/* The public API and the MCP servers, called the way developers and AI
   agents call them: every answer checked against the OpenAPI description,
   every error JSON with a code and a hint, the MCP servers through the
   official MCP client, and the discovery files (API catalog, AI Catalog,
   Server Cards, agent skills index) checked against their specs. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { validate as validateOpenApi } from "@readme/openapi-parser";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startSite } from "../support/site.mjs";
import { PAGES, PAGE_INFO } from "../../lib/markdown-pages.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SITE = "https://findash.tech";
const JULY = { month: "July", year: 2026, revenue: 72000, budget: 66000,
  costs: { costOfGoodsSold: 26000, labor: 12000, employeeMeals: 2500, payrollTax: 5000, packaging: 3400,
    creditCardFees: 2150, marketing: 2200, utilities: 2800, maintenance: 950, rent: 6000, insurance: 1100, telephone: 320 } };
const SEPTEMBER = { month: 9, year: 2026, revenue: 33000, budget: 34000,
  costs: { costOfGoodsSold: 11000, labor: 3500, employeeMeals: 500, payrollTax: 5200, packaging: 1350, creditCardFees: 910,
    marketing: 900, hardware: 2400, utilities: 1900, maintenance: 310, rent: 6000, insurance: 1100, businessLicense: 1250,
    telephone: 320 } };

let site;
let openapi;
let ajv;

before(async function () {
  site = await startSite();
  openapi = JSON.parse(readFileSync(ROOT + "frontend/openapi.json", "utf8"));
  ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema({ $id: "openapi", components: openapi.components });
  ajv.addSchema(JSON.parse(readFileSync(ROOT + "tests/fixtures/mcp-server-card.schema.json", "utf8")), "server-card");
});

after(async function () {
  await site.stop();
});

/* A findash.tech address, on the test site. */
function local(url) {
  return site.url + url.slice(SITE.length);
}

