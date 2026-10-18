/* Photographing a shelf, in the real page: the owner sets a target, takes
   a photo, checks the number Claude offers, and saves it as a count. The
   number to put out follows the newest count and replaces the old answer.

   Test names carry the numbers of the acceptance criteria they cover. */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startSite } from '../support/site.mjs';
import { launchBrowser, openPage, signUp, newEmail } from '../support/browser.mjs';

let site;
let browser;
before(async function () { site = await startSite(); browser = await launchBrowser(); });
after(async function () { await browser.close(); await site.stop(); });

const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* Each photo of a shelf is its own picture: the same bytes twice are a
   resend, which the page refuses, so each one here differs. */
let photos = 0;
function shelfPhoto(again = false) {
  if (!again) { photos += 1; }
  const padding = Buffer.alloc(photos, photos);
  return { name: 'shelf-' + photos + (again ? '-again' : '') + '.png', mimeType: 'image/png',
    buffer: Buffer.concat([Buffer.from(ONE_PIXEL_PNG, 'base64'), padding]) };
}

/* One product's answer, by its place in the list the page sent. */
function observation(candidate, changes) {
  return Object.assign({
    candidate: candidate, present: true, visible_count: 7, count_type: 'visible-exact',
    coverage: 'complete', reliability: 'good', obstructed: false,
    explanation: 'Seven cartons are clearly visible in the front row.'
  }, changes);
}

/* What the model answers for the whole photo. `reading({...})` keeps the
   one-product shape the single-SKU tests use. */
function reading(changes, more) {
  return Object.assign({
    usable: true, quality_flags: [], unmatched: [], explanation: '',
    observations: [observation(1, changes)]
  }, more);
}

beforeEach(function () { site.anthropic.replies.shelf = reading({}); });

async function stockPage(page, language) {
  await page.goto(site.url + '/stock#items');
  await page.locator('#add-item:enabled').waitFor({ timeout: 8000 });
  if (language) { await page.selectOption('#stock-language', language); }
}

/* One tracked product on the front fridge, counted at the start, with a
   shelf target. `row` is its place in the stock table, for the settings
   button that sets that target. */
