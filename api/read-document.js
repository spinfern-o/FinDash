/**
 * POST /api/read-document
 *
 * Reads a photo of a business document - a supplier invoice, a bill, a
 * receipt - and returns its lines as structured data, each line assigned to
 * one of the dashboard's fourteen cost lines.
 *
 * Unlike the spreadsheet path, which never leaves the browser, this sends the
 * photo itself: reading a picture needs the model. The page says so before a
 * photo is added, and nothing is stored here - the image exists for the one
 * request. Nothing is added to anyone's figures either: the page shows the
 * reading back to the owner, who checks it and decides.
 *
 * Request:  { "image": "<base64 JPEG/PNG/WebP/GIF>", "mediaType": "image/jpeg",
 *             "review": { "previous": {...}, "problems": ["..."] } }   (review optional)
 * Response: { "document": {...}, "checks": {...}, "model": "..." }
 *
 * "review" is the second look. When a first reading fails its own arithmetic
 * (the lines do not add up to the printed total, or a line's quantity times
 * price is not its amount), the page sends the photo again with that reading
 * and the failures, and the model re-reads the lines it got wrong. A separate
 * request rather than a loop in here, so each look gets its own time budget.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Public and unauthenticated, like the other endpoints: these caps bound what
// one request can cost. A spend limit in the Anthropic console is the hard stop.
// Vercel refuses request bodies over 4.5 MB before this code runs; the page
// shrinks photos well under that.
const MAX_BASE64 = 6_000_000;
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** The dashboard's cost lines, keyed as data/expenses.csv names them. */
const CATEGORIES = [
  "cogs", "labor", "employee meals", "tax",
  "packaging", "credit card fees", "marketing", "hardware",
  "utilities", "maintenance",
  "rent", "insurance", "business license", "telephone"
];

