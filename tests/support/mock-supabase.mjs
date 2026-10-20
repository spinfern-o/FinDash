/* A small stand-in for Supabase, speaking the parts of its API this site
   uses, so the tests never touch a real project:
     Auth (GoTrue)  sign up, log in, refresh, who-am-I, change password,
                    password reset, log out
     Database       the account_figures and waitlist tables, and the
                    claim_ai_use function, each with the same row-level
                    rules as the real SQL in backend/database/supabase/migrations/

   It runs inside the test's own process, so a test can look at and change
   its state directly (users, figures, usage, options). */

import http from "node:http";

function base64Url(object) {
  return Buffer.from(JSON.stringify(object)).toString("base64url");
}

/* A value with every object's keys in the order Postgres keeps them in a
   jsonb column (shorter keys first, then alphabetical), as the real
   database hands saved figures back: never in the order they were sent. */
function inJsonbKeyOrder(value) {
  if (Array.isArray(value)) {
    return value.map(inJsonbKeyOrder);
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort(function (first, second) {
      if (first.length !== second.length) {
        return first.length - second.length;
      }
      if (first < second) {
        return -1;
      }
      if (first > second) {
        return 1;
      }
      return 0;
    });
    const ordered = {};
    for (const key of keys) {
      ordered[key] = inJsonbKeyOrder(value[key]);
    }
    return ordered;
  }
  return value;
}

function readBody(request) {
  return new Promise(function (resolve) {
    let body = "";
    request.on("data", function (chunk) {
      body += chunk;
    });
    request.on("end", function () {
      resolve(body);
    });
  });
}

