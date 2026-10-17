/* "What you buy": every item on the invoices added from photos, with how
   much came in, what it cost in all, and whether its price moved since the
   delivery before. The count sheet is printed or downloaded from here.

   A price change is shown only when the two prices are for the same amount
   of the same thing (price-comparison.js). When they might not be, the row
   says why and offers "Confirm size": the owner says what one case or bag
   holds, or what the printed price is per, from a chosen delivery on. Those
   messages and the form follow the language chosen for stock.

   It covers every invoice on file, whichever period is on screen, and is
   left out of the printed report (the count sheet has its own print). */

import { state, isShowingOwnerFigures } from "../state.js";
import { escapeHtml, formatMoneyWithCents, formatPercent, formatShortDate } from "../format.js";
import { itemsBought, invoicesWithoutItems, confirmPackage } from "../items.js";
import { printCountSheet, downloadCountSheet } from "../count-sheet.js";
import { CHOOSABLE_UNITS } from "../units.js";
import { keepOwnerFigures } from "../keep-figures.js";
import { showOwnerFigures } from "../figures-on-screen.js";
import { words } from "../../stock/language.js";
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

// Why a price wasn't compared, as the word for it in language.js.
const NOT_COMPARED = {
  package: "priceNeedsPackage",
  units: "priceDifferentUnits",
  basis: "priceNeedsBasis",
  currency: "priceOtherCurrency"
};

/* Text in the language chosen for stock, marked so it changes when the
   language does. */
function wordsHtml(key) {
  return `<span data-text="${key}">${escapeHtml(words(key))}</span>`;
}

/* What the owner confirmed for the item's latest unit, so the basis of a
   comparison is always visible: "Priced per lb", "1 bag = 50 lb", or ""
   when nothing is confirmed. */
function packNote(item) {
  const latest = item.units.find(function (entry) {
    return entry.unit === item.comparedUnits[0];
  });
  if (!latest) {
    return "";
  }
  const notes = [];
  if (latest.billedPer) {
    notes.push(`${wordsHtml("pricedPerNote")} ${escapeHtml(latest.billedPer)}`);
  }
  if (latest.pack) {
    notes.push(`1 ${escapeHtml(latest.unit)} = ${quantityText(latest.pack.quantity)} ${escapeHtml(latest.pack.unit)}`);
  }
  if (!notes.length) {
    return "";
  }
  return `<span class="item-sub">${notes.join(" &middot; ")}</span>`;
}

/* The button that opens the form for a package size: "Confirm size", or
   "Change size" once one is in effect. */
function sizeButtonHtml(item, index, key) {
  return `<button type="button" class="btn small item-size" data-items="size" data-row="${index}">${wordsHtml(key)}</button>`;
}

/* "▲ $0.40/lb (50.0%)" in red when it went up, "▼" in green when it came
   down; when the two prices can't be compared, why, with a way to say what
   a package holds. */
