/* Vercel Routing Middleware: runs before the pages in docs/ are served.

   An AI agent that sends "Accept: text/markdown" gets the page it asked for
   as Markdown instead of HTML, and an address with no page gets a Markdown
   404 that points to /llms.txt and the sitemap. Everyone else gets the
   pages exactly as before, with "Vary: Accept" so a cache never hands the
   HTML to an agent or the Markdown to a browser. lib/markdown-negotiation.js
   decides which; this file only turns the decision into a response. */

import { next } from "@vercel/functions/middleware";
import { negotiate } from "./lib/markdown-negotiation.js";

// Not for the server functions, Vercel's own scripts, or the stylesheets,
// scripts and fonts the pages load: none of them have a Markdown version.
export const config = {
  matcher: ["/((?!api/|_vercel/|css/|js/|fonts/).*)"]
};

export default function middleware(request) {
  let decision;
  try {
    const url = new URL(request.url);
    decision = negotiate(request.method, url.pathname, request.headers.get("accept"));
  } catch (error) {
    // Never let a problem here take the site down: serve the page as usual.
    console.error("findash-error middleware:", error && error.message);
    return next();
  }

  if (decision.action === "next") {
    return decision.vary ? next({ headers: { Vary: "Accept" } }) : next();
  }

  const headers = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Vary": "Accept",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=0, must-revalidate"
  };
  if (decision.canonical) {
    headers.Link = "<" + decision.canonical + '>; rel="canonical"; type="text/html"';
  }
  const body = request.method === "HEAD" ? null : decision.body;
  return new Response(body, { status: decision.status, headers: headers });
}
