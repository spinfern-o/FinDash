/* The panel that shows what was read from a photo, for the owner to check
   before anything is added: every line with the cost line it goes to, the
   month it goes into, and whether the lines add up to the printed total.
   Nothing is added until the owner presses Add. */

import { state, isShowingOwnerFigures } from "../state.js";
import { escapeHtml, formatMoneyWithCents, formatLongDate } from "../format.js";
import { calendarMonthLabel } from "../months.js";
import { COST_GROUPS, COST_GROUP_ROWS, LINE_LABELS } from "../cost-groups.js";
import { roundToCents } from "../numbers.js";
import { keepOwnerFigures } from "../keep-figures.js";
import { combineMonthsAndInvoices } from "../owner-figures.js";
import { showOwnerFigures } from "../figures-on-screen.js";
import { selectMonth } from "../draw-dashboard.js";
import { showStatus } from "../status-line.js";
import { adoptCurrency } from "../import/currency-from-file.js";
import { stockReviewHtml, reviewedStock } from './stock-review.js';
import { store, saveStock } from '../../stock/storage.js';
import { fingerprint } from '../../stock/files.js';
import { invoiceId } from '../../stock/invoice.js';
import { words } from '../../stock/language.js';
import { saveOwnerFigures } from '../saved-figures.js';
import { renderDashboardStock } from '../stock.js';
import { refreshAccountFigures, acceptConfirmedFigures } from '../account-figures.js';

function reviewPanel() {
  return document.getElementById("review");
}

/* Every cost line, grouped as the report groups them, for the line picker. */
function costLineOptionsHtml(selectedLine) {
  let html = "";
  for (const group of COST_GROUP_ROWS) {
    let options = "";
    for (const lineKey of COST_GROUPS[group.group]) {
      let selected = "";
      if (lineKey === selectedLine) {
        selected = " selected";
      }
      options += `<option value="${lineKey}"${selected}>${LINE_LABELS[lineKey]}</option>`;
    }
    html += `<optgroup label="${group.label}">${options}</optgroup>`;
  }
  return html;
}

/* "2026-9": how a month is written in the month picker's values. */
function monthKey(year, monthNumber) {
  return `${year}-${monthNumber}`;
}

function yearOfIsoDate(isoDate) {
  return Number(isoDate.slice(0, 4));
}

function monthOfIsoDate(isoDate) {
  return Number(isoDate.slice(5, 7));
}

/* The months the reading could go into: the document's own, every month
   already on file, and this month. Newest first. */
function monthChoices(doc) {
  const choices = new Map();
  function addChoice(year, monthNumber) {
    const sortKey = year * 100 + monthNumber;
    if (!choices.has(sortKey)) {
      choices.set(sortKey, { year: year, monthNum: monthNumber });
    }
  }

  if (doc.date) {
    addChoice(yearOfIsoDate(doc.date), monthOfIsoDate(doc.date));
  }
  if (isShowingOwnerFigures()) {
    for (const month of state.data.months) {
      addChoice(month.year, month.monthNum);
    }
  }
  const now = new Date();
  addChoice(now.getUTCFullYear(), now.getUTCMonth() + 1);

  return [...choices.values()].sort(function (a, b) {
    return (b.year * 100 + b.monthNum) - (a.year * 100 + a.monthNum);
  });
}

function notesHtml(notes) {
  if (!notes.length) {
    return "";
  }
  let items = "";
  for (const note of notes) {
    items += `<li>${escapeHtml(note)}</li>`;
  }
  return `<ul class="review-notes">${items}</ul>`;
}

/* The total that will be added: for a receipt the printed total when it
   could be read; for an invoice always the sum of its lines, because the
   lines are what get added. */
function amountToAdd(doc, checks) {
  if (doc.kind === "sale" && checks.total !== null) {
    return checks.total;
  }
  return checks.lineSum;
}

