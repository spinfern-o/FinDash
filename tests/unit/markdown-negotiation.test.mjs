/* Who gets Markdown: only a client that names text/markdown and prefers it
   to HTML. Browsers, curl and crawlers that send wildcards keep getting the
   pages as before. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prefersMarkdown, negotiate } from "../../lib/markdown-negotiation.js";
import { PAGES, NOT_FOUND, FILES } from "../../lib/markdown-pages.js";

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

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

test("a page asked for as Markdown gets its Markdown and its HTML address as canonical", function () {
  for (const address of Object.keys(PAGES)) {
    const decision = negotiate("GET", address, "text/markdown");
    assert.equal(decision.action, "markdown", address);
    assert.equal(decision.status, 200, address);
    assert.equal(decision.body, PAGES[address], address);
    assert.equal(decision.canonical, "https://findash.tech" + address, address);
  }
  assert.equal(negotiate("HEAD", "/", "text/markdown").action, "markdown");
});

test("a page asked for as HTML is served as usual, marked as depending on Accept", function () {
  assert.deepEqual(negotiate("GET", "/", BROWSER), { action: "next", vary: true });
  assert.deepEqual(negotiate("GET", "/help", "text/html"), { action: "next", vary: true });
  assert.deepEqual(negotiate("GET", "/no-such-page", "*/*"), { action: "next", vary: true });
});

test("an address with no page asked for as Markdown is a Markdown 404", function () {
  for (const address of ["/no-such-page", "/a/b/c", "/__probe-404", "/help/extra", "/missing.php", "/a/llms.txt"]) {
    const decision = negotiate("GET", address, "text/markdown");
    assert.equal(decision.action, "markdown", address);
    assert.equal(decision.status, 404, address);
    assert.equal(decision.body, NOT_FOUND, address);
  }
});

test("files are served as they are, whatever is asked for", function () {
  assert.ok(FILES.includes("llms.txt") && FILES.includes("robots.txt") && FILES.includes("favicon.ico"));
  for (const address of ["/llms.txt", "/robots.txt", "/sitemap.xml", "/favicon.ico", "/data.json", "/dashboard.html"]) {
    assert.deepEqual(negotiate("GET", address, "text/markdown"), { action: "next", vary: false }, address);
  }
});

test("other methods, and a page with a trailing slash, are left to the host", function () {
  assert.deepEqual(negotiate("POST", "/", "text/markdown"), { action: "next", vary: false });
  assert.deepEqual(negotiate("OPTIONS", "/help", "text/markdown"), { action: "next", vary: false });
  // Vercel redirects /help/ to /help, which then answers in Markdown.
  assert.deepEqual(negotiate("GET", "/help/", "text/markdown"), { action: "next", vary: true });
});