export async function startMockSupabase() {
  const mock = {
    url: "",
    users: new Map(),          // email -> { id, email, password, confirmed }
    sessions: new Map(),       // access token -> email, and "r:" + refresh token -> email
    refreshOf: new Map(),      // access token -> its refresh token
    figures: new Map(),        // user id -> { figures, updated_at }
    inventory: new Map(),      // user id -> { inventory, revision, updated_at }
    usage: new Map(),          // "userId|feature|day" -> uses
    waitlist: [],              // rows people added; nobody can read them back
    options: {
      confirmEmails: false,    // true: sign-ups need the emailed link first
      missingTables: false,    // true: answer as if the SQL was never run
      waitlistNeedsAnswers: false, // true: as if the email-only waitlist SQL wasn't run
      signupError: null,       // { status, code, message }: refuse sign-ups with it
      tokenLifetimeSeconds: 3600
    },
    reset: function () {
      mock.figures.clear();
      mock.inventory.clear();
      mock.usage.clear();
      mock.waitlist.length = 0;
      mock.options.missingTables = false;
      mock.options.waitlistNeedsAnswers = false;
      mock.options.signupError = null;
    },
    userId: function (email) {
      return mock.users.get(email).id;
    },
    /* A confirmation or reset link's tokens, as the emailed link carries them. */
    makeEmailLink: function (email) {
      mock.users.get(email).confirmed = true;
      const session = newSession(email);
      return { access_token: session.access_token, refresh_token: session.refresh_token };
    },
    usesToday: function (email, feature) {
      const day = new Date().toISOString().slice(0, 10);
      return mock.usage.get(mock.userId(email) + "|" + feature + "|" + day) || 0;
    }
  };

  function accessToken(email, lifetimeSeconds) {
    const header = base64Url({ alg: "HS256", typ: "JWT" });
    const payload = base64Url({
      sub: mock.users.get(email).id,
      email: email,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + lifetimeSeconds,
      session_id: Math.random().toString(36).slice(2)
    });
    // Not a real signature, but it must look like base64url, as Supabase's
    // library checks the shape of a token before using it.
    return header + "." + payload + "." + Buffer.from("test-signature").toString("base64url");
  }

  function userObject(user) {
    return {
      id: user.id,
      aud: "authenticated",
      role: "authenticated",
      email: user.email,
      email_confirmed_at: user.confirmed ? new Date().toISOString() : null,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString()
    };
  }

  function newSession(email) {
    const lifetime = mock.options.tokenLifetimeSeconds;
    const access = accessToken(email, lifetime);
    const refresh = Math.random().toString(36).slice(2);
    mock.sessions.set(access, email);
    mock.sessions.set("r:" + refresh, email);
    mock.refreshOf.set(access, refresh);
    return {
      access_token: access,
      token_type: "bearer",
      expires_in: lifetime,
      expires_at: Math.floor(Date.now() / 1000) + lifetime,
      refresh_token: refresh,
      user: userObject(mock.users.get(email))
    };
  }

  /* The email behind a bearer token that is known and not expired, or null. */
  function emailFromToken(token) {
    const email = mock.sessions.get(token);
    if (!email) {
      return null;
    }
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      if (payload.exp < Date.now() / 1000) {
        return null;
      }
    } catch {
      return null;
    }
    return email;
  }

  function sendJson(response, status, body) {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(body === undefined ? "" : JSON.stringify(body));
  }

  function authError(response, status, code, message) {
    sendJson(response, status, { code: status, error_code: code, msg: message });
  }

  function databaseError(response, status, code, message) {
    sendJson(response, status, { code: code, message: message, details: null, hint: null });
  }

  function handleAuth(request, response, url, body, bearer) {
    if (url.pathname === "/auth/v1/signup" && request.method === "POST") {
      const refusal = mock.options.signupError;
      if (refusal) {
        return authError(response, refusal.status, refusal.code, refusal.message);
      }
      if (mock.users.has(body.email)) {
        return authError(response, 422, "user_already_exists", "User already registered");
      }
      if (!body.password || body.password.length < 6) {
        return authError(response, 422, "weak_password", "Password should be at least 6 characters");
      }
      const user = {
        id: "00000000-0000-4000-8000-" + String(mock.users.size + 1).padStart(12, "0"),
        email: body.email,
        password: body.password,
        confirmed: !mock.options.confirmEmails
      };
      mock.users.set(body.email, user);
      if (mock.options.confirmEmails) {
        return sendJson(response, 200, userObject(user));
      }
      return sendJson(response, 200, newSession(body.email));
    }

    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const user = mock.users.get(body.email);
      if (!user || user.password !== body.password) {
        return authError(response, 400, "invalid_credentials", "Invalid login credentials");
      }
      if (!user.confirmed) {
        return authError(response, 400, "email_not_confirmed", "Email not confirmed");
      }
      return sendJson(response, 200, newSession(body.email));
    }

    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      const email = mock.sessions.get("r:" + body.refresh_token);
      if (!email) {
        return authError(response, 400, "refresh_token_not_found", "Invalid Refresh Token");
      }
      mock.sessions.delete("r:" + body.refresh_token);
      return sendJson(response, 200, newSession(email));
    }

    if (url.pathname === "/auth/v1/recover") {
      return sendJson(response, 200, {});
    }

    if (url.pathname === "/auth/v1/user") {
      const email = emailFromToken(bearer);
      if (!email) {
        return authError(response, 403, "bad_jwt", "invalid JWT: token is expired");
      }
      const user = mock.users.get(email);
      if (request.method === "PUT") {
        if (body.password === user.password) {
          return authError(response, 422, "same_password", "New password should be different from the old password.");
        }
        user.password = body.password;
      }
      return sendJson(response, 200, userObject(user));
    }

    if (url.pathname === "/auth/v1/logout") {
      // scope=local ends only this session; anything else ends all of them.
      if (url.searchParams.get("scope") === "local") {
        mock.sessions.delete(bearer);
        mock.sessions.delete("r:" + mock.refreshOf.get(bearer));
      } else {
        const email = mock.sessions.get(bearer);
        for (const [key, value] of mock.sessions) {
          if (value === email) {
            mock.sessions.delete(key);
          }
        }
      }
      return sendJson(response, 204);
    }

    return authError(response, 404, "not_found", "no route " + url.pathname);
  }

  /* The account_figures table, with its row-level security: every request
     only ever reaches the row of whoever the token belongs to. */
  function handleFigures(request, response, url, body, userId) {
    if (request.method === "GET") {
      const row = mock.figures.get(userId);
      if (row) {
        return sendJson(response, 200, [{ figures: inJsonbKeyOrder(row.figures), updated_at: row.updated_at }]);
      }
      return sendJson(response, 200, []);
    }
    if (request.method === "POST") {
      if (body.user_id !== userId) {
        return databaseError(response, 403, "42501", "new row violates row-level security policy");
      }
      mock.figures.set(userId, { figures: body.figures, updated_at: body.updated_at });
      return sendJson(response, 201);
    }
    if (request.method === "DELETE") {
      if (url.searchParams.get("user_id") === "eq." + userId) {
        mock.figures.delete(userId);
      }
      return sendJson(response, 204);
    }
    return databaseError(response, 405, "PGRST000", "method not allowed");
  }

  /* The stock table enforces account isolation and atomic revision matching. */
  function handleInventory(request, response, url, body, userId) {
    const row = mock.inventory.get(userId);
    if (request.method === "GET") {
      return sendJson(response, 200, row ? [{ inventory: inJsonbKeyOrder(row.inventory), revision: row.revision }] : []);
    }
    if (body.user_id !== userId) {
      return databaseError(response, 403, "42501", "new row violates row-level security policy");
    }
    if (request.method === "POST") {
      if (row) {
        return databaseError(response, 409, "23505", "duplicate account inventory");
      }
      mock.inventory.set(userId, { ...body });
      return sendJson(response, 201, [{ revision: body.revision }]);
    }
    if (request.method === "PATCH") {
      if (!row || url.searchParams.get("user_id") !== "eq." + userId ||
          url.searchParams.get("revision") !== "eq." + row.revision) {
        return sendJson(response, 200, []);
      }
      mock.inventory.set(userId, { ...body });
      return sendJson(response, 200, [{ revision: body.revision }]);
    }
    return databaseError(response, 405, "PGRST000", "method not allowed");
  }

  /* Postgres timestamps advance even when two saves happen in one millisecond. */
  function nextSavedTime(previous) {
    return new Date(Math.max(Date.now(), Date.parse(previous || '1970-01-01') + 1)).toISOString();
  }

  /* JSONB object order is irrelevant to idempotent confirmations. */
  function sameJson(first, second) {
    return JSON.stringify(inJsonbKeyOrder(first)) === JSON.stringify(inJsonbKeyOrder(second));
  }

  /* The same transaction semantics as save_account_figures in the migration. */
  function handleSaveFigures(response, body, userId) {
    const previous = mock.figures.get(userId);
    if (body.check_updated_at && (previous?.updated_at || null) !== body.expected_updated_at) {
      return databaseError(response, 409, '40001', 'Financial records changed');
    }
    let figures = JSON.parse(JSON.stringify(body.new_figures));
    let protectedIds = previous?.stock_invoice_ids || [];
    if (!body.check_updated_at) {
      const protectedInvoices = (previous?.figures.invoices || []).filter(function (invoice) { return protectedIds.includes(invoice.id); });
      figures.invoices = figures.invoices.filter(function (invoice) { return !protectedIds.includes(invoice.id); }).concat(protectedInvoices);
    } else {
      protectedIds = protectedIds.filter(function (id) { return figures.invoices.some(function (invoice) { return invoice.id === id; }); });
    }
    if (figures.invoices.length > 5000 || Buffer.byteLength(JSON.stringify(figures)) > 1_000_000) {
      return databaseError(response, 400, '22023', 'Figures exceed storage limit');
    }
    const updatedAt = nextSavedTime(previous?.updated_at);
    mock.figures.set(userId, { figures, stock_invoice_ids: protectedIds, updated_at: updatedAt });
    return sendJson(response, 200, { updatedAt });
  }

  /* Check everything before either assignment, modeling a SQL transaction. */
  function handleConfirmStock(response, body, userId) {
    const stock = mock.inventory.get(userId);
    const saved = mock.figures.get(userId);
    const invoice = body.new_invoice;
    const figures = JSON.parse(JSON.stringify(saved?.figures || { v: 2, months: [], invoices: [] }));
    const protectedIds = [...(saved?.stock_invoice_ids || [])];
    const existing = figures.invoices.find(function (entry) { return entry.id === invoice.id; });
    if (existing && !sameJson(existing, invoice)) {
      return databaseError(response, 409, 'FD002', 'Invoice id has different contents');
    }
    if (existing && protectedIds.includes(invoice.id) && sameJson(stock?.inventory, body.new_inventory)) {
      return sendJson(response, 200, { revision: stock.revision, figuresUpdatedAt: saved.updated_at,
        invoiceAdded: false, figures: saved.figures });
    }
    if ((stock?.revision || 0) !== body.expected_revision) {
      return databaseError(response, 409, '40001', 'Stock changed');
    }
    if (!existing && invoice.supplier.trim() && invoice.number.trim() && invoice.date && figures.invoices.some(function (entry) {
      return String(entry.supplier || '').trim().toLowerCase() === invoice.supplier.trim().toLowerCase() &&
        String(entry.number || '').trim().toLowerCase() === invoice.number.trim().toLowerCase() && entry.date === invoice.date;
    })) {
      return databaseError(response, 409, 'FD001', 'Supplier invoice already recorded');
    }
    if (!existing) { figures.invoices.push(invoice); }
    if (figures.invoices.length > 5000 || Buffer.byteLength(JSON.stringify(figures)) > 1_000_000) {
      return databaseError(response, 400, '22023', 'Figures exceed storage limit');
    }
    if (!protectedIds.includes(invoice.id)) { protectedIds.push(invoice.id); }
    const updatedAt = nextSavedTime(saved?.updated_at);
    const revision = body.expected_revision + 1;
    mock.inventory.set(userId, { inventory: body.new_inventory, revision, updated_at: updatedAt });
    mock.figures.set(userId, { figures, updated_at: updatedAt, stock_invoice_ids: protectedIds });
    return sendJson(response, 200, { revision, figuresUpdatedAt: updatedAt, invoiceAdded: !existing, figures });
  }

  /* claim_ai_use(feature_name, daily_limit), as the SQL function does it. */
  function handleClaimAiUse(response, body, userId) {
    if (!["photo", "advice", "columns", "forecast"].includes(body.feature_name)) {
      return databaseError(response, 400, "P0001", "unknown feature: " + body.feature_name);
    }
    const day = new Date().toISOString().slice(0, 10);
    const key = userId + "|" + body.feature_name + "|" + day;
    const uses = (mock.usage.get(key) || 0) + 1;
    mock.usage.set(key, uses);
    return sendJson(response, 200, uses <= body.daily_limit);
  }

  /* The waitlist table: anyone, logged in or not, may add a row; nobody
     may read, change or delete one. Each email once, whatever its case. */
  function handleWaitlist(request, response, body) {
    if (request.method !== "POST") {
      return databaseError(response, 403, "42501", "permission denied for table waitlist");
    }
    // As the table was before 20261020000000_waitlist_email_only.sql: the
    // business answers were still required.
    if (mock.options.waitlistNeedsAnswers && !body.business_type) {
      return databaseError(response, 400, "23502",
        'null value in column "business_type" of relation "waitlist" violates not-null constraint');
    }
    const email = String(body.email).toLowerCase();
    const isListed = mock.waitlist.some(function (row) {
      return row.email.toLowerCase() === email;
    });
    if (isListed) {
      return databaseError(response, 409, "23505",
        'duplicate key value violates unique constraint "waitlist_email_once"');
    }
    mock.waitlist.push(Object.assign({ created_at: new Date().toISOString() }, body));
    return sendJson(response, 201);
  }

  function handleDatabase(request, response, url, body, bearer) {
    if (mock.options.missingTables) {
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        return databaseError(response, 404, "PGRST202", "Could not find the function in the schema cache");
      }
      return databaseError(response, 404, "PGRST205", "Could not find the table in the schema cache");
    }
    if (url.pathname === "/rest/v1/waitlist") {
      return handleWaitlist(request, response, body);
    }
    const email = emailFromToken(bearer);
    if (!email) {
      return databaseError(response, 401, "PGRST301", "JWT expired");
    }
    const userId = mock.users.get(email).id;

    if (url.pathname === "/rest/v1/account_figures") {
      return handleFigures(request, response, url, body, userId);
    }
    if (url.pathname === "/rest/v1/account_inventory") {
      return handleInventory(request, response, url, body, userId);
    }
    if (url.pathname === "/rest/v1/rpc/claim_ai_use" && request.method === "POST") {
      return handleClaimAiUse(response, body, userId);
    }
    if (url.pathname === '/rest/v1/rpc/save_account_figures' && request.method === 'POST') {
      return handleSaveFigures(response, body, userId);
    }
    if (url.pathname === '/rest/v1/rpc/confirm_stock_invoice' && request.method === 'POST') {
      return handleConfirmStock(response, body, userId);
    }
    return databaseError(response, 404, "PGRST205", "no table " + url.pathname);
  }

  const server = http.createServer(async function (request, response) {
    const text = await readBody(request);
    const url = new URL(request.url, "http://localhost");
    let body = {};
    if (text) {
      body = JSON.parse(text);
    }
    const bearer = String(request.headers.authorization || "").replace(/^Bearer /, "");

    if (url.pathname.startsWith("/auth/v1/")) {
      return handleAuth(request, response, url, body, bearer);
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      return handleDatabase(request, response, url, body, bearer);
    }
    return sendJson(response, 404, { message: "no route" });
  });

  await new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", resolve);
  });
  mock.url = "http://127.0.0.1:" + server.address().port;
  mock.stop = function () {
    return new Promise(function (resolve) {
      server.close(resolve);
      server.closeAllConnections();
    });
  };
  return mock;
}
