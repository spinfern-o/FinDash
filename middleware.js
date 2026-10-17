/* Vercel Routing Middleware: runs before the pages in frontend/ are served.

   An AI agent that sends "Accept: text/markdown", or asks for /help.md, gets
   the page as Markdown; ?mode=agent gets the view for agents; an address
   with no page gets a Markdown 404 that points to /llms.txt and the sitemap.
   Everyone else gets the pages exactly as before, with "Vary: Accept" so a
   cache never mixes the two up, and Link headers saying where the Markdown,
   llms.txt and the API's descriptions are. lib/markdown-negotiation.js
   decides; this file only turns the decision into a response. */

import { next } from "@vercel/functions/middleware";
import { negotiate } from "./lib/markdown-negotiation.js";
import { isClosedAppPage, WAITLIST } from "./lib/app-gate.js";

// Not for the server functions, Vercel's own scripts, or the stylesheets,
// scripts and fonts the pages load: none of them have a Markdown version.
export const config = {
  matcher: ["/((?!api/|_vercel/|css/|js/|fonts/).*)"]
};

export default function middleware(request) {
  let decision;
  try {
    const url = new URL(request.url);
    // Before launch, the app's pages send visitors to the waitlist
    // (lib/app-gate.js). A temporary redirect, so nothing remembers it, to
    // the waitlist on whichever address the visitor came in on.
    if (isClosedAppPage(url.pathname, process.env)) {
      return new Response(null, { status: 307, headers: { "Location": WAITLIST, "Cache-Control": "no-store" } });
    }
    decision = negotiate(request.method, url.pathname, request.headers.get("accept"), url.search);
  } catch (error) {
    // Never let a problem here take the site down: serve the page as usual.
    console.error("findash-error middleware:", error && error.message);
    return next();
  }

  if (decision.action === "next") {
    return Object.keys(decision.headers).length ? next({ headers: decision.headers }) : next();
  }

  const headers = Object.assign({
    "Content-Type": decision.contentType,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Access-Control-Allow-Origin": "*"
  }, decision.headers);
  const body = request.method === "HEAD" ? null : decision.body;
  return new Response(body, { status: decision.status, headers: headers });
}
