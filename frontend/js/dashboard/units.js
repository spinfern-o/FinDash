/* Units of measure, and the conversions between them that are always safe.

   Three kinds of measure can be converted within themselves: weight (g,
   kg, lb), volume (mL, L) and count (each, dozen). Nothing converts from
   one kind to another: a kilogram of oil is not a litre without knowing the
   oil.

   Some units are fixed measures but not safe to convert, because the same
   name means different amounts in different places: an ounce (weight, or
   fluid?), a gallon or a quart (US or imperial?), a 斤 (500 g in mainland
   China, 600 g in Taiwan and Hong Kong). A price per gallon can be compared
   with another price per gallon, never with a price per litre.

   Anything else (case, bag, box, bucket, bottle...) is a package: what it
   holds has to be confirmed by the owner before its price means anything
   per kilogram or per item. Used by items.js and price-comparison.js. */

// How many grams, millilitres or single items one of each unit holds.
const CONVERTIBLE = {
  g: { measure: "weight", size: 1 },
  kg: { measure: "weight", size: 1000 },
  lb: { measure: "weight", size: 453.59237 },
  ml: { measure: "volume", size: 1 },
  l: { measure: "volume", size: 1000 },
  each: { measure: "count", size: 1 },
  dozen: { measure: "count", size: 12 }
};

// Fixed measures that are only ever compared with themselves.
const SAME_UNIT_ONLY = ["oz", "fl oz", "gal", "qt", "pt", "斤", "两"];

// Other ways invoices write the units above, after unitName() has made them
// lower case and singular.
const ALIASES = {
  gram: "g", gm: "g", gr: "g", "克": "g",
  kilo: "kg", kilogram: "kg", kgs: "kg", "公斤": "kg", "千克": "kg",
  pound: "lb", lbs: "lb", "#": "lb", "磅": "lb",
  milliliter: "ml", millilitre: "ml", "毫升": "ml",
  liter: "l", litre: "l", ltr: "l", lt: "l", "升": "l", "公升": "l",
  ea: "each", pc: "each", piece: "each", "个": "each", "個": "each",
  doz: "dozen", dz: "dozen", "打": "dozen",
  ounce: "oz", "fl. oz": "fl oz", floz: "fl oz", gallon: "gal", quart: "qt", pint: "pt"
};

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

// The units an owner can choose when confirming what a package holds or
// what a price is per, in the order they are offered.
export const CHOOSABLE_UNITS = ["lb", "kg", "g", "l", "ml", "each"];

/* The unit as this file names it: "Kilos" -> "kg", "PCS" -> "each",
   "Case" -> "case". "" when there is none. */
export function standardUnitName(unit) {
  const name = unitName(unit);
  return ALIASES[name] || name;
}

/* What kind of measure a unit is and how big, or null for a package or a
   unit that is not safe to convert: { measure, size }. */
export function convertibleUnit(unit) {
  return CONVERTIBLE[standardUnitName(unit)] || null;
}

/* Whether a unit is a fixed amount (a kilogram, a gallon, one item), so a
   price per it can be compared with another price per the same unit
   without knowing what is in a package. */
export function isFixedMeasure(unit) {
  const name = standardUnitName(unit);
  return Boolean(CONVERTIBLE[name]) || SAME_UNIT_ONLY.includes(name);
}

/* `quantity` of `fromUnit` in `toUnit`, or null when the two can't be
   converted safely. 2 lb in kg -> 0.907... */
export function convertQuantity(quantity, fromUnit, toUnit) {
  const from = convertibleUnit(fromUnit);
  const to = convertibleUnit(toUnit);
  if (!Number.isFinite(quantity) || !from || !to || from.measure !== to.measure) {
    return null;
  }
  return quantity * from.size / to.size;
}
