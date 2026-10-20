/* The details an invoice keeps so its prices can be compared fairly (see
   price-comparison.js): the currency it was in, and, on a line, what the
   owner confirmed one package holds and what the printed price is per.

   They are checked the same way wherever an invoice is kept: in this
   browser (saved-figures.js) and on the server (backend/services/invoice-sync.js).
   Anything that isn't one of them is dropped, never guessed at. */

import { CHOOSABLE_UNITS, standardUnitName } from "./units.js";

// More than any package holds; a typing slip beyond it is refused.
const LARGEST_PACK = 100000;

/* A currency code such as "USD", or null. */
export function cleanCurrency(value) {
  if (typeof value !== "string") {
    return null;
  }
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return null;
  }
  return code;
}

/* What one package holds, as the owner confirmed it: { quantity, unit }
   with a positive amount of one of the units an owner can choose, or null. */
export function cleanPack(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const unit = standardUnitName(value.unit);
  const quantity = value.quantity;
  if (!CHOOSABLE_UNITS.includes(unit) || !Number.isFinite(quantity) || quantity <= 0 || quantity > LARGEST_PACK) {
    return null;
  }
  return { quantity: Math.round(quantity * 1000) / 1000, unit: unit };
}

/* The unit a printed price is per, when the owner confirmed it isn't the
   unit the quantity is in (a case billed by the pound): one of the units an
   owner can choose, or null. */
export function cleanBilledPer(value) {
  const unit = standardUnitName(value);
  if (!CHOOSABLE_UNITS.includes(unit)) {
    return null;
  }
  return unit;
}

/* The price-comparison details a line has, ready to keep: {} when none. */
export function linePriceDetails(line) {
  const details = {};
  const pack = cleanPack(line.pack);
  if (pack) {
    details.pack = pack;
  }
  const billedPer = cleanBilledPer(line.billedPer);
  if (billedPer) {
    details.billedPer = billedPer;
  }
  return details;
}
