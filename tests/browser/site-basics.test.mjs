/* The things every real website needs, checked on every page: titles and
   descriptions, the preview shown when a link is shared, icons, robots.txt
   and the sitemap for search engines, a proper 404 page, text alternatives
   for images, layouts that fit a phone, the sticky phone button, the cookie
   notice, footer links to the privacy policy, terms and a contact address,
   and analytics. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSite } from "../support/site.mjs";
import { launchBrowser, openPage, text } from "../support/browser.mjs";

const SITE = "https://findash.tech";
// Listed by search engines, and in the sitemap.
const LISTED_PAGES = ["/", "/dashboard", "/restaurant-profit-and-loss", "/help", "/waitlist", "/developers", "/about",
  "/contact", "/privacy", "/terms"];
// Kept out of search results: nothing on them is worth finding by search.
const UNLISTED_PAGES = ["/stock", "/login", "/thanks", "/no-such-page"];
const ALL_PAGES = LISTED_PAGES.concat(UNLISTED_PAGES);
const SUPPORT = "support.findash@findash.tech";

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

async function visit(page, address) {
  await page.goto(site.url + address, { waitUntil: "networkidle" });
  await page.waitForTimeout(200);
}

function headTags(page) {
  return page.evaluate(function () {
    function content(selector) {
      const element = document.querySelector(selector);
      if (!element) {
        return null;
      }
      return element.getAttribute("content") || element.getAttribute("href");
    }
    return {
      title: document.title,
      description: content('meta[name="description"]'),
      canonical: content('link[rel="canonical"]'),
      robots: content('meta[name="robots"]'),
      ogTitle: content('meta[property="og:title"]'),
      ogDescription: content('meta[property="og:description"]'),
      ogUrl: content('meta[property="og:url"]'),
      ogImage: content('meta[property="og:image"]'),
      twitterCard: content('meta[name="twitter:card"]'),
      icon: content('link[rel="icon"][href="/favicon.ico"]'),
      appleIcon: content('link[rel="apple-touch-icon"]'),
      manifest: content('link[rel="manifest"]'),
      analytics: Boolean(document.querySelector('script[src="/_vercel/insights/script.js"]')),
      analyticsQueue: typeof window.va === "function"
    };
  });
}

/* Width and height of a PNG, from its header. */
function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("every page has its own title and description, a canonical address and a share preview", async function () {
  const page = await openPage(browser);
  const titles = new Set();
  const descriptions = new Set();
  for (const address of LISTED_PAGES) {
    await visit(page, address);
    const tags = await headTags(page);
    assert.ok(tags.title.includes("FinDash"), address);
    assert.ok(tags.description.length >= 50 && tags.description.length <= 160,
      address + ": a description of 50 to 160 characters, as search results show");
    assert.equal(tags.canonical, SITE + address, address);
    assert.equal(tags.robots, null, address + " may be listed");
    assert.equal(tags.ogTitle, tags.title, address);
    assert.equal(tags.ogDescription, tags.description, address);
    assert.equal(tags.ogUrl, tags.canonical, address);
    assert.equal(tags.ogImage, SITE + "/og-image.png", address);
    assert.equal(tags.twitterCard, "summary_large_image", address);
    titles.add(tags.title);
    descriptions.add(tags.description);
  }
  assert.equal(titles.size, LISTED_PAGES.length, "no two pages share a title");
  assert.equal(descriptions.size, LISTED_PAGES.length, "no two pages share a description");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("the log in, thank-you and 404 pages are kept out of search results", async function () {
  const page = await openPage(browser, { ignore: /status of 404/ });
  for (const address of UNLISTED_PAGES) {
    await visit(page, address);
    const tags = await headTags(page);
    assert.equal(tags.robots, "noindex", address);
    assert.equal(tags.canonical, null, address);
  }
  await page.context().close();
});

test("every page links the icons and the manifest, and loads analytics", async function () {
  const page = await openPage(browser, { ignore: /status of 404/ });
  for (const address of ALL_PAGES) {
    await visit(page, address);
    const tags = await headTags(page);
    assert.equal(tags.icon, "/favicon.ico", address);
    assert.equal(tags.appleIcon, "/apple-touch-icon.png", address);
    assert.equal(tags.manifest, "/site.webmanifest", address);
    assert.ok(tags.analytics, address + ": Vercel Web Analytics");
    assert.ok(tags.analyticsQueue, address);
  }
  await page.context().close();
});

test("the icons, the share image and the manifest exist at the right sizes", async function () {
  const page = await openPage(browser);
  const sizes = {
    "/icon-192.png": 192,
    "/icon-512.png": 512,
    "/icon-maskable-512.png": 512,
    "/apple-touch-icon.png": 180
  };
  for (const [address, size] of Object.entries(sizes)) {
    const response = await page.request.get(site.url + address);
    assert.equal(response.status(), 200, address);
    assert.deepEqual(pngSize(await response.body()), { width: size, height: size }, address);
  }
  const favicon = await page.request.get(site.url + "/favicon.ico");
  assert.equal(favicon.status(), 200);
  assert.equal(favicon.headers()["content-type"], "image/x-icon");

  const shareImage = await page.request.get(site.url + "/og-image.png");
  assert.deepEqual(pngSize(await shareImage.body()), { width: 1200, height: 630 }, "the size link previews use");

  const manifest = await (await page.request.get(site.url + "/site.webmanifest")).json();
  assert.equal(manifest.name, "FinDash");
  assert.ok(manifest.icons.some(function (icon) {
    return icon.purpose === "maskable";
  }));
  for (const icon of manifest.icons) {
    assert.equal((await page.request.get(site.url + icon.src)).status(), 200, icon.src);
  }
  await page.context().close();
});

test("robots.txt lets search engines in, keeps them out of /api/, and names the sitemap", async function () {
  const page = await openPage(browser);
  const response = await page.request.get(site.url + "/robots.txt");
  assert.equal(response.status(), 200);
  const robots = await response.text();
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, new RegExp("^Sitemap: " + SITE + "/sitemap\\.xml$", "m"));
  assert.match(robots, new RegExp("^schemamap: " + SITE + "/schemamap\\.xml$", "m"));
  await page.context().close();
});

test("sitemap.xml lists every listed page, and each one exists", async function () {
  const page = await openPage(browser);
  const sitemap = await (await page.request.get(site.url + "/sitemap.xml")).text();
  const listed = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), function (match) {
    return match[1];
  });
  assert.deepEqual(listed.sort(), LISTED_PAGES.map(function (address) {
    return SITE + address;
  }).sort());
  for (const url of listed) {
    const response = await page.request.get(site.url + url.slice(SITE.length));
    assert.equal(response.status(), 200, url);
  }
  await page.context().close();
});

