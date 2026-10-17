/* Follow the same records from invoice review to graphs and from dashboard
   stock entry back to the stock page, using the real UI and mocked services. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startSite } from '../support/site.mjs';
import { launchBrowser, openPage, signUp, newEmail, photoFile } from '../support/browser.mjs';
import { readFixture } from '../support/mock-anthropic.mjs';
let site;
let browser;
before(async function () {
  site = await startSite();
  browser = await launchBrowser();
  const invoice = readFixture('invoice-reading.json');
  invoice.lines = [{ ...invoice.lines[2], original: 'Jasmine rice, 50 lb bag', description: '茉莉香米' }];
  invoice.total_printed = 76;
  invoice.subtotal_printed = 76;
  site.anthropic.replies.photoFirstLook = invoice;
});
after(async function () { await browser.close(); await site.stop(); });

async function account(page) {
  assert.equal(await signUp(page, site, newEmail('sync'), 'test password'), 200);
}
async function dashboard(page) {
  await page.goto(site.url + '/dashboard', { waitUntil: 'networkidle' });
  await page.locator('#add-item:enabled').waitFor();
}
async function readStockPhoto(page) {
  await page.goto(site.url + '/stock#files');
  await page.locator('#add-item:enabled').waitFor();
  await page.selectOption('#stock-language', 'zh-CN');
  await page.locator('#stock-files').setInputFiles(photoFile());
  await page.locator('[data-review]').click();
}
async function fillCount(page) {
  await page.locator('[name="location-0"]').fill('后仓');
  await page.locator('[name="unit-0"]').fill('袋');
  await page.locator('[name="count-0"]').fill('8');
}
async function confirm(page) {
  await page.locator('#invoice-stock button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
}
async function graphHasInvoice(page) {
  await page.waitForFunction(function () {
    return window.findash?.state.ownerInvoices.length === 1 && findash.state.data.months[0].lines.cogs === 76;
  });
  assert.match(await page.locator('.trend .hit').getAttribute('aria-label'), /September 2026, net profit .*76/);
  assert.equal(await page.locator('.trend .col').count(), 1);
}

test('stock photo confirmation updates an already-open P&L graph and survives returning to the dashboard', async function () {
  const page = await openPage(browser);
  await account(page);
  await dashboard(page);
  const stock = await page.context().newPage();
  await readStockPhoto(stock);
  assert.equal((await (await stock.request.get(site.url + '/api/figures')).json()).figures, null);
  await fillCount(stock);
  await confirm(stock);
  await graphHasInvoice(page);
  await page.locator('.stock-count').first().waitFor();
  assert.equal(await page.locator('.stock-count').first().innerText(), '8');
  if (process.env.FINDASH_SCREENSHOTS) {
    await page.selectOption('#stock-language', 'zh-CN');
    await page.locator('#dashboard-stock').screenshot({ path: '/tmp/findash-sync-dashboard.png' });
  }
  await page.reload({ waitUntil: 'networkidle' });
  await graphHasInvoice(page);
  assert.equal(await page.locator('#sync-choice').isVisible(), false, 'a clean old browser copy automatically follows the synced invoice');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('stock entered on P&L appears on the stock page and stock usage refreshes the dashboard without another expense', async function () {
  const page = await openPage(browser);
  await account(page);
  await dashboard(page);
  await page.selectOption('#stock-language', 'zh-CN');
  assert.equal(await page.locator('#add-item').innerText(), '手动添加商品');
  assert.equal(await page.locator('#dashboard-stock-title').innerText(), '货架实存');
  await page.click('#add-item');
  for (const [name, value] of Object.entries({ original: 'Jasmine rice', description: '大米', unit: '袋', location: '后仓', quantity: '8' })) {
    await page.locator('#manual-item [name="' + name + '"]').fill(value);
  }
  await page.locator('#manual-item button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
  const stock = await page.context().newPage();
  await stock.goto(site.url + '/stock#items');
  await stock.locator('#add-item:enabled').waitFor();
  assert.equal(await stock.locator('.stock-count').innerText(), '8');
  assert.match(await stock.locator('[data-stock-row]').innerText(), /大米/);
  await stock.locator('[data-movement="usage"]').click();
  await stock.locator('[name="quantity"]').fill('3');
  await stock.locator('#movement-form button[type="submit"]').click();
  await page.waitForFunction(function () { return document.querySelector('.stock-count')?.textContent === '5'; });
  assert.equal((await (await page.request.get(site.url + '/api/figures')).json()).figures, null, 'quantities alone do not invent a financial cost');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('dashboard invoice review can confirm a shelf count and save both records together', async function () {
  const page = await openPage(browser);
  await account(page);
  await dashboard(page);
  await page.setInputFiles('#file', photoFile());
  await page.locator('#review-add').waitFor();
  await page.locator('#review details summary').click();
  await page.locator('[data-stock-line="0"]').check();
  await page.locator('[data-stock-unit="0"]').fill('袋');
  await page.locator('[data-stock-location="0"]').fill('后仓');
  await page.locator('[data-stock-count="0"]').fill('8');
  await page.click('#review-add');
  await page.locator('#review').waitFor({ state: 'hidden' });
  await graphHasInvoice(page);
  assert.equal(await page.locator('.stock-count').innerText(), '8');
  await page.goto(site.url + '/stock#items');
  await page.locator('#add-item:enabled').waitFor();
  assert.equal(await page.locator('.stock-count').innerText(), '8');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('a lost confirmation response can be retried without a second invoice or stock movement', async function () {
  const page = await openPage(browser, { ignore: /ERR_FAILED/ });
  await account(page);
  await readStockPhoto(page);
  await fillCount(page);
  let loseResponse = true;
  await page.route('**/api/inventory', async function (route) {
    if (route.request().method() === 'PUT' && loseResponse) {
      loseResponse = false;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.abort('failed');
    } else { await route.continue(); }
  });
  await confirm(page);
  await page.locator('#retry-stock').click();
  await page.locator('#add-item:enabled').waitFor();
  const inventory = (await (await page.request.get(site.url + '/api/inventory')).json()).inventory;
  const figures = (await (await page.request.get(site.url + '/api/figures')).json()).figures;
  assert.equal(inventory.movements.length, 1);
  assert.equal(figures.invoices.length, 1);
  assert.equal(await page.locator('#review-count').innerText(), '0');
  await page.goto(site.url + '/dashboard', { waitUntil: 'networkidle' });
  await graphHasInvoice(page);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('invoice costs already in a spreadsheet can be excluded while shelf counts still save', async function () {
  const page = await openPage(browser);
  await account(page);
  await readStockPhoto(page);
  await fillCount(page);
  await page.locator('[name="financial"]').uncheck();
  await confirm(page);
  assert.equal(await page.locator('.stock-count').innerText(), '8');
  assert.equal((await (await page.request.get(site.url + '/api/figures')).json()).figures, null);
  await page.context().close();
});

