/* The waitlist (api/waitlist.js), against the stand-in for Supabase: an
   email is kept, cleaned up, and nothing else; each email once; a bad one
   is refused; robots and other sites get nothing stored; and a site whose
   table isn't ready says so. */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { httpClient } from "../support/http-client.mjs";

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

test("an email is kept, trimmed and in lower case, and nothing else is stored", async function () {
  const response = await join({ email: "  Owner@Example.TEST ", website: "" });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { ok: true });
  assert.equal(site.supabase.waitlist.length, 1);
  const row = Object.assign({}, site.supabase.waitlist[0]);
  delete row.created_at;
  assert.deepEqual(row, { email: "owner@example.test" });
});

test("anything else sent along is ignored", async function () {
  const response = await join({ email: "short@example.test", businessType: "restaurant", hardestPart: "x" });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(site.supabase.waitlist[0]).sort(), ["created_at", "email"]);
});

test("joining twice keeps one entry, and says nothing about who is already listed", async function () {
  assert.equal((await join({ email: "owner@example.test" })).status, 200);
  const again = await join({ email: "OWNER@example.test" });
  assert.equal(again.status, 200);
  assert.deepEqual(again.json, { ok: true });
  assert.equal(site.supabase.waitlist.length, 1);
});

test("an email that can't be used is refused, naming the email", async function () {
  for (const email of ["not an email", "", "a".repeat(250) + "@x.co", 42]) {
    const response = await join({ email: email });
    assert.equal(response.status, 400, String(email));
    assert.equal(response.json.field, "email");
    assert.equal(response.json.error, "Enter a valid email address.");
  }
  assert.equal(site.supabase.waitlist.length, 0);
});

test("a form robot that fills in the hidden field is told it worked, and nothing is kept", async function () {
  const response = await join({ email: "robot@example.test", website: "https://spam.example" });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { ok: true });
  assert.equal(site.supabase.waitlist.length, 0);
});

test("only this site's own page may send an email, and only by POST", async function () {
  const answers = { email: "owner@example.test" };
  assert.equal((await join(answers, { origin: "https://another.example" })).status, 403);
  assert.equal((await join(answers, { origin: "" })).status, 403, "a script that doesn't say where it's from");
  assert.equal((await httpClient(site).get("/api/waitlist")).status, 405);
  assert.equal(site.supabase.waitlist.length, 0);
});

test("before the table is made, the waitlist says it isn't open, and logs why", async function () {
  site.supabase.options.missingTables = true;
  const response = await join({ email: "owner@example.test" });
  assert.equal(response.status, 503);
  assert.match(response.json.error, /isn't open/);
  assert.ok(site.serverLogs.some(function (line) {
    return line.startsWith("[findash-error] waitlist:");
  }));
});

test("before the email-only change is run, the waitlist says it isn't open rather than failing", async function () {
  site.supabase.options.waitlistNeedsAnswers = true;
  const response = await join({ email: "owner@example.test" });
  assert.equal(response.status, 503);
  assert.match(response.json.error, /isn't open/);
  assert.equal(site.supabase.waitlist.length, 0);
});
