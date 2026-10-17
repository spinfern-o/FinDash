/* Checking a delivery against its invoice. The invoice says what was
   billed; the owner says what actually arrived. When they differ, or the
   owner hasn't checked yet, a delivery check is kept in the ledger until it
   is resolved: the billed amounts exactly as printed, what arrived, and a
   history of what happened since. Nothing here changes an invoice or takes
   anything off the P&L by itself.

   "Possible value" is only a figure to check with the supplier, never a
   confirmed credit, and it is worked out only when the invoice's price is
   per the unit billed and what arrived can be counted in that unit. */

import { roundToCents } from '../dashboard/numbers.js';
import { ALL_COST_LINES } from '../dashboard/cost-groups.js';

// What the owner can say about each delivery line, in the order offered.
export const RECEIPT_STATUSES = ['full', 'short', 'damaged', 'missing', 'unchecked'];

/* Two unit names for the same unit, however capitalised or spaced. */
function sameUnit(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/* How many of the item's own unit one `unit` holds: 1 for its own unit,
   the pack size the owner confirmed, or null when it isn't known. */
export function unitsPer(item, unit) {
  if (sameUnit(unit, item.unit)) {
    return 1;
  }
  const pack = (item.packs || []).find(function (entry) { return sameUnit(entry.unit, unit); });
  return pack ? pack.contains : null;
}

/* The billed quantity in the item's own unit, or null when the invoice's
   unit isn't the item's and no pack size is confirmed for it. */
export function billedInItemUnits(item, line) {
  const per = unitsPer(item, line.unit);
  if (per === null || !Number.isFinite(line.quantity)) {
    return null;
  }
  return Math.round(line.quantity * per * 1000) / 1000;
}

/* Whether the invoice's price is per the unit billed: the quantity times
   the price comes to the amount charged, give or take a rounding. */
function priceIsPerBilledUnit(line) {
  if (!Number.isFinite(line.quantity) || !Number.isFinite(line.unit_price) || !Number.isFinite(line.amount)) {
    return false;
  }
  const allowance = Math.max(0.02, Math.abs(line.amount) * 0.01);
  return Math.abs(line.quantity * line.unit_price - line.amount) <= allowance;
}

/* What the missing or damaged goods may be worth, to check with the
   supplier: the billed units that didn't arrive usable, times the price
   per billed unit. null when that can't be worked out honestly. */
export function possibleValue(item, line, received) {
  if (!priceIsPerBilledUnit(line) || !(line.unit_price > 0)) {
    return null;
  }
  const per = unitsPer(item, line.unit);
  if (per === null) {
    return null;
  }
  const receivedInBilledUnits = received / per;
  const missing = line.quantity - receivedInBilledUnits;
  if (!(missing > 0)) {
    return null;
  }
  return roundToCents(missing * line.unit_price);
}

/* A new delivery check for a line that didn't arrive as billed, or that
   the owner hasn't checked yet. `received` is in the item's own unit. */
export function newCheck(details) {
  const { id, at, source, document, line, item, received, status, note } = details;
  const check = {
    id: id,
    at: at,
    source: source,
    supplier: String(document.supplier || '').slice(0, 120),
    number: String(document.document_number || '').slice(0, 60),
    itemId: item.id,
    original: String(line.original || line.description || item.original).slice(0, 160),
    category: String(line.category || '').slice(0, 40),
    billed: { quantity: Number.isFinite(line.quantity) ? line.quantity : 0, unit: String(line.unit || '').slice(0, 40) },
    received: { quantity: status === 'unchecked' ? 0 : received, unit: item.unit },
    status: status,
    state: 'open',
    history: [{ at: at, state: 'open', ...(note ? { note: note.slice(0, 300) } : {}) }]
  };
  if (Number.isFinite(line.unit_price) && line.unit_price >= 0) {
    check.unitPrice = line.unit_price;
  }
  const value = status === 'unchecked' ? null : possibleValue(item, line, received);
  if (value !== null) {
    check.possibleValue = value;
  }
  if (/^[A-Z]{3}$/.test(document.currency || '')) {
    check.currency = document.currency;
  }
  return check;
}

/* The check once the owner has resolved it: 'resolved' (nothing more is
   owed) or 'credited' (with the credit the supplier confirmed). Only an
   open check can be resolved, so a credit is never counted twice. */
export function resolvedCheck(check, resolution) {
  if (check.state !== 'open') {
    throw new Error('This delivery check is already resolved');
  }
  const next = { ...check, state: resolution.state, history: [...check.history] };
  const entry = { at: resolution.at, state: resolution.state };
  if (resolution.note) {
    entry.note = resolution.note.slice(0, 300);
  }
  if (resolution.state === 'credited') {
    if (!(resolution.credit && resolution.credit.amount > 0)) {
      throw new Error('A credit needs its amount');
    }
    next.credit = { amount: roundToCents(resolution.credit.amount) };
    if (resolution.credit.reference) {
      next.credit.reference = resolution.credit.reference.slice(0, 60);
    }
    if (resolution.credit.invoiceId) {
      next.credit.invoiceId = resolution.credit.invoiceId;
    }
  } else if (resolution.state !== 'resolved') {
    throw new Error('A check is resolved, or credited');
  }
  next.history.push(entry);
  return next;
}

/* The checks still waiting for the owner, newest first. */
export function openChecks(inventory) {
  return (inventory.checks || []).filter(function (check) { return check.state === 'open'; }).reverse();
}

/* The cost line a credit comes off: the one the invoice line was in, or
   food and drink when that isn't known. */
function costLine(check) {
  return ALL_COST_LINES.includes(check.category) ? check.category : 'cogs';
}

/* The credit as an invoice for the P&L, when the owner chooses to take a
   confirmed credit off their costs: one negative line in the check's cost
   line, in the month they choose. Its id comes from the check, so saving it
   again can never add it twice. */
export function creditInvoice(check, credit, month, today) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('month');
  }
  const amount = -roundToCents(credit.amount);
  const description = ('Credit: ' + check.original).slice(0, 160);
  return {
    id: ('credit-' + check.id).slice(0, 40), kind: 'purchase', supplier: check.supplier || '',
    number: credit.reference || '', date: today, year: Number(month.slice(0, 4)), monthNum: Number(month.slice(5, 7)),
    total: amount, lines: [{ description: description, original: check.original, category: costLine(check), amount: amount }],
    addedAt: new Date().toISOString()
  };
}
