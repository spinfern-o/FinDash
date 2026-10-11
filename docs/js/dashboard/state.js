/* Everything the dashboard keeps track of while it is open, in one object.

   Every module reads and changes this same object, so there is exactly one
   answer to "which month is on screen?" or "which invoices has the owner
   added?". It can also be looked at from the browser's console as
   window.findash.state, which helps when checking a figure by hand. */

export const DEMO_NOTE = "Showing demo figures. Add your own file above to see your business.";

export const state = {
  // The figures on screen: { generated, months }. Each month is one row of
  // totals, in date order. Every card is drawn from this.
  data: null,

  // The month the reader picked: one of data.months.
  activeMonth: null,

  // How much time the period cards cover: "month", "quarter" or "ytd".
  period: "month",

  // Display preferences, saved per browser (see preferences.js).
  showCents: false,
  currency: "USD",

  // The demo figures from data.json, once they have loaded.
  publishedData: null,

  // The footer line that says where the figures came from.
  sourceNote: DEMO_NOTE,

  // The owner's own figures come from two places, kept apart so an invoice
  // can be removed again, and so a new spreadsheet replaces the file's months
  // without losing the invoices.
  //   ownerMonths:     the months read from the owner's spreadsheet, or null
  //                    when there is no spreadsheet (the demo, or photos only).
  //   ownerInvoices:   invoices and receipts read from photos, added on top:
  //                    [{ id, kind, supplier, number, date, year, monthNum,
  //                       total, lines }]
  //   ownerSourceName: the name of the file (or files) behind ownerMonths.
  ownerMonths: null,
  ownerInvoices: [],
  ownerSourceName: null,

  // Spreadsheets picked so far, by kind, until there is a full set to read.
  // The template is one "combined" file; older exports come as a "dashboard"
  // file (revenue and budget) plus an "expenses" file (the costs).
  heldFiles: { dashboard: null, expenses: null, combined: null },

  // What this copy of FinDash can do, from /api/capabilities:
  // { briefing, mapping, photos, forecast, accounts }.
  capabilities: null,

  // A projection from the forecasting model, or null to use the trend line
  // worked out on the page.
  modelForecast: null,

  // The last advice from Claude, with exactly what was sent to get it.
  savedAdvice: null,

  // While someone is logged in and their figures are being saved to their
  // account (see account-figures.js): { email, hasUnsavedChanges,
  // isWaitingForChoice }. Null otherwise.
  account: null,

  // Photos waiting to be read, whether one is being handled now, and the
  // reading on screen for the owner to check: { doc, checks, file }.
  photoQueue: [],
  isHandlingPhoto: false,
  photoReview: null
};

/* True when the screen shows the owner's own figures rather than the demo. */
export function isShowingOwnerFigures() {
  return state.ownerMonths !== null || state.ownerInvoices.length > 0;
}
