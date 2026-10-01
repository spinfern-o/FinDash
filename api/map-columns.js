/**
 * POST /api/map-columns
 *
 * Maps spreadsheet column headers onto canonical accounting fields.
 *
 * Only header TEXT is accepted and forwarded - never a row of figures. The
 * browser keeps the data, does the arithmetic, and asks this endpoint one
 * question: which header means what. That keeps the request tiny regardless
 * of file size, and keeps anyone's financials off this server.
 *
 * Request:  { "headers": ["Month", "Cost of Goods", ...],
 *             "fields":  ["month num", "cogs", ...] }
 * Response: { "mapping": { "cogs": "Cost of Goods", "labor": null },
 *             "other":   { "Bank service charge": "operating" } }
 *
 * "other" assigns each column that matched no field to the bucket it behaves
 * like, so its money still reaches the totals instead of silently reading zero.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// This endpoint is public and unauthenticated - anyone who finds it can spend
// credits through it. These caps bound the damage; a spend limit set in the
// Anthropic console is the only hard stop.
const MAX_HEADERS = 120;
const MAX_FIELDS = 60;
const MAX_LABEL = 200;

/** The four buckets an unmatched column can be assigned to. */
const BUCKETS = ["direct", "operating", "variable", "fixed"];

/** Domains allowed to call this. Empty list = allow any origin. */
const ALLOWED_HOSTS = [];

function originAllowed(req) {
  if (!ALLOWED_HOSTS.length) return true;
  const origin = req.headers.origin || req.headers.referer || "";
  return ALLOWED_HOSTS.some((h) => origin.includes(h));
}

const isCleanList = (v, max, min = 1) =>
  Array.isArray(v) &&
  v.length >= min &&
  v.length <= max &&
  v.every((s) => typeof s === "string" && s.length <= MAX_LABEL);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  if (!originAllowed(req)) {
    return res.status(403).json({ error: "origin not allowed" });
  }

  const { headers, fields, unclaimed } = req.body ?? {};

  if (!isCleanList(headers, MAX_HEADERS)) {
    return res.status(400).json({ error: `headers must be 1-${MAX_HEADERS} strings` });
  }
  // fields may legitimately be empty: every canonical field can already be
  // placed locally while unknown cost columns still need bucketing. Rejecting
  // that case made the caller drop those columns, understating expenses.
  if (!isCleanList(fields, MAX_FIELDS, 0)) {
    return res.status(400).json({ error: `fields must be 0-${MAX_FIELDS} strings` });
  }
  // Which headers are still up for grabs. Without this the model is asked to
  // bucket columns the caller has already matched, and answers for all of them.
  // There must be SOMETHING to ask about - either an unplaced field or an
  // unclaimed column. Neither on its own is required.
  const unclaimedHeaders = Array.isArray(unclaimed)
    ? unclaimed.filter(h => typeof h === "string" && headers.includes(h))
    : [];

  if (!fields.length && !unclaimedHeaders.length) {
    return res.status(400).json({ error: "nothing to map: send unplaced fields or unclaimed headers" });
  }

  const prompt = `You are mapping spreadsheet column headers to canonical accounting fields.

Canonical fields needing a column: ${fields.join(", ")}

The file's headers, in order: ${headers.join(", ")}

Reply with JSON only - no prose, no code fences - shaped like:
{"mapping": {"cogs": "Cost of Goods", "labor": null},
 "other":   {"Bank service charge": "operating"}}

"mapping": one key per canonical field listed above, whose value is the header
text it corresponds to, or null if no header fits.

Columns still unspoken for: ${unclaimedHeaders.length ? unclaimedHeaders.join(", ") : "(none)"}

"other": for each of those unspoken-for columns that is a real cost - and ONLY
those - which of these four buckets it behaves like: direct (traceable to a unit or job),
operating (scales with volume but not per-unit), variable (rises with activity,
but not proportionally), fixed (does not move with sales). Omit a header that is
not a cost, or that is a subtotal of other columns - counting a subtotal
alongside its parts double-counts the money.

Copy header text exactly as given.`;

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    // content is a discriminated union - narrow before reading .text
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Be forgiving about fences or stray prose around the object.
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      return res.status(502).json({ error: "model did not return JSON" });
    }

    let mapping;
    try {
      mapping = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    } catch {
      return res.status(502).json({ error: "model returned malformed JSON" });
    }

    // Drop anything invented: every value must be a header actually sent to us,
    // and every key must be a field that was actually asked about.
    const clean = {};
    for (const [field, header] of Object.entries(mapping.mapping ?? {})) {
      if (!fields.includes(field)) continue;
      if (header === null) continue;
      if (typeof header === "string" && headers.includes(header)) {
        clean[field] = header;
      }
    }

    // Same discipline for the bucket assignments: a real header, a real bucket,
    // and never a column already claimed by a named field.
    const claimed = new Set(Object.values(clean));
    const other = {};
    for (const [header, bucket] of Object.entries(mapping.other ?? {})) {
      if (!headers.includes(header) || claimed.has(header)) continue;
      // When the caller said what is unclaimed, honour it: a column it has
      // already matched must never come back as a leftover, or its money is
      // counted twice - once in its named field and once in a bucket.
      if (unclaimedHeaders.length && !unclaimedHeaders.includes(header)) continue;
      if (BUCKETS.includes(bucket)) other[header] = bucket;
    }

    return res.status(200).json({ mapping: clean, other });
  } catch (err) {
    // Never echo the upstream error verbatim - it can carry request details.
    console.error("map-columns failed:", err);
    return res.status(502).json({ error: "column mapping unavailable" });
  }
}
