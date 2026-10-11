/* The login page: one page, five states.

     login     log in with an email and password
     signup    create an account
     reset     ask for a link to choose a new password
     newpass   choose a new password (after opening a reset link)
     logged in already logged in: open the dashboard or log out

   Every request goes to /api/auth on this site; the session lives in
   cookies that page scripts cannot read. */

const MINIMUM_PASSWORD_LENGTH = 8;

/* Where account deletion requests go: whoever runs this copy of FinDash. */
const OWNER_EMAIL = "larrywzh59@gmail.com";

const DELETE_QUESTION = "Delete your FinDash account?\n\n" +
  "Your saved figures are removed from your account and from this browser straight away, " +
  "and you'll be logged out. An email asking FinDash to delete your login is then opened " +
  "for you to send. This can't be undone.";

// The email of whoever is logged in on this page, for the deletion request.
let loggedInEmail = null;

const ACCOUNTS_OFF_MESSAGE = "<b>Accounts aren't switched on for this site yet.</b> Everything on the " +
  'dashboard works without one: <a href="/dashboard">open the dashboard</a>.';

/* What each state shows. */
const MODES = {
  login: {
    tag: "Account",
    title: "Log in to FinDash",
    lede: "Welcome back. Log in with the email you signed up with.",
    submitLabel: "Log in",
    action: "login",
    asksForEmail: true,
    asksForPassword: true,
    passwordAutocomplete: "current-password",
    showsPasswordHint: false,
    showsForgotLink: true,
    switchHtml: 'New to FinDash? <button type="button" class="text-link" data-mode="signup">Create an account</button>'
  },
  signup: {
    tag: "New account",
    title: "Create your account",
    lede: "All you need is an email address and a password.",
    submitLabel: "Create account",
    action: "signup",
    asksForEmail: true,
    asksForPassword: true,
    passwordAutocomplete: "new-password",
    showsPasswordHint: true,
    showsForgotLink: false,
    switchHtml: 'Already have an account? <button type="button" class="text-link" data-mode="login">Log in</button>'
  },
  reset: {
    tag: "Password",
    title: "Reset your password",
    lede: "Enter your email and we'll send you a link to choose a new password.",
    submitLabel: "Send reset link",
    action: "reset",
    asksForEmail: true,
    asksForPassword: false,
    passwordAutocomplete: "off",
    showsPasswordHint: false,
    showsForgotLink: false,
    switchHtml: 'Remembered it? <button type="button" class="text-link" data-mode="login">Back to log in</button>'
  },
  newpass: {
    tag: "Password",
    title: "Choose a new password",
    lede: "Pick a password you haven't used here before.",
    submitLabel: "Save new password",
    action: "password",
    asksForEmail: false,
    asksForPassword: true,
    passwordAutocomplete: "new-password",
    showsPasswordHint: true,
    showsForgotLink: false,
    switchHtml: ""
  }
};

const form = document.getElementById("form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("submit");
const switchLine = document.getElementById("switch");

let currentMode = "login";

function element(id) {
  return document.getElementById(id);
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, function (character) {
    return HTML_ESCAPES[character];
  });
}

/* Where to go once logged in: a path on this site from ?next=, never
   another site. The dashboard by default. */
