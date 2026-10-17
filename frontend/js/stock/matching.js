/* Which of the owner's items an invoice line is. A supplier's item code,
   once the owner has confirmed it is one of their items, finds that item
   again on later invoices. Without a confirmed code, an item whose
   supplier wording is exactly the same is suggested, for the owner to
   accept or not; nothing is merged because two translations look alike.

   Changing a match changes only what later invoices find. Movements and
   delivery checks already recorded stay as they were. */

import { updateItem } from './ledger.js';

function sameText(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/* The item `supplier`'s `code` was confirmed as, or null. */
export function itemForCode(inventory, supplier, code) {
  if (!String(supplier || '').trim() || !String(code || '').trim()) {
    return null;
  }
  return inventory.items.find(function (item) {
    return (item.supplierCodes || []).some(function (entry) {
      return sameText(entry.supplier, supplier) && sameText(entry.code, code);
    });
  }) || null;
}

/* Items worth offering for an invoice line, best first: [{ item, reason }]
   where reason is "code" (the supplier's code was confirmed as it) or
   "wording" (the supplier wording is the same). */
export function suggestedItems(inventory, supplier, line) {
  const suggestions = [];
  const byCode = itemForCode(inventory, supplier, line.code);
  if (byCode) {
    suggestions.push({ item: byCode, reason: 'code' });
  }
  const wording = line.original || line.description;
  for (const item of inventory.items) {
    if (item !== byCode && sameText(item.original, wording)) {
      suggestions.push({ item: item, reason: 'wording' });
    }
  }
  return suggestions;
}

/* The ledger with `supplier`'s `code` confirmed as the item `itemId`,
   taken off any other item it was confirmed as before. */
export function rememberCode(inventory, itemId, supplier, code) {
  if (!String(supplier || '').trim() || !String(code || '').trim()) {
    return inventory;
  }
  const entry = { supplier: supplier.trim().slice(0, 120), code: code.trim().slice(0, 40) };
  let next = inventory;
  const previous = itemForCode(inventory, supplier, code);
  if (previous && previous.id === itemId) {
    return inventory;
  }
  if (previous) {
    next = updateItem(next, previous.id, { supplierCodes: previous.supplierCodes.filter(function (existing) {
      return !(sameText(existing.supplier, supplier) && sameText(existing.code, code));
    }) });
  }
  const item = next.items.find(function (candidate) { return candidate.id === itemId; });
  return updateItem(next, itemId, { supplierCodes: [...(item.supplierCodes || []), entry] });
}

/* The ledger with one `unit` of the item confirmed to hold `contains` of
   its own unit, replacing any size confirmed for that unit before. */
export function rememberPack(inventory, itemId, unit, contains) {
  const item = inventory.items.find(function (candidate) { return candidate.id === itemId; });
  const name = String(unit || '').trim().slice(0, 40);
  if (!item || !name || sameText(name, item.unit)) {
    return inventory;
  }
  const others = (item.packs || []).filter(function (pack) { return !sameText(pack.unit, name); });
  const same = (item.packs || []).find(function (pack) { return sameText(pack.unit, name); });
  if (same && same.contains === contains) {
    return inventory;
  }
  return updateItem(inventory, itemId, { packs: [...others, { unit: name, contains: contains }] });
}
