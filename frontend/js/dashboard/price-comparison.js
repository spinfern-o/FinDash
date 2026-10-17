/* Whether an item's price went up or down from one delivery to the next,
   worked out only when the two prices are for the same amount of the same
   thing. A wrong percentage is worse than none: $2 a pound then $3 a
   kilogram is a price cut, not a 50% rise, and a cheaper bag can be dearer
   stock if it holds less.

   A price can be compared when it is per a fixed measure (a pound, a
   litre, one item: see units.js), or per a package whose contents the
   owner has confirmed ("one bag holds 50 lb"). It can't be when:
   - "package": it is per a case or bag whose contents aren't confirmed;
   - "units": the two are in measures that don't convert (a kilogram and a
     litre, a gallon and a litre);
   - "basis": the quantity times the price isn't the amount charged, so the
     price is per something else (a case of chicken billed by the pound),
     until the owner says what;
   - "currency": the invoices were in different currencies;
   - "free": a free item has no price to compare.

   A purchase here is { quantity, unit, unitPrice, amount, currency, pack,
   billedPer }, with the package definition and billing unit in effect for
   that delivery (items.js works those out). Nothing here changes an
   invoice. */

import { convertibleUnit, isFixedMeasure, standardUnitName } from "./units.js";

/* Whether the printed price is per the unit the quantity is in: the
   quantity times the price comes to the amount charged, give or take a
   rounding. */
function priceIsPerStatedUnit(purchase) {
  const expected = purchase.quantity * purchase.unitPrice;
  const allowance = Math.max(0.02, Math.abs(purchase.amount) * 0.01);
  return Math.abs(expected - purchase.amount) <= allowance;
}

/* `price` for `quantity` of `unit`, as a price per gram, millilitre or
   single item ({ measure, price }), or per one of a fixed measure that only
   compares with itself ({ measure: "unit:gal", price }). */
function pricePerMeasure(price, quantity, unit) {
  const convertible = convertibleUnit(unit);
  if (convertible) {
    return { measure: convertible.measure, price: price / (quantity * convertible.size) };
  }
  if (isFixedMeasure(unit)) {
    return { measure: "unit:" + standardUnitName(unit), price: price / quantity };
  }
  return { problem: "package" };
}

/* What the unit the price is per is: the billing unit the owner confirmed,
   or the unit the quantity is in. */
function pricedPer(purchase) {
  if (purchase.billedPer) {
    return standardUnitName(purchase.billedPer);
  }
  return standardUnitName(purchase.unit);
}

/* A purchase's price in a form that can be compared with another's:
   { measure, price }, or { problem } saying why it can't be. */
export function measuredPrice(purchase) {
  if (!(purchase.unitPrice > 0)) {
    return { problem: "free" };
  }
  if (!purchase.billedPer && !priceIsPerStatedUnit(purchase)) {
    return { problem: "basis" };
  }
  const unit = pricedPer(purchase);
  if (isFixedMeasure(unit)) {
    return pricePerMeasure(purchase.unitPrice, 1, unit);
  }
  if (purchase.pack) {
    return pricePerMeasure(purchase.unitPrice, purchase.pack.quantity, purchase.pack.unit);
  }
  return { problem: "package" };
}

/* Whether two package definitions are the same: the same amount of the
   same unit. */
function samePack(a, b) {
  return Boolean(a && b) && a.quantity === b.quantity && standardUnitName(a.unit) === standardUnitName(b.unit);
}

/* The unit to show the change in, and how many of the comparable measure
   it holds: per case when both were the same confirmed case, otherwise per
   the latest's own measure (per kg, per lb, per item). */
function displayUnit(latest, previous) {
  const latestPer = pricedPer(latest);
  const isSamePackage = !isFixedMeasure(latestPer) && latestPer === pricedPer(previous) &&
    samePack(latest.pack, previous.pack);
  if (isSamePackage) {
    const contents = convertibleUnit(latest.pack.unit);
    const size = contents ? latest.pack.quantity * contents.size : latest.pack.quantity;
    return { unit: latestPer, size: size };
  }
  let unit = latestPer;
  if (!isFixedMeasure(latestPer)) {
    unit = standardUnitName(latest.pack.unit);
  }
  const convertible = convertibleUnit(unit);
  return { unit: unit, size: convertible ? convertible.size : 1 };
}

/* Compares the latest price with the one before: { state: "change",
   change, percent, per } when it can, where change is the difference per
   `per` (a unit name) and percent is rounded to 0.1; { state: "same" }
   when it didn't move; otherwise { state } with the reason it can't be
   compared (see the top of this file). */
export function comparePrices(latest, previous) {
  if (latest.currency && previous.currency && latest.currency !== previous.currency) {
    return { state: "currency" };
  }
  const now = measuredPrice(latest);
  const before = measuredPrice(previous);
  for (const problem of ["free", "basis", "package"]) {
    if (now.problem === problem || before.problem === problem) {
      return { state: problem };
    }
  }
  if (now.measure !== before.measure) {
    return { state: "units" };
  }
  if (now.price === before.price) {
    return { state: "same" };
  }
  const shown = displayUnit(latest, previous);
  const change = (now.price - before.price) * shown.size;
  const percent = Math.round(((now.price - before.price) / before.price) * 1000) / 10;
  if (percent === 0 && Math.abs(change) < 0.0005) {
    return { state: "same" };
  }
  return {
    state: "change",
    change: Math.round(change * 1000) / 1000,
    percent: percent,
    per: shown.unit
  };
}
