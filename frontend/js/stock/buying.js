/* The buying list: the items the owner set a minimum for whose stock is
   below it, with how much would bring them back up to their target.

   It only works from what the owner confirmed. Stock that was never
   counted is unknown, not zero, so nothing is suggested for it. A count
   older than a week is shown with its date, to check before ordering.
   Quantities are rounded up to whole packs only when the pack's size is
   confirmed. Nothing is ordered: the owner edits, prints or downloads the
   list. Usage, lead times and demand are never guessed. */

import { stockBalances } from './ledger.js';

// After this many days a count is shown as out of date.
export const STALE_AFTER_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

/* When the item's stock was last counted or changed, or null. */
function lastUpdated(inventory, itemId) {
  let latest = null;
  for (const movement of inventory.movements) {
    if (movement.itemId === itemId && (latest === null || movement.at > latest)) {
      latest = movement.at;
    }
  }
  return latest;
}

/* How much the supplier still owes for the item, in its own unit: the
   open checks for deliveries that came short or didn't come. Shown beside
   the suggestion, never taken off it. */
function stillOwed(inventory, item) {
  let owed = 0;
  for (const check of inventory.checks || []) {
    if (check.itemId !== item.id || check.state !== 'open' || !['short', 'missing'].includes(check.status)) {
      continue;
    }
    const per = sameUnit(check.billed.unit, item.unit) ? 1 :
      (item.packs || []).find(function (pack) { return sameUnit(pack.unit, check.billed.unit); })?.contains;
    if (per) {
      owed += Math.max(0, check.billed.quantity * per - check.received.quantity);
    }
  }
  return Math.round(owed * 1000) / 1000;
}

function sameUnit(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/* How much to buy to bring `onHand` up to the target (or the minimum when
   no target is set), rounded up to whole packs when they are confirmed:
   { quantity, packs, packUnit } with quantity in the item's own unit. */
function suggestion(item, onHand) {
  const reorder = item.reorder;
  const goal = reorder.target !== undefined ? reorder.target : reorder.minimum;
  const needed = Math.max(0, goal - onHand);
  const pack = reorder.buyUnit ? item.packs.find(function (entry) { return sameUnit(entry.unit, reorder.buyUnit); }) : null;
  if (!pack) {
    return { quantity: Math.round(needed * 1000) / 1000, packs: null, packUnit: null };
  }
  const packs = Math.ceil(needed / pack.contains - 1e-9);
  return { quantity: Math.round(packs * pack.contains * 1000) / 1000, packs: packs, packUnit: pack.unit };
}

/* The buying list, by supplier and then name. Each entry is { item,
   onHand, lastUpdated, isStale, state, suggestion, owed }: state "low"
   (below the minimum, with a suggestion) or "unknown" (never counted, so
   no suggestion). Items at or above their minimum, or without one, are
   left out. */
export function buyingList(inventory, now = new Date()) {
  const balances = stockBalances(inventory);
  const list = [];
  for (const item of inventory.items) {
    if (!item.reorder || item.reorder.minimum === undefined) {
      continue;
    }
    const onHand = balances.get(item.id);
    const updated = lastUpdated(inventory, item.id);
    const entry = {
      item: item,
      onHand: onHand,
      lastUpdated: updated,
      isStale: updated !== null && now.getTime() - Date.parse(updated) > STALE_AFTER_DAYS * DAY,
      owed: stillOwed(inventory, item)
    };
    if (onHand === null) {
      list.push(Object.assign(entry, { state: 'unknown', suggestion: null }));
    } else if (onHand < item.reorder.minimum) {
      list.push(Object.assign(entry, { state: 'low', suggestion: suggestion(item, onHand) }));
    }
  }
  return list.sort(function (a, b) {
    const bySupplier = String(a.item.reorder.supplier || '').localeCompare(String(b.item.reorder.supplier || ''));
    return bySupplier || a.item.description.localeCompare(b.item.description);
  });
}

/* A spreadsheet cell that a spreadsheet won't run as a formula. */
function csvCell(value) {
  let text = String(value === null || value === undefined ? '' : value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }
  return '"' + text.replace(/"/g, '""') + '"';
}

/* The list as CSV, with the quantities the owner settled on: rows of
   [supplier, name, supplier's wording, location, quantity, unit]. */
export function buyingListCsv(rows, headings) {
  const lines = [headings.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
