/* Remembering the owner's figures in this browser.

   What is kept is the worked-out months and the confirmed invoices: not the
   file, not the photos. They stay in this browser's own storage so a
   returning owner does not have to add them again on every visit. They
   never leave the device from here, and "Forget my data" removes them along
   with any saved advice. */

import { state } from "./state.js";
import { escapeHtml, unescapeHtml } from "./format.js";
import { ALL_COST_LINES } from "./cost-groups.js";
import { roundToCents } from "./numbers.js";
import { ADVICE_KEY } from "./cards/advice.js";

const FIGURES_KEY = "findash-data";
const FORMAT_VERSION = 2;

/* The number fields a saved month may have. Anything else is dropped. */
const NUMBER_FIELDS = [
  "monthNum", "revenue", "cogs", "labor", "utilities", "maintenance", "hardware",
  "directExpenses", "operatingExpenses", "variableOverhead", "fixedOverhead",
  "otherDirect", "otherOperating", "otherVariable", "otherFixed",
  "totalExpenses", "grossProfit", "netProfit", "budget", "budgetPercent"
];

/* Everything that is remembered, as one object. */
export function figuresToSave() {
  return {
    v: FORMAT_VERSION,
    saved: new Date().toISOString(),
    from: state.ownerSourceName,
    months: state.ownerMonths || [],
    invoices: state.ownerInvoices
  };
}

/* Returns false when the browser would not store it (a private window, or
   storage full), so the caller can say so.

   Figures saved while someone is logged in are marked as theirs. Once
   logged out, the mark stays: whatever is left in this browser came from
   that account. */
export function saveOwnerFigures() {
  if (state.account && state.account.email) {
    state.ownerAccount = state.account.email.toLowerCase();
  }
  const saved = figuresToSave();
  saved.account = state.ownerAccount;
  try {
    localStorage.setItem(FIGURES_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

/* A piece of text no longer than `maximumLength`, or "" if it is not text. */
function textOrBlank(value, maximumLength) {
  if (typeof value === "string") {
    return value.slice(0, maximumLength);
  }
  return "";
}

/* An invoice as this page wrote it, or null. Text fields stay as they were
   read and are made safe wherever they are drawn: they came from a model
   reading a photo. */
export function cleanInvoice(invoice) {
  if (!invoice || typeof invoice !== "object" || !Array.isArray(invoice.lines)) {
    return null;
  }
  const hasValidMonth = Number.isInteger(invoice.year) && Number.isInteger(invoice.monthNum) &&
    invoice.monthNum >= 1 && invoice.monthNum <= 12;
  if (!hasValidMonth) {
    return null;
  }

  const lines = [];
  for (const line of invoice.lines) {
    if (line && ALL_COST_LINES.includes(line.category) && Number.isFinite(line.amount)) {
      lines.push({
        description: textOrBlank(line.description, 160),
        category: line.category,
        amount: roundToCents(line.amount)
      });
    }
  }

  let kind = "purchase";
  if (invoice.kind === "sale") {
    kind = "sale";
  }

  let total;
  if (Number.isFinite(invoice.total)) {
    total = roundToCents(invoice.total);
  } else {
    let linesTotal = 0;
    for (const line of lines) {
      linesTotal += line.amount;
    }
    total = roundToCents(linesTotal);
  }

  let date = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(invoice.date)) {
    date = invoice.date;
  }

  return {
    id: textOrBlank(invoice.id, 40) || String(Math.random()),
    kind: kind,
    supplier: textOrBlank(invoice.supplier, 120),
    number: textOrBlank(invoice.number, 60),
    date: date,
    year: invoice.year,
    monthNum: invoice.monthNum,
    total: total,
    lines: lines,
    addedAt: textOrBlank(invoice.addedAt, 40)
  };
}

/* A month as this page wrote it, or null. */
function cleanMonth(saved) {
  if (!saved || typeof saved.month !== "string") {
    return null;
  }

  let year = new Date().getUTCFullYear();
  if (Number.isInteger(saved.year)) {
    year = saved.year;
  }
  const month = { month: escapeHtml(unescapeHtml(saved.month).slice(0, 60)), year: year, lines: {} };

  for (const field of NUMBER_FIELDS) {
    if (Number.isFinite(saved[field])) {
      month[field] = saved[field];
    } else {
      month[field] = 0;
    }
  }
  for (const lineKey of ALL_COST_LINES) {
    if (saved.lines && Number.isFinite(saved.lines[lineKey])) {
      month.lines[lineKey] = saved.lines[lineKey];
    } else {
      month.lines[lineKey] = 0;
    }
  }
  return month;
}

/* Saved figures, rebuilt field by field: anything that is not in the shape
   this page writes is dropped rather than drawn. Returns
   { months, invoices, from, account }, or null when there is nothing usable.
   months is null when only invoices were saved; account is null for figures
   not marked as any account's. */
export function cleanSavedFigures(saved) {
  if (!saved || !Array.isArray(saved.months)) {
    return null;
  }

  const months = [];
  for (const savedMonth of saved.months) {
    const month = cleanMonth(savedMonth);
    if (!month) {
      return null;   // one damaged month means the whole save is suspect
    }
    months.push(month);
  }

  const invoices = [];
  if (Array.isArray(saved.invoices)) {
    for (const savedInvoice of saved.invoices) {
      const invoice = cleanInvoice(savedInvoice);
      if (invoice) {
        invoices.push(invoice);
      }
    }
  }

  if (!months.length && !invoices.length) {
    return null;
  }

  let from = null;
  if (typeof saved.from === "string") {
    from = saved.from.slice(0, 200);
  }
  let account = null;
  if (typeof saved.account === "string" && saved.account) {
    account = saved.account.slice(0, 254).toLowerCase();
  }
  return {
    months: saved.months.length ? months : null,
    invoices: invoices,
    from: from,
    account: account
  };
}

export function loadSavedFigures() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(FIGURES_KEY));
  } catch {
    return null;   // nothing saved, or storage is blocked
  }
  return cleanSavedFigures(saved);
}

/* Removes the saved figures and any saved advice from this browser. */
export function forgetSavedFigures() {
  try {
    localStorage.removeItem(FIGURES_KEY);
    localStorage.removeItem(ADVICE_KEY);
  } catch {
    // Storage is blocked; nothing was saved to remove.
  }
  state.savedAdvice = null;
  state.ownerAccount = null;
}

/* The sentence that tells the owner whether their figures were kept. */
export function savedNote(wasSaved) {
  if (wasSaved) {
    return "Saved in this browser, so it will be here next time.";
  }
  return "This browser would not let us save it (a private window?), so you will need to add it " +
    "again next visit.";
}
