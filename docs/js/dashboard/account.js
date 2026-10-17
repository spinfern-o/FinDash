/* The account corner of the nav bar. It shows "Log in" unless someone is logged
   in, in which case it shows who, and offers "Log out".

   The login lives in a cookie that page scripts cannot read (see
   api/auth.js), so the page has to ask /api/auth who is logged in rather
   than look for itself. */

import { escapeHtml } from "./format.js";
import { loadCapabilities } from "./capabilities.js";

const LOGGED_OUT_HTML = '<a class="account-link" href="/login">Log in</a>';

// The answer to "who is logged in?", asked once per visit and shared by
// everything that needs it (photos, advice and column matching only work
// for someone logged in).
let loginCheck = null;

/* { email } for the person logged in, or null when nobody is, or when this
   site has no accounts. */
export function loggedInUser() {
  if (!loginCheck) {
    loginCheck = askWhoIsLoggedIn();
  }
  return loginCheck;
}

async function askWhoIsLoggedIn() {
  const capabilities = await loadCapabilities();
  if (!capabilities.accounts) {
    return null;
  }
  return whoIsLoggedIn();
}

/* { email } for the person logged in, or null. Asks the server every time. */
export async function whoIsLoggedIn() {
  try {
    const response = await fetch("/api/auth?action=me", { credentials: "same-origin" });
    // Read the body whatever the status: an unread body leaves the request open.
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok || !body || !body.user || !body.user.email) {
      return null;
    }
    return body.user;
  } catch {
    return null;   // offline
  }
}

export async function logOut() {
  try {
    await fetch("/api/auth?action=logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "same-origin"
    });
  } catch {
    // The cookies run out on their own; the Log in link comes back either way.
  }
}

/* Shows who is logged in. `onLogOut`, if given, runs once they have logged out. */
export function showLoggedIn(user, onLogOut) {
  const corner = document.getElementById("account");
  corner.innerHTML = `<span class="account-email" title="${escapeHtml(user.email)}">${escapeHtml(user.email)}</span>
    <button type="button" class="account-link" id="logout">Log out</button>`;

  document.getElementById("logout").addEventListener("click", async function () {
    await logOut();
    loginCheck = Promise.resolve(null);
    corner.innerHTML = LOGGED_OUT_HTML;
    if (onLogOut) {
      onLogOut();
    }
  });
}
