/**
 * POST /api/report-error
 *
 * Errors that happen in a visitor's browser, written to this site's logs so
 * whoever runs FinDash can see that something broke without waiting for an
 * email. In Vercel: the project -> Logs, and search for "findash-error";
 * every server-side failure is tagged the same way.
 *
 * Request: { "message": "...", "where": "dashboard.html:120", "page": "/dashboard" }
 * Response: 204, always (a broken report must never cause another error).
 *
 * Nothing about the visitor's figures is sent: only the error message and
 * where in the code it happened. Every field is cut short, so this cannot
 * be used to fill the logs with large amounts of text.
 */

import { isSameSite } from "../../lib/session.js";

const MAXIMUM_FIELD_LENGTH = 300;

function shortText(value) {
  if (typeof value !== "string") {
    return "";
  }
  // One line, so a report cannot pretend to be several log entries.
  return value.replace(/[\r\n]+/g, " ").slice(0, MAXIMUM_FIELD_LENGTH);
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" || !isSameSite(req)) {
    return res.status(204).end();
  }

  let body = {};
  if (req.body && typeof req.body === "object") {
    body = req.body;
  }
  const message = shortText(body.message);
  if (message) {
    console.error(`[findash-error] page ${shortText(body.page)}: ${message} (at ${shortText(body.where)})`);
  }
  return res.status(204).end();
}
