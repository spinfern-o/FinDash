/**
 * /api/auth?action=...
 *
 * Accounts, through Supabase Auth, without the browser ever talking to Supabase.
 *
 * The site's Content-Security-Policy (vercel.json) lets a page load scripts only
 * from this site and send requests only to this site. Supabase's browser library
 * would need both rules loosened: it is usually loaded from a CDN, and it calls
 * https://<project>.supabase.co directly. Instead, the page posts to this
 * function, which makes the Supabase calls and keeps the session in HttpOnly
 * cookies. Page scripts - including anything that ever got injected - cannot
 * read those tokens, where the browser library would keep them in localStorage.
 *
 * One function for every action: Vercel's Hobby plan allows 12 per deployment.
 *
 *   POST login    {email, password}               -> {user}
 *   POST signup   {email, password}               -> {user} | {confirm: true}
 *   POST reset    {email}                         -> {ok: true}
 *   POST session  {access_token, refresh_token}   -> {user}   tokens from an email link
 *   POST password {password}                      -> {user}   needs a session
 *   POST logout                                   -> {ok: true}
 *   GET  me                                       -> {user}   user is null when logged out
 *
 * Only the project URL and the public (anon / publishable) key are used: every
 * call here is one the signed-in person could make themselves. The service-role
 * key is never needed and never read.
 */

import { createClient } from "@supabase/supabase-js";

// The Supabase integration on Vercel has used several names over time; take
// whichever the project has.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const ACCESS = "fd_access";
const REFRESH = "fd_refresh";
const REFRESH_DAYS = 30;
const MIN_PASSWORD = 8;

/* A fresh client per request, holding nothing between them: a serverless
   instance can serve many people, and a session must never leak across. */
const supabase = () => createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

/* Path=/api: the cookies go only to these functions, never to the static
   pages. HttpOnly: no script can read them. SameSite=Lax: another site cannot
   make a signed-in request on someone's behalf with a form post. */
const cookie = (name, value, maxAge) =>
  `${name}=${encodeURIComponent(value)}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

function setSession(res, session) {
  res.setHeader("Set-Cookie", [
    cookie(ACCESS, session.access_token, Math.max(60, Math.round(session.expires_in || 3600))),
    cookie(REFRESH, session.refresh_token, REFRESH_DAYS * 86400)
  ]);
}

function clearSession(res) {
  res.setHeader("Set-Cookie", [cookie(ACCESS, "", 0), cookie(REFRESH, "", 0)]);
}

function readCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { /* a malformed cookie is ignored, as if it were not there */ }
  }
  return out;
}

/* Seconds until a JWT expires, from its own exp claim; the cookie lives no longer. */
function secondsLeft(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
    return payload.exp ? payload.exp - Date.now() / 1000 : 3600;
  } catch { return 3600; }
}

/* A browser always sends Origin on a cross-site POST. One from another site is
   refused, which also stops someone signing a visitor into the wrong account. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

/* Where links in Supabase's emails send people back to. SITE_URL pins it;
   otherwise this deployment's own address. Supabase only honours addresses on
   the project's redirect allow-list, so a forged Host header goes nowhere. */
function loginUrl(req) {
  const base = process.env.SITE_URL || `https://${req.headers.host}`;
  return base.replace(/\/$/, "") + "/login";
}

const userOut = user => ({ email: user && user.email ? String(user.email) : null });

const validEmail = v => typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const validPassword = v => typeof v === "string" && v.length >= 1 && v.length <= 200;

/* Supabase's error codes, said the way an owner would want to hear them. The
   raw message goes to the log, not the page. */
