/* The list of invoices and receipts added from photos, under the import box.
   Each one can be removed again (see import-box.js). */

import { state } from "./state.js";
import { escapeHtml, formatMoneyWithCents } from "./format.js";
import { calendarMonthLabel } from "./months.js";

function invoiceItemHtml(invoice) {
  let number = "";
  if (invoice.number) {
    number = " #" + escapeHtml(invoice.number);
  }
  let addsTo = "costs";
  if (invoice.kind === "sale") {
    addsTo = "revenue";
  }

  return `<li>
      <span><b>${escapeHtml(invoice.supplier || "Invoice")}</b>${number}
        &middot; ${formatMoneyWithCents(invoice.total)} ${addsTo}
        &middot; ${calendarMonthLabel(invoice.year, invoice.monthNum)}</span>
      <button type="button" class="btn small" data-remove="${escapeHtml(invoice.id)}">Remove</button></li>`;
}

export function drawInvoiceList() {
  const list = document.getElementById("inv-list");
  const invoiceCount = state.ownerInvoices.length;
  list.hidden = !invoiceCount;
  if (!invoiceCount) {
    list.innerHTML = "";
    return;
  }

  let summary;
  if (invoiceCount > 1) {
    summary = `${invoiceCount} invoices and receipts added from photos`;
  } else {
    summary = `${invoiceCount} invoice and receipt added from photos`;
  }

  let items = "";
  for (const invoice of state.ownerInvoices) {
    items += invoiceItemHtml(invoice);
  }

  // Redrawing would close the list; keep it as the owner left it.
  const wasOpen = list.open;
  list.innerHTML = `<summary>${summary}</summary>
    <ul>${items}</ul>`;
  list.open = wasOpen;
}
