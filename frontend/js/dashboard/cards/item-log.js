/* "What you buy": every item on the invoices added from photos, with how
   much came in, what it cost in all, and whether its price moved since the
   delivery before. The count sheet is printed or downloaded from here.

   It covers every invoice on file, whichever period is on screen, and is
   left out of the printed report (the count sheet has its own print). */

import { state, isShowingOwnerFigures } from "../state.js";
import { escapeHtml, formatMoneyWithCents, formatPercent, formatShortDate } from "../format.js";
import { itemsBought, invoicesWithoutItems } from "../items.js";
import { printCountSheet, downloadCountSheet } from "../count-sheet.js";
import { cardHtml } from "./card.js";

// The items with the most money spent on them are shown first; the rest
// are a click away, so a long list does not push the cards below it down.
const ROWS_AT_FIRST = 10;
let isShowingEveryItem = false;

function plural(count, word) {
  if (count === 1) {
    return word;
  }
  return word + "s";
}

/* 3 -> "3", 2.5 -> "2.5", 0.333333 -> "0.333". */
function quantityText(quantity) {
  return quantity.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/* "6 case, 2 bag". */
function quantitiesText(quantities) {
  return quantities.map(function (entry) {
    return (quantityText(entry.quantity) + " " + entry.unit).trim();
  }).join(", ");
}

/* What is under the item's name: the name as printed, its code and, when
   more than one supplier is on file, who it came from. */
function itemDetailsHtml(item, showSupplier) {
  const details = [];
  if (item.original) {
    details.push(escapeHtml(item.original));
  }
  if (item.code) {
    details.push(escapeHtml(item.code));
  }
  if (showSupplier && item.supplier) {
    details.push(escapeHtml(item.supplier));
  }
  if (!details.length) {
    return "";
  }
  return `<span class="item-sub">${details.join(" &middot; ")}</span>`;
}

/* "1 delivery", "3 deliveries". */
function deliveriesText(count) {
  if (count === 1) {
    return "1 delivery";
  }
  return `${count} deliveries`;
}

function boughtHtml(item) {
  return `${escapeHtml(quantitiesText(item.quantities))}
    <span class="item-sub">${deliveriesText(item.timesBought)}, last ${formatShortDate(item.lastDate)}</span>`;
}

function lastPriceHtml(item) {
  if (item.isFree) {
    return "Free";
  }
  if (!Number.isFinite(item.lastPrice)) {
    return "&mdash;";
  }
  return formatMoneyWithCents(item.lastPrice);
}

/* "▲ $1.00 (3.3%)" in red when it went up, "▼" in green when it came down. */
function priceChangeHtml(item) {
  if (item.priceChange === null) {
    return `<span class="item-same">&mdash;</span>`;
  }
  const size = `${formatMoneyWithCents(Math.abs(item.priceChange))} (${formatPercent(Math.abs(item.priceChangePercent))})`;
  if (item.priceChange > 0) {
    return `<span class="item-up" title="Up from the delivery before">▲ ${size}</span>`;
  }
  return `<span class="item-down" title="Down from the delivery before">▼ ${size}</span>`;
}

function itemRowHtml(item, index, showSupplier) {
  let hidden = "";
  if (index >= ROWS_AT_FIRST && !isShowingEveryItem) {
    hidden = " hidden";
  }
  return `<tr${hidden}>
      <th scope="row">${escapeHtml(item.description)}${itemDetailsHtml(item, showSupplier)}</th>
      <td>${boughtHtml(item)}</td>
      <td class="amt">${formatMoneyWithCents(item.spent)}</td>
      <td class="amt">${lastPriceHtml(item)}</td>
      <td class="amt">${priceChangeHtml(item)}</td>
    </tr>`;
}

function showAllButtonHtml(itemCount) {
  if (itemCount <= ROWS_AT_FIRST) {
    return "";
  }
  let label = `Show all ${itemCount} items`;
  if (isShowingEveryItem) {
    label = "Show fewer";
  }
  return `<button type="button" class="btn small item-more" data-items="more"
    aria-expanded="${isShowingEveryItem}">${label}</button>`;
}

/* A word about invoices that are on file but list no items. */
function missingItemsNote() {
  const count = invoicesWithoutItems(state.ownerInvoices);
  if (!count) {
    return "";
  }
  let invoices = `${count} invoices on file list`;
  if (count === 1) {
    invoices = "1 invoice on file lists";
  }
  return ` ${invoices} no items: bills with nothing to count, or invoices added before FinDash kept ` +
    "item details.";
}

/* The card, or "" when the owner has not added an invoice with items. */
export function itemLogCardHtml() {
  if (!isShowingOwnerFigures()) {
    return "";
  }
  const items = itemsBought(state.ownerInvoices);
  if (!items.length) {
    return "";
  }

  const suppliers = new Set(items.map(function (item) {
    return item.supplier.toLowerCase();
  }));
  const showSupplier = suppliers.size > 1;

  let rows = "";
  items.forEach(function (item, index) {
    rows += itemRowHtml(item, index, showSupplier);
  });

  const invoiceCount = state.ownerInvoices.filter(function (invoice) {
    return invoice.kind !== "sale";
  }).length;

  const body = `<div class="table-wrap"><table class="item-table">
      <thead><tr><th scope="col">Item</th><th scope="col">Bought</th><th scope="col">Spent</th>
        <th scope="col">Last price</th><th scope="col">Change</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${showAllButtonHtml(items.length)}
    <p class="item-note">Prices are as printed on the invoice: per pound for anything billed by weight, otherwise
      per case, bag or piece. The change is against the delivery before.${missingItemsNote()}</p>
    <div class="item-actions">
      <button type="button" class="btn" data-items="print">Print count sheet</button>
      <button type="button" class="btn" data-items="excel">Download count sheet (Excel)</button>
    </div>`;

  return cardHtml("wide no-print item-log", "What you buy",
    "Every item on the invoices you added from photos, and what it cost last time",
    `From ${invoiceCount} ${plural(invoiceCount, "invoice")}`, body);
}

/* "Show all" opens the rest of the list in place, without redrawing. */
function toggleEveryItem(button) {
  isShowingEveryItem = !isShowingEveryItem;
  const rows = button.closest(".item-log").querySelectorAll(".item-table tbody tr");
  rows.forEach(function (row, index) {
    row.hidden = index >= ROWS_AT_FIRST && !isShowingEveryItem;
  });
  button.setAttribute("aria-expanded", String(isShowingEveryItem));
  if (isShowingEveryItem) {
    button.textContent = "Show fewer";
  } else {
    button.textContent = `Show all ${rows.length} items`;
  }
}

function handleItemLogClick(event) {
  const button = event.target.closest("[data-items]");
  if (!button) {
    return;
  }
  const action = button.dataset.items;
  if (action === "more") {
    toggleEveryItem(button);
  } else if (action === "print") {
    printCountSheet();
  } else if (action === "excel") {
    downloadCountSheet();
  }
}

/* Called once. #sheet is refilled on every redraw but never replaced, so
   one listener covers the card however often it is drawn. */
export function wireItemLog() {
  document.getElementById("sheet").addEventListener("click", handleItemLogClick);
}
