/* The whole site, running locally for the tests: the pages in docs/ served
   with the same security headers vercel.json sets, and every /api/*
   request handled by the real function in api/, talking to the stand-ins
   for Supabase and Claude instead of the real services.

   const site = await startSite();
   ... site.url, site.supabase, site.anthropic, site.serverLogs ...
   await site.stop(); */

import http from "node:http";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMockSupabase } from "./mock-supabase.mjs";
import { startMockAnthropic } from "./mock-anthropic.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
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
  ".webmanifest": "application/manifest+json"
};

function securityHeaders() {
  const vercel = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  return vercel.headers[0].headers;
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

/* options.accounts: false runs the site without Supabase settings.
   options.claude: false runs it without an Anthropic key. */
export async function startSite(options = {}) {
  const supabase = await startMockSupabase();
  const anthropic = await startMockAnthropic();

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

  const headers = securityHeaders();
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
    for (const header of headers) {
      response.setHeader(header.key, header.value);
    }
    const url = new URL(request.url, "http://localhost");

    if (url.pathname.startsWith("/api/")) {
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
    }
  };
  return site;
}
