/* Optional stock beside the financial invoice review, with the same lines
   as the stock page's review (stock/review-lines.js): which item each line
   is, whether it arrived as billed, and how the shelf changes. Purchase
   quantities stay visible; nothing changes stock unless a line is ticked. */
import { store } from '../../stock/storage.js';
import { words } from '../../stock/language.js';
import { reviewLinesHtml, wireReviewLines, applyReviewedLines } from '../../stock/review-lines.js';

/* Keep less frequent stock fields behind one clearly named disclosure. */
export function stockReviewHtml(document) {
  if (document.kind !== 'purchase') { return ''; }
  const lines = reviewLinesHtml(document, store.inventory, { isTracked: function () { return false; } });
  return `<details class="howto" data-stock-review><summary>${words('reviewStock')}</summary><p>${words('reviewStockHint')}</p>${lines}</details>`;
}

/* Called once the review is on the page. */
export function wireStockReview(panel, document) {
  const container = panel.querySelector('[data-stock-review]');
  if (container) { wireReviewLines(container, document, store.inventory); }
}

/* Whether any line is ticked for stock. */
export function hasStockLines(panel) {
  return Boolean(panel.querySelector('[data-stock-review] [name^="include-"]:checked'));
}

/* The stock ledger with the ticked lines applied, or null when none is
   ticked. `source` is the photo's fingerprint; `invoiceId` names the
   invoice on any delivery check. */
export function reviewedStock(panel, document, source, invoiceId) {
  if (!hasStockLines(panel)) { return null; }
  if (!store.ready || store.busy || store.dirty) { throw new Error(words(store.note || 'loading')); }
  try {
    return applyReviewedLines(panel.querySelector('[data-stock-review]'), document, store.inventory, source, invoiceId).inventory;
  } catch (error) {
    throw new Error(words(['chooseItem'].includes(error.message) ? error.message : 'invalid'));
  }
}
