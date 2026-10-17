/* Confirmed physical stock, separate from purchases and financial totals.
   Each item has its own explicit unit and location; units are never guessed
   or converted. A count establishes stock before deliveries, usage or waste. */

const MAXIMUM_ITEMS = 2000;
const MAXIMUM_MOVEMENTS = 10000;
const MOVEMENT_TYPES = ["count", "delivery", "usage", "waste"];

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

/* Validate an item without changing the supplier's original wording. */
function checkItem(item) {
  checkKeys(item, ["id", "original", "description", "unit", "location"], "item");
  checkText(item.id, 80, "Item id");
  checkText(item.original, 160, "Original description");
  checkText(item.description, 160, "Description");
  checkText(item.unit, 40, "Unit");
  checkText(item.location, 120, "Location");
}

/* An event is append-only; at is its recorded time, not a request to reorder history. */
function checkMovement(movement) {
  checkKeys(movement, ["id", "itemId", "type", "quantity", "at", "note"], "movement");
  checkText(movement.id, 80, "Movement id");
  checkText(movement.itemId, 80, "Movement item id");
  if (!MOVEMENT_TYPES.includes(movement.type)) {
    throw new Error("Movement type must be count, delivery, usage or waste");
  }
  if (typeof movement.quantity !== "number" || !Number.isFinite(movement.quantity) ||
      movement.quantity < 0 || movement.quantity > 1_000_000_000) {
    throw new Error("Quantity must be a finite number between 0 and 1000000000");
  }
  if (typeof movement.at !== "string" || movement.at.length > 40 ||
      !/^\d{4}-\d{2}-\d{2}T/.test(movement.at) || !Number.isFinite(Date.parse(movement.at))) {
    throw new Error("Movement time must be an ISO date and time");
  }
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
  checkKeys(inventory, ["version", "items", "movements"], "inventory");
  if (inventory.version !== 1 || !Array.isArray(inventory.items) || !Array.isArray(inventory.movements)) {
    throw new Error("Inventory needs version 1, items and movements");
  }
  if (inventory.items.length > MAXIMUM_ITEMS || inventory.movements.length > MAXIMUM_MOVEMENTS) {
    throw new Error("Inventory exceeds its item or movement limit");
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
  return balances;
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
  const next = { version: 1, items: [...inventory.items, item], movements: [...inventory.movements] };
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
  const next = { version: 1, items: [...inventory.items], movements: [...inventory.movements, movement] };
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
