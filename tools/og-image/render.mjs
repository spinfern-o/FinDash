/* Draws frontend/og-image.png, the 1200 x 630 picture shown when a link to
   FinDash is shared, from og-image.html next to this file, with the site's
   own fonts from frontend/fonts. Needs the test browser (npm install, then
   npx playwright install chromium).

   node tools/og-image/render.mjs */

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const page = new URL("./og-image.html", import.meta.url);
const output = fileURLToPath(new URL("../../frontend/og-image.png", import.meta.url));

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await tab.goto(page.href, { waitUntil: "networkidle" });
await tab.evaluate(function () {
  return document.fonts.ready;
});
await tab.screenshot({ path: output });
await browser.close();
console.log("wrote", output);
