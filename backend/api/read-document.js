/**
 * POST /api/read-document
 *
 * Reads a photo of a business document (a supplier invoice, a bill, a
 * receipt) and returns its lines as structured data, each line given one of
 * the dashboard's fourteen cost lines.
 *
 * Unlike a spreadsheet, which never leaves the browser, this sends the photo
 * itself: reading a picture needs the model. The page says so before a photo
 * is added, and nothing is stored here: the image exists for the one
 * request. Nothing is added to anyone's figures either: the page shows the
 * reading to the owner, who checks it and decides.
 *
 * Request:  { "image": "<base64 JPEG/PNG/WebP/GIF>", "mediaType": "image/jpeg",
 *             "language": "zh-CN",
 *             "review": { "previous": {...}, "problems": ["..."] } }   (language/review optional)
 * Response: { "document": {...}, "checks": {...}, "model": "..." }
 *
 * The same photo path also counts one shelf, for the stock page: a request
 * with "task": "shelf-count" and "items" (the products the owner tracks
 * on that one shelf) goes to backend/services/vision/shelf-count.js and answers
 * { "reading": { "observations": [...] } }, one observation per product.
 * It is the same login, the same site check and the same daily photo
 * allowance; only the question and the answer differ. A request without
 * "task" is an invoice, exactly as before.
 *
 * "review" is the second look. When a first reading fails its own arithmetic
 * (the lines do not add up to the printed total, or a line's quantity times
 * price is not its amount), the page sends the photo again with that reading
 * and what failed, and the model reads the lines it got wrong again. A
 * separate request rather than a loop in here, so each look gets its own
 * time limit.
 */

import Anthropic from "@anthropic-ai/sdk";
import { allowAiUse } from "../lib/ai-access.js";
import { readShelfCount, shelfItemsProblem } from "../services/vision/shelf-count.js";

const client = new Anthropic();

// These limits bound what one request can cost. A spending limit in the
// Anthropic console is the hard stop. Vercel refuses request bodies over
// 4.5 MB before this code runs; the page shrinks photos well under that.
const MAXIMUM_BASE64_LENGTH = 6_000_000;
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const DOCUMENT_KINDS = ["purchase", "sale", "other"];

/* The dashboard's cost lines, named as backend/legacy-java/data/expenses.csv names them. */
const CATEGORIES = [
  "cogs", "labor", "employee meals", "tax",
  "packaging", "credit card fees", "marketing", "hardware",
  "utilities", "maintenance",
  "rent", "insurance", "business license", "telephone"
];

/* A schema that also allows null. */
function nullable(schema) {
  return { anyOf: [schema, { type: "null" }] };
}

/* Every field required, nulls allowed: structured outputs then guarantee the
   shape, and "not on the document" is an explicit null rather than a guess. */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "legible", "supplier", "customer", "document_number", "date",
             "currency", "lines", "subtotal_printed", "total_printed", "notes"],
  properties: {
    kind: { type: "string", enum: ["purchase", "sale", "other"] },
    legible: { type: "boolean" },
    supplier: nullable({ type: "string" }),
    customer: nullable({ type: "string" }),
    document_number: nullable({ type: "string" }),
    date: nullable({ type: "string", format: "date" }),
    currency: nullable({ type: "string" }),
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "original", "code", "quantity", "unit", "billed_quantity",
                   "unit_price", "amount", "amount_source", "category"],
        properties: {
          description: { type: "string" },
          original: nullable({ type: "string" }),
          code: nullable({ type: "string" }),
          quantity: nullable({ type: "number" }),
          unit: nullable({ type: "string" }),
          billed_quantity: nullable({ type: "number" }),
          unit_price: nullable({ type: "number" }),
          amount: { type: "number" },
          amount_source: { type: "string", enum: ["printed", "computed"] },
          category: { type: "string", enum: CATEGORIES }
        }
      }
    },
    subtotal_printed: nullable({ type: "number" }),
    total_printed: nullable({ type: "number" }),
    notes: { type: "array", items: { type: "string" } }
  }
};

