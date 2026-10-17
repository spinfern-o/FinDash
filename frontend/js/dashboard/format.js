/* Turning numbers and text into what the page shows: money, percentages,
   dates, and text made safe to put into HTML. */

import { state } from "./state.js";

/* Amounts are shown in whichever currency the reader picks. Only the symbol
   changes. No conversion happens: the figures are the reader's own. */
export const CURRENCIES = [
  ["USD", "US dollar"],
  ["CAD", "Canadian dollar"],
  ["AUD", "Australian dollar"],
  ["NZD", "New Zealand dollar"],
  ["EUR", "Euro"],
  ["GBP", "British pound"],
  ["CHF", "Swiss franc"],
  ["SEK", "Swedish krona"],
  ["INR", "Indian rupee"],
  ["JPY", "Japanese yen"],
  ["CNY", "Chinese yuan"],
  ["SGD", "Singapore dollar"],
  ["ZAR", "South African rand"],
  ["MXN", "Mexican peso"]
];

/* Currencies that have no cents in everyday use. */
const CURRENCIES_WITHOUT_CENTS = ["JPY"];

export function isKnownCurrency(currencyCode) {
  for (const [code] of CURRENCIES) {
    if (code === currencyCode) {
      return true;
    }
  }
  return false;
}

/* Building a number formatter is slow, so each one is made once and kept. */
const currencyFormatters = {};

function currencyFormatter(currencyCode, decimals) {
  const cacheKey = currencyCode + decimals;
  if (currencyFormatters[cacheKey]) {
    return currencyFormatters[cacheKey];
  }

  const options = {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  };
  try {
    // narrowSymbol shows "$" rather than "CA$" for a Canadian reader, who
    // knows which dollar they mean. Older browsers reject it.
    currencyFormatters[cacheKey] = new Intl.NumberFormat("en-US", {
      ...options,
      currencyDisplay: "narrowSymbol"
    });
  } catch {
    currencyFormatters[cacheKey] = new Intl.NumberFormat("en-US", options);
  }
  return currencyFormatters[cacheKey];
}

/* An amount in the reader's currency, with 0 or 2 decimals. Negative amounts
   get a true minus sign, which lines up better than a hyphen. */
export function formatCurrency(amount, decimals) {
  let rounded;
  if (decimals) {
    rounded = Math.round(amount * 100) / 100;
  } else {
    rounded = Math.round(amount);
  }

  let sign = "";
  if (rounded < 0) {
    sign = "−";
  }
  return sign + currencyFormatter(state.currency, decimals).format(Math.abs(rounded));
}

/* Always whole: chart labels and headline numbers. */
export function formatWholeMoney(amount) {
  return formatCurrency(amount, 0);
}

/* Follows the "Show cents" setting: sentences and the report. */
export function formatMoney(amount) {
  if (state.showCents && !CURRENCIES_WITHOUT_CENTS.includes(state.currency)) {
    return formatCurrency(amount, 2);
  }
  return formatCurrency(amount, 0);
}

/* Always with cents (where the currency has them): what was read from an
   invoice, which should match the paper to the cent. */
export function formatMoneyWithCents(amount) {
  if (CURRENCIES_WITHOUT_CENTS.includes(state.currency)) {
    return formatCurrency(amount, 0);
  }
  return formatCurrency(amount, 2);
}

/* "$" for USD, "€" for EUR: the symbol alone, for the currency picker. */
export function currencySymbol(currencyCode) {
  const parts = currencyFormatter(currencyCode, 0).formatToParts(0);
  for (const part of parts) {
    if (part.type === "currency") {
      return part.value;
    }
  }
  return currencyCode;
}

/* What share `part` is of `whole`, as a percentage. Zero when there is no whole. */
export function percentOf(part, whole) {
  if (!whole) {
    return 0;
  }
  return (part / whole) * 100;
}

/* 12.345 -> "12.3%", -4 -> "−4.0%". */
export function formatPercent(value) {
  let sign = "";
  if (value < 0) {
    sign = "−";
  }
  return sign + Math.abs(value).toFixed(1) + "%";
}

export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* "11 October 2026", for a date the reader's own clock produced. */
export function formatLocalDate(date) {
  return date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

/* "11 October 2026", for a "2026-10-11" date read from a document. Read as
   UTC so the day never shifts with the reader's time zone. */
export function formatLongDate(isoDate) {
  const date = new Date(isoDate + "T00:00:00Z");
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

/* "Sep 21", for a "2026-09-21" date read from a document, where the year is
   plain from what is around it. Read as UTC, like formatLongDate. */
export function formatShortDate(isoDate) {
  const date = new Date(isoDate + "T00:00:00Z");
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

/* Text from a file, a photo reading or the model is text, not markup. This
   makes it safe to put inside HTML. */
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, function (character) {
    return HTML_ESCAPES[character];
  });
}

/* The reverse, for text that leaves the page (a request, a spreadsheet) and
   must not carry entities that only mean something in HTML. */
const HTML_UNESCAPES = { amp: "&", lt: "<", gt: ">", quot: '"' };

export function unescapeHtml(text) {
  return String(text).replace(/&(amp|lt|gt|quot);/g, function (entity, name) {
    return HTML_UNESCAPES[name];
  });
}
