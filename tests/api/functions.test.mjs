/* The server functions, called the way the pages call them: saved figures,
   the login and daily limits on the features that call Claude, what is
   sent to Claude, and error reports. */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { httpClient } from "../support/http-client.mjs";
import { newEmail } from "../support/browser.mjs";
import { readFixture } from "../support/mock-anthropic.mjs";

const PASSWORD = "correct horse battery";
const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PHOTO_REQUEST = { image: ONE_PIXEL_PNG, mediaType: "image/png" };
const ADVICE_REQUEST = {
  currency: "USD",
  months: [{ month: "July 2026", revenue: 72000, directExpenses: 45500, operatingExpenses: 7750,
    variableOverhead: 3750, fixedOverhead: 7420, totalExpenses: 64420, netProfit: 7580, budget: 66000 }]
};
const COLUMNS_REQUEST = { headers: ["month", "revenue", "cogs", "bank charges"], fields: [], unclaimed: ["bank charges"] };

let site;

before(async function () {
  site = await startSite();
});

after(async function () {
  await site.stop();
});

beforeEach(function () {
  site.supabase.reset();
  site.anthropic.requests.length = 0;
});

async function loggedInClient() {
  const client = httpClient(site);
  const response = await client.post("/api/auth?action=signup", { email: newEmail("api"), password: PASSWORD });
  assert.equal(response.status, 200);
  return client;
}

test("capabilities: the Claude features are on only with accounts as well as a key", async function () {
  const response = await httpClient(site).get("/api/capabilities");
  assert.deepEqual(response.json, { briefing: true, mapping: true, photos: true, accounts: true, forecast: false });
});

test("figures: nothing without a login, then saved, read back, refreshed and deleted", async function () {
  assert.equal((await httpClient(site).get("/api/figures")).status, 401);

  const client = await loggedInClient();
  assert.deepEqual((await client.get("/api/figures")).json, { figures: null, updatedAt: null });
  assert.equal((await client.post("/api/figures", {})).status, 405);
  assert.equal((await client.put("/api/figures", { figures: { months: [], invoices: [] } },
    { origin: "https://another.example" })).status, 403);
  assert.equal((await client.put("/api/figures", { figures: [1, 2] })).status, 400);
  assert.equal((await client.put("/api/figures", { figures: { months: "x", invoices: [] } })).status, 400);
  assert.equal((await client.put("/api/figures", { figures: { months: new Array(601).fill({}), invoices: [] } })).status, 400);
  const tooBig = { months: [{ month: "x".repeat(1_100_000) }], invoices: [] };
  assert.match((await client.put("/api/figures", { figures: tooBig })).json.error, /too large/);

  const saved = await client.put("/api/figures", { figures: { v: 2, months: [{ month: "july", year: 2026 }], invoices: [] } });
  assert.equal(saved.status, 200);
  assert.equal((await client.get("/api/figures")).json.figures.months[0].month, "july");

  // An expired access cookie with a good refresh cookie: renewed, not refused.
  client.jar.set("fd_access", "expired.token.here");
  const renewed = await client.get("/api/figures");
  assert.equal(renewed.status, 200);
  assert.ok(renewed.setCookies.some(function (cookie) {
    return cookie.startsWith("fd_access=") && !cookie.startsWith("fd_access=;");
  }));

  assert.equal((await client.delete("/api/figures")).status, 200);
  assert.equal((await client.get("/api/figures")).json.figures, null);
});

