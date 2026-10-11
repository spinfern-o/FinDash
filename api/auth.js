/**
 * /api/auth?action=...
 *
 * Accounts, through Supabase Auth, without the browser ever talking to Supabase.
 *
 * The site's Content-Security-Policy (vercel.json) lets a page load scripts
 * only from this site and send requests only to this site. Supabase's
 * browser library would need both rules loosened: it is usually loaded from
 * a CDN, and it calls https://<project>.supabase.co directly. Instead, the
 * page posts to this function, which makes the Supabase calls and keeps the
 * session in cookies page scripts cannot read (see lib/session.js), where
 * the browser library would keep it in localStorage.
 *
 * One function for every action: Vercel's Hobby plan allows 12 per deployment.
 *
 *   POST login    { email, password }              -> { user }
 *   POST signup   { email, password }              -> { user } or { confirm: true }
 *   POST reset    { email }                        -> { ok: true }
 *   POST session  { access_token, refresh_token }  -> { user }   tokens from an email link
 *   POST password { password }                     -> { user }   needs a session
 *   POST logout                                    -> { ok: true }
 *   GET  me                                        -> { user }   user is null when logged out
 */

import { accountsAreSetUp, supabaseClient } from "../lib/supabase.js";
import {
  clearSessionCookies,
  currentSession,
  isSameSite,
  secondsUntilExpiry,
  sessionTokens,
  setSessionCookies
} from "../lib/session.js";

const MINIMUM_PASSWORD_LENGTH = 8;

/* Only the email address goes back to the page. */
function userForPage(user) {
  if (user && user.email) {
    return { email: String(user.email) };
  }
  return { email: null };
}

function isValidEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPassword(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 200;
}

function isLongEnoughPassword(value) {
  return isValidPassword(value) && value.length >= MINIMUM_PASSWORD_LENGTH;
}

function isRateLimit(error) {
  return error.status === 429 || /rate_limit/.test(error.code || "");
}

/* Where links in Supabase's emails send people back to. SITE_URL pins it;
   otherwise this deployment's own address. Supabase only honours addresses
   on the project's redirect allow-list, so a forged Host header goes nowhere. */
function loginPageUrl(req) {
  const base = process.env.SITE_URL || `https://${req.headers.host}`;
  return base.replace(/\/$/, "") + "/login";
}

/* Supabase's error codes, said the way an owner would want to hear them.
   The raw message goes to the log, not the page. */
function fail(res, error, fallbackMessage) {
  const code = error && error.code;
  const status = error && error.status;
  console.error("auth:", code || "", status || "", error && error.message);

  if (code === "invalid_credentials") {
    return res.status(401).json({ error: "That email and password don't match an account." });
  }
  if (code === "email_not_confirmed") {
    return res.status(403).json({ error: "Confirm your email first: open the link we sent you, then log in." });
  }
  if (code === "user_already_exists" || code === "email_exists") {
    return res.status(409).json({ error: "There's already an account with that email. Log in instead." });
  }
  if (code === "weak_password") {
    return res.status(400).json({ error: "Choose a stronger password: at least 8 characters, not a common one." });
  }
  if (code === "same_password") {
    return res.status(400).json({ error: "Choose a password you haven't used for this account before." });
  }
  if (status === 429 || /rate_limit/.test(code || "")) {
    return res.status(429).json({ error: "Too many tries. Wait a minute and try again." });
  }
  return res.status(502).json({ error: fallbackMessage });
}

/* Who is logged in. Not being logged in is an ordinary answer, not an error:
   every logged-out page view asks, and a 401 would print a red line in every
   visitor's console. */
async function whoIsLoggedIn(req, res) {
  const session = await currentSession(req, res);
  if (session) {
    return res.status(200).json({ user: userForPage(session.user) });
  }
  clearSessionCookies(res);
  return res.status(200).json({ user: null });
}

async function logIn(req, res, body) {
  if (!isValidEmail(body.email) || !isValidPassword(body.password)) {
    return res.status(400).json({ error: "Enter your email and password." });
  }
  const { data, error } = await supabaseClient().auth.signInWithPassword({
    email: body.email.trim(),
    password: body.password
  });
  if (error || !data.session) {
    return fail(res, error, "Logging in isn't working right now. Try again soon.");
  }
  setSessionCookies(res, data.session);
  return res.status(200).json({ user: userForPage(data.user) });
}