/* For a photo that is not an invoice or receipt, or could not be read. */
function showNotADocument(file, preview, doc) {
  let heading = "This photo couldn't be read";
  if (doc.legible) {
    heading = "This doesn't look like an invoice or receipt";
  }
  const panel = reviewPanel();
  panel.innerHTML = `<div class="review-top">
        <img class="review-thumb" src="${preview}" alt="">
        <div><p class="review-kicker">Read from ${escapeHtml(file.name)}</p>
          <h3>${heading}</h3>
          <p class="review-meta">FinDash can add supplier invoices, bills and receipts. For monthly totals, use the template.</p>
          ${notesHtml(doc.notes)}
        </div></div>
      <div class="review-actions"><button type="button" class="btn" id="review-cancel">OK</button></div>`;
  panel.hidden = false;
  panel.scrollIntoView({ block: "nearest" });
}

/* "Invoice 1234 · 3 October 2026 · billed to Bistro". */
function documentDetailsHtml(doc) {
  const details = [];
  if (doc.document_number) {
    if (doc.kind === "sale") {
      details.push("Receipt " + escapeHtml(doc.document_number));
    } else {
      details.push("Invoice " + escapeHtml(doc.document_number));
    }
  }
  if (doc.date) {
    details.push(formatLongDate(doc.date));
  } else {
    details.push("No date found: choose the month below");
  }
  if (doc.customer) {
    details.push("billed to " + escapeHtml(doc.customer));
  }
  return details.join(" &middot; ");
}

/* Whether the lines add up to the printed total. */
function arithmeticVerdictHtml(doc, checks) {
  if (checks.ok && checks.totalReadable) {
    let total = checks.lineSum;
    if (checks.total !== null) {
      total = checks.total;
    }
    return `<p class="review-check ok">✓ The ${doc.lines.length} lines add up to the printed total of ${formatMoneyWithCents(total)}.</p>`;
  }
  if (!checks.totalReadable) {
    return `<p class="review-check warn">The total couldn't be read, so the lines could not be checked against it.
               They add up to ${formatMoneyWithCents(checks.lineSum)}. Check them against your paper copy.</p>`;
  }
  return `<p class="review-check bad">⚠ The lines add up to ${formatMoneyWithCents(checks.lineSum)}, but the printed total is
               ${formatMoneyWithCents(checks.total)}. Check the lines marked below against your paper copy before adding.</p>`;
}

/* What the line said on the paper, if the reading changed it: the original
   wording, the item code, the quantity, and quantity × price. */
function lineDetailHtml(line) {
  const details = [];
  if (line.original) {
    details.push(escapeHtml(line.original));
  }
  if (line.code) {
    details.push(escapeHtml(line.code));
  }
  if (line.quantity !== null) {
    let quantity = `${line.quantity}`;
    if (line.unit) {
      quantity += " " + line.unit;
    }
    details.push(escapeHtml(quantity));
  }
  if (line.billed_quantity !== null && line.unit_price !== null) {
    details.push(escapeHtml(`${line.billed_quantity} × ${line.unit_price}`));
  }

  const shown = details.filter(function (detail) {
    return detail !== "";
  });
  if (!shown.length) {
    return "";
  }
  return `<span class="review-orig">${shown.join(" &middot; ")}</span>`;
}

function lineRowHtml(line, index, isSale, expectedAmounts) {
  let flags = "";
  if (expectedAmounts.has(index)) {
    flags += `<span class="review-flag">Quantity × price gives ${formatMoneyWithCents(expectedAmounts.get(index))}</span>`;
  }
  if (line.amount_source === "computed") {
    flags += `<span class="review-flag soft">Worked out from quantity × price: the printed amount wasn't readable</span>`;
  }

  let goesTo = "Revenue";
  if (!isSale) {
    goesTo = `<select class="select small" data-line="${index}" aria-label="Cost line for ${escapeHtml(line.description)}">` +
      `${costLineOptionsHtml(line.category)}</select>`;
  }

  let rowClass = "";
  if (expectedAmounts.has(index)) {
    rowClass = "flag";
  }

  return `<tr class="${rowClass}">
      <th scope="row">${escapeHtml(line.description)}${lineDetailHtml(line)}${flags}</th>
      <td>${goesTo}</td>
      <td class="amt">${formatMoneyWithCents(line.amount)}</td>
    </tr>`;
}

