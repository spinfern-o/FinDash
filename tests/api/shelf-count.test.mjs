/* Counting a shelf through the existing photo endpoint: the same login,
   the same site check and the same daily allowance as reading an invoice,
   a different question asked of the model, and an answer rebuilt field by
   field before the page ever sees it.

   One photo answers for every product the owner tracks on that shelf. The
   model is given those products as a numbered list and never their ids, so
   it can only answer about products the owner picked.

   Test names carry the numbers of the acceptance criteria they cover. */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { httpClient } from "../support/http-client.mjs";
import { newEmail } from "../support/browser.mjs";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const MILK = { id: "milk", name: "全脂牛奶", original: "WHOLE MILK 1GAL", unit: "carton", location: "Front fridge" };
const OAT = { id: "oat", name: "燕麦奶", original: "OATLY BARISTA 32OZ", unit: "carton", location: "Front fridge" };
const SHELF_REQUEST = { task: "shelf-count", image: ONE_PIXEL_PNG, mediaType: "image/png", items: [MILK] };
const INVOICE_REQUEST = { image: ONE_PIXEL_PNG, mediaType: "image/png" };

/* One product's answer, as the model gives it. */
function observation(candidate, changes) {
  return Object.assign({
    candidate: candidate, present: true, visible_count: 7, count_type: "visible-exact",
    coverage: "complete", reliability: "good", obstructed: false, explanation: "Clearly visible."
  }, changes);
}

function reply(observations, changes) {
  return Object.assign({
    usable: true, quality_flags: [], unmatched: [], explanation: "The shelf is clearly visible.",
    observations: observations
  }, changes);
}

let site;

before(async function () { site = await startSite(); });
after(async function () { await site.stop(); });
beforeEach(function () {
  site.supabase.reset();
  site.anthropic.requests.length = 0;
  site.anthropic.replies.shelf = reply([observation(1)]);
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

test("the model is asked to count the shelf's products, each in its own unit, and nothing else", async function () {
  const client = await loggedInClient();
  const response = await client.post("/api/read-document", { ...SHELF_REQUEST, items: [MILK, OAT], language: "zh-CN" });
  assert.equal(response.status, 200);
  assert.equal(response.json.document, undefined, "a shelf photo is not read as an invoice");

  const sent = site.anthropic.requestsOfKind("shelf");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.model, "claude-opus-5-5");
  assert.match(sent[0].body.system, /Count ONLY distinct, clearly visible units/);
  assert.match(sent[0].body.system, /not being able to find it is not a count of/);
  assert.match(sent[0].body.system, /Simplified Chinese/, "the owner reviews it in their language");
  assert.ok(!/add up|printed total/.test(sent[0].body.system), "no invoice arithmetic is asked of a shelf photo");

  const schema = sent[0].body.output_config.format.schema;
  assert.deepEqual(Object.keys(schema.properties).sort(),
    ["explanation", "observations", "quality_flags", "unmatched", "usable"]);
  assert.equal(schema.additionalProperties, false);
  const perProduct = schema.properties.observations.items;
  assert.equal(perProduct.properties.visible_count.anyOf[0].type, "integer", "whole units only");
  assert.equal(perProduct.properties.candidate.maximum, 12);

  // Each product is numbered, named and given its own unit; no ids are sent.
  const asked = JSON.stringify(sent[0].body.messages[0].content);
  assert.match(asked, /WHOLE MILK 1GAL/);
  assert.match(asked, /OATLY BARISTA 32OZ/);
  assert.match(asked, /Front fridge/);
  assert.match(asked, /\\"candidate\\":1/);
  assert.match(asked, /\\"candidate\\":2/);
  assert.ok(!asked.includes('milk\\"') || !asked.includes('oat\\"'), "the model is never given item ids");
});

test("one photo answers for every product on the shelf, each on its own", async function () {
  const client = await loggedInClient();
  site.anthropic.replies.shelf = reply([
    observation(1, { visible_count: 2, explanation: "Two gallons with blue caps." }),
    observation(2, { visible_count: 5 })
  ]);
  const response = await client.post("/api/read-document", { ...SHELF_REQUEST, items: [MILK, OAT] });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json.reading.observations.map(function (seen) {
    return [seen.itemId, seen.visibleCount, seen.usable];
  }), [["milk", 2, true], ["oat", 5, true]]);
});

