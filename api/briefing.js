/**
 * POST /api/briefing
 *
 * Turns a run of monthly figures into what to do next: opportunities, risks,
 * and a short action checklist.
 *
 * UNLIKE /api/map-columns, this one does receive figures. Column mapping only
 * ever sees header text; advice cannot be given without the numbers. That is a
 * real change in what leaves the browser, so the page only calls this when the
 * reader presses the button - never on load, never on upload.
 *
 * Even so it takes only the per-month TOTALS the dashboard already displays -
 * revenue, the four bucket totals, net, budget. No line items, no counterparties,
 * no names. Nothing is stored here; the figures exist for the one request.
 *
 * Request:  { "months": [{month, revenue, directExpenses, operatingExpenses,
 *                         variableOverhead, fixedOverhead, totalExpenses,
 *                         netProfit, budget}] }
 * Response: { "opportunities": [...], "risks": [...], "actions": [...] }
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const MAX_MONTHS = 36;

/** Exactly the fields we are willing to forward. Anything else is dropped. */
const ALLOWED = [
  "month", "revenue", "directExpenses", "operatingExpenses", "variableOverhead",
  "fixedOverhead", "totalExpenses", "netProfit", "budget"
];

const num = v => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);

/** Keep a list of short strings, so a long model reply cannot flood the page. */
const strings = (v, cap) =>
  Array.isArray(v)
    ? v.filter(x => typeof x === "string" && x.trim()).map(x => x.trim().slice(0, 400)).slice(0, cap)
    : [];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { months } = req.body ?? {};
  if (!Array.isArray(months) || !months.length || months.length > MAX_MONTHS) {
    return res.status(400).json({ error: `months must be 1-${MAX_MONTHS} entries` });
  }

  // Rebuild each row from the allowlist rather than forwarding what was sent.
  // A caller cannot smuggle extra fields through by adding them to the body.
  const clean = months.map(m => {
    const row = {};
    for (const k of ALLOWED) {
      row[k] = k === "month" ? String(m[k] ?? "").slice(0, 40) : num(m[k]);
    }
    return row;
  });

  const prompt = `You are advising the owner of a small business on their own monthly figures.
Every amount is in whole currency units. Costs are grouped into four buckets:
direct (traceable to a unit or job), operating (scales with volume but not
per-unit), variable overhead (rises with activity, not proportionally), and
fixed overhead (does not move with sales).

Monthly figures:
${JSON.stringify(clean, null, 1)}

Reply with JSON only - no prose, no code fences:
{"opportunities": ["..."], "risks": ["..."], "actions": ["..."]}

- opportunities: up to 3 things working in their favour, or worth pressing.
- risks: up to 3 things that will cost them money if left alone.
- actions: up to 4 concrete next steps, each starting with a verb.

Rules: cite the actual figures and month names you were given. Say "labour rose
18% while revenue fell 4%", not "costs appear elevated". Keep each item to one
sentence. If the data does not support a point, leave it out rather than padding
the list. You are not a licensed financial adviser - suggest operational steps,
never investment or tax advice.`;

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    const open = text.indexOf("{");
    const close = text.lastIndexOf("}");
    if (open < 0 || close <= open) {
      return res.status(502).json({ error: "model did not return JSON" });
    }

    let parsed;
    try {
      parsed = JSON.parse(text.slice(open, close + 1));
    } catch {
      return res.status(502).json({ error: "model returned malformed JSON" });
    }

    return res.status(200).json({
      opportunities: strings(parsed.opportunities, 3),
      risks: strings(parsed.risks, 3),
      actions: strings(parsed.actions, 4),
    });
  } catch (err) {
    console.error("briefing failed:", err);
    return res.status(502).json({ error: "briefing unavailable" });
  }
}
