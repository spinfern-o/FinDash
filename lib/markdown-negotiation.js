/* Which answer a request for a page should get: the page as usual, or the
   same page as Markdown for an AI agent that asked for it with
   "Accept: text/markdown". middleware.js asks this for every request that
   isn't for /api/ or a stylesheet, script or font.

   The Markdown is written by tools/build-pages.py from each page's own
   HTML (lib/markdown-pages.js), so it always says what the page says. */

import { PAGES, NOT_FOUND, FILES } from "./markdown-pages.js";

const SITE = "https://findash.tech";
const MARKDOWN_TYPES = ["text/markdown", "text/x-markdown"];

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

/* "/help/" -> "/help"; "/" stays "/". */
function withoutTrailingSlash(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/* What to do with a request:
     { action: "markdown", status, body, canonical }  answer with Markdown
     { action: "next", vary }                        serve it as usual; vary
                                                     is true when the answer
                                                     depends on Accept */
export function negotiate(method, pathname, acceptHeader) {
  if (method !== "GET" && method !== "HEAD") {
    return { action: "next", vary: false };
  }
  const name = pathname.split("/").pop();

  // A file such as /llms.txt or /favicon.ico is served as it is, whatever
  // was asked for. One that doesn't exist is a 404 like any other address.
  if (name.includes(".")) {
    const isFile = pathname.split("/").length === 2 && FILES.includes(name);
    if (isFile || !prefersMarkdown(acceptHeader)) {
      return { action: "next", vary: false };
    }
    return { action: "markdown", status: 404, body: NOT_FOUND, canonical: null };
  }

  const page = withoutTrailingSlash(pathname);
  const isPage = Object.prototype.hasOwnProperty.call(PAGES, page);
  if (!prefersMarkdown(acceptHeader)) {
    return { action: "next", vary: true };
  }
  if (isPage && page !== pathname) {
    // "/help/": let the host redirect to "/help", which then answers in Markdown.
    return { action: "next", vary: true };
  }
  if (isPage) {
    return { action: "markdown", status: 200, body: PAGES[page], canonical: SITE + page };
  }
  return { action: "markdown", status: 404, body: NOT_FOUND, canonical: null };
}