test("T09: a product the photo does not show comes back unobserved, never as zero", async function () {
  const client = await loggedInClient();
  site.anthropic.replies.shelf = reply([
    observation(1, { visible_count: 3 }),
    observation(2, { present: false, visible_count: null, count_type: "none", coverage: "unclear",
      explanation: "No oat milk anywhere in this photo." })
  ]);
  const response = await client.post("/api/read-document", { ...SHELF_REQUEST, items: [MILK, OAT] });
  const [milk, oat] = response.json.reading.observations;
  assert.deepEqual([milk.itemId, milk.visibleCount], ["milk", 3]);
  assert.deepEqual([oat.itemId, oat.visibleCount, oat.showsItem, oat.usable], ["oat", null, false, false]);
});

test("T18: the model cannot answer about a product the owner did not pick, or twice about one", async function () {
  const client = await loggedInClient();
  site.anthropic.replies.shelf = reply([
    observation(3, { visible_count: 99 }),            // outside the list: dropped
    observation(0, { visible_count: 98 }),            // not a place in it: dropped
    observation(1, { visible_count: 4 }),             // the milk
    observation(1, { visible_count: 40 })             // a second answer for it: ignored
  ]);
  const response = await client.post("/api/read-document", { ...SHELF_REQUEST, items: [MILK, OAT] });
  const seen = response.json.reading.observations;
  assert.equal(seen.length, 2, "one row per product asked about, no more and no fewer");
  assert.deepEqual([seen[0].itemId, seen[0].visibleCount], ["milk", 4], "the first answer wins");
  assert.deepEqual([seen[1].itemId, seen[1].visibleCount], ["oat", null], "no answer means unobserved");
});

test("T21: the answer is rebuilt, and anything that is not a plain count is dropped", async function () {
  const client = await loggedInClient();
  site.anthropic.replies.shelf = reply([observation(1, {
    visible_count: 7.5, count_type: "estimate", coverage: "generous", reliability: "excellent",
    explanation: "x".repeat(600)
  })], { quality_flags: ["blurry", "sabotage"], unmatched: ["a jug of tea concentrate", 42], buy_now: 12 });
  const estimated = await client.post("/api/read-document", SHELF_REQUEST);
  assert.equal(estimated.status, 200);
  assert.deepEqual(estimated.json.reading.observations[0], {
    itemId: "milk", showsItem: true, usable: false, coverage: "unclear", visibleCount: null,
    countType: "estimate", reliability: "poor", obstructed: false, explanation: "x".repeat(300)
  });
  assert.deepEqual(estimated.json.reading.qualityFlags, ["blurry"]);
  assert.deepEqual(estimated.json.reading.unmatched, ["a jug of tea concentrate"]);
  assert.equal(estimated.json.reading.buy_now, undefined);

  site.anthropic.replies.shelf = reply([observation(1, { visible_count: -3 })]);
  const negative = await client.post("/api/read-document", SHELF_REQUEST);
  assert.equal(negative.json.reading.observations[0].visibleCount, null, "a negative count is not a count");

  // A photo of no use at all is not rescued by a confident-looking product.
  site.anthropic.replies.shelf = reply([observation(1, { visible_count: 6 })], { usable: false });
  const unusable = await client.post("/api/read-document", SHELF_REQUEST);
  assert.equal(unusable.json.reading.observations[0].usable, false);
});

test("a request without the products, or with an unknown task, is refused before anything is spent", async function () {
  const client = await loggedInClient();
  const refusals = [
    { ...SHELF_REQUEST, task: "count-the-money" },
    { ...SHELF_REQUEST, items: undefined },
    { ...SHELF_REQUEST, items: [] },
    { ...SHELF_REQUEST, items: new Array(13).fill(MILK) },
    { ...SHELF_REQUEST, items: [MILK, MILK] },
    { ...SHELF_REQUEST, items: [{ ...MILK, unit: "" }] },
    { ...SHELF_REQUEST, items: [{ ...MILK, original: "x".repeat(161) }] },
    { ...SHELF_REQUEST, items: MILK },
    { ...SHELF_REQUEST, image: "not base64!" },
    { ...SHELF_REQUEST, mediaType: "application/pdf" },
    { ...SHELF_REQUEST, language: "fr" }
  ];
  for (const body of refusals) {
    const response = await client.post("/api/read-document", body);
    assert.equal(response.status, 400, JSON.stringify(body.task || body.items || body.mediaType));
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
