/* Display preferences: whether to show cents, and which currency symbol.

   These are per-browser conveniences only. Amounts are whole by default:
   owners read whole dollars, and cents on a $64,420 cost line are noise.
   "Show cents" brings them back everywhere at once. */

import { state } from "./state.js";

const PREFERENCES_KEY = "findash-prefs";

export function loadPreferences() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY)) || {};
  } catch {
    // Storage is blocked or holds something unreadable; the defaults stand.
    saved = {};
  }

  state.showCents = saved.exact === true;

  const savedCurrency = saved.currency || "";
  if (/^[A-Z]{3}$/.test(savedCurrency)) {
    state.currency = savedCurrency;
  } else {
    state.currency = "USD";
  }
}

export function savePreferences() {
  const preferences = { exact: state.showCents, currency: state.currency };
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Storage is blocked; the choice still holds for this visit.
  }
}