/* The document's own month is chosen at first; the newest month when the
   document had no date. */
function monthPickerOptionsHtml(doc) {
  const choices = monthChoices(doc);
  let chosen;
  if (doc.date) {
    chosen = monthKey(yearOfIsoDate(doc.date), monthOfIsoDate(doc.date));
  } else {
    chosen = monthKey(choices[0].year, choices[0].monthNum);
  }

  let options = "";
  for (const choice of choices) {
    const value = monthKey(choice.year, choice.monthNum);
    let selected = "";
    if (value === chosen) {
      selected = " selected";
    }
    options += `<option value="${value}"${selected}>${calendarMonthLabel(choice.year, choice.monthNum)}</option>`;
  }
  return options;
}

function photosWaitingHtml() {
  const waiting = state.photoQueue.length;
  if (waiting === 0) {
    return "";
  }
  if (waiting === 1) {
    return " 1 more photo waiting.";
  }
  return ` ${waiting} more photos waiting.`;
}

/* Shows the reading of `file`. `result` is { document, checks } from
   /api/read-document. */
export function showReview(file, preview, result, owner = state.account?.email) {
  const doc = result.document;
  const checks = result.checks;
  state.photoReview = { doc: doc, checks: checks, file: file, owner: owner };

  if (!doc.legible || doc.kind === "other" || !doc.lines.length) {
    showNotADocument(file, preview, doc);
    return;
  }

  const isSale = doc.kind === "sale";
  const expectedAmounts = new Map();
  for (const issue of checks.lineIssues) {
    expectedAmounts.set(issue.index, issue.expected);
  }

  let rows = "";
  doc.lines.forEach(function (line, index) {
    rows += lineRowHtml(line, index, isSale, expectedAmounts);
  });

  let lineColumnHeading = "Cost line";
  let onlyAdd = "invoices";
  if (isSale) {
    lineColumnHeading = "Adds to";
    onlyAdd = "receipts";
  }

  const panel = reviewPanel();
  panel.innerHTML = `<div class="review-top">
      <img class="review-thumb" src="${preview}" alt="">
      <div>
        <p class="review-kicker">Read from your photo. Check it before adding.</p>
        <h3>${escapeHtml(doc.supplier || file.name)}</h3>
        <p class="review-meta">${documentDetailsHtml(doc)}</p>
        ${arithmeticVerdictHtml(doc, checks)}
      </div>
    </div>
    <div class="table-wrap"><table class="review-lines">
      <thead><tr><th scope="col">Line</th><th scope="col">${lineColumnHeading}</th><th scope="col">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th scope="row">Lines total</th><td></td><td class="amt">${formatMoneyWithCents(checks.lineSum)}</td></tr></tfoot>
    </table></div>
    <p class="review-sum" id="review-sum"></p>
    ${notesHtml(doc.notes)}
    ${stockReviewHtml(doc)}
    <div class="review-actions">
      <label class="check">Add to <select class="select" id="review-month">${monthPickerOptionsHtml(doc)}</select></label>
      <span class="review-dup" id="review-dup"></span>
      <button type="button" class="btn" id="review-cancel">Don't add</button>
      <button type="button" class="btn primary" id="review-add"></button>
    </div>
    <p class="review-foot">Only add ${onlyAdd} that your monthly file doesn't already count.
      The photo itself isn't kept.${photosWaitingHtml()}</p>`;
  panel.hidden = false;
  updateReview();
  panel.scrollIntoView({ block: "nearest" });
}

/* The month picked in the panel, as { year, monthNum }. */
function pickedMonth(panel) {
  const parts = panel.querySelector("#review-month").value.split("-").map(Number);
  return { year: parts[0], monthNum: parts[1] };
}