function fail(res, error, fallback) {
  const code = error && error.code;
  const status = error && error.status;
  console.error("auth:", code || "", status || "", error && error.message);
  if (code === "invalid_credentials") return res.status(401).json({ error: "That email and password don't match an account." });
  if (code === "email_not_confirmed") return res.status(403).json({ error: "Confirm your email first: open the link we sent you, then log in." });
  if (code === "user_already_exists" || code === "email_exists") return res.status(409).json({ error: "There's already an account with that email. Log in instead." });
  if (code === "weak_password") return res.status(400).json({ error: "Choose a stronger password: at least 8 characters, not a common one." });
  if (code === "same_password") return res.status(400).json({ error: "Choose a password you haven't used for this account before." });
  if (status === 429 || /rate_limit/.test(code || "")) return res.status(429).json({ error: "Too many tries. Wait a minute and try again." });
  return res.status(502).json({ error: fallback });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: "accounts aren't set up on this site yet" });
  }

  const action = String((req.query && req.query.action) || "");
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const cookies = readCookies(req);

  if (action === "me") {
    if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
    const access = cookies[ACCESS], refresh = cookies[REFRESH];
    if (access) {
      const { data, error } = await supabase().auth.getUser(access);
      if (!error && data.user) return res.status(200).json({ user: userOut(data.user) });
    }
    // The access token lasts about an hour; the refresh token keeps someone
    // signed in for longer without asking for the password again.
    if (refresh) {
      const { data, error } = await supabase().auth.refreshSession({ refresh_token: refresh });
      if (!error && data.session) {
        setSession(res, data.session);
        return res.status(200).json({ user: userOut(data.session.user) });
      }
    }
    // Not logged in is an ordinary answer, not an error: every logged-out page
    // view asks, and a 401 would print a red line in every visitor's console.
    clearSession(res);
    return res.status(200).json({ user: null });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!sameOrigin(req)) return res.status(403).json({ error: "request from another site" });

  if (action === "login") {
    if (!validEmail(body.email) || !validPassword(body.password)) {
      return res.status(400).json({ error: "Enter your email and password." });
    }
    const { data, error } = await supabase().auth.signInWithPassword({
      email: body.email.trim(), password: body.password
    });
    if (error || !data.session) return fail(res, error, "Logging in isn't working right now. Try again soon.");
    setSession(res, data.session);
    return res.status(200).json({ user: userOut(data.user) });
  }

  if (action === "signup") {
    if (!validEmail(body.email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (!validPassword(body.password) || body.password.length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Choose a password of at least ${MIN_PASSWORD} characters.` });
    }
    const { data, error } = await supabase().auth.signUp({
      email: body.email.trim(), password: body.password,
      options: { emailRedirectTo: loginUrl(req) }
    });
    if (error) return fail(res, error, "Creating an account isn't working right now. Try again soon.");
    // With email confirmation on (Supabase's default) there is no session yet:
    // the person has to click the link first.
    if (!data.session) return res.status(200).json({ confirm: true });
    setSession(res, data.session);
    return res.status(200).json({ user: userOut(data.user) });
  }

  if (action === "reset") {
    if (!validEmail(body.email)) return res.status(400).json({ error: "Enter a valid email address." });
    const { error } = await supabase().auth.resetPasswordForEmail(body.email.trim(), { redirectTo: loginUrl(req) });
    // The same answer whether or not the email has an account, so this cannot
    // be used to find out who uses FinDash. Only a rate limit is reported.
    if (error && (error.status === 429 || /rate_limit/.test(error.code || ""))) return fail(res, error, "");
    if (error) console.error("auth reset:", error.code, error.message);
    return res.status(200).json({ ok: true });
  }

  if (action === "session") {
    // Supabase's confirmation and reset emails come back to /login with the
    // session in the URL fragment, which only the page can see. It hands the
    // tokens over once; they are checked with Supabase before being trusted.
    const { access_token, refresh_token } = body;
    if (typeof access_token !== "string" || typeof refresh_token !== "string" ||
        access_token.length > 4096 || refresh_token.length > 512) {
      return res.status(400).json({ error: "That link is incomplete. Request a new one." });
    }
    const { data, error } = await supabase().auth.getUser(access_token);
    if (error || !data.user) return res.status(401).json({ error: "That link has expired. Request a new one." });
    setSession(res, { access_token, refresh_token, expires_in: secondsLeft(access_token) });
    return res.status(200).json({ user: userOut(data.user) });
  }

  if (action === "password") {
    if (!validPassword(body.password) || body.password.length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Choose a password of at least ${MIN_PASSWORD} characters.` });
    }
    if (!cookies[ACCESS] || !cookies[REFRESH]) {
      return res.status(401).json({ error: "Your reset link has expired. Request a new one." });
    }
    const client = supabase();
    const { data: s, error: sErr } = await client.auth.setSession({
      access_token: cookies[ACCESS], refresh_token: cookies[REFRESH]
    });
    if (sErr || !s.session) return res.status(401).json({ error: "Your reset link has expired. Request a new one." });
    const { data, error } = await client.auth.updateUser({ password: body.password });
    if (error) return fail(res, error, "Changing your password isn't working right now. Try again soon.");
    setSession(res, s.session);
    return res.status(200).json({ user: userOut(data.user) });
  }

  if (action === "logout") {
    // Revoke the session at Supabase too, so the refresh token is dead even if
    // it was copied; then drop the cookies whatever Supabase said.
    if (cookies[ACCESS]) {
      const { error } = await supabase().auth.admin.signOut(cookies[ACCESS], "local");
      if (error) console.error("auth logout:", error.code, error.message);
    }
    clearSession(res);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "unknown action" });
}
