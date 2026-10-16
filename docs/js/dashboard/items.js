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
   money on the dashboard: that comes from the invoices' lines as before. */

import { roundToCents } from "./numbers.js";

/* The cost lines whose items sit on a shelf until they are used, so they
   go on the count sheet: food and drink, staff meals and packaging. */
export const COUNTED_LINES = ["cogs", "employee meals", "packaging"];

/* "Cases" -> "case", "LBS" -> "lb", "Boxes" -> "box": the same unit however
   a reading wrote it, so quantities in it can be added up. */
export function unitName(unit) {
  if (typeof unit !== "string") {
    return "";
  }
  const name = unit.trim().toLowerCase();
  if (/(ss|us)$/.test(name)) {
    return name;
  }
  if (/(x|ch|sh)es$/.test(name)) {
    return name.slice(0, -2);
  }
  if (name.length > 2 && name.endsWith("s")) {
    return name.slice(0, -1);
  }
  return name;
}

/* "Broccoli (Chui Ho)  " -> "broccoli (chui ho)", for matching names. */
function matchingText(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/* What identifies the item on `line` from `supplier`. */
function itemKey(supplier, line) {
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

/* The latest price paid that was not free, and the one before it. */
function lastTwoPrices(purchases) {
  const prices = [];
  for (let index = purchases.length - 1; index >= 0 && prices.length < 2; index--) {
    const price = purchases[index].unitPrice;
    if (Number.isFinite(price) && price > 0) {
      prices.push(price);
    }
  }
  let last = null;
  let previous = null;
  if (prices.length > 0) {
    last = prices[0];
  }
  if (prices.length > 1) {
    previous = prices[1];
  }
  return { last: last, previous: previous };
}

/* One item's purchases, summed up for the list. */
function summariseItem(item) {
  const purchases = item.purchases;
  const latest = purchases[purchases.length - 1];

  let spent = 0;
  for (const purchase of purchases) {
    spent += purchase.amount;
  }

  const prices = lastTwoPrices(purchases);
  let priceChange = null;
  let priceChangePercent = null;
  if (prices.last !== null && prices.previous !== null && prices.last !== prices.previous) {
    priceChange = Math.round((prices.last - prices.previous) * 1000) / 1000;
    priceChangePercent = Math.round(((prices.last - prices.previous) / prices.previous) * 1000) / 10;
  }

  return {
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
    priceChangePercent: priceChangePercent
  };
}

/* Every item bought, most money spent first. Each is { supplier, code,
   description, original, category, unit, timesBought, quantities, spent,
   firstDate, lastDate, lastQuantity, lastPrice, isFree, priceChange,
   priceChangePercent }. priceChange is the latest price minus the one
   before it, or null when there is only one price or it has not moved. */
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
        amount: line.amount
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
