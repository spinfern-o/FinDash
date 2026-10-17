/* The toolbar above the cards: the period, the currency, "Show cents", and
   the print, export and template buttons. */

import { state } from "./state.js";
import { CURRENCIES, currencySymbol, isKnownCurrency } from "./format.js";
import { savePreferences } from "./preferences.js";
import { PERIODS } from "./periods.js";
import { drawDashboard, selectMonth } from "./draw-dashboard.js";
import { drawInvoiceList } from "./invoice-list.js";
import { updateReview } from "./photos/photo-review.js";
import { exportWorkbook } from "./export/excel-export.js";
import { downloadTemplate } from "./export/template.js";

/* Month, Quarter, Year to date: draws the selected month again under the
   new period. */
function wirePeriodButtons() {
  const group = document.getElementById("periods");

  let buttons = "";
  for (const period of PERIODS) {
    buttons += `<button type="button" data-period="${period.key}" aria-pressed="${period.key === state.period}">` +
      `${period.label}</button>`;
  }
  group.innerHTML = buttons;

  group.addEventListener("click", function (event) {
    const button = event.target.closest("[data-period]");
    if (!button) {
      return;
    }
    state.period = button.dataset.period;
    for (const other of group.querySelectorAll("button")) {
      other.setAttribute("aria-pressed", other.dataset.period === state.period);
    }
    if (state.activeMonth) {
      selectMonth(state.data.months.indexOf(state.activeMonth));
    }
  });
}

/* The code and symbol only, e.g. "EUR (€)": the full names made the picker
   wide enough to push the toolbar onto a second line. The name is still
   there as a tooltip. */
function currencyOptionsHtml() {
  let options = "";
  for (const [code, name] of CURRENCIES) {
    const symbol = currencySymbol(code);
    let label = code;
    if (symbol !== code) {
      label = `${code} (${symbol})`;
    }
    options += `<option value="${code}" title="${name}">${label}</option>`;
  }
  return options;
}

function wireCurrencyPicker() {
  if (!isKnownCurrency(state.currency)) {
    state.currency = "USD";
  }
  const picker = document.getElementById("currency");
  picker.innerHTML = currencyOptionsHtml();
  picker.value = state.currency;

  picker.addEventListener("change", function () {
    state.currency = picker.value;
    savePreferences();
    if (state.activeMonth) {
      drawDashboard();
    }
    drawInvoiceList();
    updateReview();
  });
}

function wireCentsCheckbox() {
  const checkbox = document.getElementById("exact");
  checkbox.checked = state.showCents;
  checkbox.addEventListener("change", function () {
    state.showCents = checkbox.checked;
    savePreferences();
    if (state.activeMonth) {
      drawDashboard();
    }
  });
}

function wireFileButtons() {
  document.getElementById("print").addEventListener("click", function () {
    window.print();
  });
  document.getElementById("export").addEventListener("click", exportWorkbook);
  document.getElementById("tpl-xlsx").addEventListener("click", function () {
    downloadTemplate("xlsx");
  });
  document.getElementById("tpl-csv").addEventListener("click", function () {
    downloadTemplate("csv");
  });
}

export function wireToolbar() {
  wirePeriodButtons();
  wireCurrencyPicker();
  wireCentsCheckbox();
  wireFileButtons();
}
