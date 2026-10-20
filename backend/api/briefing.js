/**
 * POST /api/briefing
 *
 * Turns a run of monthly figures into what to do next: opportunities, risks,
 * and a short list of actions.
 *
 * UNLIKE /api/map-columns, this one does receive figures. Column matching
 * only ever sees header text; advice cannot be given without the numbers.
 * That is a real change in what leaves the browser, so the page only calls
 * this when the reader presses the button: never on load, never on upload.
 *
 * Even so it takes only the per-month TOTALS the dashboard already shows:
 * revenue, the four cost group totals, net profit, budget. No line items, no
 * suppliers, no names. Nothing is stored here; the figures exist for the one
 * request.
 *
 * Request:  { "months": [{ month, revenue, directExpenses, operatingExpenses,
 *                          variableOverhead, fixedOverhead, totalExpenses,
 *                          netProfit, budget }],
 *             "currency": "USD" }        (optional ISO 4217 code)
 * Response: { "opportunities": [...], "risks": [...], "actions": [...] }
 */

import Anthropic from "@anthropic-ai/sdk";
import { allowAiUse } from "../lib/ai-access.js";

const client = new Anthropic();

const MAXIMUM_MONTHS = 36;

/* Exactly the fields that are passed on to the model. Anything else is dropped. */
const ALLOWED_FIELDS = [
  "month", "revenue", "directExpenses", "operatingExpenses", "variableOverhead",
  "fixedOverhead", "totalExpenses", "netProfit", "budget"
];

function wholeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  return 0;
}

/* Keeps a list of short strings, so a long model reply cannot flood the page. */
function shortStrings(value, maximumCount) {
  if (!Array.isArray(value)) {
    return [];
  }
  const kept = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      kept.push(item.trim().slice(0, 400));
    }
  }
  return kept.slice(0, maximumCount);
}

/* Each month rebuilt from the allowed fields rather than passed on as sent:
   a caller cannot smuggle extra fields through by adding them to the body. */
function cleanMonth(month) {
  const row = {};
  for (const field of ALLOWED_FIELDS) {
    if (field === "month") {
      row.month = String(month.month ?? "").slice(0, 40);
    } else {
      row[field] = wholeNumber(month[field]);
    }
  }
  return row;
}

function buildPrompt(months, currencyCode) {
  let unitsLine = "Every amount is in whole currency units.";
  if (currencyCode) {
    unitsLine = `Every amount is in whole ${currencyCode} units; write amounts in ${currencyCode}.`;
  }

  return `You are advising the owner of a small business on their own monthly figures.
${unitsLine} Costs are grouped into four buckets:
direct (traceable to a unit or job), operating (scales with volume but not
per-unit), variable overhead (rises with activity, not proportionally), and
fixed overhead (does not move with sales).

"budget" is the planned ceiling for TOTAL EXPENSES that month - it is not a
revenue target. Compare it against totalExpenses only. A month is over budget
when totalExpenses exceeds budget; saying revenue "beat budget" is a category
error and must not appear.

Monthly figures:
${JSON.stringify(months, null, 1)}

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const body = req.body ?? {};
  const months = body.months;
  if (!Array.isArray(months) || !months.length || months.length > MAXIMUM_MONTHS) {
    return res.status(400).json({ error: `months must be 1-${MAXIMUM_MONTHS} entries` });
  }

  // The page shows amounts in the reader's chosen currency; advice written in
  // dollars beside a dashboard in euros reads as a mistake. Three capital
  // letters or nothing: free text never reaches the prompt.
  let currencyCode = null;
  if (typeof body.currency === "string" && /^[A-Z]{3}$/.test(body.currency)) {
    currencyCode = body.currency;
  }

  // Only for a logged-in person within today's allowance (backend/lib/ai-access.js).
  if (!(await allowAiUse(req, res, "advice"))) {
    return;
  }

  const prompt = buildPrompt(months.map(cleanMonth), currencyCode);

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      // Room for the model's thinking as well as the reply. 12 months of
      // figures once overran a 2048 ceiling and was cut off mid-JSON; the
      // server caps the list lengths anyway, so unused room costs nothing.
      max_tokens: 16000,
      // A safety classifier can decline a request; "default" runs a declined
      // one again on the model Anthropic recommends for that case.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: prompt }]
    });

    if (response.stop_reason === "refusal") {
      console.error("[findash-error] briefing refused:", response.stop_details?.category ?? "unknown");
      return res.status(422).json({ error: "advice couldn't be written for these figures" });
    }

    // Cut off is not the same as malformed: say which it is, or the next
    // person debugging this chases a JSON bug that is really a length limit.
    if (response.stop_reason === "max_tokens") {
      console.error("[findash-error] briefing truncated: hit max_tokens");
      return res.status(502).json({ error: "the briefing ran long and was cut off - try a shorter period" });
    }

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      }
    }

    const reply = jsonInReply(text);
    if (reply.error) {
      return res.status(502).json({ error: reply.error });
    }

    return res.status(200).json({
      opportunities: shortStrings(reply.value.opportunities, 3),
      risks: shortStrings(reply.value.risks, 3),
      actions: shortStrings(reply.value.actions, 4)
    });
  } catch (error) {
    console.error("[findash-error] briefing failed:", error);
    return res.status(502).json({ error: "briefing unavailable" });
  }
}
