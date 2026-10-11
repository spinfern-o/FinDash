/* Working out which month a period cell means: "July", "Sept 2026",
   "2026-07", "07/2026", or an Excel date serial like 46204. */

import { MONTH_NAMES } from "../months.js";

/* Excel stores dates as days since 30 December 1899. A sideways sheet puts
   those numbers in the period column, where a bare "46204" means nothing to
   a reader. Null when the value is not a plausible date. */
export function monthFromExcelDate(value) {
  const days = Number(value);
  if (!Number.isFinite(days) || days < 20000 || days > 80000) {
    return null;
  }
  const date = new Date(Date.UTC(1899, 11, 30) + days * 86400000);
  return {
    month: date.toLocaleString("en-US", { month: "long", timeZone: "UTC" }).toLowerCase(),
    monthNum: date.getUTCMonth() + 1,
    year: date.getUTCFullYear()
  };
}

/* A year written into the period cell: "Sept 2026", "2026-09", "09/2026".
   Without this an imported month has no year at all and two Januaries
   collide. Null when there is none. */
export function yearInText(text) {
  const match = String(text).match(/(19|20)\d{2}/);
  if (match) {
    return Number(match[0]);
  }
  return null;
}

/* Whether a word is a month name or an abbreviation of one: "sep", "sept"
   and "september" all mean September. */
function wordMeansMonth(word, monthName) {
  if (monthName.startsWith(word)) {
    return true;
  }
  return word.startsWith(monthName) && word.length <= monthName.length + 1;
}

/* "July", "Jul 2026", "Sept", "2026-07", "07/2026" -> 7. Null when the cell
   names no month, so the caller can fall back to a month-number column. */
export function monthFromText(value) {
  let text = "";
  if (value !== null && value !== undefined) {
    text = String(value).toLowerCase();
  }

  const words = text.match(/[a-z]+/g) || [];
  for (const word of words) {
    if (word.length < 3) {
      continue;
    }
    const index = MONTH_NAMES.findIndex(function (monthName) {
      return wordMeansMonth(word, monthName);
    });
    if (index >= 0) {
      return index + 1;
    }
  }

  // "2026-07" or "07/2026": the month is the one- or two-digit part.
  const yearFirst = text.match(/\b(?:19|20)\d{2}[-/.](\d{1,2})\b/);
  const monthFirst = text.match(/\b(\d{1,2})[-/.](?:19|20)\d{2}\b/);
  const match = yearFirst || monthFirst;
  let monthNumber = 0;
  if (match) {
    monthNumber = Number(match[1]);
  }
  if (monthNumber >= 1 && monthNumber <= 12) {
    return monthNumber;
  }
  return null;
}
