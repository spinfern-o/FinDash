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
 * Response: { "mapping": { "cogs": "Cost of Goods", "labor": null } }
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// This endpoint is public and unauthenticated - anyone who finds it can spend
// credits through it. These caps bound the damage; a spend limit set in the
// Anthropic console is the only hard stop.
const MAX_HEADERS = 120;
const MAX_FIELDS = 60;
const MAX_LABEL = 200;

/** Hostnames allowed to call this. Empty list = allow any origin. */
const ALLOWED_HOSTS = ["findash.tech", "www.findash.tech", "localhost"];

function originAllowed(req) {
  if (!ALLOWED_HOSTS.length) return true;
  const raw = req.headers.origin || req.headers.referer || "";
  let host;
  // Compare the parsed hostname, not a substring: "findash.tech" appears inside
  // "findash.tech.attacker.com" too, and a substring test would wave it through.
  try {
    host = new URL(raw).hostname;
  } catch {
    return false;                       // no Origin, or one we cannot parse
  }
  return ALLOWED_HOSTS.includes(host);
}

const isCleanList = (v, max) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= max &&
  v.every((s) => typeof s === "string" && s.length <= MAX_LABEL);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  if (!originAllowed(req)) {
    return res.status(403).json({ error: "origin not allowed" });
  }

  const { headers, fields } = req.body ?? {};

  if (!isCleanList(headers, MAX_HEADERS)) {
    return res.status(400).json({ error: `headers must be 1-${MAX_HEADERS} strings` });
  }
  if (!isCleanList(fields, MAX_FIELDS)) {
    return res.status(400).json({ error: `fields must be 1-${MAX_FIELDS} strings` });
  }

  const prompt = `You are mapping spreadsheet column headers to canonical accounting fields.

Canonical fields needing a column: ${fields.join(", ")}

The file's headers, in order: ${headers.join(", ")}

Reply with JSON only - no prose, no code fences. One key per canonical field
listed above, whose value is the header text it corresponds to, or null if no
header fits. Copy header text exactly as given.
Example: {"cogs": "Cost of Goods", "labor": null}`;

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
    const open = text.indexOf("{");
    const close = text.lastIndexOf("}");
    if (open < 0 || close <= open) {
      return res.status(502).json({ error: "model did not return JSON" });
    }

    let mapping;
    try {
      mapping = JSON.parse(text.slice(open, close + 1));
    } catch {
      return res.status(502).json({ error: "model returned malformed JSON" });
    }

    // Drop anything invented: every value must be a header actually sent to us,
    // and every key must be a field that was actually asked about.
    const clean = {};
    for (const [field, header] of Object.entries(mapping)) {
      if (!fields.includes(field)) continue;
      if (header === null) continue;
      if (typeof header === "string" && headers.includes(header)) {
        clean[field] = header;
      }
    }

    return res.status(200).json({ mapping: clean });
  } catch (err) {
    // Never echo the upstream error verbatim - it can carry request details.
    console.error("map-columns failed:", err);
    return res.status(502).json({ error: "column mapping unavailable" });
  }
}
