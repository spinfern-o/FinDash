/* Takes the two pictures of the demo dashboard the site shows, in light mode:

     docs/images/dashboard-preview.jpg  in the device frame on the home page,
                                        from the period buttons down
     docs/screenshot-dashboard.jpg      the screenshot in the home page's
                                        structured data, 1280 x 800 from the top

   Run it after changing how the dashboard looks, so the site never shows an
   older version of it. Needs the test browser (npm install, then
   npx playwright install chromium).

   node tools/home-preview/render.mjs */

import { fileURLToPath } from "node:url";
import { startSite } from "../../tests/support/site.mjs";
import { launchBrowser } from "../../tests/support/browser.mjs";

const OUTPUT = fileURLToPath(new URL("../../docs/images/dashboard-preview.jpg", import.meta.url));
const SCREENSHOT = fileURLToPath(new URL("../../docs/screenshot-dashboard.jpg", import.meta.url));
// The screen in the kit's device frame is 870 x 607; this is that shape at
// the dashboard's usual width, saved at 1740 pixels wide for sharp screens.
const WIDTH = 1280;
const HEIGHT = 893;
const SCALE = 1740 / WIDTH;

const site = await startSite();
const browser = await launchBrowser();
try {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE });
  await context.addInitScript(function () {
    localStorage.setItem("findash-cookie-notice", "seen");
    localStorage.setItem("findash-theme", "light");
  });
  const page = await context.newPage();
  await page.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector(".hero .figure");
  await page.evaluate(function () {
    return document.fonts.ready;
  });
  const top = await page.evaluate(function () {
    return document.querySelector(".toolbar").getBoundingClientRect().top + window.scrollY - 28;
  });
  await page.screenshot({ path: OUTPUT, type: "jpeg", quality: 82, fullPage: true,
    clip: { x: 0, y: top, width: WIDTH, height: HEIGHT } });
  console.log("wrote", OUTPUT);
  await context.close();

  const plain = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await plain.addInitScript(function () {
    localStorage.setItem("findash-cookie-notice", "seen");
    localStorage.setItem("findash-theme", "light");
  });
  const whole = await plain.newPage();
  await whole.goto(site.url + "/dashboard", { waitUntil: "networkidle" });
  await whole.waitForSelector(".hero .figure");
  await whole.evaluate(function () {
    return document.fonts.ready;
  });
  await whole.screenshot({ path: SCREENSHOT, type: "jpeg", quality: 82 });
  console.log("wrote", SCREENSHOT);
} finally {
  await browser.close();
  await site.stop();
}
