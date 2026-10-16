/* The count sheet: a list of everything the owner buys that sits on a
   shelf (food and ingredients, staff meals, packaging), with a box beside
   each item to write how many are on hand. Made from the invoices added
   from photos, so it lists only what this business actually orders, under
   the names and codes on the supplier's own paperwork.

   It can be printed (staff count on paper, as most kitchens do) or
   downloaded as a spreadsheet for counting on a tablet. Both are made in
   this browser; nothing is sent anywhere. */

import { state } from "./state.js";
import { escapeHtml, formatLongDate, formatShortDate, formatLocalDate } from "./format.js";
import { itemsBought, countSheetGroups } from "./items.js";
import { xlsxWorkbook, CELL_STYLES } from "./export/xlsx-writer.js";
import { downloadFile } from "./export/downloads.js";

/* What each group is called on the sheet: the words a kitchen uses, rather
   than the report's cost line names. */
const GROUP_HEADINGS = {
  "cogs": "Food and ingredients",
  "employee meals": "Staff meals",
  "packaging": "Packaging"
};

const HOW_TO_COUNT = "Count what is on the shelf in the unit shown. Write part of a case or bag as a " +
  "fraction: half a case is ½.";

/* 3 -> "3", 2.5 -> "2.5". */
function quantityText(quantity) {
  return quantity.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/* "3 case on Sep 21", or "3 on Sep 21" when the invoice named no unit. */
function lastDeliveryText(item) {
  let quantity = quantityText(item.lastQuantity);
  if (item.unit) {
    quantity += " " + item.unit;
  }
  return `${quantity} on ${formatShortDate(item.lastDate)}`;
}

/* Everything the sheet needs: the groups, whether to name suppliers (only
   when there is more than one), and what it was made from. */
function countSheetContents() {
  const items = itemsBought(state.ownerInvoices);
  const groups = countSheetGroups(items);
  const suppliers = new Set(items.map(function (item) {
    return item.supplier.toLowerCase();
  }));
  let latestDate = "";
  for (const item of items) {
    if (item.lastDate > latestDate) {
      latestDate = item.lastDate;
    }
  }
  const invoiceCount = state.ownerInvoices.filter(function (invoice) {
    return invoice.kind !== "sale";
  }).length;
  return { groups: groups, showSupplier: suppliers.size > 1, latestDate: latestDate, invoiceCount: invoiceCount };
}

function itemCellHtml(item, showSupplier) {
  const details = [];
  if (item.original) {
    details.push(escapeHtml(item.original));
  }
  if (showSupplier && item.supplier) {
    details.push(escapeHtml(item.supplier));
  }
  let detailsHtml = "";
  if (details.length) {
    detailsHtml = `<span class="count-orig">${details.join(" &middot; ")}</span>`;
  }
  return `<th scope="row">${escapeHtml(item.description)}${detailsHtml}</th>`;
}

function groupHtml(group, showSupplier) {
  let rows = "";
  for (const item of group.items) {
    rows += `<tr>
        ${itemCellHtml(item, showSupplier)}
        <td>${escapeHtml(item.code || "")}</td>
        <td>${escapeHtml(lastDeliveryText(item))}</td>
        <td>${escapeHtml(item.unit)}</td>
        <td class="count-box"></td>
      </tr>`;
  }
  return `<section class="count-group">
      <h3>${GROUP_HEADINGS[group.line]}</h3>
      <table class="count-table">
        <thead><tr><th scope="col">Item</th><th scope="col">Code</th><th scope="col">Last delivery</th>
          <th scope="col">Count in</th><th scope="col">On hand</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

/* The sheet as HTML, for printing. */
export function countSheetHtml() {
  const contents = countSheetContents();
  let groups = "";
  for (const group of contents.groups) {
    groups += groupHtml(group, contents.showSupplier);
  }
  if (!groups) {
    groups = `<p>None of the items on your invoices is food, staff meals or packaging, so there is nothing to count.</p>`;
  }

  let madeFrom = "";
  if (contents.latestDate) {
    madeFrom = `, the latest dated ${formatLongDate(contents.latestDate)}`;
  }
  return `<header class="count-head">
      <div><h2>Count sheet</h2><p>${HOW_TO_COUNT}</p></div>
      <p class="count-fill">Date <span></span></p>
      <p class="count-fill">Counted by <span></span></p>
    </header>
    ${groups}
    <p class="count-foot">Made by FinDash from ${contents.invoiceCount} supplier invoices${madeFrom}.
      Printed ${formatLocalDate(new Date())}.</p>`;
}

const PAGE_TITLE_WHILE_PRINTING = "Count sheet · FinDash";
let pageTitle = "";

function stopPrintingCountSheet() {
  document.body.classList.remove("printing-count-sheet");
  document.title = pageTitle;
}

/* Prints the count sheet on its own: while it prints, the page shows only
   the sheet (see .printing-count-sheet in dashboard.css). The title names
   the file when it is saved as a PDF. */
export function printCountSheet() {
  document.getElementById("count-sheet").innerHTML = countSheetHtml();
  pageTitle = document.title;
  document.title = PAGE_TITLE_WHILE_PRINTING;
  document.body.classList.add("printing-count-sheet");
  window.addEventListener("afterprint", stopPrintingCountSheet, { once: true });
  window.print();
}

/* The sheet as spreadsheet rows: a heading, the same columns as the
   printed sheet, the item's printed name and supplier in columns of their
   own, and an empty On hand column to fill in. */
function countSheetRows() {
  const contents = countSheetContents();
  const bold = CELL_STYLES.bold;
  const rows = [
    [{ v: "Count sheet", s: bold }],
    [HOW_TO_COUNT],
    [{ v: "Date", s: bold }, "", { v: "Counted by", s: bold }],
    [],
    ["Item", "Name on invoice", "Code", "Supplier", "Last delivery", "Count in", "On hand"].map(function (heading) {
      return { v: heading, s: bold };
    })
  ];
  for (const group of contents.groups) {
    rows.push([{ v: GROUP_HEADINGS[group.line], s: bold }]);
    for (const item of group.items) {
      rows.push([item.description, item.original, item.code, item.supplier, lastDeliveryText(item), item.unit, ""]);
    }
  }
  return rows;
}

/* "2026-10-16", today on the owner's own clock, for the file name. */
function todayForFileName() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

/* Saves the count sheet as an Excel file. */
export function downloadCountSheet() {
  const sheet = { name: "Count sheet", rows: countSheetRows(), widths: [34, 22, 12, 22, 18, 10, 12], freeze: [0, 5] };
  downloadFile(xlsxWorkbook([sheet]), `findash-count-sheet-${todayForFileName()}.xlsx`);
}
