/* The P&L dashboard edits the same stock ledger as /stock. It does not keep
   a second list or turn shelf quantities into financial costs. */
import { store, loadStock, saveStock } from '../stock/storage.js';
import { words, loadLanguage, setLanguage } from '../stock/language.js';
import { itemRowsHtml } from '../stock/views.js';
import { wireForms, showAddItem, showMovement, canChange } from '../stock/forms.js';
import { watchStockChanges } from '../stock/changes.js';
import { refreshAccountFigures } from './account-figures.js';
import { state } from './state.js';

/* Keep failures visible beside the controls that caused them. */
function message(key) {
  const element = document.getElementById('stock-message');
  element.textContent = words(key);
  element.hidden = false;
}

/* Stock rows redraw independently of the monthly financial cards. */
export function renderDashboardStock() {
  document.getElementById('add-item').disabled = !canChange();
  document.getElementById('stock-storage').textContent = words(store.note || 'loading');
  const panel = document.getElementById('dashboard-stock-items');
  panel.innerHTML = itemRowsHtml();
  if (store.dirty && !state.photoReview?.stockInvoiceId) {
    const retry = document.createElement('button');
    retry.id = 'retry-stock';
    retry.className = 'btn';
    retry.textContent = words('sync');
    panel.prepend(retry);
  }
}

/* Do not replace a count being entered or figures waiting for a sync choice. */
async function refresh() {
  if (store.busy || store.dirty || document.getElementById('stock-dialog').open) { return; }
  await loadStock();
  renderDashboardStock();
  await refreshAccountFigures();
}

/* Both pages use the same forms, owner binding and revision checks. */
export async function startDashboardStock() {
  setLanguage(loadLanguage());
  wireForms(renderDashboardStock, message);
  document.getElementById('add-item').addEventListener('click', showAddItem);
  document.getElementById('stock-language').addEventListener('change', function (event) {
    setLanguage(event.target.value);
    renderDashboardStock();
  });
  const panel = document.getElementById('dashboard-stock-items');
  panel.addEventListener('click', async function (event) {
    const button = event.target.closest('button');
    if (!button) { return; }
    if (button.dataset.movement) { showMovement(button.dataset.item, button.dataset.movement); }
    if (button.id === 'retry-stock') {
      await saveStock(store.inventory);
      renderDashboardStock();
      await refreshAccountFigures();
    }
  });
  panel.addEventListener('input', function (event) {
    if (event.target.id !== 'stock-search') { return; }
    const query = event.target.value.toLocaleLowerCase();
    for (const row of panel.querySelectorAll('[data-stock-row]')) { row.hidden = !row.textContent.toLocaleLowerCase().includes(query); }
  });
  watchStockChanges(refresh);
  window.addEventListener('findash-stock-saved', function () { refreshAccountFigures(); });
  window.addEventListener('beforeunload', function (event) {
    if (store.dirty) { event.preventDefault(); event.returnValue = words('pendingLeave'); }
  });
  await loadStock();
  renderDashboardStock();
}
