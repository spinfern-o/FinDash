/* The template: one sheet, one row per month, every column the importer
   needs and nothing it doesn't.

   The headers are the plain names an owner would write, and each one lands
   on the right field when the file is read back. It comes filled with the
   demo months so the layout explains itself. */

import { state } from "../state.js";
import { capitalize, unescapeHtml } from "../format.js";
import { yearOf } from "../months.js";
import { lineValue } from "../cost-groups.js";
import { SAMPLE_DATA } from "../sample-data.js";
import { xlsxWorkbook, CELL_STYLES } from "./xlsx-writer.js";
import { downloadFile, toCsv } from "./downloads.js";

/* Each column: its header, and the field it fills (null for Month and Year,
   which are handled on their own). */
const TEMPLATE_COLUMNS = [
  { header: "Month", field: null },
  { header: "Year", field: null },
  { header: "Revenue", field: "revenue" },
  { header: "Budget", field: "budget" },
  { header: "Cost of goods sold", field: "cogs" },
  { header: "Labor", field: "labor" },
  { header: "Employee meals", field: "employee meals" },
  { header: "Payroll tax", field: "tax" },
  { header: "Packaging", field: "packaging" },
  { header: "Credit card fees", field: "credit card fees" },
  { header: "Marketing", field: "marketing" },
  { header: "Hardware", field: "hardware" },
  { header: "Utilities", field: "utilities" },
  { header: "Maintenance", field: "maintenance" },
  { header: "Rent", field: "rent" },
  { header: "Insurance", field: "insurance" },
  { header: "Business license", field: "business license" },
  { header: "Telephone", field: "telephone" }
];

const INSTRUCTIONS = [
  "One row per month. Replace the sample rows with your own; add as many months as you have.",
  "Month: the month's name, e.g. July. Year: e.g. 2026.",
  "Revenue: everything that came in from sales that month.",
  "Budget: the most you planned to spend that month in total (a spending limit, not a sales target). " +
    "Leave blank if you don't set one.",
  "Cost columns: copy each month's totals from your Profit and Loss in QuickBooks or Xero, or from your " +
    "own records. Leave a cost at 0 if you don't have it.",
  "A cost with no column of its own? Add it to the closest one. The help page explains what each cost " +
    "group covers.",
  "When you're done, save the file and drop it on the FinDash dashboard. It is read on your computer and " +
    "never uploaded."
];

function templateCell(month, column) {
  if (column.header === "Month") {
    return capitalize(unescapeHtml(month.month));
  }
  if (column.header === "Year") {
    return yearOf(month);
  }
  if (column.field === "revenue" || column.field === "budget") {
    return month[column.field];
  }
  return lineValue(month, column.field);
}

/* The header row, then one row per demo month. */
function templateRows() {
  const months = (state.publishedData || SAMPLE_DATA).months;
  const headerRow = TEMPLATE_COLUMNS.map(function (column) {
    return column.header;
  });
  const monthRows = months.map(function (month) {
    return TEMPLATE_COLUMNS.map(function (column) {
      return templateCell(month, column);
    });
  });
  return [headerRow, ...monthRows];
}

function figuresSheet(rows) {
  const headers = rows[0];
  const body = rows.slice(1);

  const widths = [12, 8];
  for (const header of headers.slice(2)) {
    widths.push(Math.max(11, header.length + 2));
  }

  const boldHeaders = headers.map(function (header) {
    return { v: header, s: CELL_STYLES.bold };
  });
  // Month and Year stay plain; the amounts get a thousands separator.
  const styledBody = body.map(function (row) {
    return row.map(function (value, columnIndex) {
      if (columnIndex < 2) {
        return value;
      }
      return { v: value, s: CELL_STYLES.number };
    });
  });

  return { name: "Your figures", freeze: [0, 1], widths: widths, rows: [boldHeaders, ...styledBody] };
}

function instructionsSheet() {
  const rows = [[{ v: "How to fill in the FinDash template", s: CELL_STYLES.bold }]];
  for (const line of INSTRUCTIONS) {
    rows.push([line]);
  }
  return { name: "How to fill this in", widths: [100], rows: rows };
}

/* kind is "xlsx" or "csv". */
export function downloadTemplate(kind) {
  const rows = templateRows();
  if (kind === "csv") {
    downloadFile(new Blob([toCsv(rows)], { type: "text/csv" }), "findash-template.csv");
    return;
  }
  downloadFile(xlsxWorkbook([figuresSheet(rows), instructionsSheet()]), "findash-template.xlsx");
}
