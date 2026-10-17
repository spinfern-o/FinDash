/* Focused screens. These functions draw text only; the ledger owns stock math,
   buying.js the buying list and receiving.js the delivery checks. */
import { escapeHtml } from '../dashboard/format.js';
import { stockBalances } from './ledger.js';
import { store } from './storage.js';
import { drafts } from './files.js';
import { words, currentLanguage } from './language.js';
import { buyingList } from './buying.js';
import { openChecks } from './receiving.js';
export const html = escapeHtml;

/* A quantity in the reader's own way of writing numbers. */
function quantityText(quantity) {
  return new Intl.NumberFormat(currentLanguage(), { maximumFractionDigits: 8 }).format(quantity);
}

/* A recorded time as a date in the reader's language. */
function dateText(at) {
  return new Date(at).toLocaleDateString(currentLanguage(), { year: 'numeric', month: 'short', day: 'numeric' });
}

/* A consistent labeled input; supplier/model strings always pass through escaping. */
export function field(name, key, value = '', type = 'text', extra = '') {
  return `<label class="stock-field"><span>${words(key)}</span><input name="${name}" type="${type}" value="${html(value)}" required ${extra}></label>`;
}
function fileRows() {
  return drafts.filter(function (draft) { return (draft.owner || null) === (store.user?.email || null); }).map(function (draft) {
    const state = words(draft.status);
    let action = '';
    if (draft.status === 'ready') { action = `<button class="btn" data-review="${draft.id}">${words('check')}</button>`; }
    if (draft.status !== 'reading') { action += `<button class="btn" data-discard="${draft.id}">${words('discard')}</button>`; }
    return `<li class="stock-card"><strong>${html(draft.name)}</strong><p>${state}</p>${draft.error ? `<p>${words(draft.error)}</p>` : ''}<div class="stock-actions">${action}</div></li>`;
  }).join('');
}
export function filesHtml() {
  return `<section class="stock-card"><div class="stock-drop" id="stock-drop" role="group" aria-label="${words('drop')}"><h2>${words('drop')}</h2><p>${words('formats')}</p><button class="btn primary" id="choose-photos">${words('upload')}</button><input id="stock-files" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></div><p class="stock-hint">${words('photoPrivacy')}</p><p>${words('manualHint')}</p></section><section class="stock-card"><p>${words('financeHint')}</p><a href="/dashboard">${words('openFinance')}</a></section><ul style="list-style:none;padding:0">${fileRows()}</ul>`;
}
export function reviewHtml() {
  if (!drafts.length) { return `<section class="stock-card"><p>${words('emptyReview')}</p></section>`; }
  return `<p class="stock-hint">${words('pendingHint')}</p><ul style="list-style:none;padding:0">${fileRows()}</ul>`;
}
export function itemRowsHtml() {
  let content = `<p>${words('emptyItems')}</p>`;
  if (store.inventory.items.length) {
    let rows = '';
    const balances = stockBalances(store.inventory);
    for (const item of store.inventory.items) {
      const onHand = balances.get(item.id);
      let actions = '';
      for (const type of ['count', 'delivery', 'usage', 'waste']) {
        actions += `<button class="btn" data-movement="${type}" data-item="${html(item.id)}">${words(type)}</button>`;
      }
      actions += `<button class="btn" data-settings="${html(item.id)}">${words('itemSettings')}</button>`;
      const minimum = item.reorder?.minimum;
      const low = onHand !== null && minimum !== undefined && onHand < minimum ? `<span class="stock-low">${words('belowMinimum')}</span>` : '';
      rows += `<tr data-stock-row><td><strong>${html(item.description)}</strong><br><span class="stock-secondary">${html(item.original)}</span></td><td data-label="${words('unit')}">${html(item.unit)}</td><td data-label="${words('location')}">${html(item.location)}</td><td class="stock-count" data-label="${words('onHand')}">${onHand === null ? words('unknown') : quantityText(onHand)}${low}</td><td><div class="stock-actions">${actions}</div></td></tr>`;
    }
    content = `<label class="stock-field"><span>${words('search')}</span><input id="stock-search" type="search"></label><div class="stock-table-wrap"><table class="stock-table stock-items-table"><thead><tr><th>${words('item')}</th><th>${words('unit')}</th><th>${words('location')}</th><th>${words('onHand')}</th><th>${words('action')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  return content;
}
/* The tabs within Stock: the stock itself, the buying list, and delivery
   problems still open. */
function stockTabsHtml(current) {
  const open = openChecks(store.inventory).length;
  const tabs = [['items', 'items'], ['buying', 'buyingList'], ['checks', 'deliveryProblems']];
  const links = tabs.map(function ([view, key]) {
    const count = view === 'checks' && open ? ` <span class="stock-badge">${open}</span>` : '';
    const currentMark = view === current ? ' aria-current="page"' : '';
    return `<a href="#${view}"${currentMark}>${words(key)}${count}</a>`;
  }).join('');
  return `<nav class="stock-tabs" aria-label="${words('items')}">${links}</nav>`;
}

export function itemsHtml() {
  return `${stockTabsHtml('items')}<section class="stock-card"><div class="stock-actions"><button class="btn" id="print-stock">${words('print')}</button></div>${itemRowsHtml()}</section><section class="stock-card"><h2>${words('movements')}</h2>${historyHtml()}</section><p class="stock-hint">${words('stockOnly')}</p>`;
}

/* One row of the buying list, with the quantity to buy ready to change:
   the suggestion, or what the owner already changed it to (`edits`, by
   item id). */
function buyingRowHtml(entry, index, edits) {
  const item = entry.item;
  const reorder = item.reorder;
  const target = reorder.target !== undefined ? ` · ${words('target')} ${quantityText(reorder.target)}` : '';
  let shelf = words('unknown');
  if (entry.onHand !== null) {
    shelf = quantityText(entry.onHand);
  }
  let updated = words('neverCounted');
  if (entry.lastUpdated) {
    updated = dateText(entry.lastUpdated);
  }
  const stale = entry.isStale ? `<span class="stock-low">${words('staleCount')}</span>` : '';
  const owed = entry.owed > 0 ? `<br><span class="stock-secondary">${words('stillOwed')}: ${quantityText(entry.owed)} ${html(item.unit)}</span>` : '';
  let buy = `<span class="stock-secondary">${words('countFirst')}</span>`;
  if (entry.suggestion) {
    const packs = entry.suggestion.packs ? `<br><span class="stock-secondary">${quantityText(entry.suggestion.packs)} ${html(entry.suggestion.packUnit)}</span>` : '';
    const quantity = edits.has(item.id) ? edits.get(item.id) : entry.suggestion.quantity;
    buy = `<label><span class="stock-visually-hidden">${words('buyQuantity')}</span><input class="stock-buy" data-buy="${html(item.id)}" type="number" min="0" step="any" value="${html(quantity)}"></label> ${html(item.unit)}${packs}`;
  }
  return `<tr data-buy-row="${index}"><td><strong>${html(item.description)}</strong><br><span class="stock-secondary">${html(item.original)}</span></td><td data-label="${words('location')}">${html(item.location)}</td><td data-label="${words('onHand')}">${shelf} ${html(item.unit)}<br><span class="stock-secondary">${updated}</span>${stale}</td><td data-label="${words('minimum')}">${quantityText(reorder.minimum)}${target}</td><td data-label="${words('buyQuantity')}">${buy}${owed}</td><td data-label="${words('preferredSupplier')}">${html(reorder.supplier || '')}</td></tr>`;
}

/* The buying list: what is below its minimum, and what was never counted.
   `edits` holds quantities the owner changed this visit, by item id. */
export function buyingHtml(edits = new Map()) {
  const list = buyingList(store.inventory);
  let content = `<p>${words('buyingEmpty')}</p>`;
  if (list.length) {
    const rows = list.map(function (entry, index) { return buyingRowHtml(entry, index, edits); }).join('');
    content = `<div class="stock-actions"><button class="btn" id="print-buying">${words('printBuying')}</button><button class="btn" id="download-buying">${words('downloadBuying')}</button></div><div class="stock-table-wrap"><table class="stock-table stock-items-table stock-buying-table"><thead><tr><th>${words('item')}</th><th>${words('location')}</th><th>${words('onHand')}</th><th>${words('minimum')}</th><th>${words('buyQuantity')}</th><th>${words('preferredSupplier')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  return `${stockTabsHtml('buying')}<section class="stock-card"><p class="stock-hint">${words('buyingHint')}</p>${content}</section>`;
}

/* What happened with one delivery line, in a sentence. */
function checkSummary(check) {
  const billed = `${quantityText(check.billed.quantity)} ${html(check.billed.unit)}`;
  if (check.status === 'unchecked') {
    return `${words('billed')}: ${billed} · ${words('arrival-unchecked')}`;
  }
  return `${words('billed')}: ${billed} · ${words('received')}: ${quantityText(check.received.quantity)} ${html(check.received.unit)} · ${words('arrival-' + check.status)}`;
}

/* One delivery check, open (with a button to resolve it) or resolved
   (with what was decided). */
function checkHtml(check) {
  const from = `${html(check.supplier)}${check.number ? ' · ' + html(check.number) : ''} · ${dateText(check.at)}`;
  let value = '';
  if (check.possibleValue !== undefined) {
    value = `<p>${words('possibleValue')}: <strong>${html(check.possibleValue.toFixed(2))} ${html(check.currency || '')}</strong> <span class="stock-secondary">${words('notACredit')}</span></p>`;
  }
  const history = check.history.map(function (entry) {
    return `<li>${dateText(entry.at)}: ${words('state-' + entry.state)}${entry.note ? ' · ' + html(entry.note) : ''}</li>`;
  }).join('');
  let action = `<button class="btn" data-resolve="${html(check.id)}">${words('resolve')}</button>`;
  if (check.state !== 'open') {
    const credit = check.credit ? ` · ${html(check.credit.amount.toFixed(2))} ${html(check.credit.reference || '')}` : '';
    action = `<p><strong>${words('state-' + check.state)}</strong>${credit}</p>`;
  }
  return `<li class="stock-card stock-check" data-check="${html(check.id)}"><strong>${html(check.original)}</strong><p class="stock-secondary">${from}</p><p>${checkSummary(check)}</p>${value}<ul class="stock-check-history">${history}</ul>${action}</li>`;
}

/* Delivery problems: the open ones first, then the last few resolved. */
export function checksHtml() {
  const open = openChecks(store.inventory);
  const resolved = (store.inventory.checks || []).filter(function (check) { return check.state !== 'open'; }).slice(-10).reverse();
  let content = `<p>${words('noProblems')}</p>`;
  if (open.length) {
    content = `<ul class="stock-check-list">${open.map(checkHtml).join('')}</ul>`;
  }
  let done = '';
  if (resolved.length) {
    done = `<h2>${words('resolvedChecks')}</h2><ul class="stock-check-list">${resolved.map(checkHtml).join('')}</ul>`;
  }
  return `${stockTabsHtml('checks')}<p class="stock-hint">${words('checksHint')}</p>${content}${done}`;
}

/* The buying list on paper, with the quantities the owner settled on. */
export function printBuyingHtml(rows) {
  const body = rows.map(function (row) {
    return `<tr><td>${html(row.supplier)}</td><td>${html(row.description)}<br>${html(row.original)}</td><td>${html(row.location)}</td><td>${html(row.quantity)} ${html(row.unit)}</td></tr>`;
  }).join('');
  return `<h2>${words('buyingList')}</h2><table class="stock-table"><thead><tr><th>${words('preferredSupplier')}</th><th>${words('item')}</th><th>${words('location')}</th><th>${words('buyQuantity')}</th></tr></thead><tbody>${body}</tbody></table>`;
}
function historyHtml() {
  const recent = store.inventory.movements.slice(-12).reverse();
  if (!recent.length) { return `<p>${words('noRecords')}</p>`; }
  let rows = '';
  for (const movement of recent) {
    const item = store.inventory.items.find(function (item) { return item.id === movement.itemId; });
    rows += `<tr><td>${html(new Date(movement.at).toLocaleString(currentLanguage()))}</td><td>${html(item.description)}<br>${html(item.location)}</td><td>${words(movement.type)}</td><td>${movement.quantity} ${html(item.unit)}</td></tr>`;
  }
  return `<div class="stock-table-wrap"><table class="stock-table stock-history-table"><thead><tr><th>${words('date')}</th><th>${words('item')}</th><th>${words('action')}</th><th>${words('amount')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
export function settingsHtml() {
  return `<section class="stock-card"><h2>${words('backup')}</h2><p>${words('backupHint')}</p><div class="stock-actions"><button class="btn" id="backup-stock">${words('backup')}</button><button class="btn" id="restore-stock">${words('restore')}</button><input id="restore-file" type="file" accept="application/json,.json" hidden></div><p class="stock-hint">${words('restoreHint')}</p><button class="btn stock-danger" id="clear-stock">${words(store.user ? 'clearAccount' : 'clear')}</button></section><p>${words('stockOnly')}</p>`;
}
export function printHtml() {
  let rows = '';
  for (const item of store.inventory.items) {
    rows += `<tr><td>${html(item.description)}<br>${html(item.original)}</td><td>${html(item.unit)}</td><td>${html(item.location)}</td><td style="min-width:120px">________________</td></tr>`;
  }
  return `<h2>${words('stockCounts')}</h2><p>${words('fillCount')}</p><table class="stock-table"><thead><tr><th>${words('item')}</th><th>${words('unit')}</th><th>${words('location')}</th><th>${words('onHand')}</th></tr></thead><tbody>${rows}</tbody></table>`;
}
