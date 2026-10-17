/* Guest stock stays on this device. Account stock uses a separate RLS table,
   never the P&L document, so saving either cannot erase the other. */
import { emptyInventory, validateInventory } from './ledger.js';
import { words } from './language.js';
import { announceStockChange } from './changes.js';
const GUEST_KEY = 'findash-stock-guest-v1';
let loading = null;
let guestSnapshot = null;
export const store = { inventory: emptyInventory(), user: null, revision: 0, ready: false, dirty: false, busy: false, note: '', pendingInvoice: null, confirmedInvoices: [] };

/* Refuses damaged backups rather than silently dropping their records. */
export function parseInventory(text) {
  const inventory = JSON.parse(text);
  validateInventory(inventory);
  return inventory;
}

/* Waits for a reload already under way (one starts whenever the page gets
   focus back, such as when a file picker closes), so what comes next sees
   the stock as loaded. */
export async function whenStockLoaded() {
  if (loading) { await loading; }
}

/* Only guest data is written to local storage; signed-in records stay in memory. */
export function loadStock() {
  if (store.busy || store.dirty) { return Promise.resolve(); }
  if (!loading) {
    loading = readStock().finally(function () { loading = null; });
  }
  return loading;
}

async function readStock() {
  store.ready = false;
  const previousOwner = store.user?.email || null;
  try {
    const capabilities = await fetch('/api/capabilities');
    if (!capabilities.ok) { throw new Error('account'); }
    const options = await capabilities.json();
    let user = null;
    if (options.accounts) {
      const response = await fetch('/api/auth?action=me', { credentials: 'same-origin' });
      if (!response.ok) { throw new Error('account'); }
      const result = await response.json();
      user = result.user;
    }
    store.user = user;
    if ((user?.email || null) !== previousOwner) { store.inventory = emptyInventory(); store.revision = 0; store.confirmedInvoices = []; }
    if (store.user && store.user.email) {
      const response = await fetch('/api/inventory', {
        credentials: 'same-origin', cache: 'no-store', headers: { 'X-FinDash-Owner': store.user.email }
      });
      if (!response.ok) { throw new Error('account'); }
      const result = await response.json();
      validateInventory(result.inventory);
      store.inventory = result.inventory;
      store.revision = result.revision;
      store.note = 'accountSaved';
    } else {
      const saved = localStorage.getItem(GUEST_KEY);
      store.inventory = saved ? parseInventory(saved) : emptyInventory();
      guestSnapshot = saved;
      store.revision = 0;
      store.note = 'guest';
    }
    store.ready = true;
  } catch {
    store.note = 'accountFailed';
    store.ready = false;
  }
}

/* A failed write leaves the new record in memory and clearly marked unsaved. */
export async function saveStock(inventory, invoice = store.pendingInvoice) {
  validateInventory(inventory);
  if (!store.ready || store.busy) { return false; }
  store.inventory = inventory;
  store.dirty = true;
  store.pendingInvoice = invoice;
  store.busy = true;
  try {
    if (store.user && store.user.email) {
      const response = await fetch('/api/inventory', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-FinDash-Owner': store.user.email },
        body: JSON.stringify({ inventory: inventory, revision: store.revision, ...(invoice ? { invoice: invoice } : {}) })
      });
      if (response.status === 409) {
        const result = await response.json();
        store.note = result.duplicateInvoice ? 'duplicateInvoice' : 'conflict';
        return false;
      }
      if (response.status === 401) { store.note = 'sessionExpired'; return false; }
      if (!response.ok) { throw new Error('save'); }
      const result = await response.json();
      store.revision = result.revision;
      if (result.figuresUpdatedAt) { store.figuresUpdatedAt = result.figuresUpdatedAt; }
      if (result.figures) { store.confirmedFigures = result.figures; }
      store.note = 'accountSaved';
    } else {
      if (invoice) { throw new Error('account'); }
      if (localStorage.getItem(GUEST_KEY) !== guestSnapshot) { store.note = 'conflict'; return false; }
      const saved = JSON.stringify(inventory);
      localStorage.setItem(GUEST_KEY, saved);
      guestSnapshot = saved;
      store.note = 'guest';
    }
    store.dirty = false;
    if (invoice && !store.confirmedInvoices.includes(invoice.id)) { store.confirmedInvoices.push(invoice.id); }
    store.pendingInvoice = null;
    announceStockChange(store.user?.email);
    return true;
  } catch {
    store.note = store.user ? 'unsaved' : 'storageBlocked';
    return false;
  } finally {
    store.busy = false;
  }
}

/* Exports data only when the owner presses the backup button. */
export function downloadBackup() {
  const blob = new Blob([JSON.stringify(store.inventory, null, 2)], { type: 'application/json' });
  const address = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = address;
  link.download = 'findash-stock-' + new Date().toISOString().slice(0, 10) + '.json';
  link.click();
  URL.revokeObjectURL(address);
}
export function clearGuestStock() {
  if (store.user || !window.confirm(words('clearQuestion'))) { return; }
  localStorage.removeItem(GUEST_KEY);
  guestSnapshot = null;
  store.inventory = emptyInventory();
  store.dirty = false;
  announceStockChange();
}
