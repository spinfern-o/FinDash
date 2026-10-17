/* Everything the owner buys, item by item, from the invoices added from
   photos: how much of each came in, what it cost in all, and what it cost
   last time against the time before. The count sheet (count-sheet.js) is
   made from the same list.

   The same item on two invoices is recognised by the supplier's item code
   when the invoice prints one (they stay the same from one delivery to the
   next), otherwise by its name as printed, otherwise by its English
   description. Items are kept apart by supplier: two suppliers' codes and
   prices are not comparable.

   Only lines with a quantity are items. A delivery fee, a surcharge or a
   credit has no quantity and is left out; free items (a price of 0) are
   kept, because they are still stock on the shelf. Nothing here changes the
   money on the dashboard: that comes from the invoices' lines as before.

   Prices are compared by price-comparison.js, only when they are for the
   same amount of the same thing. What a case or bag holds is whatever the
   owner confirmed (confirmPackage below), kept on the line of the delivery
   it was confirmed from; later deliveries in the same unit use it until
   the owner confirms another, and earlier ones keep their own. */

import { roundToCents } from "./numbers.js";
import { unitName } from "./units.js";
import { comparePrices } from "./price-comparison.js";
import { cleanBilledPer, cleanPack } from "./line-details.js";

// Kept here too, where the item list and its tests have always found it.
export { unitName };

/* The cost lines whose items sit on a shelf until they are used, so they
   go on the count sheet: food and drink, staff meals and packaging. */
export const COUNTED_LINES = ["cogs", "employee meals", "packaging"];

