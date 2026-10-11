/* Switching the whole page between the owner's figures and the demo. */

import { state, DEMO_NOTE } from "./state.js";
import { SAMPLE_DATA } from "./sample-data.js";
import { showFigures } from "./draw-dashboard.js";
import { ownerMonthsOnScreen, describeOwnerSource } from "./owner-figures.js";
import { drawInvoiceList } from "./invoice-list.js";
import { showStatus, endBusy } from "./status-line.js";

/* Shows the owner's months and invoices, with `detail` as the status line. */
export function showOwnerFigures(detail) {
  state.sourceNote = "Worked out in your browser from " + describeOwnerSource() + ".";
  showFigures({ generated: null, months: ownerMonthsOnScreen() });
  document.getElementById("loader").classList.add("compact");
  document.getElementById("forget").hidden = false;
  drawInvoiceList();
  showStatus("Your figures", detail, false);
}

/* Drops the owner's figures from the screen (not from storage) and shows
   the demo again. */
export function showDemoFigures() {
  state.ownerMonths = null;
  state.ownerInvoices = [];
  state.ownerSourceName = null;
  state.heldFiles.dashboard = null;
  state.heldFiles.expenses = null;
  state.heldFiles.combined = null;

  if (state.publishedData) {
    state.sourceNote = DEMO_NOTE;
  } else {
    state.sourceNote = "";
  }
  showFigures(state.publishedData || SAMPLE_DATA);
  document.getElementById("loader").classList.remove("compact");
  document.getElementById("forget").hidden = true;
  drawInvoiceList();
  endBusy();
}
