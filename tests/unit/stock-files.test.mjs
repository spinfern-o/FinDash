/* Temporary invoice queues must remain bounded and follow the chosen language. */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { drafts, addFiles, rereadReadyDrafts, onFilesChanged } from '../../frontend/js/stock/files.js';
import { store, loadStock } from '../../frontend/js/stock/storage.js';
import { emptyInventory } from '../../frontend/js/stock/ledger.js';

const originalFetch = globalThis.fetch;

afterEach(function () {
  globalThis.fetch = originalFetch;
  drafts.length = 0;
  onFilesChanged(function () {});
  store.user = null;
  store.inventory = emptyInventory();
  store.ready = false;
});

test('twelve active invoice drafts prevent another photo entering memory', async function () {
  for (let index = 0; index < 12; index += 1) {
    drafts.push({ id: String(index), status: 'ready' });
  }
  let read = false;
  await addFiles([{ name: 'extra.png', type: 'image/png', size: 10, arrayBuffer: async function () { read = true; } }]);
  assert.equal(read, false);
  assert.equal(drafts.at(-1).error, 'queueFull');
  assert.equal(drafts.filter(function (draft) { return draft.status === 'ready'; }).length, 12);
});

test('one unreadable file does not reject the rest of a multi-file selection', async function () {
  await addFiles([
    { name: 'broken.png', type: 'image/png', size: 10, arrayBuffer: async function () { throw new Error('disk'); } },
    { name: 'unsupported.pdf', type: 'application/pdf', size: 10 }
  ]);
  assert.deepEqual(drafts.map(function (draft) { return draft.error; }), ['failed', 'unsupported']);
});

test('switching language rereads pending source text before exposing it for review', async function () {
  store.user = { email: 'owner@example.test' };
  const document = { kind: 'purchase', legible: true, lines: [{ original: 'Rice', description: '大米' }] };
  drafts.push({ owner: store.user.email, id: 'draft', status: 'ready', language: 'en', document: { ...document, lines: [{ description: 'Rice' }] },
    photo: { data: 'aGVsbG8=', mediaType: 'image/png', preview: 'data:image/png;base64,aGVsbG8=' } });
  const requests = [];
  globalThis.fetch = async function (url, options) {
    requests.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async function () { return { document, checks: { ok: true } }; } };
  };
  const finished = new Promise(function (resolve) {
    onFilesChanged(function () { if (drafts[0].status === 'ready') { resolve(); } });
  });
  rereadReadyDrafts('zh-CN');
  assert.equal(drafts[0].status, 'reading');
  assert.equal(drafts[0].document, undefined);
  await finished;
  assert.equal(requests[0].language, 'zh-CN');
  assert.equal(drafts[0].document.lines[0].description, '大米');
});

test('a capabilities failure cannot silently replace account loading with guest records', async function () {
  globalThis.fetch = async function () { return { ok: false, status: 503 }; };
  await loadStock();
  assert.equal(store.ready, false);
  assert.equal(store.note, 'accountFailed');
});
