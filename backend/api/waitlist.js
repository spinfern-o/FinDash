/**
 * POST /api/waitlist
 *
 * Adds someone to the waitlist: their email, and a few answers about their
 * business (what kind, where, which languages, how many supplier invoices a
 * month), so FinDash can tell them when new features are ready and learn
 * who it is for before building more.
 *
 * Request:  { email, businessType, country, ownerLanguages, staffLanguages,
 *             invoiceLanguages, otherLanguages, invoicesPerMonth, hardestPart }
 * Response: { ok: true }, or { error, field } naming the answer to fix.
 *
 * No login needed. The answers go to the waitlist table in Supabase, which
 * anyone may add to but nobody can read through this site: only the site's
 * owner, in the Supabase dashboard. The same email twice is kept once, and
 * says so to no one: joining again simply answers "ok".
 */

import { accountsAreSetUp, supabaseClient } from "../../lib/supabase.js";
import { BUSINESS_TYPES, LANGUAGES, LANGUAGE_GROUPS, INVOICE_COUNTS, TEXT_LIMITS } from "../../frontend/js/waitlist-options.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function valuesOf(options) {
  return options.map(function (option) {
    return option.value;
  });
}

/* Trimmed text, or "" when it isn't text. */
function textOf(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

/* A list of known language codes, each once, or null when it isn't one. */
function languageListOf(value) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const known = valuesOf(LANGUAGES);
  const languages = [];
  for (const code of value) {
    if (!known.includes(code)) {
      return null;
    }
    if (!languages.includes(code)) {
      languages.push(code);
    }
  }
  return languages;
}

/* The answers as a row for the waitlist table, or { error, field } for the
   first one that can't be used. */
function rowFromAnswers(answers) {
  const email = textOf(answers.email).toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > TEXT_LIMITS.email) {
    return { error: "Enter a valid email address.", field: "email" };
  }
  if (!valuesOf(BUSINESS_TYPES).includes(answers.businessType)) {
    return { error: "Choose what kind of business you run.", field: "businessType" };
  }
  const country = textOf(answers.country);
  if (!country || country.length > TEXT_LIMITS.country) {
    return { error: "Enter the country your business is in.", field: "country" };
  }

  const row = {
    email: email,
    business_type: answers.businessType,
    country: country
  };
  const columns = { ownerLanguages: "owner_languages", staffLanguages: "staff_languages",
    invoiceLanguages: "invoice_languages" };
  for (const group of LANGUAGE_GROUPS) {
    const languages = languageListOf(answers[group.key]);
    if (languages === null) {
      return { error: "Choose languages from the list, and add any others below it.", field: group.key };
    }
    row[columns[group.key]] = languages;
  }

  const otherLanguages = textOf(answers.otherLanguages);
  if (otherLanguages.length > TEXT_LIMITS.otherLanguages) {
    return { error: "Keep other languages to a short list.", field: "otherLanguages" };
  }
  row.other_languages = otherLanguages || null;

  if (!valuesOf(INVOICE_COUNTS).includes(answers.invoicesPerMonth)) {
    return { error: "Choose about how many supplier invoices you get a month.", field: "invoicesPerMonth" };
  }
  row.invoices_per_month = answers.invoicesPerMonth;

  const hardestPart = textOf(answers.hardestPart);
  if (hardestPart.length > TEXT_LIMITS.hardestPart) {
    return { error: `Keep it under ${TEXT_LIMITS.hardestPart} characters.`, field: "hardestPart" };
  }
  row.hardest_part = hardestPart || null;
  return row;
}

/* The waitlist table does not exist yet: the site's owner has not run the
   SQL in supabase/migrations/. */
function isMissingTable(error) {
  return error.code === "42P01" || error.code === "PGRST205";
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
    if (isMissingTable(error)) {
      return res.status(503).json({ error: "The waitlist isn't open on this site yet." });
    }
    return res.status(502).json({ error: "Your answers couldn't be saved just now. Try again in a moment." });
  }
  return res.status(200).json({ ok: true });
}