function priceChangeHtml(item, index) {
  const comparison = item.priceComparison;
  if (NOT_COMPARED[comparison.state]) {
    let button = "";
    if (comparison.state !== "currency") {
      button = sizeButtonHtml(item, index, "confirmSize");
    }
    return `<span class="item-unsure">${wordsHtml(NOT_COMPARED[comparison.state])}</span>${button}`;
  }
  const hasPack = Boolean(packNote(item));
  let change = `<span class="item-same">&mdash;</span>`;
  if (item.priceChange !== null) {
    const size = `${formatMoneyWithCents(Math.abs(item.priceChange))}/${escapeHtml(comparison.per)} ` +
      `(${formatPercent(Math.abs(item.priceChangePercent))})`;
    if (item.priceChange > 0) {
      change = `<span class="item-up" title="Up from the delivery before">▲ ${size}</span>`;
    } else {
      change = `<span class="item-down" title="Down from the delivery before">▼ ${size}</span>`;
    }
  }
  if (!hasPack) {
    return change;
  }
  return `${change}${packNote(item)}${sizeButtonHtml(item, index, "changeSize")}`;
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
      <td class="amt">${priceChangeHtml(item, index)}</td>
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

// The items as last drawn, so a row's button finds its item.
let itemsOnScreen = [];

/* The card, or "" when the owner has not added an invoice with items. */
export function itemLogCardHtml() {
  if (!isShowingOwnerFigures()) {
    return "";
  }
  const items = itemsBought(state.ownerInvoices);
  itemsOnScreen = items;
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
    <p class="item-note">Prices are as printed on the invoice. The change is against the delivery before, and is
      shown only when both prices are for the same amount: per pound or kilogram, per item, or per case once you
      confirm what a case holds.${missingItemsNote()}</p>
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

/* <option>s for the units an owner can choose, `chosen` selected. */
function unitOptionsHtml(chosen) {
  return CHOOSABLE_UNITS.map(function (unit) {
    const selected = unit === chosen ? " selected" : "";
    return `<option value="${unit}"${selected}>${unit}</option>`;
  }).join("");
}

/* The delivery to confirm from: the first one when nothing is confirmed
   yet (so the earlier price can be compared too), otherwise the latest. */
function defaultDate(entry) {
  if (entry.pack || entry.billedPer) {
    return entry.dates[entry.dates.length - 1];
  }
  return entry.dates[0];
}

/* The form for one unit of the item: what the price is per, what one
   package holds, and from which delivery. */
function sizeFieldsHtml(entry) {
  const pricedPer = `<option value="">${escapeHtml(words("packAsPrinted"))} (${escapeHtml(entry.unit)})</option>` +
    unitOptionsHtml(entry.billedPer);
  const dates = entry.dates.map(function (date) {
    const selected = date === defaultDate(entry) ? " selected" : "";
    return `<option value="${escapeHtml(date)}"${selected}>${formatShortDate(date)}</option>`;
  }).join("");
  const holds = entry.pack ? entry.pack.quantity : "";
  const holdsUnit = entry.pack ? entry.pack.unit : "lb";
  return `<label class="item-size-field"><span data-text="packPricedPer">${escapeHtml(words("packPricedPer"))}</span>
        <select name="billedPer">${pricedPer}</select></label>
      <label class="item-size-field"><span data-text="packHolds">${escapeHtml(words("packHolds"))}</span>
        <span class="item-size-pair"><input name="packQuantity" type="number" inputmode="decimal" min="0" step="any"
          value="${holds}"><select name="packUnit" aria-label="${escapeHtml(words("packHolds"))}">${unitOptionsHtml(holdsUnit)}</select></span></label>
      <label class="item-size-field"><span data-text="packFrom">${escapeHtml(words("packFrom"))}</span>
        <select name="from">${dates}</select></label>`;
}

/* Opens the size form under a row, for the unit of the latest price. */
function openSizeForm(button) {
  const row = button.closest("tr");
  const item = itemsOnScreen[Number(button.dataset.row)];
  if (!item || row.nextElementSibling?.classList.contains("item-size-row")) {
    return;
  }
  const unitChoices = item.comparedUnits.map(function (unit) {
    return `<option value="${escapeHtml(unit)}">${escapeHtml(unit || "?")}</option>`;
  }).join("");
  const formRow = document.createElement("tr");
  formRow.className = "item-size-row";
  formRow.innerHTML = `<td colspan="5"><form class="item-size-form" data-row="${button.dataset.row}" novalidate>
      <label class="item-size-field"><span data-text="packUnit">${escapeHtml(words("packUnit"))}</span>
        <select name="unit">${unitChoices}</select></label>
      <div class="item-size-fields">${sizeFieldsHtml(unitEntry(item, item.comparedUnits[0]))}</div>
      <p class="message bad" role="alert" hidden></p>
      <div class="item-actions">
        <button type="submit" class="btn primary">${wordsHtml("packSave")}</button>
        <button type="button" class="btn" data-items="size-cancel">${wordsHtml("cancel")}</button>
      </div>
    </form></td>`;
  row.after(formRow);
  formRow.querySelector("select").focus();
}

/* The item's entry for one unit: its delivery dates and what is in effect. */
function unitEntry(item, unit) {
  return item.units.find(function (entry) {
    return entry.unit === unit;
  });
}

/* Saves what the owner confirmed, then redraws with the comparison it
   allows. The form stays, with the problem, when something is missing. */
function saveSize(form) {
  const item = itemsOnScreen[Number(form.dataset.row)];
  const fields = form.elements;
  const quantity = Number(fields.packQuantity.value);
  const hasPack = fields.packQuantity.value.trim() !== "" && Number.isFinite(quantity) && quantity > 0;
  const billedPer = fields.billedPer.value || null;
  const problem = form.querySelector(".message");
  if (!hasPack && !billedPer) {
    problem.textContent = words("packNeeded");
    problem.hidden = false;
    fields.packQuantity.focus();
    return;
  }
  const pack = hasPack ? { quantity: quantity, unit: fields.packUnit.value } : null;
  const result = confirmPackage(state.ownerInvoices, item.key, fields.unit.value, fields.from.value,
    { pack: pack, billedPer: billedPer });
  if (!result.changed) {
    problem.textContent = words("packNothingChanged");
    problem.hidden = false;
    return;
  }
  state.ownerInvoices = result.invoices;
  showOwnerFigures(`${words("packSaved")} ${keepOwnerFigures()}`);
}

function handleItemLogSubmit(event) {
  const form = event.target.closest(".item-size-form");
  if (!form) {
    return;
  }
  event.preventDefault();
  saveSize(form);
}

/* Choosing another unit in the form shows that unit's dates and sizes. */
function handleItemLogChange(event) {
  if (event.target.name !== "unit" || !event.target.closest(".item-size-form")) {
    return;
  }
  const form = event.target.closest(".item-size-form");
  const item = itemsOnScreen[Number(form.dataset.row)];
  form.querySelector(".item-size-fields").innerHTML = sizeFieldsHtml(unitEntry(item, event.target.value));
}

function handleItemLogClick(event) {
  const button = event.target.closest("[data-items]");
  if (!button) {
    return;
  }
  const action = button.dataset.items;
  if (action === "more") {
    toggleEveryItem(button);
  } else if (action === "size") {
    openSizeForm(button);
  } else if (action === "size-cancel") {
    button.closest(".item-size-row").remove();
  } else if (action === "print") {
    printCountSheet();
  } else if (action === "excel") {
    downloadCountSheet();
  }
}

/* Called once. #sheet is refilled on every redraw but never replaced, so
   one listener covers the card however often it is drawn. */
export function wireItemLog() {
  const sheet = document.getElementById("sheet");
  sheet.addEventListener("click", handleItemLogClick);
  sheet.addEventListener("submit", handleItemLogSubmit);
  sheet.addEventListener("change", handleItemLogChange);
}