const SYSTEM = `You read photos of documents for FinDash, a monthly finance dashboard for small
business owners, and return what the document says as structured data. The owner sees your
reading before anything is saved, so accuracy matters more than completeness: copy what is
printed, and never invent a figure.

What kind of document it is:
- "purchase": an invoice, bill or receipt for something the business bought.
- "sale": a receipt, till report or statement of money the business took in.
- "other": anything else. Set legible to false when the photo is not a readable financial
  document at all (blurred, cropped past use, not a document).

The lines. One entry per charged item, in the order printed:
- description: the item in English. Many invoices print a name in another language and an
  English description on the same row; use the English one, and put the other-language name,
  exactly as printed, in "original". If there is no English, translate briefly and keep the
  printed text in "original".
- code: the supplier's item code or product number for the line (such as 00660A), exactly as
  printed, or null when the line has none.
- quantity and unit: the count as printed (3 cases, 10 lb, 5 bags).
- billed_quantity: the number the unit price is multiplied by to give the amount. On food
  invoices that is often a weight (meat priced per lb) while produce on the same invoice is
  priced per case. Work out which from the figures, so billed_quantity x unit_price = amount.
- unit_price and amount: copy them exactly as printed; do not round unit prices.
- amount_source: "printed" when you read the amount off the page. When it is cut off, faded,
  covered or creased past reading, work it out from billed_quantity x unit_price and say
  "computed".
- A row under an item that holds only that item's code and a few numbers (the weights of
  individual cases or pieces, for example) belongs to the item above it. It is not a line.
- Free or complimentary items (amount 0, often marked free, N/C or 送) are lines with amount 0.
- Delivery fees, fuel surcharges, deposits and sales tax that are added to the total are lines
  too, so the lines add up to the total. Discounts and credits are negative amounts.
- Handwritten marks (check numbers, initials, ticks, references) are not charges. Mention them
  in notes.

category: the one cost line each charge belongs to.
- cogs: anything sold or used to make what is sold: food, drink, meat, seafood, produce, eggs,
  dry goods, rice, flour, cooking oil, sauces, vinegar, spices, stock bought for resale.
- packaging: takeout containers, bags, cups, lids, wrap, foil, takeaway napkins and cutlery.
- hardware: equipment, appliances, utensils, tools, electronics, furniture.
- maintenance: repairs, servicing, cleaning supplies and services, pest control.
- utilities: electricity, gas, water, waste collection.
- telephone: phone and internet.
- marketing: advertising, printing, promotions, listings.
- credit card fees: card processing and payment fees.
- rent: rent and other property occupancy charges.
- insurance: insurance premiums.
- business license: licences, permits, inspection fees.
- labor: wages, payroll services, staffing agencies, contractors who work shifts.
- employee meals: food bought for staff to eat.
- tax: payroll tax only. Never use it for sales tax: sales tax, delivery fees and surcharges on
  a purchase take the category of the goods they are charged on.

The rest:
- date: the document's date as YYYY-MM-DD (2026/9/26 is 2026-09-26). If day and month could be
  either way round, use the supplier's country to decide and say so in notes.
- supplier is who issued the document; customer is who it is billed to.
- currency: the ISO code if the document shows it (a symbol, or the supplier's country makes
  it plain), otherwise null.
- subtotal_printed and total_printed: as printed, null if not shown or not readable.
- notes: anything the owner should know - unreadable parts, handwritten marks, your doubts.

Before you answer, add up your line amounts and compare the sum with the printed total, and
check each line's billed_quantity x unit_price against its amount. If something does not
match, look at the photo again: a misread digit or a continuation row read as its own line
is the usual cause. If it still does not match, keep what is printed and explain in notes.`;

const AMOUNT_TOLERANCE = 0.015;   // a cent and a half, for rounding on the paper

/* Chinese stock review keeps the source text beside the translated label.
   Existing finance imports continue to request English unless opted in. */
function instructionsForLanguage(language) {
  if (language !== "zh-CN") {
    return SYSTEM;
  }
  return SYSTEM.replace(
    '- description: the item in English. Many invoices print a name in another language and an\n' +
    '  English description on the same row; use the English one, and put the other-language name,\n' +
    '  exactly as printed, in "original". If there is no English, translate briefly and keep the\n' +
    '  printed text in "original".',
    '- description: a brief Simplified Chinese translation of the item, for a Chinese-speaking\n' +
    '  owner to review. original: the exact printed item description, in its source language,\n' +
    '  even when that source is English or Chinese. Never translate or paraphrase original.\n' +
    '  Preserve quantities, printed units and supplier codes without conversion. Write notes\n' +
    '  in Simplified Chinese too. Do not infer shelf stock from an invoice purchase quantity.'
  );
}

