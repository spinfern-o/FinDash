/* Before launch, the app is closed: the dashboard and the stock workspace
   send visitors to the waitlist instead. Everything else (the home page,
   help, the waitlist itself, the public API) stays open.

   The log in page stays open too: the privacy policy promises that anyone
   with an account can delete it there, and the links in confirmation and
   password-reset emails lead to it. Logging in then lands on the waitlist,
   like everyone else.

   To open the app, set FINDASH_APP_OPEN=1 in the Vercel project's
   Environment Variables: for Preview deployments only, to try it before
   launch; for Production too, on launch day. middleware.js asks this file
   about every page request.

   The public pages carry two versions of each way in: the waitlist's
   (class waitlist-only) and the app's (class app-only). Every page loads
   APP_STATE_SCRIPT first, which middleware.js answers with appStateScript():
   when the app is open it marks the page "app-open", and site.css shows the
   app's version instead of the waitlist's, before anything is drawn. No
   cookie is set and nothing about the visitor is sent. */

// The app's pages, as their addresses.
export const APP_PAGES = ["/dashboard", "/stock"];

// Where a visitor goes instead while the app is closed.
export const WAITLIST = "/waitlist";

// The script every page loads first, answered by middleware.js.
export const APP_STATE_SCRIPT = "/app-state.js";

/* Whether the app has been opened with FINDASH_APP_OPEN=1. */
export function appIsOpen(environment) {
  return environment.FINDASH_APP_OPEN === "1";
}

/* "/dashboard.html", "/dashboard/" and "/dashboard" are all the dashboard. */
function pageAddress(pathname) {
  let address = pathname.replace(/\/+$/, "");
  address = address.replace(/\.html$/, "");
  return address || "/";
}

/* Whether this address is one of the app's pages, closed for now. */
export function isClosedAppPage(pathname, environment) {
  if (appIsOpen(environment)) {
    return false;
  }
  return APP_PAGES.includes(pageAddress(pathname));
}

/* The script for APP_STATE_SCRIPT: marks the page "app-open" when the app
   is open, and does nothing while it is closed. */
export function appStateScript(environment) {
  if (appIsOpen(environment)) {
    return 'document.documentElement.classList.add("app-open");\n';
  }
  return "/* FinDash isn't open yet: the pages show the waitlist. */\n";
}
