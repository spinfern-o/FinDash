/* Counting a shelf through the existing photo endpoint: the same login,
   the same site check and the same daily allowance as reading an invoice,
   a different question asked of the model, and an answer rebuilt field by
   field before the page ever sees it.

   Test names carry the numbers of the acceptance criteria they cover. */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { httpClient } from "../support/http-client.mjs";
import { newEmail } from "../support/browser.mjs";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const MILK = { id: "milk", name: "全脂牛奶", original: "WHOLE MILK 1GAL", unit: "carton", location: "Front fridge" };
const SHELF_REQUEST = { task: "shelf-count", image: ONE_PIXEL_PNG, mediaType: "image/png", item: MILK };
const INVOICE_REQUEST = { image: ONE_PIXEL_PNG, mediaType: "image/png" };

let site;

before(async function () { site = await startSite(); });
after(async function () { await site.stop(); });
beforeEach(function () {
  site.supabase.reset();
  site.anthropic.requests.length = 0;
  site.anthropic.replies.shelf = {
    shows_requested_product: true, usable: true, coverage: "complete", visible_count: 7,
    count_type: "visible-exact", reliability: "good", obstructed: false, quality_flags: [],
    explanation: "Seven cartons are clearly visible in the front row."
  };
});

async function loggedInClient() {
  const client = httpClient(site);
  const response = await client.post("/api/auth?action=signup", { email: newEmail("shelf"), password: "correct horse battery" });
  assert.equal(response.status, 200);
  return client;
}

test("a shelf photo needs a login and this site, and spends nothing without them", async function () {
  const visitor = httpClient(site);
  const refused = await visitor.post("/api/read-document", SHELF_REQUEST);
  assert.equal(refused.status, 401);
  assert.equal(refused.json.needsLogin, true);

  const client = await loggedInClient();
  const elsewhere = await client.post("/api/read-document", SHELF_REQUEST, { origin: "https://another.example" });
  assert.equal(elsewhere.status, 403);
  assert.equal(site.anthropic.requests.length, 0, "nothing was sent to the model");
});

test("the model is asked to count one shelf, in the owner's own unit, and nothing else", async function () {
  const client = await loggedInClient();
  const response = await client.post("/api/read-document", { ...SHELF_REQUEST, language: "zh-CN" });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json.reading, {
    showsItem: true, usable: true, coverage: "complete", visibleCount: 7, countType: "visible-exact",
    reliability: "good", obstructed: false, qualityFlags: [],
    explanation: "Seven cartons are clearly visible in the front row."
  });
  assert.equal(response.json.document, undefined, "a shelf photo is not read as an invoice");

  const sent = site.anthropic.requestsOfKind("shelf");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.model, "claude-opus-5-5");
  assert.match(sent[0].body.system, /Count ONLY distinct, clearly visible units/);
  assert.match(sent[0].body.system, /Simplified Chinese/, "the owner reviews it in their language");
  assert.ok(!/add up|printed total/.test(sent[0].body.system), "no invoice arithmetic is asked of a shelf photo");

  const schema = sent[0].body.output_config.format.schema;
  assert.deepEqual(Object.keys(schema.properties).sort(), ["count_type", "coverage", "explanation",
    "obstructed", "quality_flags", "reliability", "shows_requested_product", "usable", "visible_count"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.visible_count.anyOf[0].type, "integer", "whole units only");

  // The one item the owner chose is named; the model is given no list to
  // guess from and no identifier it could answer with.
  const asked = JSON.stringify(sent[0].body.messages[0].content);
  assert.match(asked, /WHOLE MILK 1GAL/);
  assert.match(asked, /Front fridge/);
  assert.ok(!asked.includes(MILK.id), "the model is never given, or asked for, the item's id");
});

