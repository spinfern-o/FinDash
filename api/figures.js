/**
 * /api/figures
 *
 * The logged-in owner's figures, saved in their account so they are there on
 * any computer they log in on.
 *
 *   GET                -> { figures, updatedAt }   figures is null when nothing is saved
 *   PUT  { figures }   -> { updatedAt }
 *   DELETE             -> { ok: true }
 *
 * What is saved is what the dashboard keeps in the browser: the worked-out
 * monthly totals and the invoice lines the owner confirmed. Never the
 * spreadsheet itself, never a photo.
 *
 * Requests go to the database as the logged-in person (lib/supabase.js), and
 * the table's row-level security (supabase/migrations/) only lets anyone
 * reach their own row. This function could not read someone else's figures
 * even if it tried.
 */

import { accountsAreSetUp, supabaseClient } from "../lib/supabase.js";
import { currentSession, isSameSite } from "../lib/session.js";

const TABLE = "account_figures";

/* Far more than a business needs (50 years of months, thousands of
   invoices), and small enough that no one can use this as free storage. */
const MAXIMUM_BYTES = 1_000_000;
const MAXIMUM_MONTHS = 600;
const MAXIMUM_INVOICES = 5000;

/* The table has not been created yet: the site's owner has not run the SQL
   in supabase/migrations/. */
function isMissingTable(error) {
  return error.code === "42P01" || error.code === "PGRST205";
}

function storageFailed(res, error, message) {
  console.error("[findash-error] figures:", error.code || "", error.message);
  if (isMissingTable(error)) {
    return res.status(503).json({ error: "saving to accounts isn't set up on this site yet" });
  }
  return res.status(502).json({ error: message });
}

/* A reason the figures cannot be saved, or "" when they are fine. Only the
   shape and size are checked here; the dashboard checks every field again
   when it loads them. */
function problemWithFigures(figures) {
  if (!figures || typeof figures !== "object" || Array.isArray(figures)) {
    return "figures must be an object";
  }
  if (!Array.isArray(figures.months) || !Array.isArray(figures.invoices)) {
    return "figures need a list of months and a list of invoices";
  }
  if (figures.months.length > MAXIMUM_MONTHS) {
    return `at most ${MAXIMUM_MONTHS} months can be saved`;
  }
  if (figures.invoices.length > MAXIMUM_INVOICES) {
    return `at most ${MAXIMUM_INVOICES} invoices can be saved`;
  }
  if (Buffer.byteLength(JSON.stringify(figures), "utf8") > MAXIMUM_BYTES) {
    return "these figures are too large to save";
  }
  return "";
}

async function loadFigures(res, client) {
  const { data, error } = await client.from(TABLE).select("figures, updated_at").maybeSingle();
  if (error) {
    return storageFailed(res, error, "Your saved figures couldn't be loaded right now.");
  }
  if (!data) {
    return res.status(200).json({ figures: null, updatedAt: null });
  }
  return res.status(200).json({ figures: data.figures, updatedAt: data.updated_at });
}

async function saveFigures(res, client, user, body) {
  const problem = problemWithFigures(body.figures);
  if (problem) {
    return res.status(400).json({ error: problem });
  }
  const updatedAt = new Date().toISOString();
  const { error } = await client.from(TABLE).upsert({
    user_id: user.id,
    figures: body.figures,
    updated_at: updatedAt
  });
  if (error) {
    return storageFailed(res, error, "Your figures couldn't be saved to your account right now.");
  }
  return res.status(200).json({ updatedAt: updatedAt });
}

async function deleteFigures(res, client, user) {
  const { error } = await client.from(TABLE).delete().eq("user_id", user.id);
  if (error) {
    return storageFailed(res, error, "Your figures couldn't be removed from your account right now.");
  }
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!accountsAreSetUp()) {
    return res.status(503).json({ error: "accounts aren't set up on this site yet" });
  }
  if (req.method !== "GET" && req.method !== "PUT" && req.method !== "DELETE") {
    return res.status(405).json({ error: "GET, PUT or DELETE only" });
  }
  if (req.method !== "GET" && !isSameSite(req)) {
    return res.status(403).json({ error: "request from another site" });
  }

  const session = await currentSession(req, res);
  if (!session) {
    return res.status(401).json({ error: "Log in to save your figures to your account." });
  }
  const client = supabaseClient(session.accessToken);

  if (req.method === "GET") {
    return loadFigures(res, client);
  }
  if (req.method === "PUT") {
    let body = {};
    if (req.body && typeof req.body === "object") {
      body = req.body;
    }
    return saveFigures(res, client, session.user, body);
  }
  return deleteFigures(res, client, session.user);
}