test("figures: a missing table is reported plainly", async function () {
  const client = await loggedInClient();
  site.supabase.options.missingTables = true;
  const response = await client.get("/api/figures");
  assert.equal(response.status, 503);
  assert.match(response.json.error, /isn't set up/);
});

test("photos, advice and column matching need a login, and send nothing to Claude without one", async function () {
  const visitor = httpClient(site);
  for (const [path, body] of [["/api/read-document", PHOTO_REQUEST], ["/api/briefing", ADVICE_REQUEST],
    ["/api/map-columns", COLUMNS_REQUEST]]) {
    const response = await visitor.post(path, body);
    assert.equal(response.status, 401, path);
    assert.equal(response.json.needsLogin, true, path);
  }
  assert.equal(site.anthropic.requests.length, 0);
});

test("requests from another site are refused before anything is counted", async function () {
  const client = await loggedInClient();
  const response = await client.post("/api/briefing", ADVICE_REQUEST, { origin: "https://another.example" });
  assert.equal(response.status, 403);
  assert.equal(site.anthropic.requests.length, 0);
});

test("logged in: each feature works, is counted, and asks the current Claude model", async function () {
  const client = await loggedInClient();

  const photo = await client.post("/api/read-document", PHOTO_REQUEST);
  assert.equal(photo.status, 200);
  assert.equal(photo.json.document.supplier, readFixture("invoice-misread.json").supplier);
  assert.equal(photo.json.checks.ok, false);   // the misread digit is caught

  const advice = await client.post("/api/briefing", ADVICE_REQUEST);
  assert.equal(advice.status, 200);
  assert.equal(advice.json.risks[0], "September lost $3,640.");

  const columns = await client.post("/api/map-columns", COLUMNS_REQUEST);
  assert.equal(columns.status, 200);
  assert.deepEqual(columns.json.other, { "bank charges": "operating" });

  for (const sent of site.anthropic.requests) {
    assert.equal(sent.body.model, "claude-opus-5-5", sent.kind);
    assert.equal(sent.body.fallbacks, "default", sent.kind);
    assert.match(String(sent.headers["anthropic-beta"]), /server-side-fallback-2026-07-01/, sent.kind);
  }
  const efforts = site.anthropic.requests.map(function (sent) {
    return sent.kind + ":" + sent.body.output_config.effort;
  });
  assert.deepEqual(efforts, ["photo:medium", "advice:medium", "columns:low"]);
});

test("each person has a daily limit per feature", async function () {
  const client = await loggedInClient();
  for (let use = 1; use <= 10; use++) {
    assert.equal((await client.post("/api/briefing", ADVICE_REQUEST)).status, 200, "use " + use);
  }
  const eleventh = await client.post("/api/briefing", ADVICE_REQUEST);
  assert.equal(eleventh.status, 429);
  assert.match(eleventh.json.error, /today's limit for advice/);
  assert.equal(site.anthropic.requestsOfKind("advice").length, 10);

  // Another feature, and another person, are counted separately.
  assert.equal((await client.post("/api/map-columns", COLUMNS_REQUEST)).status, 200);
  const someoneElse = await loggedInClient();
  assert.equal((await someoneElse.post("/api/briefing", ADVICE_REQUEST)).status, 200);
});

test("without the usage-limit SQL, the Claude features stay off rather than run unlimited", async function () {
  const client = await loggedInClient();
  site.supabase.options.missingTables = true;
  const response = await client.post("/api/briefing", ADVICE_REQUEST);
  assert.equal(response.status, 503);
  assert.match(response.json.error, /Usage limits aren't set up/);
  assert.equal(site.anthropic.requests.length, 0);
});

test("a bad request is refused before it is counted", async function () {
  const client = await loggedInClient();
  assert.equal((await client.post("/api/read-document", { image: "not base64!", mediaType: "image/png" })).status, 400);
  assert.equal((await client.post("/api/briefing", { months: [] })).status, 400);
  assert.equal(site.anthropic.requests.length, 0);
});

test("error reports are written to the log, one line each, and cut short", async function () {
  const client = httpClient(site);
  const before = site.serverLogs.length;
  const response = await client.post("/api/report-error", {
    message: "x is not defined\nsecond line " + "y".repeat(500), where: "/js/dashboard/main.js:10", page: "/dashboard"
  });
  assert.equal(response.status, 204);
  const line = site.serverLogs.slice(before).find(function (entry) {
    return entry.includes("[findash-error] page /dashboard");
  });
  assert.ok(line, "the report reached the log");
  assert.ok(!line.includes("\n"));
  assert.ok(line.length < 800);

  const fromElsewhere = await client.post("/api/report-error", { message: "spam" }, { origin: "https://another.example" });
  assert.equal(fromElsewhere.status, 204);
  assert.ok(!site.serverLogs.some(function (entry) {
    return entry.includes("spam");
  }));
});
