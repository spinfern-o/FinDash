/* The thank-you page after creating an account that still needs its email
   confirmed. The login page leaves the address in this tab's session
   storage (never in the page address, which ends up in logs), so the page
   can say where the link went. */

const SIGNUP_EMAIL_KEY = "findash-signup-email";

function showSignupEmail() {
  let email = null;
  try {
    email = sessionStorage.getItem(SIGNUP_EMAIL_KEY);
  } catch {
    return;   // storage is blocked; the page says "your email address"
  }
  if (email) {
    document.getElementById("signup-email").textContent = email;
  }
}

showSignupEmail();