function roundToCents(amount) {
  return Math.round(amount * 100) / 100;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOrNull(value) {
  if (isFiniteNumber(value)) {
    return value;
  }
  return null;
}

/* Trimmed text no longer than maximumLength, or null when there is none. */
function textOrNull(value, maximumLength) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, maximumLength);
  }
  return null;
}

/* Whether a line's quantity times its unit price gives its amount. Returns
   null when it adds up (or cannot be checked), otherwise what it should be.
   Either quantity may be the one the price applies to: invoices bill some
   lines by weight and others by count. */
function expectedAmountIfWrong(line) {
  if (!isFiniteNumber(line.unit_price)) {
    return null;
  }
  const quantities = [line.billed_quantity, line.quantity].filter(isFiniteNumber);
  if (!quantities.length) {
    return null;
  }
  const addsUp = quantities.some(function (quantity) {
    return Math.abs(roundToCents(quantity * line.unit_price) - line.amount) <= AMOUNT_TOLERANCE;
  });
  if (addsUp) {
    return null;
  }
  return { quantity: quantities[0], expected: roundToCents(quantities[0] * line.unit_price) };
}

/* Checks the model's arithmetic again here, where it cannot be talked out of. */
export function checkDocument(doc) {
  const problems = [];
  const lineIssues = [];

  doc.lines.forEach(function (line, index) {
    const wrong = expectedAmountIfWrong(line);
    if (wrong) {
      lineIssues.push({ index: index, expected: wrong.expected });
      problems.push(`Line ${index + 1} ("${line.description}"): ${wrong.quantity} x ${line.unit_price} = ` +
        `${wrong.expected}, but the amount read is ${line.amount}.`);
    }
  });

  let linesTotal = 0;
  for (const line of doc.lines) {
    linesTotal += line.amount;
  }
  const lineSum = roundToCents(linesTotal);

  let total = null;
  let difference = null;
  if (isFiniteNumber(doc.total_printed)) {
    total = doc.total_printed;
    difference = roundToCents(lineSum - total);
  }
  if (difference !== null && Math.abs(difference) > AMOUNT_TOLERANCE) {
    problems.push(`The lines add up to ${lineSum.toFixed(2)} but the printed total is ` +
      `${total.toFixed(2)} (a difference of ${difference.toFixed(2)}).`);
  }

  const computedLines = doc.lines.filter(function (line) {
    return line.amount_source === "computed";
  }).length;

  return {
    ok: problems.length === 0,
    lineSum: lineSum,
    total: total,
    difference: difference,
    totalReadable: total !== null,
    lineIssues: lineIssues,
    problems: problems,
    computedLines: computedLines
  };
}

function normaliseLine(line) {
  let amountSource = "printed";
  if (line.amount_source === "computed") {
    amountSource = "computed";
  }
  let category = "cogs";
  if (CATEGORIES.includes(line.category)) {
    category = line.category;
  }
  return {
    description: textOrNull(line.description, 160) || "Item",
    original: textOrNull(line.original, 160),
    code: textOrNull(line.code, 40),
    quantity: numberOrNull(line.quantity),
    unit: textOrNull(line.unit, 40),
    billed_quantity: numberOrNull(line.billed_quantity),
    unit_price: numberOrNull(line.unit_price),
    amount: roundToCents(line.amount),
    amount_source: amountSource,
    category: category
  };
}

function centsOrNull(value) {
  if (isFiniteNumber(value)) {
    return roundToCents(value);
  }
  return null;
}

/* The model's reply matches the schema, but it is still model output: it is
   rebuilt field by field so nothing unexpected reaches the page. */
export function normalise(raw) {
  let lines = [];
  if (Array.isArray(raw.lines)) {
    lines = raw.lines
      .filter(function (line) {
        return line && isFiniteNumber(line.amount);
      })
      .slice(0, 200)
      .map(normaliseLine);
  }

  let date = null;
  if (typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    date = raw.date;
  }
  let currency = null;
  if (typeof raw.currency === "string" && /^[A-Z]{3}$/.test(raw.currency)) {
    currency = raw.currency;
  }
  let kind = "other";
  if (DOCUMENT_KINDS.includes(raw.kind)) {
    kind = raw.kind;
  }

  let notes = [];
  if (Array.isArray(raw.notes)) {
    notes = raw.notes
      .map(function (note) {
        return textOrNull(note, 300);
      })
      .filter(Boolean)
      .slice(0, 12);
  }

  return {
    kind: kind,
    legible: raw.legible !== false,
    supplier: textOrNull(raw.supplier, 120),
    customer: textOrNull(raw.customer, 120),
    document_number: textOrNull(raw.document_number, 60),
    date: date,
    currency: currency,
    lines: lines,
    subtotal_printed: centsOrNull(raw.subtotal_printed),
    total_printed: centsOrNull(raw.total_printed),
    notes: notes
  };
}

