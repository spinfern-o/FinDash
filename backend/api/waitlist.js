/**
 * POST /api/waitlist
 *
 * Adds someone's email to the waitlist, so FinDash can tell them when it
 * opens. That is all it asks for.
 *
 * Request:  { email }
 * Response: { ok: true }, or { error, field: "email" }.
 *
 * No login needed. The email goes to the waitlist table in Supabase, which
 * anyone may add to but nobody can read through this site: only the site's
 * owner, in the Supabase dashboard. The same email twice is kept once, and
 * says so to no one: joining again simply answers "ok".
 */

import { accountsAreSetUp, supabaseClient } from "../../lib/supabase.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The longest email address there can be, and the most the table keeps.
const EMAIL_LIMIT = 254;

/* Trimmed text, or "" when it isn't text. */
function textOf(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

/* The row for the waitlist table, or { error, field } when the email can't
   be used. */
function rowFromAnswers(answers) {
  const email = textOf(answers.email).toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > EMAIL_LIMIT) {
    return { error: "Enter a valid email address.", field: "email" };
  }
  return { email: email };
}

/* The waitlist table isn't ready: the site's owner has not run the SQL in
   supabase/migrations/ (42P01, PGRST205), or not the newest of it, which
   lets a row be just an email (23502: a column still insists on an
   answer). */
function isTableNotReady(error) {
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "23502";
}

/* A browser always says which page a form was sent from. Answers sent from
   another site, or by a script that doesn't say, are refused. */
function isFromThisSite(req) {
  const origin = req.headers.origin;
  if (!origin) {
    return false;
  }
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  if (!isFromThisSite(req)) {
    return res.status(403).json({ error: "request from another site" });
  }
  if (!accountsAreSetUp()) {
    return res.status(503).json({ error: "The waitlist isn't open on this site yet." });
  }

  let answers = {};
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    answers = req.body;
  }

  // A field people never see, which only form-filling robots fill in. They
  // are told it worked, and nothing is kept.
  if (textOf(answers.website)) {
    return res.status(200).json({ ok: true });
  }

  const row = rowFromAnswers(answers);
  if (row.error) {
    return res.status(400).json(row);
  }

  const { error } = await supabaseClient().from("waitlist").insert(row);
  // 23505: this email is on the list already. Nothing to add, nothing to say.
  if (error && error.code !== "23505") {
    console.error("[findash-error] waitlist:", error.code || "", error.message);
    if (isTableNotReady(error)) {
      return res.status(503).json({ error: "The waitlist isn't open on this site yet." });
    }
    return res.status(502).json({ error: "Your email couldn't be saved just now. Try again in a moment." });
  }
  return res.status(200).json({ ok: true });
}
