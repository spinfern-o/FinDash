/* Before launch, the dashboard and the stock workspace are closed and send
   visitors to the waitlist; FINDASH_APP_OPEN=1 opens them. Every other page,
   the log in page among them, stays open either way. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { isClosedAppPage, appIsOpen, appStateScript } from "../../lib/app-gate.js";

const CLOSED = {};
const OPEN = { FINDASH_APP_OPEN: "1" };

test("the dashboard and the stock workspace are closed, however their address is written", function () {
  for (const address of ["/dashboard", "/dashboard.html", "/dashboard/", "/stock", "/stock.html", "/stock/"]) {
    assert.equal(isClosedAppPage(address, CLOSED), true, address);
  }
});

test("every other page stays open, the log in page and the dashboard's Markdown among them", function () {
  for (const address of ["/", "/index.html", "/waitlist", "/help", "/login", "/thanks", "/privacy",
    "/dashboard.md", "/dashboard/llms.txt", "/dashboards", "/stock-take"]) {
    assert.equal(isClosedAppPage(address, CLOSED), false, address);
  }
});

test("FINDASH_APP_OPEN=1 opens the app, and nothing else does", function () {
  assert.equal(appIsOpen(OPEN), true);
  assert.equal(isClosedAppPage("/dashboard", OPEN), false);
  for (const value of [undefined, "", "0", "true", "yes"]) {
    assert.equal(appIsOpen({ FINDASH_APP_OPEN: value }), false, String(value));
  }
});

test("the pages' script marks them open only when the app is open", function () {
  assert.match(appStateScript(OPEN), /document\.documentElement\.classList\.add\("app-open"\)/);
  assert.doesNotMatch(appStateScript(CLOSED), /app-open"\)/);
  assert.doesNotMatch(appStateScript({ FINDASH_APP_OPEN: "true" }), /app-open"\)/);
});
