/* Naming months and runs of months: "September 2026", "sep '26",
   "Jul–Sep 2026". */

import { state } from "./state.js";
import { capitalize } from "./format.js";

export const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

/* A bare month name is ambiguous once the figures span more than one year.
   Every month on file should carry its own year; this only falls back to the
   date the data was generated (or this year) for older data without one. */
function fallbackYear() {
  // data.generated is an ISO date from the Java app, but the built-in sample
  // says "sample data", which does not parse. Only trust it if it did.
  let generatedTime = NaN;
  if (state.data && state.data.generated) {
    generatedTime = Date.parse(state.data.generated);
  }
  if (Number.isFinite(generatedTime)) {
    return new Date(generatedTime).getUTCFullYear();
  }
  return new Date().getUTCFullYear();
}

export function yearOf(month) {
  return month.year || fallbackYear();
}

/* "September 2026" */
export function monthLabel(month) {
  return `${capitalize(month.month)} ${yearOf(month)}`;
}

/* "sep '26", for chart labels where space is short. */
export function monthShortLabel(month) {
  const twoDigitYear = String(yearOf(month)).slice(2);
  return `${month.month.slice(0, 3)} '${twoDigitYear}`;
}

/* "September 2026" from a year and a month number (1 to 12). */
export function calendarMonthLabel(year, monthNumber) {
  return `${capitalize(MONTH_NAMES[monthNumber - 1])} ${year}`;
}

/* "September 2026" for one month, "Jul–Sep 2026" for a run, and both years
   when the run crosses one: "Nov 2025–Feb 2026". Every card's period label
   comes from here. */
export function describeMonths(months) {
  if (months.length === 0) {
    return "";
  }
  if (months.length === 1) {
    return monthLabel(months[0]);
  }

  const first = months[0];
  const last = months[months.length - 1];
  const firstName = capitalize(first.month.slice(0, 3));
  const lastName = capitalize(last.month.slice(0, 3));

  if (yearOf(first) === yearOf(last)) {
    return `${firstName}–${lastName} ${yearOf(last)}`;
  }
  return `${firstName} ${yearOf(first)}–${lastName} ${yearOf(last)}`;
}

/* The label for cards that always cover every month on file. */
export function allMonthsLabel() {
  const months = state.data.months;
  if (months.length === 1) {
    return monthLabel(months[0]);
  }
  return "All months · " + describeMonths(months);
}