test('financial-only confirmation clears the review queue after a failed save is retried', async function () {
  const page = await openPage(browser, { ignore: /503/ });
  await account(page);
  await readStockPhoto(page);
  await page.locator('[name="include-0"]').uncheck();
  let fail = true;
  await page.route('**/api/inventory', function (route) {
    if (route.request().method() === 'PUT' && fail) {
      fail = false;
      return route.fulfill({ status: 503, json: { error: 'unavailable' } });
    }
    return route.continue();
  });
  await confirm(page);
  await page.locator('#retry-stock').click();
  await page.locator('#add-item:enabled').waitFor();
  assert.equal(await page.locator('#review-count').innerText(), '0');
  const saved = await (await page.request.get(site.url + '/api/figures')).json();
  assert.equal(saved.figures.invoices.length, 1);
  assert.equal((await (await page.request.get(site.url + '/api/inventory')).json()).inventory.items.length, 0);
  await page.context().close();
});

test('dashboard confirmation retries the same invoice after a failed save without losing its review', async function () {
  const page = await openPage(browser, { ignore: /503/ });
  await account(page);
  await dashboard(page);
  await page.setInputFiles('#file', photoFile());
  await page.locator('#review details summary').click();
  await page.locator('[data-stock-line="0"]').check();
  await page.locator('[data-stock-unit="0"]').fill('袋');
  await page.locator('[data-stock-location="0"]').fill('后仓');
  await page.locator('[data-stock-count="0"]').fill('8');
  let fail = true;
  await page.route('**/api/inventory', function (route) {
    if (route.request().method() === 'PUT' && fail) {
      fail = false;
      return route.fulfill({ status: 503, json: { error: 'unavailable' } });
    }
    return route.continue();
  });
  await page.click('#review-add');
  await page.waitForFunction(function () { return document.querySelector('#source').textContent === 'Invoice and stock not saved'; });
  assert.equal(await page.locator('#review').isVisible(), true);
  assert.equal((await (await page.request.get(site.url + '/api/figures')).json()).figures, null);
  await page.click('#review-add');
  await page.locator('#review').waitFor({ state: 'hidden' });
  await graphHasInvoice(page);
  assert.equal(await page.locator('.stock-count').innerText(), '8');
  assert.equal((await (await page.request.get(site.url + '/api/inventory')).json()).inventory.movements.length, 1);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('an account switch cannot save a pending invoice under the next owner', async function () {
  const page = await openPage(browser, { ignore: /401/ });
  await account(page);
  await readStockPhoto(page);
  await fillCount(page);
  await account(page); // A different owner signs in through another tab/session request.
  await confirm(page);
  await page.getByText('登录已过期。请先导出当前内容，再重新登录。', { exact: true }).first().waitFor();
  assert.equal((await (await page.request.get(site.url + '/api/figures')).json()).figures, null);
  assert.deepEqual((await (await page.request.get(site.url + '/api/inventory')).json()).inventory.items, []);
  page.on('dialog', function (dialog) { return dialog.accept(); });
  await page.reload();
  await page.locator('#add-item:enabled').waitFor();
  assert.equal(await page.locator('[data-stock-row]').count(), 0);
  await page.context().close();
});

test('queued financial edits stop at a conflict so another tab’s synced invoice needs an explicit choice', async function () {
  const page = await openPage(browser, { ignore: /409/ });
  await account(page);
  await dashboard(page);
  let release;
  let entered;
  const held = new Promise(function (resolve) { release = resolve; });
  const waiting = new Promise(function (resolve) { entered = resolve; });
  let writes = 0;
  await page.route('**/api/figures', async function (route) {
    if (route.request().method() === 'PUT') {
      writes += 1;
      if (writes === 1) { entered(); await held; }
    }
    await route.continue();
  });
  await page.setInputFiles('#file', photoFile());
  await page.click('#review-add');
  await waiting;
  await page.locator('#review').waitFor({ state: 'hidden' });
  await page.setInputFiles('#file', photoFile('second.png'));
  await page.click('#review-add');
  await page.locator('#review').waitFor({ state: 'hidden' });
  const email = await page.evaluate(function () { return findash.state.account.email; });
  const invoice = { id: 'other-tab', kind: 'purchase', supplier: 'Another supplier', number: 'OTHER', date: '2026-09-26',
    year: 2026, monthNum: 9, total: 20, lines: [{ description: 'Flour', category: 'cogs', amount: 20 }], addedAt: '2026-09-26T12:00:00Z' };
  const saved = await page.request.put(site.url + '/api/inventory', { headers: { origin: site.url, 'X-FinDash-Owner': email },
    data: { inventory: { version: 1, items: [], movements: [] }, revision: 0, invoice: invoice } });
  assert.equal(saved.status(), 200);
  release();
  await page.locator('#sync-choice:not([hidden])').waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(writes, 1, 'queued save must not bypass the reconciliation choice');
  assert.deepEqual((await (await page.request.get(site.url + '/api/figures')).json()).figures.invoices.map(function (entry) { return entry.id; }), ['other-tab']);
  await page.click('#keep-account');
  assert.equal(await page.evaluate(function () { return findash.state.account.hasUnsavedChanges; }), false);
  assert.equal(await page.evaluate(function () { return findash.state.data.months[0].lines.cogs; }), 20);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('guest dashboard and stock pages share entries and preserve an unfinished form from stale overwrites', async function () {
  const page = await openPage(browser, { ignore: /a^/ });
  await dashboard(page);
  const stock = await page.context().newPage();
  await stock.goto(site.url + '/stock#items');
  await stock.locator('#add-item:enabled').waitFor();
  await stock.click('#add-item');
  await page.click('#add-item');
  for (const [name, value] of Object.entries({ original: 'Rice', description: 'Rice', unit: 'bag', location: 'Store', quantity: '8' })) {
    await page.locator('#manual-item [name="' + name + '"]').fill(value);
    await stock.locator('#manual-item [name="' + name + '"]').fill(value);
  }
  await page.locator('#manual-item button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
  await stock.locator('#manual-item button[type="submit"]').click();
  await stock.locator('#stock-dialog').waitFor({ state: 'hidden' });
  assert.match(await stock.locator('#stock-storage').innerText(), /changed this stock/);
  const saved = await page.evaluate(function () { return JSON.parse(localStorage.getItem('findash-stock-guest-v1')); });
  assert.equal(saved.items.length, 1);
  assert.equal(saved.movements.length, 1);
  assert.equal(saved.items[0].id, await page.locator('[data-movement="count"]').getAttribute('data-item'));
  await page.context().close();
});
