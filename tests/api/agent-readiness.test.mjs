/* What an AI agent gets: every page as Markdown when it asks for it with
   "Accept: text/markdown", the same HTML as before for everyone else, a
   Markdown 404 that points to llms.txt and the sitemap, and files served as
   they are. Requests go through the real middleware.js, as on Vercel. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startSite } from "../support/site.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SITE = "https://findash.tech";
const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
const PAGES = {
  "/": "index.html",
  "/dashboard": "dashboard.html",
  "/restaurant-profit-and-loss": "restaurant-profit-and-loss.html",
  "/help": "help.html",
  "/developers": "developers.html",
  "/about": "about.html",
  "/contact": "contact.html",
  "/privacy": "privacy.html",
  "/terms": "terms.html",
  "/login": "login.html",
  "/thanks": "thanks.html"
};

let site;

before(async function () {
  site = await startSite();
});

after(async function () {
  await site.stop();
});

function get(address, accept, method) {
  const headers = accept === undefined ? {} : { accept: accept };
  return fetch(site.url + address, { method: method || "GET", headers: headers, redirect: "manual" });
}

function varies(response) {
  return (response.headers.get("vary") || "").split(",").map(function (part) {
    return part.trim().toLowerCase();
  }).includes("accept");
}

/* The text of each heading in a page's <main>, as a reader sees it. */
function headings(file) {
  const page = readFileSync(ROOT + "frontend/" + file, "utf8");
  const main = page.slice(page.indexOf("<main"), page.indexOf("</main>"));
  return Array.from(main.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/g), function (match) {
    return match[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'")
      .replace(/\s+/g, " ").trim();
  });
}