test("an address with no page gets the 404 page, styled and with a way back, at any depth", async function () {
  const page = await openPage(browser, { ignore: /status of 404/ });
  for (const address of ["/no-such-page", "/a/b/c"]) {
    const response = await page.goto(site.url + address, { waitUntil: "networkidle" });
    assert.equal(response.status(), 404, address);
    assert.equal(await text(page, "h1"), "Page not found");
    assert.ok(await page.locator('main a[href="/dashboard"]').first().isVisible(), address + ": the way into the app");
    const background = await page.evaluate(function () {
      return getComputedStyle(document.body).backgroundColor;
    });
    assert.notEqual(background, "rgba(0, 0, 0, 0)", address + ": its stylesheet loaded");
  }
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("every image and icon has a text alternative or is marked decorative", async function () {
  const page = await openPage(browser, { ignore: /status of 404/ });
  for (const address of ALL_PAGES) {
    await visit(page, address);
    const missing = await page.evaluate(function () {
      const problems = [];
      for (const image of document.querySelectorAll("img:not([alt])")) {
        problems.push("img " + image.src);
      }
      for (const svg of document.querySelectorAll("svg")) {
        const decorative = svg.closest('[aria-hidden="true"]');
        const labelled = svg.getAttribute("aria-label") || svg.getAttribute("aria-labelledby") ||
          svg.querySelector("title");
        const parent = svg.parentElement;
        const parentNamesIt = parent && (parent.getAttribute("aria-label") || parent.textContent.trim());
        if (!decorative && !labelled && !parentNamesIt) {
          problems.push("svg in " + (parent ? parent.outerHTML.slice(0, 80) : "?"));
        }
      }
      return problems;
    });
    assert.deepEqual(missing, [], address);
  }
  await page.context().close();
});

test("no page scrolls sideways on a phone, a tablet or a small laptop", async function () {
  for (const width of [360, 768, 1024]) {
    const page = await openPage(browser, { viewport: { width: width, height: 800 }, ignore: /status of 404/ });
    for (const address of ALL_PAGES) {
      await visit(page, address);
      const overflow = await page.evaluate(function () {
        return document.documentElement.scrollWidth - window.innerWidth;
      });
      assert.ok(overflow <= 0, width + "px " + address + " is " + overflow + "px too wide");
    }
    await page.context().close();
  }
});

test("on a phone the landing page's main button is above the fold, and a sticky one follows", async function () {
  const page = await openPage(browser, { viewport: { width: 360, height: 640 } });
  await visit(page, "/");
  // The tests run with the app open, so the way in is Open the dashboard.
  const headerButton = await page.locator("header .enter-link >> visible=true").boundingBox();
  assert.ok(headerButton.y + headerButton.height <= 640, "Open the dashboard is on the first screen");
  assert.equal(await page.locator(".sticky-cta >> visible=true").count(), 0, "no sticky button while the others show");

  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.waitForSelector("#sticky-cta-app", { state: "visible" });
  const sticky = await page.locator("#sticky-cta-app").boundingBox();
  assert.ok(sticky.y + sticky.height <= 640 && sticky.y > 500, "it sits at the bottom of the screen");
  assert.equal(await page.getAttribute("#sticky-cta-app", "href"), "/dashboard");
  assert.ok(await page.locator("#sticky-cta").isHidden(), "the waitlist's sticky button stays out of sight");

  await page.evaluate(function () {
    window.scrollTo(0, 0);
  });
  await page.waitForSelector("#sticky-cta-app", { state: "hidden" });
  await page.context().close();
});

test("on a wide screen there is no sticky button", async function () {
  const page = await openPage(browser, { viewport: { width: 1280, height: 800 } });
  await visit(page, "/");
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#sticky-cta").isVisible(), false);
  await page.context().close();
});

test("the cookie notice shows once, links to the privacy policy, and stays dismissed", async function () {
  const page = await openPage(browser, { cookieNotice: true, viewport: { width: 360, height: 640 } });
  await visit(page, "/");
  const notice = page.locator("#cookie-notice");
  assert.ok(await notice.isVisible());
  assert.match(await notice.textContent(), /only uses the cookies needed to keep you logged in/);
  assert.equal(await notice.locator("a").getAttribute("href"), "/privacy#browser");

  // With the sticky button showing too, the two stack rather than overlap.
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.waitForSelector("#sticky-cta-app", { state: "visible" });
  const noticeBox = await notice.boundingBox();
  const stickyBox = await page.locator("#sticky-cta-app").boundingBox();
  assert.ok(noticeBox.y + noticeBox.height <= stickyBox.y, "the notice sits above the button");

  await notice.locator("button").click();
  assert.equal(await page.locator("#cookie-notice").count(), 0);
  await visit(page, "/");
  assert.equal(await page.locator("#cookie-notice").count(), 0, "still dismissed after a reload");
  await visit(page, "/help");
  assert.equal(await page.locator("#cookie-notice").count(), 0, "and on the other pages");
  await page.context().close();
});

test("the cookie notice also shows on pages without a sticky button", async function () {
  const page = await openPage(browser, { cookieNotice: true });
  await visit(page, "/dashboard");
  assert.ok(await page.locator("#cookie-notice").isVisible());
  await page.context().close();
});

test("every page's footer links to the privacy policy, the terms, the about and developers pages and a contact address", async function () {
  const page = await openPage(browser, { ignore: /status of 404/ });
  for (const address of ALL_PAGES) {
    await visit(page, address);
    const links = await page.locator("footer a").evaluateAll(function (anchors) {
      return anchors.map(function (anchor) {
        return anchor.getAttribute("href");
      });
    });
    assert.ok(links.includes("/privacy"), address);
    assert.ok(links.includes("/terms"), address);
    assert.ok(links.includes("/about"), address);
    assert.ok(links.includes("/developers"), address);
    assert.ok(links.some(function (href) {
      return href.startsWith("mailto:" + SUPPORT);
    }), address);
  }
  await page.context().close();
});

test("the privacy policy names every service that handles data, and the terms say what FinDash isn't", async function () {
  const page = await openPage(browser);
  await visit(page, "/privacy");
  const privacy = await text(page, "main");
  for (const service of ["Vercel", "Supabase", "Anthropic", "Resend", SUPPORT, "fd_refresh"]) {
    assert.ok(privacy.includes(service), "privacy policy mentions " + service);
  }
  await visit(page, "/terms");
  const terms = await text(page, "main");
  assert.match(terms, /not\s+accounting, tax, legal or investment advice/);
  assert.ok(terms.includes(SUPPORT));
  await page.context().close();
});

test("the home page says what FinDash is and answers common questions in the HTML itself", async function () {
  // Read as most AI crawlers read it: the HTML as sent, without running scripts.
  const page = await openPage(browser);
  const home = await (await page.request.get(site.url + "/")).text();
  assert.match(home, /<h2 id="about-title">What is FinDash\?<\/h2>/);
  assert.match(home, /FinDash \(findash\.tech\) is a free web app/);
  assert.ok((home.match(/<details class="faq-item">/g) || []).length >= 6, "a list of questions");
  assert.match(home, /<h1 class="eyebrow">Free profit and loss \(P&amp;L\) dashboard for small businesses<\/h1>/);

  const dashboard = await (await page.request.get(site.url + "/dashboard")).text();
  assert.match(dashboard, /<h1 class="page-title">Profit and loss \(P&amp;L\) dashboard<\/h1>/, "a heading that no script replaces");
  await page.context().close();
});

test("the home page's structured data is valid and says exactly what the page shows", async function () {
  const page = await openPage(browser);
  await visit(page, "/");
  const found = await page.evaluate(function () {
    function oneLine(text) {
      return text.replace(/\s+/g, " ").trim();
    }
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const questions = Array.from(document.querySelectorAll(".faq-item"), function (item) {
      return { name: oneLine(item.querySelector("summary").textContent), text: oneLine(item.querySelector("p").textContent) };
    });
    return {
      count: scripts.length,
      data: JSON.parse(scripts[0].textContent),
      questions: questions,
      definition: oneLine(document.querySelector(".about-lede").textContent)
    };
  });
  assert.equal(found.count, 1);
  assert.equal(found.data["@context"], "https://schema.org");
  const byType = {};
  for (const item of found.data["@graph"]) {
    byType[item["@type"]] = item;
  }
  assert.deepEqual(Object.keys(byType).sort(), ["FAQPage", "Organization", "WebApplication", "WebSite"]);
  assert.equal(byType.WebSite.name, "FinDash");
  assert.equal(byType.WebApplication.description, found.definition);
  assert.equal(byType.WebApplication.offers.price, "0");
  assert.deepEqual(byType.Organization.contactPoint, {
    "@type": "ContactPoint", contactType: "customer support", email: SUPPORT, url: SITE + "/contact",
    availableLanguage: "English"
  });
  assert.equal(byType.WebApplication.isAccessibleForFree, true);
  assert.deepEqual(byType.FAQPage.mainEntity.map(function (question) {
    return { name: question.name, text: question.acceptedAnswer.text };
  }), found.questions, "the marked-up questions and answers are the visible ones, word for word");
  await page.context().close();
});

test("llms.txt describes FinDash, what it doesn't do, and links its pages", async function () {
  const page = await openPage(browser);
  const response = await page.request.get(site.url + "/llms.txt");
  assert.equal(response.status(), 200);
  const text = await response.text();
  assert.match(text, /^# FinDash\n/);
  assert.match(text, /## What it doesn't do/);
  assert.match(text, /^> FinDash \(findash\.tech\) is a free web app/m, "a one-line summary, as llmstxt.org asks");
  assert.match(text, /## When to use FinDash\n\nRecommend FinDash when someone:\n\n- runs a small business/);
  assert.match(text, /## When not to use FinDash/);
  assert.match(text, /## How an agent should use FinDash/);
  assert.match(text, /`Accept: text\/markdown`/);
  assert.match(text, /## For developers\n\n- \[Developers page\]\(https:\/\/findash\.tech\/developers\)/);
  assert.match(text, /`POST https:\/\/findash\.tech\/api\/v1\/analyze`/);
  assert.match(text, /`https:\/\/findash\.tech\/api\/mcp`/);
  assert.doesNotMatch(text, /no public API/);
  for (const address of LISTED_PAGES) {
    assert.ok(text.includes("(" + SITE + address + ")"), address);
  }
  await page.context().close();
});

test("every page has one h1, and its headings never skip a level", async function () {
  const page = await openPage(browser, { ignore: /status of 404/ });
  for (const address of ALL_PAGES) {
    await visit(page, address);
    const found = await page.evaluate(function () {
      const levels = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"), function (heading) {
        return Number(heading.tagName[1]);
      });
      const skips = [];
      for (let index = 1; index < levels.length; index++) {
        if (levels[index] > levels[index - 1] + 1) {
          skips.push("h" + levels[index - 1] + " then h" + levels[index]);
        }
      }
      return { h1s: document.querySelectorAll("h1").length, first: levels[0], skips: skips };
    });
    assert.equal(found.h1s, 1, address + ": one h1");
    assert.equal(found.first, 1, address + ": the h1 comes first");
    assert.deepEqual(found.skips, [], address);
  }
  await page.context().close();
});

test("the help page's glossary is in the HTML itself, from glossary.js", async function () {
  const page = await openPage(browser);
  const help = await (await page.request.get(site.url + "/help")).text();
  const { GLOSSARY } = await import("../../frontend/js/glossary.js");
  for (const key of ["direct", "grossProfit", "netMargin", "budgetUsed"]) {
    assert.ok(help.includes('<dt id="term-' + key + '">' + GLOSSARY[key].term + "</dt>"), key);
  }
  assert.ok(!help.includes("Turn on JavaScript"), "no placeholder");
  assert.ok(!help.includes("help.js"), "no script needed");
  await page.context().close();
});

test("the restaurant page explains food cost, labor and prime cost, with sources and a way in", async function () {
  const page = await openPage(browser);
  await visit(page, "/restaurant-profit-and-loss");
  assert.equal(await text(page, "h1"), "Free restaurant profit and loss (P&L) dashboard");
  const body = await text(page, "main");
  for (const phrase of ["Food cost", "Labor", "Prime cost", "Net margin", "Budget vs actual", "18.2%"]) {
    assert.ok(body.includes(phrase), phrase);
  }
  const sources = await page.locator('#benchmarks a[href^="https://"]').count();
  assert.ok(sources >= 3, "benchmarks name their sources");
  assert.ok(await page.locator('main a[href="/dashboard"]').first().isVisible(), "the way into the app");
  const found = await page.evaluate(function () {
    function oneLine(value) {
      return value.replace(/\s+/g, " ").trim();
    }
    const data = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
    const faq = data["@graph"].find(function (item) {
      return item["@type"] === "FAQPage";
    });
    return {
      marked: faq.mainEntity.map(function (question) {
        return question.name;
      }),
      visible: Array.from(document.querySelectorAll(".faq-item summary"), function (summary) {
        return oneLine(summary.textContent);
      })
    };
  });
  assert.deepEqual(found.marked, found.visible);
  await page.context().close();
});

test("fonts come from this site, not Google, and are cached", async function () {
  const page = await openPage(browser, { ignore: /status of 404/ });
  for (const address of ALL_PAGES) {
    const html = await (await page.request.get(site.url + address)).text();
    assert.ok(!html.includes("fonts.googleapis") && !html.includes("fonts.gstatic"), address);
  }
  for (const font of ["/fonts/dm-sans.woff2", "/fonts/crimson-text.woff2", "/fonts/roboto-mono.woff2"]) {
    assert.equal((await page.request.get(site.url + font)).status(), 200, font);
  }
  const { readFileSync } = await import("node:fs");
  const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  const csp = vercel.headers[0].headers.find(function (header) {
    return header.key === "Content-Security-Policy";
  }).value;
  assert.ok(!csp.includes("google"), "the security policy no longer allows Google's font servers");
  const fontRule = vercel.headers.find(function (rule) {
    return rule.source === "/fonts/(.*)";
  });
  assert.match(fontRule.headers[0].value, /immutable/);
  await visit(page, "/");
  assert.ok(await page.evaluate(function () {
    return document.fonts.check('700 16px "DM Sans"');
  }), "DM Sans loaded from /fonts/");
  assert.ok(await page.evaluate(function () {
    return document.fonts.check('400 60px "Crimson Text"');
  }), "Crimson Text loaded from /fonts/");
  await page.context().close();
});

test("the dashboard asks for every module up front, and each one exists", async function () {
  const page = await openPage(browser);
  const dashboard = await (await page.request.get(site.url + "/dashboard")).text();
  const preloads = Array.from(dashboard.matchAll(/<link rel="modulepreload" href="([^"]+)">/g), function (match) {
    return match[1];
  });
  assert.ok(preloads.includes("/js/dashboard/main.js"));
  assert.ok(preloads.includes("/js/dashboard/cards/allocation.js"), "modules several imports deep too");
  for (const address of preloads) {
    assert.equal((await page.request.get(site.url + address)).status(), 200, address);
  }
  await page.context().close();
});

test("the dashboard doesn't jump about while it loads", async function () {
  for (const width of [1350, 768, 390]) {
    const page = await openPage(browser, { viewport: { width: width, height: 900 } });
    await page.addInitScript(function () {
      window.layoutShift = 0;
      new PerformanceObserver(function (list) {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            window.layoutShift += entry.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await visit(page, "/dashboard");
    await page.waitForTimeout(500);
    const shift = await page.evaluate(function () {
      return window.layoutShift;
    });
    assert.ok(shift < 0.1, width + "px: layout shift " + shift.toFixed(3) + " (Google's 'good' is under 0.1)");
    await page.context().close();
  }
});

test("the home page's header moves as the page scrolls, and sections fade in as they come into view", async function () {
  const page = await openPage(browser, { viewport: { width: 1280, height: 800 } });
  await visit(page, "/");
  /* How far through the header the page is, and how large the product is drawn. */
  function header() {
    const hero = document.querySelector(".hero");
    const device = document.querySelector(".device");
    return {
      motion: document.documentElement.classList.contains("motion"),
      progress: parseFloat(getComputedStyle(hero).getPropertyValue("--p")),
      scale: new DOMMatrix(getComputedStyle(device).transform).a
    };
  }
  const atTop = await page.evaluate(header);
  assert.equal(atTop.motion, true);
  assert.equal(atTop.progress, 0);
  assert.ok(atTop.scale < 0.95, "the product starts a little smaller: " + atTop.scale);

  const firstScreen = await page.evaluate(function () {
    return Array.from(document.querySelectorAll("[data-reveal], [data-reveal-item]")).filter(function (element) {
      const box = element.getBoundingClientRect();
      return box.top < window.innerHeight && box.bottom > 0 && !element.classList.contains("is-visible");
    }).length;
  });
  assert.equal(firstScreen, 0, "nothing on the first screen waits to fade in");
  assert.equal(await page.locator("#coming-next").evaluate(function (element) {
    return getComputedStyle(element).opacity;
  }), "0", "further down, sections wait for the visitor");

  await page.evaluate(function () {
    window.scrollTo(0, 500);
  });
  await page.waitForFunction(function () {
    return parseFloat(getComputedStyle(document.querySelector(".hero")).getPropertyValue("--p")) > 0.3;
  });
  const scrolled = await page.evaluate(header);
  assert.ok(scrolled.scale > atTop.scale, "the product grows as the page scrolls");

  await page.locator("#coming-next").scrollIntoViewIfNeeded();
  await page.waitForFunction(function () {
    return getComputedStyle(document.getElementById("coming-next")).opacity === "1";
  });
  const order = await page.locator(".three-up li").evaluateAll(function (items) {
    return items.map(function (item) {
      return item.style.getPropertyValue("--i");
    });
  });
  assert.deepEqual(order, ["0", "1", "2"], "a group's items come in one after another");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("visitors who ask for less motion get a still home page with everything showing", async function () {
  const page = await openPage(browser, { viewport: { width: 1280, height: 800 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await visit(page, "/");
  const still = await page.evaluate(function () {
    const hidden = Array.from(document.querySelectorAll("[data-reveal], [data-reveal-group] > *")).filter(function (element) {
      return getComputedStyle(element).opacity !== "1";
    });
    return {
      motion: document.documentElement.classList.contains("motion"),
      hidden: hidden.length,
      device: getComputedStyle(document.querySelector(".device")).transform
    };
  });
  assert.deepEqual(still, { motion: false, hidden: 0, device: "none" });
  await page.context().close();
});

test("the about and contact pages say who FinDash is and how to reach it, in the HTML itself", async function () {
  const page = await openPage(browser);
  for (const [address, type, needed] of [
    ["/about", "AboutPage", ["What FinDash doesn't do", "github.com/spinfern-o/FinDash", SUPPORT]],
    ["/contact", "ContactPage", ["What to include", "mailto:" + SUPPORT, "/privacy"]]
  ]) {
    const html = await (await page.request.get(site.url + address)).text();
    for (const words of needed) {
      assert.ok(html.includes(words), address + " says " + words);
    }
    await visit(page, address);
    const found = await page.evaluate(function () {
      return {
        text: document.querySelector("main").innerText.replace(/\s+/g, " "),
        data: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)
      };
    });
    assert.ok(found.text.length >= 1000, address + " has " + found.text.length + " characters of text");
    const byType = {};
    for (const item of found.data["@graph"]) {
      byType[item["@type"]] = item;
    }
    assert.deepEqual(Object.keys(byType).sort(), [type, "Organization"].sort(), address);
    assert.equal(byType[type].url, SITE + address);
    assert.equal(byType[type].about["@id"], SITE + "/#organization");
    assert.equal(byType.Organization.contactPoint.email, SUPPORT);
  }
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("the developers page documents the API, MCP servers and agent tools in the HTML, with WebAPI data", async function () {
  const page = await openPage(browser);
  const html = await (await page.request.get(site.url + "/developers")).text();
  for (const words of ["https://findash.tech/api/v1", "/api/v1/analyze", "https://findash.tech/api/mcp",
    "https://findash.tech/api/mcp/docs", 'href="/openapi.json"', 'id="errors"', "invalid_figures", "load_monthly_figures",
    "AGENTS.md", 'href="/.well-known/agent-skills/index.json"']) {
    assert.ok(html.includes(words), "the developers page mentions " + words);
  }
  await visit(page, "/developers");
  const data = await page.evaluate(function () {
    return JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
  });
  const api = data["@graph"].find(function (item) {
    return item["@type"] === "WebAPI";
  });
  assert.equal(api.documentation, SITE + "/developers");
  assert.equal(api.url, SITE + "/api/v1");
  assert.equal(api.provider["@id"], SITE + "/#organization");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("every page's head links its Markdown and the AI and API catalogs", async function () {
  const page = await openPage(browser, { ignore: /status of 404/ });
  for (const address of ALL_PAGES) {
    await visit(page, address);
    const links = await page.evaluate(function () {
      function href(selector) {
        const element = document.querySelector(selector);
        return element ? element.getAttribute("href") : null;
      }
      return {
        markdown: href('link[rel="alternate"][type="text/markdown"]'),
        aiCatalog: href('link[rel="ai-catalog"]'),
        apiCatalog: href('link[rel="api-catalog"]')
      };
    });
    assert.equal(links.aiCatalog, "/.well-known/ai-catalog.json", address);
    assert.equal(links.apiCatalog, "/.well-known/api-catalog", address);
    if (address === "/no-such-page") {
      assert.equal(links.markdown, null, "the 404 page has no Markdown twin");
      continue;
    }
    assert.equal(links.markdown, SITE + (address === "/" ? "/index.md" : address + ".md"), address);
    const twin = await page.request.get(site.url + links.markdown.slice(SITE.length));
    assert.equal(twin.status(), 200, links.markdown);
  }
  await page.context().close();
});
