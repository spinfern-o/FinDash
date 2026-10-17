/* The daily purchasing routine in a real browser, against the stand-ins for
   Supabase and Claude: an invoice billed for three cases where two arrived
   keeps the invoice as printed and opens a delivery problem with its
   possible value; a confirmed credit is taken off the P&L once; the next
   invoice from the same supplier finds the item by its code and adds the
   delivery to the last count; and the buying list suggests what brings the
   item back to its target, in whole pallets, printed and downloaded. The
   invoices are made up. */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startSite } from '../support/site.mjs';
import { launchBrowser, openPage, signUp, newEmail, photoFile } from '../support/browser.mjs';

let site;
let browser;
let page;

const OIL = { description: 'Soybean oil', original: '黄豆油 35磅', code: 'GH-600', quantity: 3, unit: 'case',
  billed_quantity: 3, unit_price: 40, amount: 120, amount_source: 'printed', category: 'cogs' };

/* A made-up Golden Harbor invoice with the given lines. */
function reading(number, lines) {
  const total = lines.reduce(function (sum, line) { return sum + line.amount; }, 0);
  return { kind: 'purchase', legible: true, supplier: 'Golden Harbor Foods', customer: 'Corner Bistro',
    document_number: number, date: '2026-10-19', currency: 'USD', subtotal_printed: total, total_printed: total,
    notes: ["Made-up invoice for FinDash's tests."], lines: lines };
}

/* A photo whose bytes differ from photoFile()'s, so it isn't taken for the same image. */
function anotherPhoto(name) {
  const photo = photoFile(name);
  return { ...photo, buffer: Buffer.concat([photo.buffer, Buffer.from([1])]) };
}

/* Uploads a photo read as `invoice` and opens its review. */
async function review(invoice, photo) {
  site.anthropic.replies.photoFirstLook = invoice;
  await page.goto(site.url + '/stock#files');
  await page.locator('#add-item:enabled').waitFor();
  await page.locator('#stock-files').setInputFiles(photo);
  await page.locator('[data-review]').click();
  await page.locator('#invoice-stock').waitFor();
}

