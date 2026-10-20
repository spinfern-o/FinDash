/* Who gets Markdown: only a client that names text/markdown and prefers it
   to HTML, or one that asks for a page's .md address. Browsers, curl and
   crawlers that send wildcards keep getting the pages as before, with Link
   headers saying where everything for agents is. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prefersMarkdown, negotiate, pageLinks, markdownAddress } from "../../backend/lib/markdown-negotiation.js";
import { PAGES, NOT_FOUND, FILES, AGENT_VIEW, SECTION_INDEXES } from "../../backend/lib/markdown-pages.js";

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
const MARKDOWN = "text/markdown; charset=utf-8";

test("an Accept header that names Markdown and prefers it gets Markdown", function () {
  for (const accept of [
    "text/markdown",
    "text/x-markdown",
    "TEXT/MARKDOWN",
    "text/markdown; charset=utf-8",
    "text/markdown, text/html;q=0.9",
    "text/plain;q=0.5, text/markdown",
    "text/markdown, */*",
    "text/markdown;q=0.9, */*;q=0.1",
    "text/markdown, text/html",
    "text/markdown;q=0.8, text/*;q=0.8"
  ]) {
    assert.equal(prefersMarkdown(accept), true, accept);
  }
});

test("browsers, wildcards and HTML-first clients keep getting HTML", function () {
  for (const accept of [
    null,
    "",
    "*/*",
    "text/*",
    BROWSER,
    "text/html",
    "text/html, text/markdown",
    "text/html, text/markdown;q=0.9",
    "text/markdown;q=0",
    "text/markdown;q=0.5, */*",
    "application/json",
    "garbage"
  ]) {
    assert.equal(prefersMarkdown(accept), false, String(accept));
  }
});

test("a page asked for as Markdown, or at its .md address, gets its Markdown", function () {
  for (const page of Object.keys(PAGES)) {
    for (const [address, accept] of [[page, "text/markdown"], [markdownAddress(page), BROWSER]]) {
      const decision = negotiate("GET", address, accept, "");
      assert.equal(decision.action, "respond", address);
      assert.equal(decision.status, 200, address);
      assert.equal(decision.contentType, MARKDOWN, address);
      assert.equal(decision.body, PAGES[page], address);
      assert.equal(decision.headers.Vary, "Accept", address);
      assert.ok(decision.headers.Link.startsWith("<https://findash.tech" + page + '>; rel="canonical"'), address);
    }
  }
  assert.equal(markdownAddress("/"), "/index.md");
  assert.equal(negotiate("HEAD", "/", "text/markdown", "").action, "respond");
});

test("a page asked for as HTML is served as usual, with Vary and Link headers", function () {
  for (const page of Object.keys(PAGES)) {
    assert.deepEqual(negotiate("GET", page, BROWSER, ""),
      { action: "next", headers: { Vary: "Accept", Link: pageLinks(page) } }, page);
  }
  const links = pageLinks("/help");
  for (const expected of ['<https://findash.tech/help.md>; rel="alternate"; type="text/markdown"',
    '<https://findash.tech/sitemap.xml>; rel="sitemap"', '<https://findash.tech/llms.txt>; rel="describedby"',
    '<https://findash.tech/.well-known/api-catalog>; rel="api-catalog"',
    '<https://findash.tech/openapi.json>; rel="service-desc"', '<https://findash.tech/developers>; rel="service-doc"',
    '<https://findash.tech/.well-known/ai-catalog.json>; rel="ai-catalog"']) {
    assert.ok(links.includes(expected), expected);
  }
  assert.deepEqual(negotiate("GET", "/no-such-page", "*/*", ""), { action: "next", headers: { Vary: "Accept" } });
});

test("?mode=agent answers with the view for agents instead of the page", function () {
  for (const page of ["/", "/help"]) {
    const decision = negotiate("GET", page, BROWSER, "?mode=agent");
    assert.equal(decision.action, "respond", page);
    assert.equal(decision.contentType, MARKDOWN);
    assert.equal(decision.body, AGENT_VIEW);
  }
  assert.match(AGENT_VIEW, /^# FinDash\n/);
  assert.equal(negotiate("GET", "/", BROWSER, "?mode=human").action, "next");
});

test("each section's llms.txt is served from its own address", function () {
  assert.deepEqual(Object.keys(SECTION_INDEXES).sort(), ["/dashboard/llms.txt", "/developers/llms.txt", "/help/llms.txt"]);
  for (const [address, text] of Object.entries(SECTION_INDEXES)) {
    const decision = negotiate("GET", address, "*/*", "");
    assert.equal(decision.action, "respond", address);
    assert.equal(decision.contentType, "text/plain; charset=utf-8");
    assert.equal(decision.body, text);
    assert.match(text, /^# .*FinDash.*\n\n> /);
  }
});

test("an address with no page asked for as Markdown is a Markdown 404", function () {
  for (const address of ["/no-such-page", "/a/b/c", "/__probe-404", "/help/extra", "/missing.php", "/a/llms.txt",
    "/missing.md", "/.well-known/missing.json"]) {
    const decision = negotiate("GET", address, "text/markdown", "");
    assert.equal(decision.action, "respond", address);
    assert.equal(decision.status, 404, address);
    assert.equal(decision.body, NOT_FOUND, address);
  }
});

test("files are served as they are, whatever is asked for, including /.well-known/", function () {
  for (const address of ["/llms.txt", "/robots.txt", "/sitemap.xml", "/favicon.ico", "/data.json", "/dashboard.html",
    "/openapi.json", "/.well-known/api-catalog", "/.well-known/ai-catalog.json", "/.well-known/agent-skills/index.json",
    "/.well-known/agent-skills/findash/SKILL.md", "/schema-feed.jsonl", "/schemamap.xml"]) {
    assert.ok(FILES.includes(address), address + " is listed");
    assert.deepEqual(negotiate("GET", address, "text/markdown", ""), { action: "next", headers: {} }, address);
  }
});

test("other methods, and a page with a trailing slash, are left to the host", function () {
  assert.deepEqual(negotiate("POST", "/", "text/markdown", ""), { action: "next", headers: {} });
  assert.deepEqual(negotiate("OPTIONS", "/help", "text/markdown", ""), { action: "next", headers: {} });
  // Vercel redirects /help/ to /help, which then answers in Markdown.
  assert.deepEqual(negotiate("GET", "/help/", "text/markdown", ""), { action: "next", headers: { Vary: "Accept" } });
});
