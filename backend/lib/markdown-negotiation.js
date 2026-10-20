/* What a request for a page should get. middleware.js asks this for every
   request that isn't for /api/ or a stylesheet, script or font:

   - "Accept: text/markdown" (and preferring it to HTML): the page as Markdown
   - /help.md, /index.md for the home page: the page as Markdown, whatever
     was asked for
   - ?mode=agent: the view for AI agents (llms.txt), not the HTML
   - /help/llms.txt and the other section indexes: that section's llms.txt
   - an address with no page, asked for as Markdown: a Markdown 404
   - anything else: the page as usual, with Link headers (RFC 8288) pointing
     to its Markdown, the sitemap, llms.txt and the API's descriptions

   The Markdown is written by tools/build-pages.py from each page's own
   HTML (backend/lib/markdown-pages.js), so it always says what the page says. */

import { PAGES, NOT_FOUND, FILES, AGENT_VIEW, SECTION_INDEXES } from "./markdown-pages.js";

const SITE = "https://findash.tech";
const MARKDOWN_TYPES = ["text/markdown", "text/x-markdown"];
const MARKDOWN = "text/markdown; charset=utf-8";
const PLAIN_TEXT = "text/plain; charset=utf-8";

/* One entry of an Accept header: "text/markdown;q=0.9" ->
   { type: "text", subtype: "markdown", q: 0.9, order: 0 }. */
function parseAccept(header) {
  if (!header) {
    return [];
  }
  return header.split(",").map(function (part, order) {
    const pieces = part.split(";").map(function (piece) {
      return piece.trim();
    });
    const [type, subtype] = pieces[0].toLowerCase().split("/");
    let q = 1;
    for (const parameter of pieces.slice(1)) {
      const [name, value] = parameter.split("=").map(function (side) {
        return side.trim();
      });
      if (name.toLowerCase() === "q") {
        const number = Number(value);
        q = Number.isFinite(number) ? Math.min(Math.max(number, 0), 1) : 1;
      }
    }
    return { type: type, subtype: subtype, q: q, order: order };
  }).filter(function (entry) {
    return entry.type && entry.subtype;
  });
}

/* How much the client wants `type/subtype`: the most specific range that
   covers it wins (text/html beats text/* beats * / *), as RFC 9110 says. */
function preference(entries, type, subtype) {
  let best = null;
  for (const entry of entries) {
    let specificity = -1;
    if (entry.type === type && entry.subtype === subtype) {
      specificity = 2;
    } else if (entry.type === type && entry.subtype === "*") {
      specificity = 1;
    } else if (entry.type === "*" && entry.subtype === "*") {
      specificity = 0;
    }
    if (specificity >= 0 && (!best || specificity > best.specificity)) {
      best = { q: entry.q, order: entry.order, specificity: specificity };
    }
  }
  return best;
}

/* True when the Accept header names Markdown and prefers it to HTML.
   A wildcard alone (curl's "* / *", a browser's "...,* / *;q=0.8") never
   counts as asking for Markdown: only a client that names it gets it. */
export function prefersMarkdown(acceptHeader) {
  const entries = parseAccept(acceptHeader);
  let markdown = null;
  for (const type of MARKDOWN_TYPES) {
    const [main, sub] = type.split("/");
    const found = entries.find(function (entry) {
      return entry.type === main && entry.subtype === sub;
    });
    if (found && (!markdown || found.q > markdown.q)) {
      markdown = found;
    }
  }
  if (!markdown || markdown.q <= 0) {
    return false;
  }
  const html = preference(entries, "text", "html");
  if (!html || markdown.q > html.q) {
    return true;
  }
  if (markdown.q < html.q) {
    return false;
  }
  // Equally wanted: HTML named outright wins only if it was listed first.
  return html.specificity < 2 || markdown.order < html.order;
}

/* "/" -> "/index.md", "/help" -> "/help.md". */
export function markdownAddress(page) {
  return page === "/" ? "/index.md" : page + ".md";
}

/* The Link header (RFC 8288) every page is served with: where its Markdown
   is, and where an agent finds the rest. */
export function pageLinks(page) {
  return [
    "<" + SITE + markdownAddress(page) + '>; rel="alternate"; type="text/markdown"',
    "<" + SITE + '/sitemap.xml>; rel="sitemap"; type="application/xml"',
    "<" + SITE + '/llms.txt>; rel="describedby"; type="text/plain"',
    "<" + SITE + '/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
    "<" + SITE + '/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
    "<" + SITE + '/developers>; rel="service-doc"; type="text/html"',
    "<" + SITE + '/.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/ai-catalog+json"'
  ].join(", ");
}

function hasPage(page) {
  return Object.prototype.hasOwnProperty.call(PAGES, page);
}

/* "/help/" -> "/help"; "/" stays "/". */
function withoutTrailingSlash(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function markdownPage(page) {
  return {
    action: "respond", status: 200, contentType: MARKDOWN, body: PAGES[page],
    headers: { Vary: "Accept", Link: "<" + SITE + page + '>; rel="canonical"; type="text/html", ' + pageLinks(page) }
  };
}

function markdownNotFound() {
  return {
    action: "respond", status: 404, contentType: MARKDOWN, body: NOT_FOUND,
    headers: { Vary: "Accept", Link: "<" + SITE + '/llms.txt>; rel="describedby"; type="text/plain", <' + SITE +
      '/sitemap.xml>; rel="sitemap"; type="application/xml"' }
  };
}

/* What to do with a request:
     { action: "respond", status, contentType, body, headers }  answer it here
     { action: "next", headers }   serve it as usual, adding these headers
   `search` is the query string ("?mode=agent"), or "". */
export function negotiate(method, pathname, acceptHeader, search) {
  if (method !== "GET" && method !== "HEAD") {
    return { action: "next", headers: {} };
  }

  // A real file, such as /llms.txt or /.well-known/ai-catalog.json, is
  // served as it is, whatever was asked for.
  if (FILES.includes(pathname)) {
    return { action: "next", headers: {} };
  }

  if (Object.prototype.hasOwnProperty.call(SECTION_INDEXES, pathname)) {
    return { action: "respond", status: 200, contentType: PLAIN_TEXT, body: SECTION_INDEXES[pathname],
      headers: {} };
  }

  // /help.md and /index.md: the Markdown twin of a page.
  if (pathname.endsWith(".md")) {
    const page = pathname === "/index.md" ? "/" : pathname.slice(0, -".md".length);
    if (hasPage(page)) {
      return markdownPage(page);
    }
    return markdownNotFound();
  }

  const name = pathname.split("/").pop();
  const wantsMarkdown = prefersMarkdown(acceptHeader);

  // Any other address with a file extension that isn't one of ours.
  if (name.includes(".")) {
    return wantsMarkdown ? markdownNotFound() : { action: "next", headers: {} };
  }

  const page = withoutTrailingSlash(pathname);
  if (hasPage(page) && page !== pathname) {
    // "/help/": let the host redirect to "/help", which then answers.
    return { action: "next", headers: { Vary: "Accept" } };
  }

  if (hasPage(page) && new URLSearchParams(search || "").get("mode") === "agent") {
    return { action: "respond", status: 200, contentType: MARKDOWN, body: AGENT_VIEW,
      headers: { Vary: "Accept", Link: pageLinks(page) } };
  }

  if (!wantsMarkdown) {
    if (hasPage(page)) {
      return { action: "next", headers: { Vary: "Accept", Link: pageLinks(page) } };
    }
    return { action: "next", headers: { Vary: "Accept" } };
  }
  if (hasPage(page)) {
    return markdownPage(page);
  }
  return markdownNotFound();
}
