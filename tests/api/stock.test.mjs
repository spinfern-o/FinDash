/* Stock persistence uses each account's token and rejects stale revisions. */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { httpClient } from "../support/http-client.mjs";
import { emptyInventory, addItem, recordMovement } from "../../frontend/js/stock/ledger.js";

let site;
let nextOwner = 0;
const PHOTO = { image: "aGVsbG8=", mediaType: "image/png" };

before(async function () { site = await startSite(); });
after(async function () { await site.stop(); });
beforeEach(function () { site.supabase.reset(); site.anthropic.requests.length = 0; });

/* Separate cookie jars act as separate account holders. */
async function owner() {
  nextOwner += 1;
  const client = httpClient(site);
  const response = await client.post("/api/auth?action=signup", {
    email: "stock" + nextOwner + "@example.test", password: "stock test password"
  });
  assert.equal(response.status, 200);
  const put = client.put;
  client.put = function (path, body, headers) {
    if (path === '/api/inventory') {
      headers = { 'X-FinDash-Owner': response.json.user.email, ...headers };
    }
    return put(path, body, headers);
  };
  return client;
}

/* A real checked count, rather than a purchase being treated as shelf stock. */
function countedInventory() {
  const state = addItem(emptyInventory(), { id: "rice", original: "Rice", description: "大米", unit: "袋", location: "后仓" });
  return recordMovement(state, { id: "count", itemId: "rice", type: "count", quantity: 8 });
}

test("stock needs login, refuses cross-site writes and keeps owners apart", async function () {
  const visitor = httpClient(site);
  assert.equal((await visitor.get("/api/inventory")).status, 401);
  assert.equal((await visitor.put("/api/inventory", {})).status, 401);
  assert.equal((await visitor.post("/api/inventory", {})).status, 405);
  const first = await owner();
  const second = await owner();
  assert.deepEqual((await first.get("/api/inventory")).json, { inventory: emptyInventory(), revision: 0 });
  const inventory = countedInventory();
  const missingOwner = await fetch(site.url + '/api/inventory', {
    method: 'PUT', body: JSON.stringify({ inventory, revision: 0 }),
    headers: { 'Content-Type': 'application/json', origin: site.url,
      cookie: Array.from(first.jar).map(function ([key, value]) { return key + '=' + value; }).join('; ') }
  });
  assert.equal(missingOwner.status, 400);
  assert.equal((await first.put("/api/inventory", { inventory, revision: 0 }, { origin: "https://other.test" })).status, 403);
  assert.equal((await first.put("/api/inventory", { inventory, revision: 0 })).status, 200);
  assert.deepEqual((await first.get("/api/inventory")).json, { inventory, revision: 1 });
  assert.deepEqual((await second.get("/api/inventory")).json, { inventory: emptyInventory(), revision: 0 });
});

test("stale tabs and simultaneous first saves cannot overwrite confirmed stock", async function () {
  const client = await owner();
  const inventory = countedInventory();
  const initial = await Promise.all([
    client.put("/api/inventory", { inventory, revision: 0 }),
    client.put("/api/inventory", { inventory: emptyInventory(), revision: 0 })
  ]);
  assert.deepEqual(initial.map(function (result) { return result.status; }).sort(), [200, 409]);
  assert.equal((await client.put("/api/inventory", { inventory, revision: 0 })).status, 409);
  const update = await client.put("/api/inventory", { inventory, revision: 1 });
  assert.deepEqual(update.json, { revision: 2 });
  assert.equal((await client.put("/api/inventory", { inventory: emptyInventory(), revision: 1 })).status, 409);
  assert.deepEqual((await client.get("/api/inventory")).json, { inventory, revision: 2 });
});

test("switching accounts in another tab cannot save the previous owner's in-memory stock", async function () {
  const first = await owner();
  const second = await owner();
  const previousOwner = (await first.get('/api/auth?action=me')).json.user.email;
  const inventory = countedInventory();
  assert.equal((await second.put('/api/inventory', { inventory, revision: 0 })).status, 200);
  // The second account's cookies now accompany the first page's owner header.
  const response = await second.put('/api/inventory', { inventory: emptyInventory(), revision: 1 },
    { 'X-FinDash-Owner': previousOwner });
  assert.equal(response.status, 401);
  const read = await fetch(site.url + '/api/inventory', {
    headers: { cookie: Array.from(second.jar).map(function ([key, value]) { return key + '=' + value; }).join('; '),
      'X-FinDash-Owner': previousOwner }
  });
  assert.equal(read.status, 401);
  assert.deepEqual((await second.get('/api/inventory')).json, { inventory, revision: 1 });
});

test("invalid stock and revision are rejected without replacing the stored ledger", async function () {
  const client = await owner();
  const inventory = countedInventory();
  assert.equal((await client.put("/api/inventory", { inventory, revision: 0 })).status, 200);
  for (const revision of [undefined, -1, 0.5, "1", Number.MAX_SAFE_INTEGER]) {
    assert.equal((await client.put("/api/inventory", { inventory, revision })).status, 400);
  }
  const bad = { ...inventory, movements: [...inventory.movements,
    { id: "bad", itemId: "rice", type: "usage", quantity: 9, at: "2026-10-17T01:00:00Z" }] };
  assert.equal((await client.put("/api/inventory", { inventory: bad, revision: 1 })).status, 400);
  assert.deepEqual((await client.get("/api/inventory")).json, { inventory, revision: 1 });
});

test("an unapplied stock migration produces a clear setup response", async function () {
  const client = await owner();
  site.supabase.options.missingTables = true;
  const response = await client.get("/api/inventory");
  assert.equal(response.status, 503);
  assert.match(response.json.error, /isn't set up/);
});

test("Chinese invoice review requests Chinese descriptions and exact original text, preserving English default", async function () {
  const client = await owner();
  assert.equal((await client.post("/api/read-document", { ...PHOTO, language: "zh-CN" })).status, 200);
  const chinese = site.anthropic.requestsOfKind("photo")[0].body;
  assert.match(chinese.system, /Simplified Chinese translation/);
  assert.match(chinese.system, /exact printed item description/);
  assert.match(chinese.system, /Do not infer shelf stock/);
  assert.equal((await client.post("/api/read-document", PHOTO)).status, 200);
  const english = site.anthropic.requestsOfKind("photo")[1].body;
  assert.match(english.system, /description: the item in English/);
  assert.equal(chinese.model, english.model);
  assert.equal((await client.post("/api/read-document", { ...PHOTO, language: "unsupported" })).status, 400);
  assert.equal(site.anthropic.requestsOfKind("photo").length, 2);
});
