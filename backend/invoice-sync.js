/* A reviewed invoice is money printed on a document, never a shelf count
   multiplied by a guessed price. Rebuild only the dashboard's invoice shape. */
import { ALL_COST_LINES } from '../frontend/js/dashboard/cost-groups.js';
import { roundToCents } from '../frontend/js/dashboard/numbers.js';
import { cleanCurrency, linePriceDetails } from '../frontend/js/dashboard/line-details.js';

/* Required text is bounded rather than silently truncating an invoice id. */
function text(value, maximum, label, optional = false) {
  if (optional && (value === undefined || value === null)) { return ''; }
  if (typeof value !== 'string' || value.length > maximum || (!optional && !value.trim())) {
    throw new Error('Invalid invoice ' + label);
  }
  return value;
}

/* Round monetary values to cents, using the dashboard's existing convention. */
function money(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000) {
    throw new Error('Invoice amounts must be finite monetary values');
  }
  return roundToCents(value);
}

/* Validate both the money and optional original-language purchasing details. */
function invoiceLine(line) {
  if (!line || typeof line !== 'object' || !ALL_COST_LINES.includes(line.category)) {
    throw new Error('Invalid invoice cost category');
  }
  const kept = {
    description: text(line.description, 160, 'description'),
    category: line.category,
    amount: money(line.amount)
  };
  for (const [key, limit] of [['original', 160], ['code', 40], ['unit', 40]]) {
    if (line[key] !== undefined && line[key] !== null) {
      kept[key] = text(line[key], limit, key, true);
    }
  }
  for (const key of ['quantity', 'unitPrice']) {
    if (line[key] !== undefined && line[key] !== null) {
      if (typeof line[key] !== 'number' || !Number.isFinite(line[key]) || Math.abs(line[key]) > 1e12) {
        throw new Error('Invalid invoice ' + key);
      }
      kept[key] = line[key];
    }
  }
  // A confirmed package size or billing unit, for comparing prices.
  return Object.assign(kept, linePriceDetails(line));
}

/* A stable id makes a repeated network confirmation safe to retry. */
export function reviewedInvoice(value) {
  if (!value || typeof value !== 'object' || value.kind !== 'purchase' ||
      !Array.isArray(value.lines) || !value.lines.length || value.lines.length > 200) {
    throw new Error('Supply a reviewed purchase invoice with 1 to 200 lines');
  }
  if (!Number.isInteger(value.year) || value.year < 1900 || value.year > 9999 ||
      !Number.isInteger(value.monthNum) || value.monthNum < 1 || value.monthNum > 12) {
    throw new Error('Choose the invoice year and month');
  }
  let date = null;
  if (value.date !== null && value.date !== undefined) {
    if (typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
        !Number.isFinite(Date.parse(value.date)) || new Date(value.date).toISOString().slice(0, 10) !== value.date) {
      throw new Error('Invoice date must be a valid calendar date');
    }
    date = value.date;
  }
  const lines = value.lines.map(invoiceLine);
  const total = money(value.total);
  const lineTotal = money(lines.reduce(function (sum, line) { return sum + line.amount; }, 0));
  if (Math.abs(total - lineTotal) > 0.015) {
    throw new Error('Invoice lines must add up to the reviewed total');
  }
  const invoice = {
    id: text(value.id, 40, 'id'), kind: 'purchase',
    supplier: text(value.supplier, 120, 'supplier', true),
    number: text(value.number, 60, 'number', true), date,
    year: value.year, monthNum: value.monthNum, total, lines,
    addedAt: text(value.addedAt, 40, 'recorded time', true)
  };
  // The currency the invoice was in, so prices in different currencies are
  // never compared.
  const currency = cleanCurrency(value.currency);
  if (currency) { invoice.currency = currency; }
  return invoice;
}