test("T21: the answer is rebuilt, and anything that is not a plain count is dropped", async function () {
  const client = await loggedInClient();
  site.anthropic.replies.shelf = {
    shows_requested_product: true, usable: true, coverage: "generous", visible_count: 7.5,
    count_type: "estimate", reliability: "excellent", obstructed: false,
    quality_flags: ["blurry", "sabotage"], explanation: "x".repeat(600),
    buy_now: 12, item_id: "something-else"
  };
  const estimated = await client.post("/api/read-document", SHELF_REQUEST);
  assert.equal(estimated.status, 200);
  assert.deepEqual(estimated.json.reading, {
    showsItem: true, usable: false, coverage: "unclear", visibleCount: null, countType: "estimate",
    reliability: "poor", obstructed: false, qualityFlags: ["blurry"], explanation: "x".repeat(300)
  });

  site.anthropic.replies.shelf = { shows_requested_product: true, usable: true, coverage: "complete",
    visible_count: -3, count_type: "visible-exact", reliability: "good", obstructed: false,
    quality_flags: [], explanation: "" };
  const negative = await client.post("/api/read-document", SHELF_REQUEST);
  assert.equal(negative.json.reading.visibleCount, null, "a negative count is not a count");
  assert.equal(negative.json.reading.explanation, null);
});

test("a request without the item, or with an unknown task, is refused before anything is spent", async function () {
  const client = await loggedInClient();
  const refusals = [
    { ...SHELF_REQUEST, task: "count-the-money" },
    { ...SHELF_REQUEST, item: undefined },
    { ...SHELF_REQUEST, item: { ...MILK, unit: "" } },
    { ...SHELF_REQUEST, item: { ...MILK, original: "x".repeat(161) } },
    { ...SHELF_REQUEST, item: [MILK] },
    { ...SHELF_REQUEST, image: "not base64!" },
    { ...SHELF_REQUEST, mediaType: "application/pdf" },
    { ...SHELF_REQUEST, language: "fr" }
  ];
  for (const body of refusals) {
    const response = await client.post("/api/read-document", body);
    assert.equal(response.status, 400, JSON.stringify(body.task || body.item || body.mediaType));
  }
  assert.equal(site.anthropic.requests.length, 0);
});

test("T24: an invoice photo is still read as an invoice, and never as a shelf", async function () {
  const client = await loggedInClient();
  const invoice = await client.post("/api/read-document", INVOICE_REQUEST);
  assert.equal(invoice.status, 200);
  assert.ok(invoice.json.document, "the invoice reading is unchanged");
  assert.ok(invoice.json.checks, "its arithmetic is still checked");
  assert.equal(invoice.json.reading, undefined);
  assert.deepEqual(site.anthropic.requests.map(function (sent) { return sent.kind; }), ["photo"],
    "the invoice went to the invoice reader, never to the shelf counter");

  site.anthropic.requests.length = 0;
  const shelf = await client.post("/api/read-document", SHELF_REQUEST);
  assert.equal(shelf.status, 200);
  assert.deepEqual(site.anthropic.requests.map(function (sent) { return sent.kind; }), ["shelf"]);
});

test("T23: the photo is not kept, logged or sent back", async function () {
  const client = await loggedInClient();
  const before = site.serverLogs.length;
  const response = await client.post("/api/read-document", SHELF_REQUEST);
  assert.equal(response.status, 200);
  assert.ok(!JSON.stringify(response.json).includes(ONE_PIXEL_PNG.slice(0, 40)));
  for (const line of site.serverLogs.slice(before)) {
    assert.ok(!line.includes(ONE_PIXEL_PNG.slice(0, 40)), "no photo in the log: " + line);
  }

  // A failure logs why, and still not the photo.
  site.anthropic.replies.shelf = null;
  const broken = await client.post("/api/read-document", SHELF_REQUEST);
  assert.ok([200, 502].includes(broken.status));
  for (const line of site.serverLogs.slice(before)) {
    assert.ok(!line.includes(ONE_PIXEL_PNG.slice(0, 40)), "no photo in the log: " + line);
  }
});
