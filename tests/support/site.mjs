/* The whole site, running locally for the tests: the pages in docs/ served
   with the same security headers vercel.json sets, every request the
   middleware's matcher covers passed through the real middleware.js first,
   and every /api/* request handled by the real function in api/, talking to
   the stand-ins for Supabase, Claude and Stripe instead of the real services.

   const site = await startSite();
   ... site.url, site.supabase, site.anthropic, site.stripe, site.serverLogs ...
   await site.stop(); */

import http from "node:http";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMockSupabase } from "./mock-supabase.mjs";
import { startMockAnthropic } from "./mock-anthropic.mjs";
import { startMockStripe } from "./mock-stripe.mjs";
import middleware, { config as middlewareConfig } from "../../middleware.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
// The addresses Vercel runs the middleware for. The matcher is a regular
// expression for the whole path, as Vercel reads it.
const MIDDLEWARE_PATHS = middlewareConfig.matcher.map(function (pattern) {
  return new RegExp("^" + pattern + "$");
});
const PAGES = path.join(ROOT, "docs");
const API = path.join(ROOT, "api");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".jsonl": "application/x-jsonlines",
  ".md": "text/markdown; charset=UTF-8",
  ".webmanifest": "application/manifest+json"
};

const VERCEL = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

/* A vercel.json source pattern as a regular expression for the whole path:
   "(.*)" groups stay as they are, ":name*" takes the rest of the path
   (or nothing), and dots are literal. */
