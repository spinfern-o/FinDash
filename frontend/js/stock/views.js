/* Focused screens. These functions draw text only; the ledger owns stock math. */
import { escapeHtml } from '../dashboard/format.js';
import { stockBalances } from './ledger.js';
import { store } from './storage.js';
import { drafts } from './files.js';
import { words, currentLanguage } from './language.js';
export const html = escapeHtml;

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
      rows += `<tr data-stock-row><td><strong>${html(item.description)}</strong><br><span class="stock-secondary">${html(item.original)}</span></td><td data-label="${words('unit')}">${html(item.unit)}</td><td data-label="${words('location')}">${html(item.location)}</td><td class="stock-count" data-label="${words('onHand')}">${onHand === null ? words('unknown') : new Intl.NumberFormat(currentLanguage(), { maximumFractionDigits: 8 }).format(onHand)}</td><td><div class="stock-actions">${actions}</div></td></tr>`;
    }
    content = `<label class="stock-field"><span>${words('search')}</span><input id="stock-search" type="search"></label><div class="stock-table-wrap"><table class="stock-table stock-items-table"><thead><tr><th>${words('item')}</th><th>${words('unit')}</th><th>${words('location')}</th><th>${words('onHand')}</th><th>${words('action')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  return content;
}
export function itemsHtml() {
  return `<section class="stock-card"><div class="stock-actions"><button class="btn" id="print-stock">${words('print')}</button></div>${itemRowsHtml()}</section><section class="stock-card"><h2>${words('movements')}</h2>${historyHtml()}</section><p class="stock-hint">${words('stockOnly')}</p>`;
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
