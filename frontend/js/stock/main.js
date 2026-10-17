/* Daily work starts here: add records, review, count shelves, then record
   deliveries/usage/waste. Finance remains a separate destination. */
import { emptyInventory } from './ledger.js';
import { words, loadLanguage, setLanguage, currentLanguage } from './language.js';
import { store, loadStock, saveStock, downloadBackup, parseInventory, clearGuestStock } from './storage.js';
import { drafts, addFiles, onFilesChanged, discardDraft, rereadReadyDrafts } from './files.js';
import { filesHtml, reviewHtml, itemsHtml, buyingHtml, checksHtml, settingsHtml, printHtml, printBuyingHtml } from './views.js';
import { wireForms, showAddItem, showMovement, showInvoiceReview, showItemSettings, showResolveCheck, canChange } from './forms.js';
import { buyingList, buyingListCsv } from './buying.js';
import { watchStockChanges } from './changes.js';
import { invoiceId } from './invoice.js';
const panel = document.getElementById('stock-panel');

/* User-facing errors use localized messages, not raw provider diagnostics. */
function message(key) {
  const element = document.getElementById('stock-message');
  element.textContent = words(key);
  element.hidden = false;
}
// The buying list and delivery problems are tabs within Stock.
const STOCK_TABS = ['buying','checks'];
// Quantities the owner changed on the buying list, by item id, kept for
// this visit so printing or switching tabs doesn't undo them.
const buyingEdits = new Map();
function view() {
  const requested = window.location.hash.slice(1);
  return ['files','review','items','settings', ...STOCK_TABS].includes(requested) ? requested : 'files';
}
function render() {
  const current = view();
  document.getElementById('view-title').textContent = words(current + 'Title');
  const section = STOCK_TABS.includes(current) ? 'items' : current;
  for (const link of document.querySelectorAll('[data-view]')) {
    if (link.dataset.view === section) { link.setAttribute('aria-current','page'); } else { link.removeAttribute('aria-current'); }
  }
  document.getElementById('review-count').textContent = drafts.filter(function (draft) { return draft.status === 'ready' || draft.status === 'reading'; }).length;
  document.getElementById('add-item').disabled = !canChange();
  document.getElementById('stock-storage').textContent = words(store.note || 'loading');
  if (current === 'items') { panel.innerHTML = itemsHtml(); }
  else if (current === 'buying') { panel.innerHTML = buyingHtml(buyingEdits); }
  else if (current === 'checks') { panel.innerHTML = checksHtml(); }
  else if (current === 'review') { panel.innerHTML = reviewHtml(); }
  else if (current === 'settings') { panel.innerHTML = settingsHtml(); }
  else { panel.innerHTML = filesHtml(); }
  if (store.dirty) {
    const button = document.createElement('button');
    button.className = 'btn';
    button.id = 'retry-stock';
    button.textContent = words('sync');
    panel.prepend(button);
  }
  const drop = document.getElementById('stock-drop');
  if (drop) { wireDrop(drop); }
}
function discardSavedDrafts() {
  if (store.dirty) { return; }
  for (const draft of [...drafts]) {
    if (draft.hash && (store.confirmedInvoices.includes(invoiceId(draft.hash)) || store.inventory.movements.some(function (movement) { return movement.note === 'source:' + draft.hash; }))) { discardDraft(draft.id); }
  }
}
function saved() {
  discardSavedDrafts();
  window.location.hash = 'items';
  render();
}
async function handleFiles(files) {
  if (!canChange()) { message(store.note); return; }
  try { await addFiles(files); } catch { message('failed'); }
}
/* Desktop drops and phone/desktop file pickers feed the same queue. */
function wireDrop(drop) {
  drop.addEventListener('dragover',function (event) { event.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave',function () { drop.classList.remove('over'); });
  drop.addEventListener('drop',function (event) {
    event.preventDefault();
    drop.classList.remove('over');
    handleFiles([...event.dataTransfer.files]);
  });
}
function printCountSheet() {
  printPage(printHtml());
}
/* Shows `content` alone while printing, then the page as it was. */
function printPage(content) {
  panel.innerHTML = content;
  function restore() { render(); }
  window.addEventListener('afterprint', restore, { once:true });
  window.print();
}
/* The buying list as the owner left it: the suggested quantities, or what
   they changed them to. Rows set to nothing, and items never counted, are
   left out. */
function settledBuyingRows() {
  const list = buyingList(store.inventory);
  const rows = [];
  for (const input of panel.querySelectorAll('[data-buy]')) {
    const entry = list.find(function (candidate) { return candidate.item.id === input.dataset.buy; });
    const quantity = Number(input.value);
    if (!entry || !Number.isFinite(quantity) || quantity <= 0) { continue; }
    const item = entry.item;
    rows.push({ supplier: item.reorder.supplier || '', description: item.description, original: item.original,
      location: item.location, quantity: quantity, unit: item.unit });
  }
  return rows;
}
function downloadBuyingList() {
  const rows = settledBuyingRows().map(function (row) {
    return [row.supplier, row.description, row.original, row.location, row.quantity, row.unit];
  });
  const csv = buyingListCsv(rows, [words('preferredSupplier'), words('item'), words('original'), words('location'), words('buyQuantity'), words('unit')]);
  const address = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = address;
  link.download = 'findash-buying-list-' + new Date().toISOString().slice(0, 10) + '.csv';
  link.click();
  URL.revokeObjectURL(address);
}
/* Delegation keeps controls working after a file finishes in the background. */
async function handleClick(event) {
  const button = event.target.closest('button');
  if (!button) { return; }
  if (button.id === 'choose-photos') { document.getElementById('stock-files').click(); }
  else if (button.dataset.review) { showInvoiceReview(button.dataset.review); }
  else if (button.dataset.discard) { discardDraft(button.dataset.discard); render(); }
  else if (button.dataset.movement) { showMovement(button.dataset.item,button.dataset.movement); }
  else if (button.dataset.settings) { showItemSettings(button.dataset.settings); }
  else if (button.dataset.resolve) { showResolveCheck(button.dataset.resolve); }
  else if (button.id === 'print-buying') { printPage(printBuyingHtml(settledBuyingRows())); }
  else if (button.id === 'download-buying') { downloadBuyingList(); }
  else if (button.id === 'backup-stock') { downloadBackup(); }
  else if (button.id === 'restore-stock') { document.getElementById('restore-file').click(); }
  else if (button.id === 'clear-stock') {
    if (store.user && canChange() && window.confirm(words('clearAccountQuestion'))) { await saveStock(emptyInventory()); }
    else if (!store.user) { clearGuestStock(); }
    render();
  }
  else if (button.id === 'print-stock') { printCountSheet(); }
  else if (button.id === 'retry-stock') { button.disabled = true; await saveStock(store.inventory); discardSavedDrafts(); render(); }
}
async function handleChange(event) {
  if (event.target.id === 'stock-files') { handleFiles([...event.target.files]); }
  if (event.target.id === 'restore-file' && event.target.files.length && canChange()) {
    try {
      const file = event.target.files[0];
      if (file.size > 1_000_000) { throw new Error('size'); }
      const restored = parseInventory(await file.text());
      if (window.confirm(words('restoreQuestion'))) { await saveStock(restored); render(); }
    } catch { message('invalid'); }
  }
}
async function start() {
  setLanguage(loadLanguage());
  wireForms(saved,message);
  onFilesChanged(render);
  watchStockChanges(async function () {
    if (store.busy || store.dirty || document.getElementById('stock-dialog').open) { return; }
    await loadStock();
    render();
  });
  window.addEventListener('hashchange',function () { document.getElementById('stock-message').hidden = true; render(); });
  document.getElementById('add-item').addEventListener('click',showAddItem);
  document.getElementById('stock-language').addEventListener('change',function (event) {
    setLanguage(event.target.value);
    rereadReadyDrafts(currentLanguage());
    render();
  });
  panel.addEventListener('click',handleClick);
  panel.addEventListener('change',handleChange);
  panel.addEventListener('input',function (event) {
    if (event.target.dataset.buy) { buyingEdits.set(event.target.dataset.buy, event.target.value); return; }
    if (event.target.id !== 'stock-search') { return; }
    const query = event.target.value.toLocaleLowerCase();
    for (const row of panel.querySelectorAll('[data-stock-row]')) { row.hidden = !row.textContent.toLocaleLowerCase().includes(query); }
  });
  window.addEventListener('beforeunload',function (event) {
    const pending = drafts.some(function (draft) { return draft.status === 'ready' || draft.status === 'reading'; });
    if (store.dirty || pending) { event.preventDefault(); event.returnValue = words('pendingLeave'); }
  });
  render();
  await loadStock();
  if (store.user && store.user.email) { document.getElementById('stock-account').textContent = store.user.email; }
  render();
}
start();
