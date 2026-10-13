/* The dashboard's tools for AI agents in the browser (WebMCP). Chromium has
   no WebMCP outside its origin trial, so each test gives the page a
   stand-in document.modelContext that records registrations and checks them
   as the spec does, then calls the tools the way a browser's agent would. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { launchBrowser, openPage } from "../support/browser.mjs";

let site;
let browser;

before(async function () {
  site = await startSite();
  browser = await launchBrowser();
});

after(async function () {
  await browser.close();
  await site.stop();
});

/* A page with a stand-in WebMCP on document (or, with onNavigator, on
   navigator, as an early draft had it). */
async function pageWithWebMcp(onNavigator) {
  const page = await openPage(browser);
  await page.context().addInitScript(function (useNavigator) {
    const tools = new Map();
    const context = {
      registerTool: function (tool) {
        if (!tool.name || !tool.description || tools.has(tool.name) || typeof tool.execute !== "function") {
          return Promise.reject(new Error("invalid tool " + tool.name));
        }
        JSON.stringify(tool.inputSchema);
        tools.set(tool.name, tool);
        return Promise.resolve();
      }
    };
    window.__webmcpTools = tools;
    Object.defineProperty(useNavigator ? Navigator.prototype : Document.prototype, "modelContext", {
      get: function () {
        return context;
      },
      configurable: true
    });
  }, Boolean(onNavigator));
  return page;
}

async function openDashboard(page) {
  await page.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return window.__webmcpTools && window.__webmcpTools.size === 4;
  });
}

/* Calls a registered tool as an agent would; resolves to its result, or to
   { error } when the tool rejects. */
function callTool(page, name, input) {
  return page.evaluate(async function (call) {
    try {
      const result = await window.__webmcpTools.get(call.name).execute(call.input, { signal: new AbortController().signal });
      return typeof result === "string" && result.startsWith("{") ? JSON.parse(result) : result;
    } catch (error) {
      return { error: error.message };
    }
  }, { name: name, input: input });
}

const MONTHS = [
  { month: "October", year: 2026, revenue: 50000, budget: 45000, costs: { costOfGoodsSold: 20000, labor: 10000, rent: 6000 } },
  { month: 11, year: 2026, revenue: 40000, budget: 30000, costs: { costOfGoodsSold: 21000, labor: 11000, rent: 6000, marketing: 4000 } }
];

test("the dashboard registers four described tools, each with a JSON Schema for its input", async function () {
  const page = await pageWithWebMcp();
  await openDashboard(page);
  const tools = await page.evaluate(function () {
    return Array.from(window.__webmcpTools.values(), function (tool) {
      return { name: tool.name, description: tool.description, schemaType: tool.inputSchema.type,
        annotations: tool.annotations || {} };
    });
  });
  assert.deepEqual(tools.map(function (tool) {
    return tool.name;
  }), ["load_monthly_figures", "read_dashboard", "show_month", "download_template"]);
  for (const tool of tools) {
    assert.ok(tool.description.length > 40, tool.name);
    assert.equal(tool.schemaType, "object", tool.name);
  }
  assert.equal(tools[0].annotations.consequentialHint, true, "loading figures replaces the ones on screen");
  assert.equal(tools[1].annotations.readOnlyHint, true);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("an agent can read the demo, load an owner's figures, and they stay after a reload", async function () {
  const page = await pageWithWebMcp();
  await openDashboard(page);

  const demo = await callTool(page, "read_dashboard", {});
  assert.equal(demo.figures, "demo");
  assert.equal(demo.selectedMonth, "September 2026");
  assert.deepEqual(demo.months.map(function (month) {
    return [month.label, month.netProfit];
  }), [["July 2026", 7580], ["August 2026", 5420], ["September 2026", -3640]]);

  const loaded = await callTool(page, "load_monthly_figures", { months: MONTHS });
  assert.equal(loaded.figures, "the owner's");
  assert.equal(loaded.selectedMonth, "November 2026", "it opens on the latest month, as for a spreadsheet");
  assert.deepEqual(loaded.months.map(function (month) {
    return [month.label, month.totalCosts, month.netProfit, month.budgetUsedPercent];
  }), [["October 2026", 36000, 14000, 80], ["November 2026", 42000, -2000, 140]]);
  assert.deepEqual(await page.locator("#months button").allTextContents(), ["October 2026", "November 2026"]);
  assert.match(await page.locator("#status").textContent(), /2 months added by an AI assistant/);

  // The same answer the public API gives for the same months.
  const fromApi = await (await fetch(site.url + "/api/v1/analyze", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ months: MONTHS }) })).json();
  assert.deepEqual(loaded.months, fromApi.months);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return window.__webmcpTools && window.__webmcpTools.size === 4;
  });
  assert.equal((await callTool(page, "read_dashboard", {})).figures, "the owner's", "kept in this browser");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("figures an agent gets wrong are refused, naming the value, and the page is left as it was", async function () {
  const page = await pageWithWebMcp();
  await openDashboard(page);
  const result = await callTool(page, "load_monthly_figures", { months: [{ month: "Juli", year: 2026, revenue: 5,
    costs: { wages: 1 } }] });
  assert.match(result.error, /months\[0\]\.month/);
  assert.match(result.error, /months\[0\]\.costs\.wages/);
  assert.equal((await callTool(page, "read_dashboard", {})).figures, "demo");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("an agent can pick the month and period, and save the template", async function () {
  const page = await pageWithWebMcp();
  await openDashboard(page);
  const shown = await callTool(page, "show_month", { month: "July", period: "quarter" });
  assert.equal(shown.selectedMonth, "July 2026");
  assert.equal(shown.period, "quarter");
  assert.equal(shown.selectedPeriod.label, "Jul–Sep 2026");
  assert.equal(await page.getAttribute('#periods [data-period="quarter"]', "aria-pressed"), "true");
  assert.equal(await page.getAttribute('#months button[aria-pressed="true"]', "data-idx"), "0");

  assert.match((await callTool(page, "show_month", { month: "December" })).error, /No such month on file/);
  assert.match((await callTool(page, "show_month", { period: "decade" })).error, /period is one of/);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    callTool(page, "download_template", { format: "csv" })
  ]);
  assert.equal(download.suggestedFilename(), "findash-template.csv");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("the tools are offered where WebMCP is on navigator too, and the page works without WebMCP", async function () {
  const page = await pageWithWebMcp(true);
  await openDashboard(page);
  assert.equal((await callTool(page, "read_dashboard", {})).figures, "demo");
  await page.context().close();

  const plain = await openPage(browser);
  await plain.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  assert.equal(await plain.evaluate(function () {
    return "modelContext" in document;
  }), false);
  assert.deepEqual(await plain.locator("#months button").allTextContents(), ["July 2026", "August 2026", "September 2026"]);
  assert.deepEqual(plain.errors, []);
  await plain.context().close();
});