/* The cost line picked for line `index`, or null for a receipt. */
function pickedCostLine(panel, index) {
  const picker = panel.querySelector(`select[data-line="${index}"]`);
  if (picker) {
    return picker.value;
  }
  return null;
}

/* The same document added twice would count its money twice. */
function earlierCopyOf(doc, amount) {
  return state.ownerInvoices.find(function (invoice) {
    const sameNumber = doc.document_number && invoice.number === doc.document_number &&
      invoice.supplier === (doc.supplier || "");
    const sameDateAndTotal = invoice.date && invoice.date === doc.date &&
      Math.abs(invoice.total - amount) < 0.005;
    return sameNumber || sameDateAndTotal;
  });
}

/* "Adds Cost of goods sold $1,234.00, Packaging $56.00 to October 2026." */
function additionSummaryHtml(panel, doc, amount, monthName) {
  if (doc.kind === "sale") {
    return `Adds <b>${formatMoneyWithCents(amount)}</b> to revenue for ${monthName}.`;
  }

  const totalsByLine = {};
  for (const select of panel.querySelectorAll("select[data-line]")) {
    const line = doc.lines[Number(select.dataset.line)];
    totalsByLine[select.value] = roundToCents((totalsByLine[select.value] || 0) + line.amount);
  }

  const parts = [];
  for (const [lineKey, lineTotal] of Object.entries(totalsByLine)) {
    if (lineTotal) {
      parts.push(`<b>${LINE_LABELS[lineKey]}</b> ${formatMoneyWithCents(lineTotal)}`);
    }
  }
  return "Adds " + parts.join(", ") + ` to ${monthName}.`;
}

/* The summary, the duplicate warning and the button's label all follow the
   owner's choices, so they are worked out again whenever a choice changes. */
export function updateReview() {
  if (!state.photoReview) {
    return;
  }
  const doc = state.photoReview.doc;
  const checks = state.photoReview.checks;
  const panel = reviewPanel();
  // A photo that was not a document has no choices to follow.
  if (!panel.querySelector("#review-month")) {
    return;
  }

  const month = pickedMonth(panel);
  const monthName = calendarMonthLabel(month.year, month.monthNum);
  const amount = amountToAdd(doc, checks);

  panel.querySelector("#review-sum").innerHTML = additionSummaryHtml(panel, doc, amount, monthName);

  const earlierCopy = earlierCopyOf(doc, amount);
  let duplicateWarning = "";
  let buttonLabel = `Add ${formatMoneyWithCents(amount)} to ${monthName}`;
  if (earlierCopy) {
    let datedText = "";
    if (earlierCopy.date) {
      datedText = " dated " + formatLongDate(earlierCopy.date);
    }
    duplicateWarning = `Already added: ${earlierCopy.supplier || "an invoice"} for ` +
      `${formatMoneyWithCents(earlierCopy.total)}${datedText}. Adding it again counts it twice.`;
    buttonLabel = `Add again: ${formatMoneyWithCents(amount)} to ${monthName}`;
  }
  panel.querySelector("#review-dup").textContent = duplicateWarning;
  panel.querySelector("#review-add").textContent = buttonLabel;
}

/* Closes the panel without a word. */
export function closeReviewQuietly() {
  state.photoReview = null;
  const panel = reviewPanel();
  panel.hidden = true;
  panel.innerHTML = "";
}

/* "Don't add": closes the panel and says nothing was added. */
export function closeReview() {
  if (state.photoReview) {
    let heading = "Demo data";
    if (isShowingOwnerFigures()) {
      heading = "Your figures";
    }
    showStatus(heading, "Nothing was added from " + state.photoReview.file.name + ".", false);
  }
  closeReviewQuietly();
}

function newInvoiceId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* "Add": the reading becomes an invoice in the owner's figures, and the page
   moves to the month it went into. */
