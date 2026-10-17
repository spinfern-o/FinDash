/* Invoice readings are a temporary review queue. Nothing enters the stock
   ledger until the owner confirms a physical shelf count. */
import { preparePhotoForUpload } from '../dashboard/photos/photo-reader.js';
import { currentLanguage } from './language.js';
import { store } from './storage.js';
import { invoiceId } from './invoice.js';
export const drafts = [];
const waiting = [];
let readers = 0;
let onChange = function () {};
const MAXIMUM_ACTIVE_DRAFTS = 12;
export function onFilesChanged(callback) { onChange = callback; }

/* Bound the original files, compressed photos and review fields in memory. */
function queueIsFull() {
  return drafts.filter(function (draft) { return draft.status === 'reading' || draft.status === 'ready'; }).length >= MAXIMUM_ACTIVE_DRAFTS;
}

/* The content digest catches duplicate uploads even when filenames differ. */
export async function fingerprint(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
}
function alreadyAdded(hash) {
  return drafts.some(function (draft) { return draft.hash === hash; }) || store.confirmedInvoices.includes(invoiceId(hash)) || store.inventory.movements.some(function (movement) {
    return movement.note === 'source:' + hash;
  });
}

/* At most two readings run together, independent of how long review takes. */
export async function addFiles(files) {
  for (const file of files) {
    if (queueIsFull()) {
      drafts.push({ owner: store.user?.email || null, id: crypto.randomUUID(), name: file.name, status: 'failed', error: 'queueFull' });
      continue;
    }
    if (file.size > 20_000_000 || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
      drafts.push({ owner: store.user?.email || null, id: crypto.randomUUID(), name: file.name, status: 'failed', error: 'unsupported' });
      continue;
    }
    let hash;
    try {
      hash = await fingerprint(file);
    } catch {
      drafts.push({ owner: store.user?.email || null, id: crypto.randomUUID(), name: file.name, status: 'failed', error: 'failed' });
      continue;
    }
    if (alreadyAdded(hash)) {
      drafts.push({ owner: store.user?.email || null, id: crypto.randomUUID(), name: file.name, status: 'failed', error: 'duplicate' });
      continue;
    }
    // Another drop can finish hashing while this file is being read.
    if (queueIsFull()) {
      drafts.push({ owner: store.user?.email || null, id: crypto.randomUUID(), name: file.name, status: 'failed', error: 'queueFull' });
      continue;
    }
    const draft = { owner: store.user?.email || null, id: crypto.randomUUID(), name: file.name, hash: hash, status: 'reading', file: file, language: currentLanguage() };
    drafts.push(draft);
    waiting.push(draft);
    // Start accepted files immediately. A later file failing to read from
    // disk must not strand earlier uploads in a queue that never runs.
    onChange();
    startWaiting();
  }
  onChange();
  startWaiting();
}
function startWaiting() {
  while (readers < 2 && waiting.length) {
    const draft = waiting.shift();
    readers += 1;
    readInvoice(draft).finally(function () { readers -= 1; onChange(); startWaiting(); });
  }
}

/* Uses the site's existing authenticated, rate-limited reader. A failed
   arithmetic check gets one second look, matching the financial import. */
async function requestReading(photo, language, review) {
  const response = await fetch('/api/read-document', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: photo.data, mediaType: photo.mediaType, language: language, review: review })
  });
  if (response.status === 401 || response.status === 403) { throw new Error('authNeeded'); }
  if (!response.ok) { throw new Error('failed'); }
  return response.json();
}
async function readInvoice(draft) {
  try {
    if (!store.user || draft.owner !== store.user.email) { throw new Error('authNeeded'); }
    const photo = draft.photo || await preparePhotoForUpload(draft.file);
    draft.photo = photo;
    draft.preview = photo.preview;
    const readingLanguage = draft.language;
    let result = await requestReading(photo, readingLanguage);
    if (!result.checks.ok) {
      result = await requestReading(photo, readingLanguage, { previous: result.document, problems: result.checks.problems });
    }
    if (draft.owner !== store.user?.email) { throw new Error('authNeeded'); }
    // A language change during a request must not label an English result
    // as Chinese. Queue a new reading before exposing it for review.
    if (draft.language !== readingLanguage) { waiting.push(draft); return; }
    if (!result.document.legible || result.document.kind !== 'purchase' || !result.document.lines.length) { throw new Error('unreadable'); }
    if (!result.checks.ok) { throw new Error('checkAmounts'); }
    draft.document = result.document;
    draft.status = 'ready';
  } catch (error) {
    draft.status = 'failed';
    draft.error = ['authNeeded', 'unreadable', 'checkAmounts'].includes(error.message) ? error.message : 'failed';
  } finally {
    // Review needs the small preview and extracted fields, not the original
    // potentially 20 MB file, for the remainder of this page visit.
    delete draft.file;
  }
}

/* The owner can switch languages while reviews or readings are pending.
   Compressed photos stay only in this visit's memory for this rereading. */
export function rereadReadyDrafts(language) {
  for (const draft of drafts) {
    if ((draft.status === 'ready' || draft.status === 'reading') && draft.language !== language) {
      draft.language = language;
      if (draft.status === 'ready') {
        draft.status = 'reading';
        delete draft.document;
        waiting.push(draft);
      }
    }
  }
  onChange();
  startWaiting();
}
export function discardDraft(id) {
  const index = drafts.findIndex(function (draft) { return draft.id === id; });
  if (index >= 0 && drafts[index].status !== 'reading') { drafts.splice(index, 1); }
}
