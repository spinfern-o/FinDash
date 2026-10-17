/* Confirmed physical stock, separate from purchases and financial totals.
   Each item has its own explicit unit and location; units are never guessed
   or converted. A count establishes stock before deliveries, usage or waste.

   An item may also carry what the owner confirmed about buying it (all
   optional): `packs`, what one of a supplier's units holds in the item's
   own unit ("1 case = 6 bag"); `reorder`, the minimum and target to keep
   and who to buy from; `supplierCodes`, the suppliers' item codes that are
   this item. The ledger may also hold `checks`: deliveries that didn't
   arrive as billed, or weren't checked yet, until the owner resolves them.
   See contracts/inventory.md. */

const MAXIMUM_ITEMS = 2000;
const MAXIMUM_MOVEMENTS = 10000;
const MAXIMUM_CHECKS = 2000;
const MAXIMUM_QUANTITY = 1_000_000_000;
const MOVEMENT_TYPES = ["count", "delivery", "usage", "waste"];
// What went wrong with a delivery line, and where its check stands.
export const CHECK_STATUSES = ["short", "damaged", "missing", "unchecked"];
export const CHECK_STATES = ["open", "resolved", "credited"];

/* A new ledger has no assumed stock balances. */
export function emptyInventory() {
  return { version: 1, items: [], movements: [] };
}

/* Refuse extra fields so an account cannot become unbounded file storage. */
function checkKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error("Unexpected " + label + " field: " + key);
    }
  }
}

/* Every visible item field is explicit and bounded. */
function checkText(value, maximum, label) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error(label + " must be text, between 1 and " + maximum + " characters");
  }
}

/* Text that may be left empty, but is bounded when given. */
function checkOptionalText(value, maximum, label) {
  if (value !== undefined && (typeof value !== "string" || value.length > maximum)) {
    throw new Error(label + " must be text of at most " + maximum + " characters");
  }
}

/* A finite quantity between `lowest` (0 or more) and the ledger's largest. */
function checkQuantity(value, label, mustBePositive = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAXIMUM_QUANTITY ||
      (mustBePositive && value === 0)) {
    throw new Error(label + " must be a finite number between 0 and " + MAXIMUM_QUANTITY);
  }
}

/* An ISO date and time, as the ledger records when things happened. */
function checkTime(value, label) {
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
      !Number.isFinite(Date.parse(value))) {
    throw new Error(label + " must be an ISO date and time");
  }
}