/* "Broccoli (Chui Ho)  " -> "broccoli (chui ho)", for matching names. */
function matchingText(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/* What identifies the item on `line` from `supplier`. */
export function itemKey(supplier, line) {
  let identity;
  if (line.code) {
    identity = "code:" + matchingText(line.code);
  } else if (line.original) {
    identity = "printed:" + matchingText(line.original);
  } else {
    identity = "name:" + matchingText(line.description);
  }
  return matchingText(supplier) + "|" + identity;
}

/* The day an invoice was for: its own date, or the first of the month it
   was added to when no date could be read. */
function purchaseDate(invoice) {
  if (invoice.date) {
    return invoice.date;
  }
  return `${invoice.year}-${String(invoice.monthNum).padStart(2, "0")}-01`;
}

/* Purchase invoices, oldest first. Two on the same day stay in the order
   they were added. */
function purchasesInDateOrder(invoices) {
  const purchases = invoices.filter(function (invoice) {
    return invoice.kind !== "sale";
  });
  return purchases.sort(function (a, b) {
    const byDate = purchaseDate(a).localeCompare(purchaseDate(b));
    if (byDate) {
      return byDate;
    }
    return String(a.addedAt || "").localeCompare(String(b.addedAt || ""));
  });
}

/* Whether a line is an item someone could count, rather than a fee, a
   surcharge or a credit. */
function isItemLine(line) {
  return Number.isFinite(line.quantity) && line.quantity > 0 && line.amount >= 0;
}

function newItem(supplier) {
  return {
    supplier: supplier || "",
    code: "",
    description: "",
    original: "",
    category: "cogs",
    purchases: []
  };
}

/* How much came in, added up per unit: [{ unit, quantity }], the unit
   bought most recently first. */
function quantitiesByUnit(purchases) {
  const totals = new Map();
  for (let index = purchases.length - 1; index >= 0; index--) {
    const purchase = purchases[index];
    const sum = (totals.get(purchase.unit) || 0) + purchase.quantity;
    totals.set(purchase.unit, Math.round(sum * 1000) / 1000);
  }
  return [...totals.entries()].map(function (entry) {
    return { unit: entry[0], quantity: entry[1] };
  });
}

/* The latest purchase that was not free, and the one before it. A free
   item is stock, but its price of 0 is no baseline for a change. */
function lastTwoPaid(purchases) {
  const paid = [];
  for (let index = purchases.length - 1; index >= 0 && paid.length < 2; index--) {
    const price = purchases[index].unitPrice;
    if (Number.isFinite(price) && price > 0) {
      paid.push(purchases[index]);
    }
  }
  return { last: paid[0] || null, previous: paid[1] || null };
}

/* Gives each purchase the package definition and billing unit in effect
   for it: its own, or the latest earlier one confirmed in the same unit.
   packFrom is the date of the delivery it was confirmed from. */
function applyConfirmedDetails(purchases) {
  const latestByUnit = new Map();
  for (const purchase of purchases) {
    let inEffect = latestByUnit.get(purchase.unit) || { pack: null, billedPer: null, from: null };
    if (purchase.ownPack || purchase.ownBilledPer) {
      inEffect = { pack: purchase.ownPack, billedPer: purchase.ownBilledPer, from: purchase.date };
      latestByUnit.set(purchase.unit, inEffect);
    }
    purchase.pack = inEffect.pack;
    purchase.billedPer = inEffect.billedPer;
    purchase.packFrom = inEffect.from;
  }
}

/* Each unit the item was bought in, with the dates it came in that unit and
   the package definition in effect for the latest of them: what the owner
   picks from when confirming a package size. */
function unitsBought(purchases) {
  const units = new Map();
  for (const purchase of purchases) {
    if (!units.has(purchase.unit)) {
      units.set(purchase.unit, { unit: purchase.unit, dates: [] });
    }
    const entry = units.get(purchase.unit);
    if (!entry.dates.includes(purchase.date)) {
      entry.dates.push(purchase.date);
    }
    entry.pack = purchase.pack;
    entry.billedPer = purchase.billedPer;
    entry.packFrom = purchase.packFrom;
  }
  return [...units.values()];
}

/* One item's purchases, summed up for the list. */
function summariseItem(item) {
  const purchases = item.purchases;
  const latest = purchases[purchases.length - 1];

  let spent = 0;
  for (const purchase of purchases) {
    spent += purchase.amount;
  }

  applyConfirmedDetails(purchases);
  const paid = lastTwoPaid(purchases);
  let comparison = { state: "single" };
  if (paid.last && paid.previous) {
    comparison = comparePrices(paid.last, paid.previous);
  }
  let priceChange = null;
  let priceChangePercent = null;
  if (comparison.state === "change") {
    priceChange = comparison.change;
    priceChangePercent = comparison.percent;
  }

  return {
    key: item.key,
    supplier: item.supplier,
    code: item.code,
    description: item.description,
    original: item.original,
    category: item.category,
    unit: latest.unit,
    timesBought: purchases.length,
    quantities: quantitiesByUnit(purchases),
    spent: roundToCents(spent),
    firstDate: purchases[0].date,
    lastDate: latest.date,
    lastQuantity: latest.quantity,
    lastPrice: latest.unitPrice,
    isFree: latest.amount === 0,
    priceChange: priceChange,
    priceChangePercent: priceChangePercent,
    priceComparison: comparison,
    comparedUnits: comparedUnits(paid),
    units: unitsBought(purchases)
  };
}

/* The units the two compared purchases were in, latest first, each once:
   the ones a package size may need confirming for. */
function comparedUnits(paid) {
  const units = [];
  for (const purchase of [paid.last, paid.previous]) {
    if (purchase && !units.includes(purchase.unit)) {
      units.push(purchase.unit);
    }
  }
  return units;
}

/* Every item bought, most money spent first. Each is { key, supplier, code,
   description, original, category, unit, timesBought, quantities, spent,
   firstDate, lastDate, lastQuantity, lastPrice, isFree, priceChange,
   priceChangePercent, priceComparison, comparedUnits, units }.

   priceComparison is what comparePrices() said about the latest price paid
   against the one before ({ state: "single" } with fewer than two).
   priceChange is the change per priceComparison.per, and priceChangePercent
   the change as a share, both null unless the two could be compared and
   the price moved. units lists each unit the item came in, with its
   delivery dates and the package definition in effect. */
export function itemsBought(invoices) {
  const items = new Map();
  for (const invoice of purchasesInDateOrder(invoices)) {
    for (const line of invoice.lines) {
      if (!isItemLine(line)) {
        continue;
      }
      const key = itemKey(invoice.supplier, line);
      if (!items.has(key)) {
        items.set(key, newItem(invoice.supplier));
      }
      const item = items.get(key);
      item.key = key;

      // The latest reading names the item; earlier ones may have been worded
      // differently.
      item.description = String(line.description || "").trim() || item.description;
      item.original = line.original || item.original;
      item.code = line.code || item.code;
      item.category = line.category;
      item.purchases.push({
        date: purchaseDate(invoice),
        quantity: line.quantity,
        unit: unitName(line.unit),
        unitPrice: line.unitPrice,
        amount: line.amount,
        currency: invoice.currency || null,
        ownPack: cleanPack(line.pack),
        ownBilledPer: cleanBilledPer(line.billedPer)
      });
    }
  }

  const summaries = [...items.values()].map(summariseItem);
  return summaries.sort(function (a, b) {
    if (b.spent !== a.spent) {
      return b.spent - a.spent;
    }
    return a.description.localeCompare(b.description);
  });
}

/* How many purchase invoices list no items: ones added before item details
   were kept, or bills with nothing to count (rent, a repair). */
export function invoicesWithoutItems(invoices) {
  return invoices.filter(function (invoice) {
    return invoice.kind !== "sale" && !invoice.lines.some(isItemLine);
  }).length;
}

/* The items that go on the count sheet, grouped by cost line in the order
   of COUNTED_LINES, each group in alphabetical order:
   [{ line, items }]. Groups with nothing in them are left out. */
export function countSheetGroups(items) {
  const groups = [];
  for (const line of COUNTED_LINES) {
    const inGroup = items.filter(function (item) {
      return item.category === line;
    });
    if (!inGroup.length) {
      continue;
    }
    inGroup.sort(function (a, b) {
      const byName = a.description.localeCompare(b.description);
      if (byName) {
        return byName;
      }
      return a.supplier.localeCompare(b.supplier);
    });
    groups.push({ line: line, items: inGroup });
  }
  return groups;
}

/* The invoices with a package size or billing unit confirmed for one item:
   `definition` is { pack, billedPer } (either may be null), set on the
   item's lines in `unit` on the delivery dated `fromDate`. Later deliveries
   in that unit use it until another is confirmed; earlier ones are left as
   they were. Returns { invoices, changed }: new invoices, and how many
   lines were changed. */
export function confirmPackage(invoices, key, unit, fromDate, definition) {
  const pack = cleanPack(definition.pack);
  const billedPer = cleanBilledPer(definition.billedPer);
  let changed = 0;
  const updated = invoices.map(function (invoice) {
    if (invoice.kind === "sale" || purchaseDate(invoice) !== fromDate) {
      return invoice;
    }
    let isChanged = false;
    const lines = invoice.lines.map(function (line) {
      const isThisItem = isItemLine(line) && itemKey(invoice.supplier, line) === key && unitName(line.unit) === unit;
      if (!isThisItem) {
        return line;
      }
      isChanged = true;
      changed += 1;
      const kept = Object.assign({}, line);
      delete kept.pack;
      delete kept.billedPer;
      if (pack) {
        kept.pack = pack;
      }
      if (billedPer) {
        kept.billedPer = billedPer;
      }
      return kept;
    });
    if (!isChanged) {
      return invoice;
    }
    return Object.assign({}, invoice, { lines: lines });
  });
  return { invoices: updated, changed: changed };
}
