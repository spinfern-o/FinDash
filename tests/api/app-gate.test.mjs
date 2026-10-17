/* The site as it is before launch: the dashboard and the stock workspace
   send visitors to the waitlist with a temporary redirect, and everything
   else (the home page, help, the log in page, the public API) still
   answers. Requests go through the real middleware.js, as on Vercel. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";

let site;

before(async function () {
  site = await startSite({ appClosed: true });
});

after(async function () {
  await site.stop();
});

function get(address) {
  return fetch(site.url + address, { redirect: "manual" });
}

test("the dashboard and the stock workspace send visitors to the waitlist", async function () {
  for (const address of ["/dashboard", "/dashboard.html", "/stock", "/stock.html"]) {
    const response = await get(address);
    assert.equal(response.status, 307, address);
    assert.equal(response.headers.get("location"), "/waitlist", address);
  }
});

test("the rest of the site and the public API stay open", async function () {
  for (const address of ["/", "/waitlist", "/help", "/login", "/privacy", "/dashboard.md", "/api/v1"]) {
    const response = await get(address);
    assert.equal(response.status, 200, address);
  }
});

test("/app-state.js tells the pages whether the app is open, and sets no cookie", async function () {
  const closed = await get("/app-state.js");
  assert.equal(closed.status, 200);
  assert.match(closed.headers.get("content-type"), /^text\/javascript/);
  assert.equal(closed.headers.get("set-cookie"), null);
  assert.doesNotMatch(await closed.text(), /app-open/);

  process.env.FINDASH_APP_OPEN = "1";
  try {
    const open = await get("/app-state.js");
    assert.match(await open.text(), /classList\.add\("app-open"\)/);
    assert.equal((await get("/dashboard")).status, 200, "and the dashboard is open");
  } finally {
    delete process.env.FINDASH_APP_OPEN;
  }
});