export async function addReviewedInvoice() {
  const doc = state.photoReview.doc;
  const checks = state.photoReview.checks;
  const file = state.photoReview.file;
  const panel = reviewPanel();
  const month = pickedMonth(panel);
  const isSale = doc.kind === "sale";

  // Each line keeps what it says about the item bought (its code, the name
  // as printed, how many and at what price) for the list of what the owner
  // buys and the count sheet (see items.js).
  let lines = [];
  if (!isSale) {
    lines = doc.lines.map(function (line, index) {
      return {
        description: line.description,
        original: line.original,
        code: line.code,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unit_price,
        amount: line.amount,
        category: pickedCostLine(panel, index) || "cogs"
      };
    });
  }

  let kind = "purchase";
  if (isSale) {
    kind = "sale";
  }

  let invoice = {
    id: newInvoiceId(),
    kind: kind,
    supplier: doc.supplier || file.name,
    number: doc.document_number || "",
    date: doc.date,
    year: month.year,
    monthNum: month.monthNum,
    total: amountToAdd(doc, checks),
    lines: lines,
    addedAt: new Date().toISOString()
  };

  let savedTogether = false;
  let adoptedFigures = false;
  const button = panel.querySelector('#review-add');
  button.disabled = true;
  try {
    if (panel.querySelector('[data-stock-line]:checked')) {
      if (!state.account || state.account.hasUnsavedChanges || state.account.isWaitingForChoice ||
          state.account.email !== store.user?.email || state.photoReview.owner !== state.account.email) {
        throw new Error('Finish saving or choosing your financial figures before confirming stock.');
      }
      const source = await fingerprint(file);
      invoice.id = invoiceId(source);
      state.photoReview.stockInvoiceId = invoice.id;
      let inventory;
      if (store.pendingInvoice?.id === invoice.id) {
        invoice = store.pendingInvoice;
        inventory = store.inventory;
      } else { inventory = reviewedStock(panel, doc, source); }
      savedTogether = await saveStock(inventory, invoice);
      renderDashboardStock();
      if (!savedTogether) { throw new Error(words(store.note)); }
      adoptedFigures = acceptConfirmedFigures(store.confirmedFigures, store.figuresUpdatedAt, store.user.email);
    }
  } catch (error) {
    showStatus('Invoice and stock not saved', error.message, true);
    button.disabled = false;
    if (store.pendingInvoice?.id === invoice.id) {
      for (const input of panel.querySelectorAll('input, select, #review-cancel')) { input.disabled = true; }
      button.textContent = words('sync');
    }
    return false;
  }

  // On the demo there are no owner months yet: an invoice starts the owner's
  // own figures rather than landing on top of the sample months. The first
  // invoice also sets the currency, if it names one.
  if (!adoptedFigures) { state.ownerInvoices.push(invoice); }
  let currencyNote = "";
  if (!state.ownerMonths && state.ownerInvoices.length === 1) {
    currencyNote = adoptCurrency(doc.currency);
  }
  let savedSentence;
  if (savedTogether) {
    saveOwnerFigures(adoptedFigures);
    savedSentence = 'Invoice costs and shelf counts saved to your account.';
  } else { savedSentence = keepOwnerFigures(); }
  closeReviewQuietly();

  const monthName = calendarMonthLabel(month.year, month.monthNum);
  const monthAfter = combineMonthsAndInvoices(state.ownerMonths || [], state.ownerInvoices).find(function (candidate) {
    return candidate.year === month.year && candidate.monthNum === month.monthNum;
  });
  let noRevenueNote = "";
  if (!isSale && monthAfter && !monthAfter.revenue) {
    noRevenueNote = ` ${monthName} has no revenue on file yet: add your sales with the template to see your profit.`;
  }

  showOwnerFigures(`Added ${invoice.supplier}, ${formatMoneyWithCents(invoice.total)}, to ${monthName}. ` +
    `${savedSentence}${noRevenueNote}${currencyNote}`);

  if (savedTogether) { await refreshAccountFigures(); }

  // Land on the month the invoice went into.
  const index = state.data.months.findIndex(function (candidate) {
    return candidate.year === month.year && candidate.monthNum === month.monthNum;
  });
  if (index >= 0) {
    selectMonth(index);
  }
  return true;
}
