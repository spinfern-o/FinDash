/* Optional physical counts beside the financial invoice review. Purchase
   quantities stay visible; only an explicit shelf count updates stock. */
import { store } from '../../stock/storage.js';
import { addItem, recordMovement } from '../../stock/ledger.js';
import { words } from '../../stock/language.js';
import { escapeHtml } from '../format.js';

/* Keep less frequent stock fields behind one clearly named disclosure. */
export function stockReviewHtml(document) {
  if (document.kind !== 'purchase') { return ''; }
  let rows = '';
  document.lines.forEach(function (line, index) {
    rows += `<fieldset class="stock-review-line"><legend>${escapeHtml(line.description)}</legend><p>${escapeHtml(line.original || line.description)}</p><label><input type="checkbox" data-stock-line="${index}"> ${words('include')}</label><div data-stock-fields="${index}" hidden><div class="stock-grid"><label class="stock-field">${words('unit')}<input data-stock-unit="${index}" value="${escapeHtml(line.unit || '')}" maxlength="40"></label><label class="stock-field">${words('location')}<input data-stock-location="${index}" maxlength="120"></label><label class="stock-field">${words('onHand')}<input type="number" min="0" max="1000000000" step="any" data-stock-count="${index}"></label></div></div></fieldset>`;
  });
  return `<details class="howto"><summary>${words('reviewStock')}</summary><p>${words('reviewStockHint')}</p>${rows}</details>`;
}

/* Update the chosen items only, retaining their unit and storage location. */
export function reviewedStock(panel, document, source) {
  const included = [...panel.querySelectorAll('[data-stock-line]:checked')];
  if (!included.length) { return null; }
  if (!store.ready || store.busy || store.dirty) { throw new Error(words(store.note || 'loading')); }
  let next = store.inventory;
  for (const checkbox of included) {
    const index = checkbox.dataset.stockLine;
    const line = document.lines[Number(index)];
    const unit = panel.querySelector(`[data-stock-unit="${index}"]`).value.trim();
    const location = panel.querySelector(`[data-stock-location="${index}"]`).value.trim();
    const counted = panel.querySelector(`[data-stock-count="${index}"]`).value.trim();
    if (!counted) { throw new Error(words('invalid')); }
    const item = { id: crypto.randomUUID(), original: line.original || line.description, description: line.description, unit: unit, location: location };
    const existing = next.items.find(function (entry) { return entry.original === item.original && entry.unit === unit && entry.location === location; });
    if (!existing) { next = addItem(next, item); }
    next = recordMovement(next, { id: crypto.randomUUID(), itemId: existing?.id || item.id, type: 'count', quantity: Number(counted), note: 'source:' + source });
  }
  return next;
}