function pageAfterLogin() {
  const requested = new URLSearchParams(location.search).get("next") || "";
  if (/^\/(?!\/)[\w\-./?=&#%]*$/.test(requested)) {
    return requested;
  }
  return "/dashboard";
}

/* The message box above the form. kind is "good", "bad" or "". */
function showMessage(html, kind) {
  const box = element("message");
  box.hidden = !html;
  box.className = "message";
  if (kind) {
    box.className += " " + kind;
  }
  box.innerHTML = html;
}

function clearInvalidMarks() {
  emailInput.removeAttribute("aria-invalid");
  passwordInput.removeAttribute("aria-invalid");
}

function setMode(mode, keepMessage) {
  currentMode = mode;
  const settings = MODES[mode];

  element("tag").textContent = settings.tag;
  element("title").textContent = settings.title;
  element("lede").textContent = settings.lede;
  submitButton.textContent = settings.submitLabel;

  element("email-row").hidden = !settings.asksForEmail;
  emailInput.hidden = !settings.asksForEmail;
  element("pw-row").hidden = !settings.asksForPassword;
  element("pw-wrap").hidden = !settings.asksForPassword;
  element("to-reset").hidden = !settings.showsForgotLink;
  element("pw-hint").hidden = !settings.showsPasswordHint;
  if (mode === "newpass") {
    element("pw-label").textContent = "New password";
  } else {
    element("pw-label").textContent = "Password";
  }
  passwordInput.setAttribute("autocomplete", settings.passwordAutocomplete);

  switchLine.innerHTML = settings.switchHtml;
  switchLine.hidden = !settings.switchHtml;
  form.hidden = false;
  element("signed-in").hidden = true;

  if (!keepMessage) {
    showMessage("");
  }
  clearInvalidMarks();

  // #signup and #reset in the address bar open those states directly, so
  // the address follows the state.
  const isLinkableMode = mode === "signup" || mode === "reset";
  if (isLinkableMode && location.hash !== "#" + mode) {
    history.replaceState(null, "", "#" + mode);
  }
  // Only our own #signup / #reset markers are tidied away. An email link's
  // #fragment carries the session and must stay until readEmailLink reads it.
  if (mode === "login" && (location.hash === "#signup" || location.hash === "#reset")) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

function showWorking(isWorking) {
  submitButton.disabled = isWorking;
  if (isWorking) {
    submitButton.innerHTML = '<span class="spin" aria-hidden="true"></span> Working…';
  } else {
    submitButton.innerHTML = escapeHtml(MODES[currentMode].submitLabel);
  }
}

/* Calls /api/auth. With a body it is a POST, without one a GET. Returns
   { ok, status, data }; never throws. */
async function callAuth(action, body) {
  const options = { method: "GET", headers: {}, credentials: "same-origin" };
  if (body) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch("/api/auth?action=" + action, options);
  } catch {
    return {
      ok: false,
      status: 0,
      data: { error: "Couldn't reach FinDash. Check your connection and try again." }
    };
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    // An error page rather than JSON; the status says enough.
  }
  return { ok: response.ok, status: response.status, data: data };
}

function showLoggedIn(user, note) {
  loggedInEmail = user.email;
  form.hidden = true;
  switchLine.hidden = true;
  element("signed-in").hidden = false;
  element("tag").textContent = "Account";
  element("title").textContent = "You're logged in";
  element("lede").innerHTML = "Logged in as <b>" + escapeHtml(user.email) + "</b>.";
  if (note) {
    showMessage(note, "good");
  } else {
    showMessage("", "");
  }
}

function disableForm(html) {
  for (const control of form.querySelectorAll("input,button")) {
    control.disabled = true;
  }
  switchLine.hidden = true;
  showMessage(html);
}

/* A problem with what was typed, as { input, message }, or null. */
function problemWithInput(email, password) {
  const settings = MODES[currentMode];
  if (settings.asksForEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { input: emailInput, message: "Enter a valid email address." };
  }
  if (settings.asksForPassword && !password) {
    return { input: passwordInput, message: "Enter your password." };
  }
  const choosesPassword = currentMode === "signup" || currentMode === "newpass";
  if (choosesPassword && password.length < MINIMUM_PASSWORD_LENGTH) {
    return {
      input: passwordInput,
      message: `Choose a password of at least ${MINIMUM_PASSWORD_LENGTH} characters.`
    };
  }
  return null;
}

/* What is sent for the current state. */
function requestBody(email, password) {
  if (currentMode === "reset") {
    return { email: email };
  }
  if (currentMode === "newpass") {
    return { password: password };
  }
  return { email: email, password: password };
}

/* Back to the login form with the email filled in and a message. */
function backToLogin(email, messageHtml) {
  passwordInput.value = "";
  setMode("login", true);
  emailInput.value = email;
  showMessage(messageHtml, "good");
}

async function handleSubmit(event) {
  event.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  clearInvalidMarks();

  const problem = problemWithInput(email, password);
  if (problem) {
    problem.input.setAttribute("aria-invalid", "true");
    problem.input.focus();
    showMessage(problem.message, "bad");
    return;
  }

  showWorking(true);
  const result = await callAuth(MODES[currentMode].action, requestBody(email, password));
  showWorking(false);

  if (!result.ok) {
    if (result.status === 503) {
      disableForm(ACCOUNTS_OFF_MESSAGE);
      return;
    }
    if (result.status === 401 && currentMode === "login") {
      passwordInput.setAttribute("aria-invalid", "true");
    }
    showMessage(escapeHtml(result.data.error || "Something went wrong. Try again."), "bad");
    return;
  }

  if (currentMode === "reset") {
    backToLogin(email, "If there's an account for <b>" + escapeHtml(email) + "</b>, a link to choose a new " +
      "password is on its way. Check your inbox (and spam folder).");
    return;
  }
  if (result.data.confirm) {
    backToLogin(email, "Almost there. We sent a link to <b>" + escapeHtml(email) + "</b>: open it to confirm " +
      "your email, then log in here.");
    return;
  }
  location.assign(pageAfterLogin());
}

function linkFailedMessage(fragment) {
  if (fragment.get("error_code") === "otp_expired") {
    return "That link has expired or was already used. Request a new one below.";
  }
  return "That link didn't work. Request a new one below.";
}

/* Supabase's confirmation and reset emails come back here with the session
   in the address's #fragment (or an error). The tokens are handed to
   /api/auth once, then wiped from the address bar so they don't linger in
   the browser's history. Returns true when the address was an email link. */
async function readEmailLink() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const hasError = fragment.has("error") || fragment.has("error_code");
  if (!fragment.has("access_token") && !hasError) {
    return false;
  }
  history.replaceState(null, "", location.pathname + location.search);

  const isPasswordReset = fragment.get("type") === "recovery";
  let modeIfFailed = "login";
  if (isPasswordReset) {
    modeIfFailed = "reset";
  }

  if (hasError) {
    setMode(modeIfFailed, true);
    showMessage(linkFailedMessage(fragment), "bad");
    return true;
  }

  const result = await callAuth("session", {
    access_token: fragment.get("access_token"),
    refresh_token: fragment.get("refresh_token") || ""
  });
  if (!result.ok) {
    setMode(modeIfFailed, true);
    showMessage(escapeHtml(result.data.error || "That link didn't work. Request a new one."), "bad");
    return true;
  }

  if (isPasswordReset) {
    setMode("newpass", true);
    showMessage("Logged in as <b>" + escapeHtml(result.data.user.email) + "</b>. Now choose a new password.");
    passwordInput.focus();
    return true;
  }
  showLoggedIn(result.data.user, "Your email is confirmed. Welcome to FinDash.");
  return true;
}

