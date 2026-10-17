/* The waitlist (api/waitlist.js), against the stand-in for Supabase: good
   answers are kept, cleaned up; each email once; every answer is checked
   against the choices the page offers; robots and other sites get nothing
   stored; and a site without the table says so. */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { httpClient } from "../support/http-client.mjs";

const ANSWERS = {
  email: "  Owner@Example.TEST ",
  businessType: "restaurant",
  country: " United States ",
  ownerLanguages: ["zh", "en", "zh"],
  staffLanguages: ["es", "zh"],
  invoiceLanguages: ["zh", "en"],
  otherLanguages: "Cantonese",
  invoicesPerMonth: "30-60",
  hardestPart: "Keeping track of inventory.",
  website: ""
};

let site;

before(async function () {
  site = await startSite();
});

after(async function () {
  await site.stop();
});

beforeEach(function () {
  site.supabase.reset();
});

function join(answers, headers) {
  return httpClient(site).post("/api/waitlist", answers, headers);
}

test("good answers are kept, trimmed, with the email in lower case and each language once", async function () {
  const response = await join(ANSWERS);
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { ok: true });
  assert.equal(site.supabase.waitlist.length, 1);
  const row = Object.assign({}, site.supabase.waitlist[0]);
  delete row.created_at;
  assert.deepEqual(row, {
    email: "owner@example.test",
    business_type: "restaurant",
    country: "United States",
    owner_languages: ["zh", "en"],
    staff_languages: ["es", "zh"],
    invoice_languages: ["zh", "en"],
    other_languages: "Cantonese",
    invoices_per_month: "30-60",
    hardest_part: "Keeping track of inventory."
  });
});

test("the optional answers can be left out", async function () {
  const response = await join({ email: "short@example.test", businessType: "producer", country: "Mexico",
    invoicesPerMonth: "not-sure" });
  assert.equal(response.status, 200);
  const row = site.supabase.waitlist[0];
  assert.deepEqual([row.owner_languages, row.other_languages, row.hardest_part], [[], null, null]);
});

test("joining twice keeps one entry, and says nothing about who is already listed", async function () {
  assert.equal((await join(ANSWERS)).status, 200);
  const again = await join(Object.assign({}, ANSWERS, { email: "OWNER@example.test", country: "Canada" }));
  assert.equal(again.status, 200);
  assert.deepEqual(again.json, { ok: true });
  assert.equal(site.supabase.waitlist.length, 1);
  assert.equal(site.supabase.waitlist[0].country, "United States");
});

test("each answer is checked, and the problem names the answer to fix", async function () {
  const cases = [
    [{ email: "not an email" }, "email"],
    [{ email: "a".repeat(250) + "@x.co" }, "email"],
    [{ businessType: "casino" }, "businessType"],
    [{ country: "   " }, "country"],
    [{ country: "x".repeat(81) }, "country"],
    [{ staffLanguages: ["klingon"] }, "staffLanguages"],
    [{ invoiceLanguages: "zh" }, "invoiceLanguages"],
    [{ otherLanguages: "x".repeat(121) }, "otherLanguages"],
    [{ invoicesPerMonth: "a million" }, "invoicesPerMonth"],
    [{ hardestPart: "x".repeat(601) }, "hardestPart"]
  ];
  for (const [change, field] of cases) {
    const response = await join(Object.assign({}, ANSWERS, change));
    assert.equal(response.status, 400, field);
    assert.equal(response.json.field, field);
    assert.ok(response.json.error.length > 10, field);
  }
  assert.equal(site.supabase.waitlist.length, 0);
});

test("a form robot that fills in the hidden field is told it worked, and nothing is kept", async function () {
  const response = await join(Object.assign({}, ANSWERS, { website: "https://spam.example" }));
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { ok: true });
  assert.equal(site.supabase.waitlist.length, 0);
});

test("only this site's own page may send answers, and only by POST", async function () {
  assert.equal((await join(ANSWERS, { origin: "https://another.example" })).status, 403);
  assert.equal((await join(ANSWERS, { origin: "" })).status, 403, "a script that doesn't say where it's from");
  assert.equal((await httpClient(site).get("/api/waitlist")).status, 405);
  assert.equal(site.supabase.waitlist.length, 0);
});

test("before the table is made, the waitlist says it isn't open, and logs why", async function () {
  site.supabase.options.missingTables = true;
  const response = await join(ANSWERS);
  assert.equal(response.status, 503);
  assert.match(response.json.error, /isn't open/);
  assert.ok(site.serverLogs.some(function (line) {
    return line.startsWith("[findash-error] waitlist:");
  }));
});