function isValidImage(image) {
  return typeof image === "string" && image.length > 0 && image.length <= MAXIMUM_BASE64_LENGTH &&
    /^[A-Za-z0-9+/]+=*$/.test(image);
}

function isReviewRequest(review) {
  return Boolean(review && typeof review === "object" && review.previous && Array.isArray(review.problems));
}

/* The words sent with the photo for a second look. The first reading comes
   back from this function's own earlier answer, but it passes through the
   browser, so it is rebuilt before it goes anywhere near the prompt. */
function reviewInstructions(review) {
  const previous = normalise(review.previous);
  const problems = review.problems
    .filter(function (problem) {
      return typeof problem === "string";
    })
    .map(function (problem) {
      return problem.slice(0, 300);
    })
    .slice(0, 20);

  return "A first reading of this photo is below, but it fails these checks:\n- " +
    problems.join("\n- ") +
    "\n\nLook at the photo again, line by line, and return a corrected reading of the whole " +
    "document. If the printed total itself cannot be read, say so in notes rather than " +
    "forcing the lines to match it.\n\nFirst reading:\n" + JSON.stringify(previous);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const body = req.body ?? {};
  if (body.language !== undefined && body.language !== "en" && body.language !== "zh-CN") {
    return res.status(400).json({ error: "language must be en or zh-CN" });
  }
  const countingAShelf = body.task === "shelf-count";
  if (body.task !== undefined && !countingAShelf) {
    return res.status(400).json({ error: "task, when given, must be shelf-count" });
  }
  if (countingAShelf) {
    const problem = shelfItemsProblem(body.items);
    if (problem) {
      return res.status(400).json({ error: problem });
    }
  }
  if (!isValidImage(body.image)) {
    return res.status(400).json({ error: "image must be base64, under about 4 MB" });
  }
  if (!MEDIA_TYPES.includes(body.mediaType)) {
    return res.status(400).json({ error: "mediaType must be one of " + MEDIA_TYPES.join(", ") });
  }

  // Only for a logged-in person within today's allowance (backend/lib/ai-access.js).
  if (!(await allowAiUse(req, res, "photo"))) {
    return;
  }

  if (countingAShelf) {
    return readShelfCount(client, body, res);
  }

  const content = [
    { type: "image", source: { type: "base64", media_type: body.mediaType, data: body.image } }
  ];
  let effort = "medium";
  if (isReviewRequest(body.review)) {
    content.push({ type: "text", text: reviewInstructions(body.review) });
    // The second look only happens when the first went wrong; it is worth
    // the extra thinking.
    effort = "high";
  } else {
    content.push({ type: "text", text: "Read this document." });
  }

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // A safety classifier can decline a request; "default" runs a declined
      // one again on the model Anthropic recommends for that case, instead of
      // failing the owner's upload.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: effort, format: { type: "json_schema", schema: SCHEMA } },
      system: instructionsForLanguage(body.language),
      messages: [{ role: "user", content: content }]
    });

    if (response.stop_reason === "refusal") {
      console.error("[findash-error] read-document refused:", response.stop_details?.category ?? "unknown");
      return res.status(422).json({ error: "this photo could not be read" });
    }
    if (response.stop_reason === "max_tokens") {
      console.error("[findash-error] read-document truncated: hit max_tokens");
      return res.status(502).json({ error: "the document was too long to read in one go" });
    }

    let reply = "";
    for (const block of response.content) {
      if (block.type === "text") {
        reply += block.text;
      }
    }

    let raw;
    try {
      raw = JSON.parse(reply);
    } catch {
      return res.status(502).json({ error: "the reading came back malformed" });
    }

    const document = normalise(raw);
    return res.status(200).json({ document: document, checks: checkDocument(document), model: response.model });
  } catch (error) {
    // Never repeat the upstream error word for word: it can carry request details.
    console.error("[findash-error] read-document failed:", error);
    return res.status(502).json({ error: "photo reading unavailable" });
  }
}