/* Two names for the same unit, however they are capitalised or spaced. */
function sameName(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/* What the supplier's units hold in the item's own unit: at most ten,
   each a different unit, never the item's own. */
function checkPacks(item) {
  if (item.packs === undefined) {
    return;
  }
  if (!Array.isArray(item.packs) || item.packs.length > 10) {
    throw new Error("Pack sizes must be a list of at most 10");
  }
  item.packs.forEach(function (pack, index) {
    checkKeys(pack, ["unit", "contains"], "pack size");
    checkText(pack.unit, 40, "Pack unit");
    checkQuantity(pack.contains, "Pack size", true);
    if (sameName(pack.unit, item.unit)) {
      throw new Error("A pack size must be for a unit other than the item's own");
    }
    if (item.packs.slice(0, index).some(function (earlier) { return sameName(earlier.unit, pack.unit); })) {
      throw new Error("Each pack unit is listed once");
    }
  });
}

/* How much to keep, and where to buy it: all optional. The target is at
   least the minimum; buying in packs needs that pack's size confirmed. */
function checkReorder(item) {
  if (item.reorder === undefined) {
    return;
  }
  const reorder = item.reorder;
  checkKeys(reorder, ["minimum", "target", "supplier", "buyUnit"], "reorder");
  if (reorder.minimum !== undefined) {
    checkQuantity(reorder.minimum, "Minimum");
  }
  if (reorder.target !== undefined) {
    checkQuantity(reorder.target, "Target");
  }
  if (reorder.minimum !== undefined && reorder.target !== undefined && reorder.target < reorder.minimum) {
    throw new Error("The target must be at least the minimum");
  }
  checkOptionalText(reorder.supplier, 120, "Supplier");
  if (reorder.buyUnit !== undefined) {
    checkText(reorder.buyUnit, 40, "Buying unit");
    const known = (item.packs || []).some(function (pack) { return sameName(pack.unit, reorder.buyUnit); });
    if (!known) {
      throw new Error("Buying in packs needs that pack's size");
    }
  }
}

/* The suppliers' item codes the owner confirmed are this item. */
function checkSupplierCodes(item) {
  if (item.supplierCodes === undefined) {
    return;
  }
  if (!Array.isArray(item.supplierCodes) || item.supplierCodes.length > 20) {
    throw new Error("Supplier codes must be a list of at most 20");
  }
  for (const entry of item.supplierCodes) {
    checkKeys(entry, ["supplier", "code"], "supplier code");
    checkText(entry.supplier, 120, "Supplier");
    checkText(entry.code, 40, "Supplier code");
  }
}

/* Validate an item without changing the supplier's original wording. */
function checkItem(item) {
  checkKeys(item, ["id", "original", "description", "unit", "location", "packs", "reorder", "supplierCodes"], "item");
  checkText(item.id, 80, "Item id");
  checkText(item.original, 160, "Original description");
  checkText(item.description, 160, "Description");
  checkText(item.unit, 40, "Unit");
  checkText(item.location, 120, "Location");
  checkPacks(item);
  checkReorder(item);
  checkSupplierCodes(item);
}

/* A supplier's code identifies one item: the same code from the same
   supplier can't be confirmed as two different things. */
function checkCodesAreUnique(items) {
  const seen = new Set();
  for (const item of items) {
    for (const entry of item.supplierCodes || []) {
      const key = entry.supplier.trim().toLowerCase() + "|" + entry.code.trim().toLowerCase();
      if (seen.has(key)) {
        throw new Error("A supplier code is confirmed for more than one item");
      }
      seen.add(key);
    }
  }
}

/* An amount and unit as an invoice printed it or as it arrived. */
function checkAmountAndUnit(value, label) {
  checkKeys(value, ["quantity", "unit"], label);
  checkQuantity(value.quantity, label + " quantity");
  checkOptionalText(value.unit, 40, label + " unit");
}

/* A delivery line that didn't arrive as billed, or wasn't checked yet. The
   billed amounts are kept exactly as printed; what happened since is
   added to its history, never written over it. */
function checkDeliveryCheck(check, itemIds) {
  checkKeys(check, ["id", "at", "source", "supplier", "number", "itemId", "original", "category", "billed",
    "received", "status", "unitPrice", "possibleValue", "currency", "state", "credit", "history"], "delivery check");
  checkText(check.id, 80, "Check id");
  checkTime(check.at, "Check time");
  checkText(check.source, 80, "Check source");
  checkOptionalText(check.supplier, 120, "Supplier");
  checkOptionalText(check.number, 60, "Invoice number");
  checkOptionalText(check.category, 40, "Cost line");
  if (check.itemId !== undefined && !itemIds.has(check.itemId)) {
    throw new Error("A delivery check refers to an unknown item");
  }
  checkText(check.original, 160, "Original description");
  checkAmountAndUnit(check.billed, "Billed");
  checkAmountAndUnit(check.received, "Received");
  if (!CHECK_STATUSES.includes(check.status)) {
    throw new Error("Delivery status must be short, damaged, missing or unchecked");
  }
  for (const key of ["unitPrice", "possibleValue"]) {
    if (check[key] !== undefined) {
      checkQuantity(check[key], key);
    }
  }
  if (check.currency !== undefined && !/^[A-Z]{3}$/.test(check.currency)) {
    throw new Error("Currency must be a three-letter code");
  }
  if (!CHECK_STATES.includes(check.state)) {
    throw new Error("A delivery check is open, resolved or credited");
  }
  if ((check.state === "credited") !== (check.credit !== undefined)) {
    throw new Error("A credited check, and only one, records its credit");
  }
  if (check.credit !== undefined) {
    checkKeys(check.credit, ["amount", "reference", "invoiceId"], "credit");
    checkQuantity(check.credit.amount, "Credit amount", true);
    checkOptionalText(check.credit.reference, 60, "Credit reference");
    checkOptionalText(check.credit.invoiceId, 40, "Credit invoice");
  }
  if (!Array.isArray(check.history) || !check.history.length || check.history.length > 30) {
    throw new Error("A delivery check keeps a history of 1 to 30 entries");
  }
  for (const entry of check.history) {
    checkKeys(entry, ["at", "state", "note"], "check history");
    checkTime(entry.at, "History time");
    if (!CHECK_STATES.includes(entry.state)) {
      throw new Error("History states are open, resolved or credited");
    }
    checkOptionalText(entry.note, 300, "History note");
  }
  if (check.history[0].state !== "open" || check.history[check.history.length - 1].state !== check.state) {
    throw new Error("A check's history starts open and ends where it stands");
  }
}

/* An event is append-only; at is its recorded time, not a request to reorder history. */
function checkMovement(movement) {
  checkKeys(movement, ["id", "itemId", "type", "quantity", "at", "note"], "movement");
  checkText(movement.id, 80, "Movement id");
  checkText(movement.itemId, 80, "Movement item id");
  if (!MOVEMENT_TYPES.includes(movement.type)) {
    throw new Error("Movement type must be count, delivery, usage or waste");
  }
  checkQuantity(movement.quantity, "Quantity");
  checkTime(movement.at, "Movement time");
  if (movement.note !== undefined && (typeof movement.note !== "string" || movement.note.length > 300)) {
    throw new Error("Movement note must be text of at most 300 characters");
  }
}

/* Read a number's decimal spelling as whole digits and decimal places.
   This keeps 0.3 - 0.1 - 0.2 at zero without permitting tiny overdraws. */
function decimalParts(value) {
  const [coefficient, exponent = "0"] = String(value).split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  let digits = BigInt(whole + fraction);
  let places = fraction.length - Number(exponent);
  if (places < 0) {
    digits *= 10n ** BigInt(-places);
    places = 0;
  }
  return { digits, places };
}

/* Add or subtract the stated decimal quantities, with no unit conversion. */
function adjustedQuantity(balance, quantity, subtract) {
  const first = decimalParts(balance);
  const second = decimalParts(quantity);
  const places = Math.max(first.places, second.places);
  const balanceDigits = first.digits * 10n ** BigInt(places - first.places);
  const quantityDigits = second.digits * 10n ** BigInt(places - second.places);
  const next = subtract ? balanceDigits - quantityDigits : balanceDigits + quantityDigits;
  if (next < 0n) {
    throw new Error("This movement would make stock negative");
  }
  return Number(String(next) + "e-" + places);
}

/* Replay physical changes; purchase quantities alone never initialize stock. */
function applyMovement(balance, movement) {
  if (movement.type === "count") {
    return movement.quantity;
  }
  if (balance === null) {
    throw new Error("Count what is on the shelf before recording deliveries, usage or waste");
  }
  const subtract = movement.type === "usage" || movement.type === "waste";
  const next = adjustedQuantity(balance, movement.quantity, subtract);
  if (!Number.isFinite(next) || next < 0 || next > 1_000_000_000) {
    throw new Error("This movement would make stock negative or too large");
  }
  return next;
}

/* Validate the entire history, including duplicate ids and negative balances. */
function checkedBalances(inventory) {
  checkKeys(inventory, ["version", "items", "movements", "checks"], "inventory");
  if (inventory.version !== 1 || !Array.isArray(inventory.items) || !Array.isArray(inventory.movements)) {
    throw new Error("Inventory needs version 1, items and movements");
  }
  if (inventory.items.length > MAXIMUM_ITEMS || inventory.movements.length > MAXIMUM_MOVEMENTS) {
    throw new Error("Inventory exceeds its item or movement limit");
  }
  if (inventory.checks !== undefined && (!Array.isArray(inventory.checks) || inventory.checks.length > MAXIMUM_CHECKS)) {
    throw new Error("Delivery checks must be a list of at most " + MAXIMUM_CHECKS);
  }
  const balances = new Map();
  for (const item of inventory.items) {
    checkItem(item);
    if (balances.has(item.id)) {
      throw new Error("Duplicate item id");
    }
    balances.set(item.id, null);
  }
  const eventIds = new Set();
  for (const movement of inventory.movements) {
    checkMovement(movement);
    if (!balances.has(movement.itemId)) {
      throw new Error("Movement refers to an unknown item");
    }
    if (eventIds.has(movement.id)) {
      throw new Error("Duplicate movement id");
    }
    eventIds.add(movement.id);
    balances.set(movement.itemId, applyMovement(balances.get(movement.itemId), movement));
  }
  checkCodesAreUnique(inventory.items);
  const checkIds = new Set();
  for (const check of inventory.checks || []) {
    checkDeliveryCheck(check, balances);
    if (checkIds.has(check.id)) {
      throw new Error("Duplicate delivery check id");
    }
    checkIds.add(check.id);
  }
  return balances;
}

/* A copy of the ledger with its parts copied, for one change to be made to. */
function nextLedger(inventory) {
  const next = { version: 1, items: [...inventory.items], movements: [...inventory.movements] };
  if (inventory.checks !== undefined) {
    next.checks = [...inventory.checks];
  }
  return next;
}

/* Public validation keeps the original record intact. */
export function validateInventory(inventory) {
  checkedBalances(inventory);
  return inventory;
}

/* A list view asks for all balances in one pass, rather than replaying the
   same history separately for every item on the page. */
export function stockBalances(inventory) {
  return checkedBalances(inventory);
}

/* Add a reviewed item; its shelf quantity remains unknown until counted. */
export function addItem(inventory, input) {
  validateInventory(inventory);
  const item = { ...input };
  checkItem(item);
  const next = nextLedger(inventory);
  next.items.push(item);
  validateInventory(next);
  return next;
}

/* What the owner confirmed about buying an item: its pack sizes, reorder
   settings and supplier codes. `changes` replaces those three where given
   (null removes one). The item's name, unit and location, and every
   movement already recorded, stay as they were. */
export function updateItem(inventory, itemId, changes) {
  validateInventory(inventory);
  checkKeys(changes, ["packs", "reorder", "supplierCodes"], "item changes");
  const next = nextLedger(inventory);
  const index = next.items.findIndex(function (item) { return item.id === itemId; });
  if (index < 0) {
    throw new Error("Unknown item");
  }
  const item = { ...next.items[index] };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || (Array.isArray(value) && !value.length)) {
      delete item[key];
    } else {
      item[key] = value;
    }
  }
  next.items[index] = item;
  validateInventory(next);
  return next;
}