function post(path, body, headers) {
  return fetch(site.url + path, {
    method: "POST",
    headers: Object.assign({ "content-type": "application/json" }, headers || {}),
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

/* Asserts `value` matches the OpenAPI component schema `name`. */
function assertMatches(name, value, label) {
  const check = ajv.getSchema("openapi#/components/schemas/" + name);
  assert.ok(check(value), (label || name) + ": " + ajv.errorsText(check.errors));
}

async function assertError(response, status, code, label) {
  assert.equal(response.status, status, label);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8", label);
  const body = await response.json();
  assertMatches("Error", body, label);
  assert.equal(body.error.code, code, label);
  assert.ok(body.error.hint.length > 10, label + " has a hint");
  return body.error;
}

test("the OpenAPI description is valid and covers exactly what the API serves", async function () {
  const result = await validateOpenApi(ROOT + "frontend/openapi.json");
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(openapi.openapi, "3.1.0");
  assert.deepEqual(openapi.servers, [{ url: SITE }]);
  assert.deepEqual(openapi.security, [], "no authentication");
  assert.deepEqual(Object.keys(openapi.paths).sort(), ["/api/v1", "/api/v1/analyze", "/api/v1/glossary", "/api/v1/template"]);
  const served = await fetch(site.url + "/openapi.json");
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await served.json(), openapi);
  const example = openapi.paths["/api/v1/analyze"].post.requestBody.content["application/json"].example;
  assertMatches("AnalyzeRequest", example, "the documented example request");
});

test("every answer matches its schema in the OpenAPI description", async function () {
  const index = await fetch(site.url + "/api/v1");
  assert.equal(index.status, 200);
  assert.equal(index.headers.get("access-control-allow-origin"), "*");
  const indexBody = await index.json();
  assertMatches("ApiIndex", indexBody);
  assert.equal(indexBody.openapi, SITE + "/openapi.json");
  assert.deepEqual(indexBody.mcp, { product: SITE + "/api/mcp", docs: SITE + "/api/mcp/docs" });

  const template = await (await fetch(site.url + "/api/v1/template")).json();
  assertMatches("Template", template);
  assert.match(template.csvHeader, /^Month,Year,Revenue,Budget,Cost of goods sold,Labor,/);

  const glossary = await (await fetch(site.url + "/api/v1/glossary")).json();
  assertMatches("Glossary", glossary);

  const request = { currency: "usd", months: [SEPTEMBER, JULY] };
  assertMatches("AnalyzeRequest", request);
  const response = await post("/api/v1/analyze", request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const summary = await response.json();
  assertMatches("Summary", summary);
  assert.equal(summary.currency, "USD");
  assert.deepEqual(summary.months.map(function (month) {
    return [month.label, month.totalCosts, month.netProfit, month.budgetUsedPercent];
  }), [["July 2026", 64420, 7580, 97.61], ["September 2026", 36640, -3640, 107.76]]);
  assert.deepEqual(summary.needsAttention.map(function (item) {
    return item.kind;
  }), ["loss", "over-budget"]);
});

test("every error is JSON with a code, a hint and where it is documented", async function () {
  await assertError(await post("/api/v1/analyze", "{not json"), 400, "invalid_json", "bad JSON");
  await assertError(await post("/api/v1/analyze", "[1, 2]"), 400, "invalid_json", "an array");
  await assertError(await post("/api/v1/analyze", "months", { "content-type": "text/plain" }), 400, "invalid_json", "text");
  const figures = await assertError(await post("/api/v1/analyze", { months: [{ month: "Juli", year: 2026, revenue: 5,
    costs: { wages: 1 } }] }), 400, "invalid_figures", "bad figures");
  assert.deepEqual(figures.problems.map(function (problem) {
    return problem.field;
  }), ["months[0].month", "months[0].costs.wages"]);
  assert.equal(figures.docs, SITE + "/developers#errors");
  await assertError(await post("/api/v1/analyze", { months: [JULY], extra: 1 }), 400, "invalid_figures", "unknown field");
  await assertError(await post("/api/v1/analyze", { months: [JULY], currency: "dollars" }), 400, "invalid_figures", "currency");
  await assertError(await post("/api/v1/analyze", { months: new Array(121).fill(JULY) }), 400, "invalid_figures", "121 months");
  await assertError(await post("/api/v1/analyze", { months: [JULY], padding: "x".repeat(250000) }), 413, "too_large", "big");

  const wrongMethod = await fetch(site.url + "/api/v1/analyze");
  assert.equal(wrongMethod.headers.get("allow"), "POST, OPTIONS");
  await assertError(wrongMethod, 405, "method_not_allowed", "GET analyze");
  await assertError(await post("/api/v1/glossary", {}), 405, "method_not_allowed", "POST glossary");
  await assertError(await fetch(site.url + "/api/v1/no-such-thing"), 404, "not_found", "unknown endpoint");
  await assertError(await fetch(site.url + "/api/agent"), 404, "not_found", "the function itself");

  const preflight = await fetch(site.url + "/api/v1/analyze", { method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
});

test("the developers page's example request works, and its example answer is what comes back", async function () {
  const page = readFileSync(ROOT + "frontend/developers.html", "utf8");
  const command = /<pre class="code-block" id="example-request"><code>([\s\S]*?)<\/code><\/pre>/.exec(page)[1];
  assert.match(command, /^curl -sS https:\/\/findash\.tech\/api\/v1\/analyze/);
  const body = JSON.parse(/-d '([\s\S]*?)'$/.exec(command)[1]);
  const summary = await (await post("/api/v1/analyze", body)).json();
  const shown = /<pre class="code-block" id="example-response"><code>([\s\S]*?)<\/code><\/pre>/.exec(page)[1];
  const month = summary.months[0];
  for (const [key, value] of Object.entries({ totalCosts: month.totalCosts, grossProfit: month.grossProfit,
    netProfit: month.netProfit, netMarginPercent: month.netMarginPercent, budgetUsedPercent: month.budgetUsedPercent })) {
    assert.ok(shown.includes(`"${key}": ${value}`), `the page shows ${key} as ${value}`);
  }
  assert.ok(shown.includes(JSON.stringify(month.costGroups).replace(/:/g, ": ").replace(/,/g, ", ").replace("{", "{ ")
    .replace("}", " }")), "the page shows the cost groups as they come back");
});

test("the API catalog (RFC 9727) points to the API, its OpenAPI description and its docs", async function () {
  const response = await fetch(site.url + "/.well-known/api-catalog");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"),
    'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"');
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const { linkset } = await response.json();
  assert.equal(linkset[0].anchor, SITE + "/.well-known/api-catalog");
  assert.deepEqual(linkset[0].item.map(function (link) {
    return link.href;
  }), [SITE + "/api/v1"]);
  const api = linkset.find(function (entry) {
    return entry.anchor === SITE + "/api/v1";
  });
  assert.equal(api["service-desc"][0].href, SITE + "/openapi.json");
  assert.equal(api["service-desc"][0].type, "application/vnd.oai.openapi+json");
  assert.equal(api["service-doc"][0].href, SITE + "/developers");
  for (const href of [linkset[0].item[0].href, api["service-desc"][0].href, api["service-doc"][0].href]) {
    assert.equal((await fetch(local(href))).status, 200, href);
  }
});

async function mcpClient(path) {
  const client = new Client({ name: "findash-tests", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(site.url + path)));
  return client;
}

function toolText(result) {
  return result.content.map(function (part) {
    return part.text;
  }).join("");
}

test("the product MCP server offers its tools and works out figures exactly as the API does", async function () {
  const client = await mcpClient("/api/mcp");
  assert.equal(client.getServerVersion().name, "tech.findash/findash");
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(function (tool) {
    return tool.name;
  }).sort(), ["analyze_monthly_figures", "explain_term", "get_spreadsheet_template"]);
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true, tool.name);
    assert.ok(tool.description.length > 40, tool.name);
  }

  const months = [JULY, SEPTEMBER];
  const result = await client.callTool({ name: "analyze_monthly_figures", arguments: { months: months } });
  assert.notEqual(result.isError, true);
  const fromApi = await (await post("/api/v1/analyze", { months: months })).json();
  assert.deepEqual(result.structuredContent, fromApi);
  assert.deepEqual(JSON.parse(toolText(result)), fromApi);

  const wrong = await client.callTool({ name: "analyze_monthly_figures",
    arguments: { months: [{ month: "Juli", year: 2026, revenue: 1 }] } });
  assert.equal(wrong.isError, true);
  assert.match(toolText(wrong), /months\[0\]\.month/);

  assert.match(toolText(await client.callTool({ name: "explain_term", arguments: { term: "net margin" } })),
    /^Net margin: /);
  assert.match(toolText(await client.callTool({ name: "get_spreadsheet_template", arguments: {} })), /"csvHeader"/);
  await client.close();
});

test("the docs MCP server lists, reads and searches every page", async function () {
  const client = await mcpClient("/api/mcp/docs");
  assert.equal(client.getServerVersion().name, "tech.findash/docs");
  const pages = JSON.parse(toolText(await client.callTool({ name: "list_pages", arguments: {} })));
  const listed = Object.keys(PAGE_INFO).filter(function (path) {
    return PAGE_INFO[path].listed;
  });
  assert.deepEqual(pages.map(function (page) {
    return page.url;
  }), listed.map(function (path) {
    return SITE + path;
  }));
  for (const page of pages) {
    assert.equal((await fetch(local(page.markdown))).status, 200, page.markdown);
  }

  for (const address of ["/help", SITE + "/help", "help", "/help.md"]) {
    assert.equal(toolText(await client.callTool({ name: "read_page", arguments: { page: address } })), PAGES["/help"], address);
  }
  assert.equal(toolText(await client.callTool({ name: "read_page", arguments: { page: "/" } })), PAGES["/"]);
  assert.equal((await client.callTool({ name: "read_page", arguments: { page: "/nope" } })).isError, true);

  const found = JSON.parse(toolText(await client.callTool({ name: "search_docs", arguments: { query: "prime cost" } })));
  assert.equal(found[0].page, SITE + "/restaurant-profit-and-loss");
  await client.close();
});

test("each MCP server has a valid Server Card, listed in the AI Catalog, and answers GET with a JSON-RPC error", async function () {
  const catalogResponse = await fetch(site.url + "/.well-known/ai-catalog.json");
  assert.equal(catalogResponse.headers.get("content-type"), "application/ai-catalog+json");
  assert.equal(catalogResponse.headers.get("access-control-allow-origin"), "*");
  const catalog = await catalogResponse.json();
  assert.equal(catalog.specVersion, "1.0");
  assert.equal(catalog.host.displayName, "FinDash");
  assert.equal(catalog.entries.length, 2);

  const checkCard = ajv.getSchema("server-card#/$defs/ServerCard");
  for (const entry of catalog.entries) {
    assert.match(entry.identifier, /^urn:air:findash\.tech:mcp:[a-z]+$/);
    assert.equal(entry.type, "application/mcp-server-card+json");
    const response = await fetch(local(entry.url), { headers: { accept: "application/mcp-server-card+json" } });
    assert.equal(response.status, 200, entry.url);
    assert.equal(response.headers.get("content-type"), "application/mcp-server-card+json");
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
    const card = await response.json();
    assert.ok(checkCard(card), entry.url + ": " + ajv.errorsText(checkCard.errors));

    // The card is at <server URL>/server-card, and says what the server says once connected.
    const remote = card.remotes[0];
    assert.equal(remote.type, "streamable-http");
    assert.equal(entry.url, remote.url + "/server-card");
    const client = await mcpClient(remote.url.slice(SITE.length));
    assert.equal(client.getServerVersion().name, card.name);
    assert.equal(client.getServerVersion().version, card.version);
    assert.ok(remote.supportedProtocolVersions.includes(client.transport.protocolVersion));
    await client.close();

    const again = await fetch(local(entry.url), { headers: { "if-none-match": response.headers.get("etag") } });
    assert.equal(again.status, 304, "unchanged cards answer 304");

    const get = await fetch(local(remote.url));
    assert.equal(get.status, 405);
    assert.equal((await get.json()).jsonrpc, "2.0");
  }
});

test("the agent skill is published with an index whose digest matches it", async function () {
  const response = await fetch(site.url + "/.well-known/agent-skills/index.json");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const index = await response.json();
  assert.equal(index.$schema, "https://schemas.agentskills.io/discovery/0.2.0/schema.json");
  assert.equal(index.skills.length, 1);
  const skill = index.skills[0];
  assert.deepEqual(Object.keys(skill).sort(), ["description", "digest", "name", "type", "url"]);
  assert.equal(skill.name, "findash");
  assert.equal(skill.type, "skill-md");
  assert.ok(skill.description.length <= 1024);

  const file = await fetch(site.url + skill.url);
  assert.equal(file.headers.get("content-type"), "text/markdown; charset=utf-8");
  const bytes = Buffer.from(await file.arrayBuffer());
  assert.equal(skill.digest, "sha256:" + createHash("sha256").update(bytes).digest("hex"));
  assert.equal(bytes.toString("utf8"), readFileSync(ROOT + "skills/findash/SKILL.md", "utf8"), "the same as in the repository");
  const frontmatter = /^---\nname: (.*)\ndescription: (.*)\n---\n/.exec(bytes.toString("utf8"));
  assert.deepEqual([frontmatter[1], frontmatter[2]], [skill.name, skill.description]);
  assert.ok(bytes.toString("utf8").includes("https://findash.tech/api/v1/analyze"));
});