test("the home page answers Markdown to an agent and HTML to a browser, both marked Vary: Accept", async function () {
  const markdown = await get("/", "text/markdown");
  assert.equal(markdown.status, 200);
  assert.equal(markdown.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.ok(varies(markdown));
  assert.ok(markdown.headers.get("link").startsWith('<' + SITE + '/>; rel="canonical"; type="text/html", '));
  const text = await markdown.text();
  assert.match(text, /^# Free profit and loss \(P&L\) dashboard for small businesses\n/);
  assert.match(text, /## What is FinDash\?\n\nFinDash \(findash\.tech\) is a free web app/);
  assert.doesNotMatch(text, /<html|<div|<script/i);

  for (const accept of ["text/html", BROWSER, "*/*", undefined]) {
    const html = await get("/", accept);
    assert.equal(html.status, 200, String(accept));
    assert.equal(html.headers.get("content-type"), "text/html; charset=utf-8", String(accept));
    assert.ok(varies(html), String(accept) + ": Vary: Accept on the HTML too");
    assert.match(await html.text(), /^<!DOCTYPE html>/, String(accept));
  }
});

test("every page has a Markdown version with each of its headings, and HEAD answers without a body", async function () {
  for (const [address, file] of Object.entries(PAGES)) {
    const response = await get(address, "text/markdown");
    assert.equal(response.status, 200, address);
    assert.equal(response.headers.get("content-type"), "text/markdown; charset=utf-8", address);
    assert.ok(varies(response), address);
    const text = await response.text();
    assert.ok(text.length > 500, address + " has real content");
    for (const heading of headings(file)) {
      assert.ok(text.includes("# " + heading), address + " keeps the heading " + JSON.stringify(heading));
    }
    assert.ok(text.includes("This is the Markdown version of " + SITE + address + "."), address);
  }
  const head = await get("/help", "text/markdown", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.equal(await head.text(), "");
});

test("every link in the Markdown is a full address, and every link to this site works", async function () {
  for (const address of Object.keys(PAGES)) {
    const text = await (await get(address, "text/markdown")).text();
    const links = Array.from(text.matchAll(/\]\(([^)\s]+)\)/g), function (match) {
      return match[1];
    });
    assert.ok(links.length > 0, address);
    for (const link of links) {
      assert.match(link, /^(https:\/\/|mailto:)/, address + " links " + link);
      if (link.startsWith(SITE)) {
        const path = link.slice(SITE.length).split("#")[0] || "/";
        assert.equal((await get(path, BROWSER)).status, 200, address + " links " + link);
      }
    }
  }
});

test("an address with no page answers 404: Markdown for an agent, the HTML page for a browser", async function () {
  for (const address of ["/__ora-404-probe-6ru3ov5q", "/a/b/c", "/missing.php"]) {
    const response = await get(address, "text/markdown");
    assert.equal(response.status, 404, address);
    assert.equal(response.headers.get("content-type"), "text/markdown; charset=utf-8", address);
    assert.ok(varies(response), address);
    const text = await response.text();
    assert.match(text, /^# Page not found\n\nThere's nothing at this address\./, address);
    assert.ok(text.includes("(" + SITE + "/llms.txt)"), address + " links llms.txt");
    assert.ok(text.includes("(" + SITE + "/sitemap.xml)"), address + " links the sitemap");
    assert.ok(text.includes("(" + SITE + "/help)"), address + " links the help");
  }
  const html = await get("/__ora-404-probe-6ru3ov5q", BROWSER);
  assert.equal(html.status, 404);
  assert.equal(html.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(await html.text(), /<h1>Page not found<\/h1>/);
});

test("files and server functions are served as they are, even to an agent asking for Markdown", async function () {
  const expected = {
    "/llms.txt": "text/plain; charset=utf-8",
    "/robots.txt": "text/plain; charset=utf-8",
    "/sitemap.xml": "application/xml",
    "/favicon.ico": "image/x-icon",
    "/css/site.css": "text/css",
    "/js/theme-init.js": "text/javascript"
  };
  for (const [address, type] of Object.entries(expected)) {
    const response = await get(address, "text/markdown");
    assert.equal(response.status, 200, address);
    assert.equal(response.headers.get("content-type"), type, address);
  }
  const capabilities = await get("/api/capabilities", "text/markdown");
  assert.equal(capabilities.status, 200);
  assert.equal(capabilities.headers.get("content-type"), "application/json");
});

test("the generated Markdown, page heads and structured data are up to date with the pages", function () {
  const result = spawnSync("python3", ["tools/build-pages.py", "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("every page has a .md twin, and ?mode=agent answers with the view for agents", async function () {
  for (const address of Object.keys(PAGES)) {
    const twin = address === "/" ? "/index.md" : address + ".md";
    const response = await get(twin, BROWSER);
    assert.equal(response.status, 200, twin);
    assert.equal(response.headers.get("content-type"), "text/markdown; charset=utf-8", twin);
    const text = await response.text();
    assert.match(text, /^# /, twin + " starts with a heading");
    assert.equal(text, await (await get(address, "text/markdown")).text(), twin + " is the page's Markdown");
  }
  const agent = await get("/?mode=agent", BROWSER);
  assert.equal(agent.status, 200);
  assert.equal(agent.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.equal(await agent.text(), readFileSync(ROOT + "frontend/llms.txt", "utf8"));
});

test("every page sends Link headers to its Markdown, the sitemap, llms.txt and the API's descriptions", async function () {
  for (const address of Object.keys(PAGES)) {
    const response = await get(address, BROWSER);
    const links = response.headers.get("link");
    const twin = address === "/" ? "/index.md" : address + ".md";
    assert.ok(links.includes("<" + SITE + twin + '>; rel="alternate"; type="text/markdown"'), address);
    for (const [target, relation] of [["/sitemap.xml", "sitemap"], ["/llms.txt", "describedby"],
      ["/.well-known/api-catalog", "api-catalog"], ["/openapi.json", "service-desc"], ["/developers", "service-doc"],
      ["/.well-known/ai-catalog.json", "ai-catalog"]]) {
      assert.ok(links.includes("<" + SITE + target + '>; rel="' + relation + '"'), address + " " + relation);
      assert.equal((await get(target, BROWSER)).status, 200, target);
    }
  }
});

test("llms.txt links an index for each section, and each one links its parts", async function () {
  const root = await (await get("/llms.txt")).text();
  for (const section of ["/help", "/dashboard", "/developers"]) {
    assert.ok(root.includes("(" + SITE + section + "/llms.txt)"), "llms.txt links " + section + "/llms.txt");
    const response = await get(section + "/llms.txt");
    assert.equal(response.status, 200, section);
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
    const text = await response.text();
    assert.ok(text.includes(SITE + section + ".md"), section + " links its Markdown");
    const parts = Array.from(text.matchAll(/\(https:\/\/findash\.tech\/([a-z-]+)#([a-z-]+)\)/g));
    assert.ok(parts.length >= 1, section + " links its sections");
    const page = readFileSync(ROOT + "frontend/" + section.slice(1) + ".html", "utf8");
    for (const part of parts) {
      assert.ok(page.includes('id="' + part[2] + '"'), section + "#" + part[2] + " exists");
    }
  }
});

test("robots.txt names the Schema Map, which lists a feed of every page's structured data", async function () {
  const robots = await (await get("/robots.txt")).text();
  assert.match(robots, /^schemamap: https:\/\/findash\.tech\/schemamap\.xml$/m);
  const map = await (await get("/schemamap.xml")).text();
  assert.match(map, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"\s+xmlns:sf="http:\/\/schema\.org\/schemas\/schemafeed\/0\.1">/);
  assert.match(map, /<loc>https:\/\/findash\.tech\/schema-feed\.jsonl<\/loc>\s*<sf:contentType>structuredData\/schema\.org<\/sf:contentType>/);

  const feed = await get("/schema-feed.jsonl");
  assert.equal(feed.headers.get("content-type"), "application/x-jsonlines; charset=utf-8");
  const items = (await feed.text()).trim().split("\n").map(function (line) {
    return JSON.parse(line);
  });
  const types = new Set();
  for (const item of items) {
    assert.equal(item["@context"], "https://schema.org");
    assert.ok(item["@type"] && item["@id"], JSON.stringify(item).slice(0, 80));
    types.add(item["@type"]);
  }
  for (const type of ["WebSite", "Organization", "WebApplication", "FAQPage", "AboutPage", "ContactPage", "WebAPI"]) {
    assert.ok(types.has(type), "the feed has the " + type);
  }
  // The same objects the pages carry, word for word.
  for (const [address, file] of Object.entries(PAGES)) {
    const page = readFileSync(ROOT + "frontend/" + file, "utf8");
    for (const block of page.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)) {
      for (const node of JSON.parse(block[1])["@graph"]) {
        const inFeed = items.find(function (item) {
          return item["@id"] === node["@id"];
        });
        assert.deepEqual(inFeed, Object.assign({ "@context": "https://schema.org" }, node), address + " " + node["@id"]);
      }
    }
  }
});
