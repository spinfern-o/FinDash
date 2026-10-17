/* The financial part of a reviewed invoice uses the dashboard's usual shape
   and arithmetic. Shelf counts never become costs or multiply invoice prices. */
import { roundToCents } from '../dashboard/numbers.js';
import { cleanCurrency } from '../dashboard/line-details.js';

/* A stable ID makes retrying a confirmation safe, including a lost response. */
export function invoiceId(hash) { return 'stock-' + hash.slice(0, 34); }

/* The owner confirms the month even when the paper has no readable date. */
export function invoiceMonth(document) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(document.date || '')) { return document.date.slice(0, 7); }
  return new Date().toISOString().slice(0, 7);
}

/* Preserve all invoice lines financially, including items not counted today. */
export function financialInvoice(draft, month, corrections = []) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { throw new Error('month'); }
  const document = draft.document;
  const lines = document.lines.map(function (line, index) {
    return {
      description: corrections[index]?.description || line.description,
      original: corrections[index]?.original || line.original || line.description,
      code: line.code || '', quantity: line.quantity, unit: line.unit,
      unitPrice: line.unit_price, amount: roundToCents(line.amount),
      category: corrections[index]?.category || line.category
    };
  });
  const invoice = {
    id: invoiceId(draft.hash), kind: 'purchase', supplier: document.supplier || draft.name,
    number: document.document_number || '', date: document.date,
    year: Number(month.slice(0, 4)), monthNum: Number(month.slice(5, 7)),
    total: roundToCents(lines.reduce(function (sum, line) { return sum + line.amount; }, 0)),
    lines: lines, addedAt: new Date().toISOString()
  };
  // Kept so prices in different currencies are never compared.
  const currency = cleanCurrency(document.currency);
  if (currency) { invoice.currency = currency; }
  return invoice;
}
