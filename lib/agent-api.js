/* The public FinDash API, version 1: monthly figures in, a profit and loss
   summary out, with the template's columns and the glossary alongside.

   It needs no account and no key, calls no AI model and stores nothing: the
   arithmetic is the dashboard's own (docs/js/dashboard/analysis.js), run on
   the figures in the request. docs/openapi.json describes it; the
   developers page (docs/developers.html) explains it. Every error is JSON:
   { "error": { "code", "message", "hint", "docs", "problems"? } }. */

import { readMonthRecords, summariseMonths, templateColumns, glossaryEntries, COST_FIELDS, MAXIMUM_MONTHS }
  from "../docs/js/dashboard/analysis.js";

export const SITE = "https://findash.tech";
export const API_VERSION = "1.0.0";
const DOCS = SITE + "/developers";
const LARGEST_BODY = 200000;

/* Lets an agent running in a browser call the API from any page. */
export function allowAnyOrigin(response, methods) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", methods);
  response.setHeader("Access-Control-Allow-Headers",
    "Content-Type, Accept, If-None-Match, Mcp-Protocol-Version, Mcp-Session-Id");
  response.setHeader("Access-Control-Expose-Headers", "ETag, Mcp-Session-Id");
}

/* A JSON error an agent can act on: what went wrong, what to do about it,
   and where it is documented. */
export function sendError(response, status, code, message, hint, extra) {
  const error = { code: code, message: message, hint: hint, docs: DOCS + "#errors" };
  Object.assign(error, extra || {});
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify({ error: error }));
}

export function sendJson(response, status, body, cacheSeconds) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cacheSeconds ? "public, max-age=" + cacheSeconds : "no-store");
  response.end(JSON.stringify(body, null, 2));
}

export function wrongMethod(response, allowed) {
  response.setHeader("Allow", allowed);
  sendError(response, 405, "method_not_allowed", "This address doesn't accept that method.",
    "Use " + allowed.split(", ").join(" or ") + ".");
}

/* The request body as an object, or null after answering with the error.
   Vercel hands over parsed JSON; a body it couldn't parse arrives as text. */
export function jsonBody(request, response) {
  let body;
  try {
    body = request.body;
  } catch {
    sendError(response, 400, "invalid_json", "The request body isn't valid JSON.",
      "Send a JSON object with Content-Type: application/json.");
    return null;
  }
  if (Buffer.isBuffer(body)) {
    body = body.toString("utf8");
  }
  if (typeof body === "string") {
    if (body.length > LARGEST_BODY) {
      sendError(response, 413, "too_large", "The request body is too large.",
        "Send at most " + MAXIMUM_MONTHS + " months at a time.");
      return null;
    }
    try {
      body = JSON.parse(body);
    } catch {
      sendError(response, 400, "invalid_json", "The request body isn't valid JSON.",
        "Send a JSON object with Content-Type: application/json.");
      return null;
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendError(response, 400, "invalid_json", "The request body must be a JSON object.",
      "Send { \"months\": [ ... ] }.");
    return null;
  }
  if (JSON.stringify(body).length > LARGEST_BODY) {
    sendError(response, 413, "too_large", "The request body is too large.",
      "Send at most " + MAXIMUM_MONTHS + " months at a time.");
    return null;
  }
  return body;
}

/* GET /api/v1: what the API offers, for an agent that found it by name. */
export function apiIndex() {
  return {
    name: "FinDash API",
    version: API_VERSION,
    description: "Turns a small business's monthly revenue and costs into a profit and loss summary, with the " +
      "same arithmetic as the FinDash dashboard. Free, no account or key, nothing stored.",
    documentation: DOCS,
    openapi: SITE + "/openapi.json",
    authentication: "none",
    endpoints: [
      { method: "POST", path: "/api/v1/analyze", description: "Monthly figures in, a P&L summary out." },
      { method: "GET", path: "/api/v1/template", description: "The dashboard template's columns." },
      { method: "GET", path: "/api/v1/glossary", description: "What each figure means, in plain words." }
    ],
    mcp: { product: SITE + "/api/mcp", docs: SITE + "/api/mcp/docs" },
    dashboard: SITE + "/dashboard"
  };
}

/* The template's columns, and the header row as CSV. */
export function templateResponse() {
  const columns = templateColumns();
  return {
    columns: columns,
    csvHeader: columns.map(function (column) {
      return column.header;
    }).join(","),
    instructions: "One row per month. Fill in the cost lines from the month's Profit and Loss; leave a cost at 0 " +
      "if there is none, and put a cost with no line of its own in the closest one. Budget is the most planned " +
      "to be spent that month in total, not a sales target. Save the file and add it on " + SITE + "/dashboard, " +
      "where it is read in the browser and not uploaded.",
    excelTemplate: "On " + SITE + "/dashboard, press Download Excel template."
  };
}

/* POST /api/v1/analyze, and the MCP tool of the same job. Returns
   { summary } or { problems }. */
export function analyzeFigures(body) {
  const read = readMonthRecords(body.months);
  if (read.problems.length) {
    return { problems: read.problems };
  }
  let currency = null;
  if (body.currency !== undefined) {
    if (typeof body.currency !== "string" || !/^[A-Za-z]{3}$/.test(body.currency)) {
      return { problems: [{ field: "currency", message: "A three-letter currency code such as USD, or leave it out." }] };
    }
    currency = body.currency.toUpperCase();
  }
  return { summary: summariseMonths(read.months, currency) };
}

export function handleAnalyze(request, response) {
  if (request.method !== "POST") {
    return wrongMethod(response, "POST, OPTIONS");
  }
  const body = jsonBody(request, response);
  if (!body) {
    return;
  }
  for (const key of Object.keys(body)) {
    if (key !== "months" && key !== "currency") {
      return sendError(response, 400, "invalid_figures", "Unknown field \"" + key + "\".",
        "The body has months and, optionally, currency.", { problems: [{ field: key, message: "Unknown field." }] });
    }
  }
  const result = analyzeFigures(body);
  if (result.problems) {
    return sendError(response, 400, "invalid_figures", "Some of the figures can't be read.",
      "Fix each value listed under problems and send the request again. Cost lines: " +
      COST_FIELDS.map(function (field) {
        return field.key;
      }).join(", ") + ".", { problems: result.problems });
  }
  sendJson(response, 200, result.summary);
}

/* /api/v1/<rest>: the REST API. */
export function handleApi(request, response, rest) {
  if (rest === "" || rest === "analyze" || rest === "template" || rest === "glossary") {
    if (rest === "analyze") {
      return handleAnalyze(request, response);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return wrongMethod(response, "GET, HEAD, OPTIONS");
    }
    if (rest === "") {
      return sendJson(response, 200, apiIndex(), 3600);
    }
    if (rest === "template") {
      return sendJson(response, 200, templateResponse(), 3600);
    }
    return sendJson(response, 200, { terms: glossaryEntries() }, 3600);
  }
  sendError(response, 404, "not_found", "There is no API endpoint at /api/v1/" + rest + ".",
    "GET /api/v1 lists the endpoints; " + SITE + "/openapi.json describes them.");
}
