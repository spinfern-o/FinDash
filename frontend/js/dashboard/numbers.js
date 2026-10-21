/* Reading amounts written however a spreadsheet wrote them, and rounding. */

/* "$1,250.00" -> 1250, "(1,250.00)" -> -1250, "1.250,00" -> 1250, "" -> 0.
   Anything that is not a number reads as 0. */
export function parseAmount(value) {
  let text = String(value === null || value === undefined ? "" : value).trim();
  if (!text) {
    return 0;
  }

  // Accounting convention: (1,250.00) means -1250. Stripping the brackets
  // and reading 1250 as positive would silently flip the sign of every
  // such figure.
  let isNegative = false;
  if (/^\(.*\)$/.test(text)) {
    isNegative = true;
    text = text.slice(1, -1);
  }

  // Drop currency symbols and anything else that is not part of a number.
  text = text.replace(/[^0-9.,\-\s]/g, "").trim();

  // Only the unambiguous European forms are converted. "1.250,00",
  // "1.250.000" and "1 250,00" can mean nothing else. A bare "1,25" or
  // "1.250" is genuinely ambiguous: each is read the way a spreadsheet
  // writes numbers (a cell holding 152.125 arrives as "152.125"), since
  // guessing wrong here is a 1000x error either way.
  const europeanWithDots = /^-?\d{1,3}((\.\d{3})+,\d+|(\.\d{3}){2,})$/.test(text);
  const europeanWithSpaces = /^-?\d{1,3}( \d{3})+(,\d+)?$/.test(text);
  if (europeanWithDots || europeanWithSpaces) {
    text = text.replace(/[. ]/g, "").replace(",", ".");
  } else {
    text = text.replace(/[,\s]/g, "");
  }

  const amount = Number(text);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  if (isNegative) {
    return -amount;
  }
  return amount;
}

/* 12.345 -> 12.35. Money is kept to the cent so sums do not drift. */
export function roundToCents(amount) {
  return Math.round(amount * 100) / 100;
}