function sourcePattern(source) {
  let pattern = "";
  for (const part of source.split(/(\(\.\*\)|\/:[a-z]+\*)/)) {
    if (part === "(.*)") {
      pattern += "(.*)";
    } else if (/^\/:[a-z]+\*$/.test(part)) {
      pattern += "(?:/(.*))?";
    } else {
      pattern += part.replace(/[.+?^${}|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp("^" + pattern + "$");
}

/* The headers vercel.json sets for this address, from every rule that
   matches it, later rules winning, as on Vercel. */
function headersFor(pathname) {
  const found = [];
  for (const rule of VERCEL.headers) {
    if (sourcePattern(rule.source).test(pathname)) {
      found.push(...rule.headers);
    }
  }
  return found;
}

/* vercel.json's rewrites: the address an /api/ request is served from when
   no function lives at its own address. */
function rewritten(url) {
  for (const rule of VERCEL.rewrites || []) {
    const match = sourcePattern(rule.source).exec(url.pathname);
    if (match) {
      const destination = new URL(rule.destination.replace(/:[a-z]+\*/, match[1] || ""), url);
      for (const [name, value] of url.searchParams) {
        destination.searchParams.set(name, value);
      }
      return destination;
    }
  }
  return url;
}

/* Vercel's request and response helpers, on Node's own objects. */
function vercelStyle(request, response, url, body) {
  request.query = Object.fromEntries(url.searchParams);
  request.body = body;
  response.status = function (code) {
    response.statusCode = code;
    return response;
  };
  response.json = function (object) {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(object));
    return response;
  };
}

function readBody(request) {
  return new Promise(function (resolve) {
    let text = "";
    request.on("data", function (chunk) {
      text += chunk;
    });
    request.on("end", function () {
      resolve(text);
    });
  });
}

function parseJson(text) {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/* The file a page address means, as Vercel's cleanUrls does it:
   "/" is index.html, "/dashboard" is dashboard.html. */
function fileFor(pathname) {
  let file = path.join(PAGES, pathname === "/" ? "index.html" : pathname);
  if (!file.startsWith(PAGES)) {
    return null;
  }
  if (!existsSync(file) && existsSync(file + ".html")) {
    file = file + ".html";
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    return null;
  }
  return file;
}

/* Runs middleware.js as Vercel does. Returns true when the middleware
   answered the request itself; otherwise the headers it asked for (with
   next()) are set and the request carries on as usual. */
async function answeredByMiddleware(request, response, url) {
  if (!MIDDLEWARE_PATHS.some(function (pattern) {
    return pattern.test(url.pathname);
  })) {
    return false;
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const result = await middleware(new Request(url, { method: request.method, headers: headers }));

  if (result.headers.get("x-middleware-next") === "1") {
    for (const [name, value] of result.headers) {
      if (!name.startsWith("x-middleware-")) {
        response.setHeader(name, value);
      }
    }
    return false;
  }
  if (result.headers.has("x-middleware-rewrite")) {
    throw new Error("the test site doesn't follow middleware rewrites");
  }
  response.statusCode = result.status;
  for (const [name, value] of result.headers) {
    response.setHeader(name, value);
  }
  response.end(Buffer.from(await result.arrayBuffer()));
  return true;
}

/* options.accounts: false runs the site without Supabase settings.
   options.claude: false runs it without an Anthropic key.
   options.billing: false runs it without Stripe settings (no Plus). */
export async function startSite(options = {}) {
  const supabase = await startMockSupabase();
  const anthropic = await startMockAnthropic();
  const stripe = await startMockStripe();

  // The functions read these when they are first loaded, so they are set
  // before any of them is imported.
  if (options.accounts !== false) {
    process.env.SUPABASE_URL = supabase.url;
    process.env.SUPABASE_ANON_KEY = "test-public-key";
  }
  if (options.claude !== false) {
    process.env.ANTHROPIC_BASE_URL = anthropic.url;
    process.env.ANTHROPIC_API_KEY = "test-key";
  }
  if (options.billing !== false) {
    process.env.STRIPE_API_URL = stripe.url;
    process.env.STRIPE_SECRET_KEY = "sk_test_findash";
    process.env.STRIPE_PRICE_MONTHLY = "price_plus_month";
    process.env.STRIPE_PRICE_YEARLY = "price_plus_year";
  }

  // What the functions write to the log, kept for the tests to read instead
  // of printed. FINDASH_TEST_LOGS=1 prints it as well.
  const serverLogs = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  function keep() {
    const line = Array.from(arguments).map(String).join(" ");
    serverLogs.push(line);
    if (process.env.FINDASH_TEST_LOGS) {
      originalError(line);
    }
  }
  console.error = keep;
  console.warn = keep;

  const handlers = {};

  async function handlerFor(name) {
    if (!handlers[name]) {
      const file = path.join(API, name + ".js");
      if (!existsSync(file)) {
        return null;
      }
      handlers[name] = (await import(file)).default;
    }
    return handlers[name];
  }

  const server = http.createServer(async function (request, response) {
    let url = new URL(request.url, "http://localhost");
    for (const header of headersFor(url.pathname)) {
      if (header.key.toLowerCase() !== "content-type") {
        response.setHeader(header.key, header.value);
      }
    }

    if (await answeredByMiddleware(request, response, url)) {
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      if (!existsSync(path.join(API, url.pathname.slice("/api/".length) + ".js"))) {
        url = rewritten(url);
      }
      const handler = await handlerFor(url.pathname.slice("/api/".length));
      if (!handler) {
        response.statusCode = 404;
        return response.end("<html>not found</html>");
      }
      const body = parseJson(await readBody(request));
      vercelStyle(request, response, url, body);
      try {
        await handler(request, response);
      } catch (error) {
        keep("[test-site] handler threw:", error.stack || error);
        response.statusCode = 500;
        response.end(String(error));
      }
      return;
    }

    // Vercel's Web Analytics script, which only exists on Vercel: an empty
    // one here, so pages load as they do there.
    if (url.pathname.startsWith("/_vercel/insights/")) {
      response.setHeader("content-type", "text/javascript");
      return response.end("");
    }

    // Like Vercel: an address with no page gets docs/404.html, as a 404.
    const file = fileFor(decodeURIComponent(url.pathname));
    if (!file) {
      response.statusCode = 404;
      response.setHeader("content-type", CONTENT_TYPES[".html"]);
      return createReadStream(path.join(PAGES, "404.html")).pipe(response);
    }
    response.setHeader("content-type", CONTENT_TYPES[path.extname(file)] || "application/octet-stream");
    // A rule in vercel.json can give a file its own type, as for /.well-known/api-catalog.
    for (const header of headersFor(url.pathname)) {
      if (header.key.toLowerCase() === "content-type") {
        response.setHeader("content-type", header.value);
      }
    }
    createReadStream(file).pipe(response);
  });

  // Every address, so "localhost" works whichever way it resolves. The
  // tests use localhost because browsers treat it as a secure origin, which
  // the login cookies (marked Secure) need.
  await new Promise(function (resolve) {
    server.listen(0, resolve);
  });

  const site = {
    url: "http://localhost:" + server.address().port,
    supabase: supabase,
    anthropic: anthropic,
    stripe: stripe,
    serverLogs: serverLogs,
    stop: async function () {
      console.error = originalError;
      console.warn = originalWarn;
      await new Promise(function (resolve) {
        server.close(resolve);
        server.closeAllConnections();
      });
      await supabase.stop();
      await anthropic.stop();
      await stripe.stop();
    }
  };
  return site;
}