async function confirmReview() {
  await page.locator('#invoice-stock button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
}

async function figures() {
  return (await (await page.request.get(site.url + '/api/figures')).json()).figures;
}

async function openTab(view) {
  await page.goto(site.url + '/stock#' + view);
  await page.locator('#add-item:enabled').waitFor();
}

before(async function () {
  site = await startSite();
  browser = await launchBrowser();
  page = await openPage(browser);
  await signUp(page, site, newEmail('receiving'), 'receiving password');
});

after(async function () {
  await browser.close();
  await site.stop();
});

test('F: three cases billed, two arrived: the invoice stays as printed and a delivery problem opens', async function () {
  await review(reading('GH-5501', [OIL]), photoFile('first.png'));
  assert.equal(await page.locator('[name="status-0"]').inputValue(), 'unchecked', 'an invoice is not proof of delivery');
  assert.ok(await page.getByRole('button', { name: 'Everything arrived as billed' }).isVisible());
  assert.equal(await page.locator('[name="item-0"]').inputValue(), '__new');
  assert.ok(await page.locator('[name="mode-0"][value="delivery"]').isDisabled(), 'nothing counted yet to add to');

  await page.locator('[name="description-0"]').fill('黄豆油');
  await page.locator('[name="location-0"]').fill('后仓');
  await page.locator('[name="status-0"]').selectOption('short');
  await page.locator('[name="received-0"]').fill('2');
  await page.locator('[name="count-0"]').fill('2');
  await page.locator('[name="note-0"]').fill('One case on the next truck');
  await confirmReview();

  const saved = await figures();
  assert.equal(saved.invoices.length, 1);
  assert.equal(saved.invoices[0].total, 120, 'billed as printed: three cases');
  assert.equal(saved.invoices[0].lines[0].quantity, 3);

  await openTab('checks');
  const problem = page.locator('.stock-check');
  assert.equal(await problem.count(), 1);
  const text = (await problem.innerText()).replace(/\s+/g, ' ');
  assert.match(text, /Billed: 3 case · Received: 2 case · Short/);
  assert.match(text, /Possible value: 40\.00 USD to check with the supplier, not a confirmed credit/);
  assert.match(text, /One case on the next truck/);
  assert.match(await page.locator('.stock-tabs').innerText(), /Delivery problems\s*1/);
});

test('a confirmed credit is recorded once, and taken off the P&L only because the owner chose to', async function () {
  await page.locator('[data-resolve]').click();
  await page.locator('#resolve-check [name="state"][value="credited"]').check();
  await page.locator('#resolve-check [name="credit-amount"]').fill('40');
  await page.locator('#resolve-check [name="credit-reference"]').fill('CN-12');
  await page.locator('#resolve-check [name="to-finance"]').check();
  await page.locator('#resolve-check button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });

  await openTab('checks');
  assert.equal(await page.locator('[data-resolve]').count(), 0, 'nothing left to resolve, so it cannot be credited again');
  assert.match((await page.locator('.stock-check').innerText()).replace(/\s+/g, ' '), /Credit received · 40\.00 CN-12/);
  const credits = (await figures()).invoices.filter(function (invoice) { return invoice.id.startsWith('credit-'); });
  assert.equal(credits.length, 1);
  assert.equal(credits[0].total, -40);
  assert.equal(credits[0].number, 'CN-12');
});

test("the next invoice finds the item by its supplier code and adds what arrived to the last count", async function () {
  await review(reading('GH-5530', [OIL]), anotherPhoto('second.png'));
  const chosen = page.locator('[name="item-0"]');
  assert.notEqual(await chosen.inputValue(), '__new');
  assert.match(await chosen.locator('option:checked').innerText(), /黄豆油 · 后仓 · case \(supplier code confirmed before\)/);
  await page.getByRole('button', { name: 'Everything arrived as billed' }).click();
  assert.equal(await page.locator('[name="status-0"]').inputValue(), 'full');
  assert.equal(await page.locator('[name="received-0"]').inputValue(), '3');
  assert.ok(await page.locator('[name="mode-0"][value="delivery"]').isChecked(), 'two were counted: add the three to them');
  await confirmReview();

  await openTab('items');
  assert.equal(await page.locator('.stock-count').innerText(), '5');
  assert.doesNotMatch(await page.locator('.stock-tabs').innerText(), /Delivery problems\s*\d/, 'no new problem');
});

test('G: below its minimum, the buying list suggests what brings it to its target, in whole pallets', async function () {
  await page.locator('[data-settings]').click();
  const form = page.locator('#item-settings');
  await form.locator('[name="minimum"]').fill('6');
  await form.locator('[name="target"]').fill('10');
  await form.locator('[name="supplier"]').fill('Golden Harbor');
  await form.locator('[name="pack-unit-0"]').fill('pallet');
  await form.locator('[name="pack-contains-0"]').fill('5');
  await form.locator('button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
  await openTab('items');
  assert.match(await page.locator('.stock-count').innerText(), /Below minimum/);

  await page.locator('[data-settings]').click();
  await page.locator('#item-settings [name="buy-unit"]').selectOption('pallet');
  assert.match(await page.locator('#item-settings').innerText(), /Golden Harbor Foods · GH-600/, 'the code confirmed on the invoice');
  await page.locator('#item-settings button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });

  await openTab('buying');
  const row = page.locator('[data-buy-row="0"]');
  const text = (await row.innerText()).replace(/\s+/g, ' ');
  assert.match(text, /5 case/);
  assert.match(text, /6 · Target 10/);
  assert.match(text, /1 pallet/);
  assert.equal(await row.locator('[data-buy]').inputValue(), '5');
});

test('the buying list prints and downloads with the quantities the owner settled on', async function () {
  await page.locator('[data-buy-row="0"] [data-buy]').fill('10');
  await page.evaluate(function () {
    window.print = function () { window.printed = document.getElementById('stock-panel').innerText; };
  });
  await page.click('#print-buying');
  const printed = await page.evaluate(function () { return window.printed; });
  assert.match(printed, /Golden Harbor/);
  assert.match(printed, /黄豆油/);
  assert.match(printed, /10 case/);

  await page.evaluate(function () { window.dispatchEvent(new Event('afterprint')); });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download-buying')]);
  assert.match(download.suggestedFilename(), /^findash-buying-list-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync(await download.path(), 'utf8');
  assert.match(csv, /"Golden Harbor","黄豆油","黄豆油 35磅","后仓","10","case"/,
    'the quantity the owner changed, kept through printing');
});

test("the dashboard's invoice review has the same delivery check, and finds the item by its code too", async function () {
  site.anthropic.replies.photoFirstLook = reading('GH-5577', [OIL]);
  await page.goto(site.url + '/dashboard', { waitUntil: 'networkidle' });
  await page.setInputFiles('#file', anotherPhoto('third.png'));
  await page.locator('#review-add').waitFor();
  await page.locator('[data-stock-review] summary').click();
  await page.locator('[data-stock-review] [name="include-0"]').check();
  assert.ok(await page.locator('[data-stock-review]').getByRole('button', { name: 'Everything arrived as billed' }).isVisible());
  assert.equal(await page.locator('[data-stock-review] [name="status-0"]').inputValue(), 'unchecked');
  assert.match(await page.locator('[data-stock-review] [name="item-0"] option:checked').innerText(),
    /黄豆油 · 后仓 · case \(supplier code confirmed before\)/);
  await page.click('#review-cancel');
});

test('the stock tabs and delivery words are in Chinese when stock is in Chinese', async function () {
  await openTab('checks');
  await page.selectOption('#stock-language', 'zh-CN');
  assert.match(await page.locator('.stock-tabs').innerText(), /库存[\s\S]*采购清单[\s\S]*到货问题/);
  assert.match(await page.locator('.stock-check').innerText(), /已收到退款/);
  await page.selectOption('#stock-language', 'en');
});

test('no unexpected errors in the browser console', function () {
  assert.deepEqual(page.errors, []);
});