async function signUp(req, res, body) {
  if (!isValidEmail(body.email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!isLongEnoughPassword(body.password)) {
    return res.status(400).json({ error: `Choose a password of at least ${MINIMUM_PASSWORD_LENGTH} characters.` });
  }
  const { data, error } = await supabaseClient().auth.signUp({
    email: body.email.trim(),
    password: body.password,
    options: { emailRedirectTo: loginPageUrl(req) }
  });
  if (error) {
    return fail(res, error, "Creating an account isn't working right now. Try again soon.");
  }
  // With email confirmation on (Supabase's default) there is no session yet:
  // the person has to click the link in the email first.
  if (!data.session) {
    return res.status(200).json({ confirm: true });
  }
  setSessionCookies(res, data.session);
  return res.status(200).json({ user: userForPage(data.user) });
}

async function sendPasswordReset(req, res, body) {
  if (!isValidEmail(body.email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  const { error } = await supabaseClient().auth.resetPasswordForEmail(body.email.trim(), {
    redirectTo: loginPageUrl(req)
  });
  // The same answer whether or not the email has an account, so this cannot
  // be used to find out who uses FinDash. Only a rate limit is reported.
  if (error && isRateLimit(error)) {
    return fail(res, error, "");
  }
  if (error) {
    console.error("auth reset:", error.code, error.message);
  }
  return res.status(200).json({ ok: true });
}

/* Supabase's confirmation and reset emails come back to /login with the
   session in the address's #fragment, which only the page can see. The page
   hands the tokens over once; they are checked with Supabase before being
   trusted. */
async function startSessionFromEmailLink(req, res, body) {
  const accessToken = body.access_token;
  const refreshToken = body.refresh_token;
  const looksValid = typeof accessToken === "string" && typeof refreshToken === "string" &&
    accessToken.length <= 4096 && refreshToken.length <= 512;
  if (!looksValid) {
    return res.status(400).json({ error: "That link is incomplete. Request a new one." });
  }

  const { data, error } = await supabaseClient().auth.getUser(accessToken);
  if (error || !data.user) {
    return res.status(401).json({ error: "That link has expired. Request a new one." });
  }
  setSessionCookies(res, {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: secondsUntilExpiry(accessToken)
  });
  return res.status(200).json({ user: userForPage(data.user) });
}

async function changePassword(req, res, body) {
  if (!isLongEnoughPassword(body.password)) {
    return res.status(400).json({ error: `Choose a password of at least ${MINIMUM_PASSWORD_LENGTH} characters.` });
  }
  const tokens = sessionTokens(req);
  if (!tokens.accessToken || !tokens.refreshToken) {
    return res.status(401).json({ error: "Your reset link has expired. Request a new one." });
  }

  const client = supabaseClient();
  const started = await client.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken
  });
  if (started.error || !started.data.session) {
    return res.status(401).json({ error: "Your reset link has expired. Request a new one." });
  }

  const { data, error } = await client.auth.updateUser({ password: body.password });
  if (error) {
    return fail(res, error, "Changing your password isn't working right now. Try again soon.");
  }
  setSessionCookies(res, started.data.session);
  return res.status(200).json({ user: userForPage(data.user) });
}

/* Ends the session at Supabase too, so the refresh token is dead even if it
   was copied; then drops the cookies whatever Supabase said. */
async function logOut(req, res) {
  const tokens = sessionTokens(req);
  if (tokens.accessToken) {
    const { error } = await supabaseClient().auth.admin.signOut(tokens.accessToken, "local");
    if (error) {
      console.error("auth logout:", error.code, error.message);
    }
  }
  clearSessionCookies(res);
  return res.status(200).json({ ok: true });
}

const POST_ACTIONS = {
  login: logIn,
  signup: signUp,
  reset: sendPasswordReset,
  session: startSessionFromEmailLink,
  password: changePassword,
  logout: logOut
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!accountsAreSetUp()) {
    return res.status(503).json({ error: "accounts aren't set up on this site yet" });
  }

  const action = String((req.query && req.query.action) || "");
  let body = {};
  if (req.body && typeof req.body === "object") {
    body = req.body;
  }

  if (action === "me") {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "GET only" });
    }
    return whoIsLoggedIn(req, res);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  if (!isSameSite(req)) {
    return res.status(403).json({ error: "request from another site" });
  }

  if (!Object.hasOwn(POST_ACTIONS, action)) {
    return res.status(400).json({ error: "unknown action" });
  }
  const runAction = POST_ACTIONS[action];
  return runAction(req, res, body);
}
