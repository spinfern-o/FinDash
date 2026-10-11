/* Helpers for the browser tests: a Chromium browser, a page that collects
   console errors, logging in, and a small image to stand in for a photo. */

import { chromium } from "playwright";

export function launchBrowser() {
  return chromium.launch();
}

/* A new page whose console errors and uncaught exceptions are collected in
   page.errors. Messages matching `ignore` (a regular expression) are left
   out: fonts the sandbox cannot fetch, and errors a test causes on purpose. */
export async function openPage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1280, height: 900 },
    acceptDownloads: true
  });
  const page = await context.newPage();
  page.errors = [];
  const ignore = options.ignore || /a^/;
  page.on("console", function (message) {
    const text = message.text();
    const isNoise = /fonts\.g|ERR_CERT|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED/.test(text);
    if (message.type() === "error" && !isNoise && !ignore.test(text)) {
      page.errors.push(text);
    }
  });
  page.on("pageerror", function (error) {
    page.errors.push("pageerror: " + error.message);
  });
  return page;
}

export async function signUp(page, site, email, password) {
  const response = await page.request.post(site.url + "/api/auth?action=signup", {
    data: { email: email, password: password },
    headers: { origin: site.url }
  });
  return response.status();
}

export async function logIn(page, site, email, password) {
  const response = await page.request.post(site.url + "/api/auth?action=login", {
    data: { email: email, password: password },
    headers: { origin: site.url }
  });
  return response.status();
}

let emailCount = 0;

/* A fresh email address for each account a test makes. */
export function newEmail(prefix) {
  emailCount += 1;
  return prefix + "-" + process.pid + "-" + emailCount + "@example.test";
}

/* A one-pixel PNG: the dashboard needs a real image to open, and the
   stand-in for Claude answers the same whatever the picture shows. */
const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function photoFile(name) {
  return { name: name || "invoice.png", mimeType: "image/png", buffer: Buffer.from(ONE_PIXEL_PNG, "base64") };
}

/* Waits until the import box has finished with whatever it was given. */
export async function waitUntilNotBusy(page) {
  await page.waitForFunction(function () {
    const loader = document.getElementById("loader");
    const heading = document.getElementById("source").textContent;
    return !loader.classList.contains("busy") && heading !== "Reading" && heading !== "Matching columns";
  }, null, { timeout: 15000 });
  await page.waitForTimeout(150);
}

export function text(page, selector) {
  return page.locator(selector).first().innerText();
}
