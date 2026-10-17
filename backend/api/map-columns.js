/**
 * POST /api/map-columns
 *
 * Matches spreadsheet column headers to FinDash's own field names.
 *
 * Only header TEXT is accepted and passed on, never a row of figures. The
 * browser keeps the figures, does the arithmetic, and asks this function one
 * question: which header means what. That keeps the request tiny whatever
 * the size of the file, and keeps anyone's finances off this server.
 *
 * Request:  { "headers":   ["Month", "Cost of Goods", ...],
 *             "fields":    ["month num", "cogs", ...],      fields no column matched
 *             "unclaimed": ["Bank service charge", ...] }   columns that matched nothing
 * Response: { "mapping": { "cogs": "Cost of Goods" },
 *             "other":   { "Bank service charge": "operating" } }
 *
 * "other" puts each column that matched no field into the cost group it
 * behaves like, so its money still reaches the totals instead of silently
 * reading zero.
 */

import Anthropic from "@anthropic-ai/sdk";
import { allowAiUse } from "../../lib/ai-access.js";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// This function is public and needs no login: anyone who finds it can spend
// credits through it. These limits bound the damage; a spending limit set in
// the Anthropic console is the only hard stop.
const MAXIMUM_HEADERS = 120;
const MAXIMUM_FIELDS = 60;
const MAXIMUM_LABEL_LENGTH = 200;

/* The four cost groups an unmatched column can be put in. */
const COST_GROUPS = ["direct", "operating", "variable", "fixed"];

/* Sites allowed to call this. An empty list allows any. */
const ALLOWED_HOSTS = [];

function isAllowedOrigin(req) {
  if (!ALLOWED_HOSTS.length) {
    return true;
  }
  const origin = req.headers.origin || req.headers.referer || "";
  return ALLOWED_HOSTS.some(function (host) {
    return origin.includes(host);
  });
}

function isListOfLabels(value, minimumLength, maximumLength) {
  if (!Array.isArray(value) || value.length < minimumLength || value.length > maximumLength) {
    return false;
  }
  return value.every(function (label) {
    return typeof label === "string" && label.length <= MAXIMUM_LABEL_LENGTH;
  });
}

function buildPrompt(headers, fields, unclaimedHeaders) {
  let unclaimedList = "(none)";
  if (unclaimedHeaders.length) {
    unclaimedList = unclaimedHeaders.join(", ");
  }

  return `You are mapping spreadsheet column headers to canonical accounting fields.

Canonical fields needing a column: ${fields.join(", ")}

The file's headers, in order: ${headers.join(", ")}

Reply with JSON only - no prose, no code fences - shaped like:
{"mapping": {"cogs": "Cost of Goods", "labor": null},
 "other":   {"Bank service charge": "operating"}}

"mapping": one key per canonical field listed above, whose value is the header
text it corresponds to, or null if no header fits.

Columns still unspoken for: ${unclaimedList}

"other": for each of those unspoken-for columns that is a real cost - and ONLY
those - which of these four buckets it behaves like: direct (traceable to a unit or job),
operating (scales with volume but not per-unit), variable (rises with activity,
but not proportionally), fixed (does not move with sales). Omit a header that is
not a cost, or that is a subtotal of other columns - counting a subtotal
alongside its parts double-counts the money.

Copy header text exactly as given.`;
}

/* The JSON object in the model's reply, from the first "{" to the last "}":
   { value }, or { error } saying what was wrong with the reply. */
function jsonInReply(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { error: "model did not return JSON" };
  }
  try {
    return { value: JSON.parse(text.slice(start, end + 1)) };
  } catch {
    return { error: "model returned malformed JSON" };
  }
}

/* Drops anything made up: every key must be a field that was asked about,
   and every value a header that was actually sent. */
function checkedMapping(reply, headers, fields) {
  const mapping = {};
  for (const [field, header] of Object.entries(reply.mapping ?? {})) {
    if (!fields.includes(field) || header === null) {
      continue;
    }
    if (typeof header === "string" && headers.includes(header)) {
      mapping[field] = header;
    }
  }
  return mapping;
}

/* The same care for the cost groups: a real header, a real group, and never
   a column already matched to a field, or its money would count twice. */
function checkedLeftovers(reply, headers, unclaimedHeaders, mapping) {
  const matchedHeaders = new Set(Object.values(mapping));
  const leftovers = {};
  for (const [header, group] of Object.entries(reply.other ?? {})) {
    if (!headers.includes(header) || matchedHeaders.has(header)) {
      continue;
    }
    // When the caller said which columns are unmatched, keep to that list: a
    // column it has already matched must never come back as a leftover.
    if (unclaimedHeaders.length && !unclaimedHeaders.includes(header)) {
      continue;
    }
    if (COST_GROUPS.includes(group)) {
      leftovers[header] = group;
    }
  }
  return leftovers;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: "origin not allowed" });
  }

  const body = req.body ?? {};
  const headers = body.headers;
  const fields = body.fields;

  if (!isListOfLabels(headers, 1, MAXIMUM_HEADERS)) {
    return res.status(400).json({ error: `headers must be 1-${MAXIMUM_HEADERS} strings` });
  }
  // fields can rightly be empty: every field can already be matched on the
  // page while unknown cost columns still need a group. Refusing that made
  // the page drop those columns, understating costs.
  if (!isListOfLabels(fields, 0, MAXIMUM_FIELDS)) {
    return res.status(400).json({ error: `fields must be 0-${MAXIMUM_FIELDS} strings` });
  }

  // Which headers are still free. Without this the model is asked to group
  // columns the page has already matched, and answers for all of them.
  let unclaimedHeaders = [];
  if (Array.isArray(body.unclaimed)) {
    unclaimedHeaders = body.unclaimed.filter(function (header) {
      return typeof header === "string" && headers.includes(header);
    });
  }

  // There must be SOMETHING to ask about: an unmatched field or an unmatched
  // column. Neither on its own is required.
  if (!fields.length && !unclaimedHeaders.length) {
    return res.status(400).json({ error: "nothing to map: send unplaced fields or unclaimed headers" });
  }

  // Only for a logged-in person within today's allowance (lib/ai-access.js).
  if (!(await allowAiUse(req, res, "columns"))) {
    return;
  }

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      // Room for the model's thinking as well as the small reply.
      max_tokens: 16000,
      // A safety classifier can decline a request; "default" runs a declined
      // one again on the model Anthropic recommends for that case.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      // Matching names is a simple job: little thinking needed.
      output_config: { effort: "low" },
      messages: [{ role: "user", content: buildPrompt(headers, fields, unclaimedHeaders) }]
    });

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      console.error("[findash-error] map-columns stopped:", response.stop_reason);
      return res.status(502).json({ error: "column mapping unavailable" });
    }

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      }
    }

    // Forgiving about code fences or stray words around the object.
    const reply = jsonInReply(text);
    if (reply.error) {
      return res.status(502).json({ error: reply.error });
    }

    const mapping = checkedMapping(reply.value, headers, fields);
    const other = checkedLeftovers(reply.value, headers, unclaimedHeaders, mapping);
    return res.status(200).json({ mapping: mapping, other: other });
  } catch (error) {
    // Never repeat the upstream error word for word: it can carry request details.
    console.error("[findash-error] map-columns failed:", error);
    return res.status(502).json({ error: "column mapping unavailable" });
  }
}