const nullable = schema => ({ anyOf: [schema, { type: "null" }] });

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
        required: ["description", "original", "quantity", "unit", "billed_quantity",
                   "unit_price", "amount", "amount_source", "category"],
        properties: {
          description: { type: "string" },
          original: nullable({ type: "string" }),
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

const round2 = n => Math.round(n * 100) / 100;
const finite = v => typeof v === "number" && Number.isFinite(v);
const text = (v, cap) => (typeof v === "string" && v.trim() ? v.trim().slice(0, cap) : null);

/* Re-checks the model's arithmetic here, where it cannot be talked out of.
   A line passes when either quantity times the unit price gives its amount -
   invoices bill some lines by weight and others by count. */
export function checkDocument(doc) {
  const problems = [];
  const lineIssues = [];
  doc.lines.forEach((l, i) => {
    if (!finite(l.unit_price)) return;
    const candidates = [l.billed_quantity, l.quantity].filter(finite);
    if (!candidates.length) return;
    const ok = candidates.some(q => Math.abs(round2(q * l.unit_price) - l.amount) <= 0.015);
    if (!ok) {
      const expected = round2(candidates[0] * l.unit_price);
      lineIssues.push({ index: i, expected });
      problems.push(`Line ${i + 1} ("${l.description}"): ${candidates[0]} x ${l.unit_price} = ` +
                    `${expected}, but the amount read is ${l.amount}.`);
    }
  });

  const lineSum = round2(doc.lines.reduce((t, l) => t + l.amount, 0));
  const total = finite(doc.total_printed) ? doc.total_printed : null;
  const difference = total === null ? null : round2(lineSum - total);
  if (difference !== null && Math.abs(difference) > 0.015) {
    problems.push(`The lines add up to ${lineSum.toFixed(2)} but the printed total is ` +
                  `${total.toFixed(2)} (a difference of ${difference.toFixed(2)}).`);
  }
  return {
    ok: problems.length === 0,
    lineSum, total, difference,
    totalReadable: total !== null,
    lineIssues, problems,
    computedLines: doc.lines.filter(l => l.amount_source === "computed").length
  };
}

/* The model's reply is schema-valid, but it is still model output: rebuild it
   field by field so nothing unexpected reaches the page. */
export function normalise(raw) {
  const lines = (Array.isArray(raw.lines) ? raw.lines : [])
    .filter(l => l && finite(l.amount))
    .slice(0, 200)
    .map(l => ({
      description: text(l.description, 160) || "Item",
      original: text(l.original, 160),
      quantity: finite(l.quantity) ? l.quantity : null,
      unit: text(l.unit, 40),
      billed_quantity: finite(l.billed_quantity) ? l.billed_quantity : null,
      unit_price: finite(l.unit_price) ? l.unit_price : null,
      amount: round2(l.amount),
      amount_source: l.amount_source === "computed" ? "computed" : "printed",
      category: CATEGORIES.includes(l.category) ? l.category : "cogs"
    }));
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
  const currency = typeof raw.currency === "string" && /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : null;
  return {
    kind: ["purchase", "sale", "other"].includes(raw.kind) ? raw.kind : "other",
    legible: raw.legible !== false,
    supplier: text(raw.supplier, 120),
    customer: text(raw.customer, 120),
    document_number: text(raw.document_number, 60),
    date, currency, lines,
    subtotal_printed: finite(raw.subtotal_printed) ? round2(raw.subtotal_printed) : null,
    total_printed: finite(raw.total_printed) ? round2(raw.total_printed) : null,
    notes: (Array.isArray(raw.notes) ? raw.notes : []).map(n => text(n, 300)).filter(Boolean).slice(0, 12)
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { image, mediaType, review } = req.body ?? {};
  if (typeof image !== "string" || !image || image.length > MAX_BASE64 ||
      !/^[A-Za-z0-9+/]+=*$/.test(image)) {
    return res.status(400).json({ error: "image must be base64, under about 4 MB" });
  }
  if (!MEDIA_TYPES.includes(mediaType)) {
    return res.status(400).json({ error: "mediaType must be one of " + MEDIA_TYPES.join(", ") });
  }

  const content = [
    { type: "image", source: { type: "base64", media_type: mediaType, data: image } }
  ];
  let effort = "medium";
  if (review && typeof review === "object" && review.previous && Array.isArray(review.problems)) {
    // Echoed back from our own earlier response, but it passes through the
    // browser, so it is rebuilt before it goes anywhere near the prompt.
    const previous = normalise(review.previous);
    const problems = review.problems.filter(p => typeof p === "string").map(p => p.slice(0, 300)).slice(0, 20);
    content.push({
      type: "text",
      text: "A first reading of this photo is below, but it fails these checks:\n- " +
        problems.join("\n- ") +
        "\n\nLook at the photo again, line by line, and return a corrected reading of the whole " +
        "document. If the printed total itself cannot be read, say so in notes rather than " +
        "forcing the lines to match it.\n\nFirst reading:\n" + JSON.stringify(previous)
    });
    // The second look only happens when the first one went wrong; it is worth
    // the extra thinking.
    effort = "high";
  } else {
    content.push({ type: "text", text: "Read this document." });
  }

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // A safety classifier can decline a request; "default" re-runs a declined
      // one on the model Anthropic recommends for that category instead of
      // failing the owner's upload.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort, format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content }]
    });

    if (response.stop_reason === "refusal") {
      console.error("read-document refused:", response.stop_details?.category ?? "unknown");
      return res.status(422).json({ error: "this photo could not be read" });
    }
    if (response.stop_reason === "max_tokens") {
      console.error("read-document truncated: hit max_tokens");
      return res.status(502).json({ error: "the document was too long to read in one go" });
    }

    const reply = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");
    let raw;
    try {
      raw = JSON.parse(reply);
    } catch {
      return res.status(502).json({ error: "the reading came back malformed" });
    }

    const document = normalise(raw);
    return res.status(200).json({ document, checks: checkDocument(document), model: response.model });
  } catch (err) {
    // Never echo the upstream error verbatim - it can carry request details.
    console.error("read-document failed:", err);
    return res.status(502).json({ error: "photo reading unavailable" });
  }
}