/* Adds delivery checks to the ledger: new ones only, each with its own id. */
export function addChecks(inventory, checks) {
  validateInventory(inventory);
  if (!checks.length) {
    return inventory;
  }
  const next = nextLedger(inventory);
  next.checks = [...(inventory.checks || []), ...checks];
  validateInventory(next);
  return next;
}

/* Replaces one delivery check with its next state (see receiving.js). */
export function replaceCheck(inventory, check) {
  validateInventory(inventory);
  const next = nextLedger(inventory);
  const index = (next.checks || []).findIndex(function (entry) { return entry.id === check.id; });
  if (index < 0) {
    throw new Error("Unknown delivery check");
  }
  next.checks[index] = check;
  validateInventory(next);
  return next;
}

/* Add one confirmed physical change without mutating the previous state. */
export function recordMovement(inventory, input) {
  validateInventory(inventory);
  const movement = { ...input };
  if (movement.at === undefined) {
    movement.at = new Date().toISOString();
  }
  const next = nextLedger(inventory);
  next.movements.push(movement);
  validateInventory(next);
  return next;
}

/* A null balance asks the owner to count; zero means a confirmed empty shelf. */
export function stockOnHand(inventory, itemId) {
  const balances = stockBalances(inventory);
  if (!balances.has(itemId)) {
    throw new Error("Unknown item");
  }
  return balances.get(itemId);
}
