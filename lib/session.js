/* The login session, kept in two cookies that page scripts cannot read.

   fd_access   a short-lived access token (about an hour)
   fd_refresh  a refresh token that gets a new access token without asking
               for the password again, for up to 30 days

   Path=/api: the cookies go only to these functions, never to the pages.
   HttpOnly: no script can read them, including anything that ever got
   injected into a page. SameSite=Lax: another site cannot make a logged-in
   request on someone's behalf with a form post. */

import { supabaseClient } from "./supabase.js";

const ACCESS_COOKIE = "fd_access";
const REFRESH_COOKIE = "fd_refresh";
const REFRESH_DAYS = 30;
const SECONDS_PER_DAY = 86400;

function cookieHeader(name, value, maxAgeSeconds) {
  return `${name}=${encodeURIComponent(value)}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

/* Stores a Supabase session in the cookies. The access cookie lasts as long
   as the token itself, and never less than a minute. */
export function setSessionCookies(res, session) {
  const accessSeconds = Math.max(60, Math.round(session.expires_in || 3600));
  res.setHeader("Set-Cookie", [
    cookieHeader(ACCESS_COOKIE, session.access_token, accessSeconds),
    cookieHeader(REFRESH_COOKIE, session.refresh_token, REFRESH_DAYS * SECONDS_PER_DAY)
  ]);
}

export function clearSessionCookies(res) {
  res.setHeader("Set-Cookie", [cookieHeader(ACCESS_COOKIE, "", 0), cookieHeader(REFRESH_COOKIE, "", 0)]);
}

/* The request's cookies as { name: value }. A malformed cookie is ignored,
   as if it were not there. */
function readCookies(req) {
  const cookies = {};
  const parts = String(req.headers.cookie || "").split(";");
  for (const part of parts) {
    const equalsAt = part.indexOf("=");
    if (equalsAt < 1) {
      continue;
    }
    const name = part.slice(0, equalsAt).trim();
    try {
      cookies[name] = decodeURIComponent(part.slice(equalsAt + 1).trim());
    } catch {
      // Not valid percent-encoding; skip it.
    }
  }
  return cookies;
}

/* The tokens in this request's cookies: { accessToken, refreshToken }. */
export function sessionTokens(req) {
  const cookies = readCookies(req);
  return { accessToken: cookies[ACCESS_COOKIE], refreshToken: cookies[REFRESH_COOKIE] };
}

/* Seconds until a token expires, from its own "exp" claim. */
export function secondsUntilExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    if (payload.exp) {
      return payload.exp - Date.now() / 1000;
    }
    return 3600;
  } catch {
    return 3600;
  }
}

/* A browser always sends Origin on a cross-site POST. A request from another
   site is refused, which also stops someone logging a visitor into the
   wrong account. */
export function isSameSite(req) {
  const origin = req.headers.origin;
  if (!origin) {
    return true;
  }
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/* The person behind this request: { user, accessToken }, or null when no one
   is logged in. An expired access token is swapped for a new one using the
   refresh token, and the new tokens are put back in the cookies. */
export async function currentSession(req, res) {
  const tokens = sessionTokens(req);

  if (tokens.accessToken) {
    const { data, error } = await supabaseClient().auth.getUser(tokens.accessToken);
    if (!error && data.user) {
      return { user: data.user, accessToken: tokens.accessToken };
    }
  }

  if (tokens.refreshToken) {
    const { data, error } = await supabaseClient().auth.refreshSession({ refresh_token: tokens.refreshToken });
    if (!error && data.session) {
      setSessionCookies(res, data.session);
      return { user: data.session.user, accessToken: data.session.access_token };
    }
  }

  return null;
}