async function addProduct(page, { original, description, unit = 'carton', count = '0', target, row = 0 }) {
  await page.click('#add-item');
  for (const [name, value] of Object.entries({ original: original, description: description,
    unit: unit, location: 'Front fridge', quantity: count })) {
    await page.locator('#manual-item [name="' + name + '"]').fill(value);
  }
  await page.locator('#manual-item button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
  if (!target) { return; }
  await page.locator('[data-settings]').nth(row).click();
  await page.locator('#item-settings [name="shelf-target"]').fill(target);
  await page.locator('#item-settings button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
}

/* Milk on the front fridge, counted at the start, with a shelf target. */
async function addMilk(page, { count = '', target = '10' } = {}) {
  await addProduct(page, { original: 'WHOLE MILK 1GAL', description: '全脂牛奶',
    count: count || '0', target: target });
}

/* One scan: open the dialog, hand it a photo, wait for the number to check. */
async function scan(page, again = false) {
  await page.locator('[data-scan]').first().click();
  await page.locator('#shelf-photo').setInputFiles(shelfPhoto(again));
}
async function checkStep(page) {
  await page.locator('#shelf-scan [name="count-0"]').waitFor({ timeout: 10000 });
}
async function confirmScan(page) {
  await page.locator('#shelf-scan button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
}
function refillRow(page) {
  return page.locator('[data-refill-row]').first().innerText();
}

test('T01-T03, T22: 7, then 8, then 10 cartons against a target of 10 asks for 3, then 2, then nothing', async function () {
  const page = await openPage(browser);
  await signUp(page, site, newEmail('shelf'), 'test password');
  await stockPage(page);
  await addMilk(page);

  await scan(page);
  await checkStep(page);
  const sentence = await page.locator('#stock-dialog').innerText();
  assert.match(sentence, /I can see 7 carton/);
  assert.match(sentence, /Refill: 3 carton/);
  assert.equal(await page.locator('#shelf-scan [name="count-0"]').inputValue(), '7');
  await confirmScan(page);
  assert.match(await refillRow(page), /Refill 3 carton/);

  site.anthropic.replies.shelf = reading({ visible_count: 8 });
  await scan(page);
  await checkStep(page);
  await confirmScan(page);
  assert.match(await refillRow(page), /Refill 2 carton/, 'the old shortage is replaced, not added to');

  site.anthropic.replies.shelf = reading({ visible_count: 10 });
  await scan(page);
  await checkStep(page);
  await confirmScan(page);
  const full = await refillRow(page);
  assert.match(full, /Full/);
  assert.ok(!/Refill/.test(full), 'nothing is left to put out');

  // Every count is kept, and the shelf has one live answer, not three.
  const saved = await (await page.request.get(site.url + '/api/inventory')).json();
  assert.deepEqual(saved.inventory.movements.map(function (movement) { return movement.quantity; }), [0, 7, 8, 10]);
  assert.equal(await page.locator('[data-refill-row]').count(), 1);
  for (const movement of saved.inventory.movements.slice(1)) {
    assert.match(movement.note, new RegExp('^photo-count:[0-9a-f]{64} saw:' + movement.quantity + '$'),
      'only the photo\'s digest and the number the reading offered are kept');
  }

  // T08: the same photo again, under another name, counts nothing twice.
  await scan(page, true);
  await checkStep(page);
  await page.locator('#shelf-scan button[type="submit"]').click();
  await page.getByText('This photo has already been counted.', { exact: false }).waitFor({ timeout: 8000 });
  await page.locator('[data-cancel]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
  assert.equal((await (await page.request.get(site.url + '/api/inventory')).json()).inventory.movements.length, 4);

  // T22: the P&L page's stock area reads the same ledger.
  await page.goto(site.url + '/dashboard', { waitUntil: 'networkidle' });
  await page.locator('#add-item:enabled').waitFor();
  assert.match(await page.locator('#dashboard-stock-items .stock-count').first().innerText(), /^10/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('T06: a photo the owner does not confirm changes nothing', async function () {
  const page = await openPage(browser);
  await signUp(page, site, newEmail('shelf-cancel'), 'test password');
  await stockPage(page);
  await addMilk(page);
  await scan(page);
  await checkStep(page);
  await page.locator('[data-cancel]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
  const saved = await (await page.request.get(site.url + '/api/inventory')).json();
  assert.equal(saved.inventory.movements.length, 1, 'only the count made when the item was added');
  assert.match(await refillRow(page), /Refill 10 carton/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('T05, T07, T10: an unreliable reading offers no number, and the owner\'s own number is what is saved', async function () {
  const page = await openPage(browser);
  await signUp(page, site, newEmail('shelf-unsure'), 'test password');
  await stockPage(page);
  await addMilk(page);

  site.anthropic.replies.shelf = reading({ usable: false, visible_count: null, count_type: 'none',
    reliability: 'poor', coverage: 'unclear', quality_flags: ['dark'], explanation: 'The fridge is too dark to count.' });
  await scan(page);
  await checkStep(page);
  assert.match(await page.locator('#stock-dialog').innerText(), /Can't count reliably/);
  assert.equal(await page.locator('#shelf-scan [name="count-0"]').inputValue(), '', 'no number is offered');
  await page.locator('[data-cancel]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
  assert.match(await refillRow(page), /Refill 10 carton/, 'nothing changed');

  // T10: a clear photo of part of the shelf. What was seen is said, but it
  // is not offered as the count of the whole shelf.
  site.anthropic.replies.shelf = reading({ coverage: 'partial', visible_count: 6, quality_flags: ['cropped'] });
  await scan(page);
  await checkStep(page);
  assert.match(await page.locator('#stock-dialog').innerText(), /does not show the whole shelf/);
  assert.equal(await page.locator('#shelf-scan [name="count-0"]').inputValue(), '');
  await page.locator('[data-cancel]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });

  // T07: a good reading of 8, which the owner knows is 6.
  site.anthropic.replies.shelf = reading({ visible_count: 8 });
  await scan(page);
  await checkStep(page);
  assert.equal(await page.locator('#shelf-scan [name="count-0"]').inputValue(), '8');
  await page.locator('#shelf-scan [name="count-0"]').fill('6');
  await confirmScan(page);
  assert.match(await refillRow(page), /Refill 4 carton/, 'the owner\'s 6, not the reading\'s 8');
  const saved = await (await page.request.get(site.url + '/api/inventory')).json();
  assert.equal(saved.inventory.movements.length, 2, 'the two cancelled readings saved nothing');
  assert.equal(saved.inventory.movements[1].quantity, 6);
  assert.match(saved.inventory.movements[1].note, /^photo-count:[0-9a-f]{64} saw:8$/,
    'the reading\'s 8 is kept beside the owner\'s 6, so the correction is measurable');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('T17: the supplier\'s wording stays beside the translation, and the model\'s words are never HTML', async function () {
  const page = await openPage(browser);
  await signUp(page, site, newEmail('shelf-chinese'), 'test password');
  await stockPage(page, 'zh-CN');
  await addMilk(page);
  site.anthropic.replies.shelf = reading({ visible_count: 8,
    explanation: '<img src=x onerror="window.broken=1">识别到 8 盒。' });
  await scan(page);
  await checkStep(page);
  const dialog = page.locator('#stock-dialog');
  assert.match(await dialog.innerText(), /WHOLE MILK 1GAL/, 'the supplier\'s own wording');
  assert.match(await dialog.innerText(), /全脂牛奶/);
  assert.match(await dialog.innerText(), /识别到 8 carton/);
  assert.match(await dialog.innerText(), /<img src=x/, 'shown as text, exactly as it came');
  assert.equal(await dialog.locator('img:not(.stock-preview)').count(), 0, 'nothing from the model became an element');
  assert.equal(await page.evaluate(function () { return window.broken; }), undefined);
  await confirmScan(page);
  assert.match(await refillRow(page), /补货 2 carton/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('T13, T16: without the reading service the count is still entered by hand, and nothing saved is lost', async function () {
  const guest = await openPage(browser, { ignore: /401|403/ });
  await stockPage(guest);
  await addMilk(guest, { count: '4' });
  await scan(guest);
  await guest.getByText('Log in to have a photo read.', { exact: false }).first().waitFor({ timeout: 8000 });
  await guest.locator('[data-cancel]').click();
  assert.match(await refillRow(guest), /Refill 6 carton/, 'a guest keeps counting by hand');
  await guest.context().close();

  const page = await openPage(browser, { ignore: /503/ });
  await signUp(page, site, newEmail('shelf-offline'), 'test password');
  await stockPage(page);
  await addMilk(page, { count: '4' });
  await page.route('**/api/read-document', function (route) {
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' });
  });
  await scan(page);
  await page.getByText('The photo could not be read.', { exact: false }).waitFor({ timeout: 8000 });
  await page.locator('[data-cancel]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
  assert.match(await refillRow(page), /Refill 6 carton/, 'the count from before the failed photo stands');

  await page.locator('[data-movement="count"]').first().click();
  await page.locator('#movement-form [name="quantity"]').fill('9');
  await page.locator('#movement-form button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({ state: 'hidden' });
  assert.match(await refillRow(page), /Refill 1 carton/);
  await page.context().close();
});

test('one photo of the fridge counts milk and oat milk at once, each against its own target', async function () {
  const page = await openPage(browser);
  await signUp(page, site, newEmail('shelf-many'), 'test password');
  await stockPage(page);
  await addMilk(page, { count: '0', target: '10' });
  await addProduct(page, { original: 'OATLY BARISTA 32OZ', description: '燕麦奶', target: '6', row: 1 });
  await addProduct(page, { original: 'PACIFIC SOY 32OZ', description: '豆奶', target: '4', row: 2 });

  // The milk is clearly visible, the oat milk is behind the back row, and
  // the soy milk is nowhere in the photo.
  site.anthropic.replies.shelf = {
    usable: true, quality_flags: ['cropped'], unmatched: ['a jug of tea concentrate'],
    explanation: 'The front row is clear; the back row is cut off.',
    observations: [
      observation(1, { visible_count: 7 }),
      observation(2, { visible_count: 2, coverage: 'partial', explanation: 'Two in front; more may be behind.' }),
      observation(3, { present: false, visible_count: null, count_type: 'none', coverage: 'unclear',
        explanation: 'No soy milk in this photo.' })
    ]
  };
  await scan(page);
  await checkStep(page);

  const dialog = page.locator('#stock-dialog');
  assert.equal(await dialog.locator('[data-scan-row]').count(), 3, 'one row per product on the shelf');
  assert.match(await dialog.innerText(), /Refill: 3 carton/, 'the milk, counted');
  assert.match(await dialog.innerText(), /does not show the whole shelf/, 'the oat milk, only partly seen');
  assert.match(await dialog.innerText(), /Not visible in this photo/, 'the soy milk, not seen at all');
  assert.match(await dialog.innerText(), /a jug of tea concentrate/, 'what is on the shelf but not tracked');

  // The milk's number is offered; the other two are the owner's to fill in
  // or to leave alone.
  assert.equal(await dialog.locator('[name="count-0"]').inputValue(), '7');
  assert.equal(await dialog.locator('[name="count-1"]').inputValue(), '');
  assert.equal(await dialog.locator('[name="count-2"]').inputValue(), '');
  await dialog.locator('[name="count-1"]').fill('5');
  await confirmScan(page);

  const rows = await page.locator('[data-refill-row]').allInnerTexts();
  assert.match(rows.join(' | '), /全脂牛奶[\s\S]*?Refill 3 carton/, 'milk: 7 of 10');
  assert.match(rows.join(' | '), /燕麦奶[\s\S]*?Refill 1 carton/, 'oat milk: the owner\'s 5 of 6');
  assert.match(rows.join(' | '), /豆奶[\s\S]*?Refill 4 carton/, 'soy milk: still the 0 it was before the photo');

  const saved = await (await page.request.get(site.url + '/api/inventory')).json();
  const counts = saved.inventory.movements.filter(function (movement) {
    return String(movement.note || '').startsWith('photo-count:');
  });
  assert.equal(counts.length, 2, 'two products counted from the one photo, the third left alone');
  assert.deepEqual(counts.map(function (movement) { return movement.itemId; }).includes(
    saved.inventory.items[2].id), false, 'nothing from this photo touched the soy milk');
  assert.equal(saved.inventory.movements.filter(function (movement) {
    return movement.itemId === saved.inventory.items[2].id;
  }).length, 1, 'the soy milk still has only the count it was created with');
  assert.equal(new Set(counts.map(function (movement) { return movement.note.split(' ')[0]; })).size, 1,
    'both name the same photo');
  assert.match(counts[0].note, / saw:7$/, 'the milk count is the number the reading offered');
  assert.ok(!counts[1].note.includes(' saw:'), 'the oat milk number was the owner\'s own, offered by nobody');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