/* The saved figures in the account, removed. True when they are gone (or
   there was nowhere to keep them). */
async function removeFiguresFromAccount() {
  try {
    const response = await fetch("/api/figures", { method: "DELETE", credentials: "same-origin" });
    // 503: saving to accounts isn't set up here, so nothing was ever saved.
    return response.ok || response.status === 503;
  } catch {
    return false;
  }
}

function removeFiguresFromThisBrowser() {
  try {
    localStorage.removeItem("findash-data");
    localStorage.removeItem("findash-briefing");
  } catch {
    // Storage is blocked; nothing was saved here to remove.
  }
}

/* The person's figures can be removed from here, but deleting the login
   itself needs Supabase's admin rights, which this site deliberately never
   holds. So the figures go now, and an email asks whoever runs FinDash to
   delete the login (Supabase dashboard -> Authentication -> Users). */
async function deleteAccount() {
  const email = loggedInEmail;
  if (!email || !window.confirm(DELETE_QUESTION)) {
    return;
  }

  const removed = await removeFiguresFromAccount();
  if (!removed) {
    showMessage("Your figures couldn't be removed from your account just now, so nothing was deleted. " +
      "Try again in a moment.", "bad");
    return;
  }
  removeFiguresFromThisBrowser();
  await callAuth("logout", {});
  loggedInEmail = null;

  const subject = encodeURIComponent("Delete my FinDash account");
  const body = encodeURIComponent("Please delete the FinDash account for " + email + ".\n\n" +
    "(My saved figures were already removed from the dashboard.)");
  location.href = "mailto:" + OWNER_EMAIL + "?subject=" + subject + "&body=" + body;

  setMode("login");
  showMessage("Your saved figures were removed and you're logged out. To finish, send the email that " +
    "just opened, from <b>" + escapeHtml(email) + "</b>: your login is then deleted and you'll get a reply. " +
    "If no email opened, write to <b>" + OWNER_EMAIL + "</b> yourself.", "good");
}

async function accountsAreOn() {
  try {
    const response = await fetch("/api/capabilities");
    if (!response.ok) {
      return false;
    }
    const capabilities = await response.json();
    return Boolean(capabilities.accounts);
  } catch {
    // No capabilities endpoint (a plain static server): accounts are off.
    return false;
  }
}

function modeFromAddress() {
  if (location.hash === "#signup") {
    return "signup";
  }
  if (location.hash === "#reset") {
    return "reset";
  }
  return "login";
}

function wireControls() {
  form.addEventListener("submit", handleSubmit);

  element("show-pw").addEventListener("click", function (event) {
    const button = event.currentTarget;
    const willShow = passwordInput.type === "password";
    if (willShow) {
      passwordInput.type = "text";
      button.textContent = "Hide";
    } else {
      passwordInput.type = "password";
      button.textContent = "Show";
    }
    button.setAttribute("aria-pressed", String(willShow));
  });

  element("to-reset").addEventListener("click", function () {
    setMode("reset");
    emailInput.focus();
  });

  switchLine.addEventListener("click", function (event) {
    const button = event.target.closest("[data-mode]");
    if (button) {
      setMode(button.dataset.mode);
      emailInput.focus();
    }
  });

  element("logout").addEventListener("click", async function () {
    await callAuth("logout", {});
    loggedInEmail = null;
    setMode("login");
    showMessage("You're logged out.", "good");
  });

  element("delete-account").addEventListener("click", deleteAccount);

  // An email link opened in a tab already on /login only changes the
  // #fragment, which does not reload the page.
  addEventListener("hashchange", function () {
    if (/access_token=|error_code=/.test(location.hash)) {
      readEmailLink();
    } else if (location.hash === "#signup" || location.hash === "#reset") {
      setMode(location.hash.slice(1));
    }
  });
}

async function start() {
  setMode(modeFromAddress());
  wireControls();

  if (!(await accountsAreOn())) {
    disableForm(ACCOUNTS_OFF_MESSAGE);
    return;
  }
  if (await readEmailLink()) {
    return;
  }
  const result = await callAuth("me");
  if (result.ok && result.data.user) {
    showLoggedIn(result.data.user);
  }
}

start();
