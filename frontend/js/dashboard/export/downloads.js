/* Handing a file to the browser to save, and writing CSV text. */

import { unescapeHtml } from "../format.js";

export function downloadFile(blob, fileName) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  setTimeout(function () {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 0);
}

/* "Jul–Sep 2026" -> "jul-sep-2026", for a file name. */
export function fileNamePart(text) {
  return unescapeHtml(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* A cell holding a comma, quote or line break is quoted, with its quotes doubled. */
function csvCell(value) {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows) {
  const lines = rows.map(function (row) {
    return row.map(csvCell).join(",");
  });
  return lines.join("\r\n") + "\r\n";
}
