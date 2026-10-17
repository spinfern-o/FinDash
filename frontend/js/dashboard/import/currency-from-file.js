/* Working out a file's currency from the symbols written next to amounts.

   Only an unambiguous answer is used: a file with both $ and € in it says
   nothing, and "$" alone does not override a reader who picked another
   dollar. No amounts are converted; only the symbol shown changes. */

import { state } from "../state.js";
import { isKnownCurrency } from "../format.js";
import { savePreferences } from "../preferences.js";

const SYMBOLS = [
  { symbol: "€", code: "EUR" },
  { symbol: "£", code: "GBP" },
  { symbol: "₹", code: "INR" },
  { symbol: "¥", code: "JPY" },
  { symbol: "CHF", code: "CHF" },
  { symbol: "$", code: "USD" }
];

/* Currencies written with "$". */
const DOLLAR_CURRENCIES = ["USD", "CAD", "AUD", "NZD", "SGD", "MXN"];

/* Adds the code of every currency symbol found beside a number in the grid
   to the set `found`. */
export function collectCurrencySymbols(grid, found) {
  for (const row of grid) {
    for (const cell of row) {
      const text = String(cell);
      if (!/\d/.test(text)) {
        continue;
      }
      for (const entry of SYMBOLS) {
        if (text.includes(entry.symbol)) {
          found.add(entry.code);
        }
      }
    }
  }
}

/* Switches the page to `currencyCode` when that is a change worth making.
   Returns a sentence for the status line saying so, or "" when nothing
   changed. */
export function adoptCurrency(currencyCode) {
  if (!currencyCode || currencyCode === state.currency) {
    return "";
  }
  if (currencyCode === "USD" && DOLLAR_CURRENCIES.includes(state.currency)) {
    return "";
  }
  if (!isKnownCurrency(currencyCode)) {
    return "";
  }

  state.currency = currencyCode;
  savePreferences();
  document.getElementById("currency").value = currencyCode;
  return " Amounts are shown in " + currencyCode + ".";
}
