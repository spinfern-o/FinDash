/* Daily-work task tests: actual UI, storage, API and stock arithmetic. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startSite } from '../support/site.mjs';
import { launchBrowser, openPage, signUp, newEmail, photoFile } from '../support/browser.mjs';
import { readFixture } from '../support/mock-anthropic.mjs';
let site;
let browser;
before(async function () { site = await startSite(); browser = await launchBrowser(); });
after(async function () { await browser.close(); await site.stop(); });

async function ready(page) {
  await page.goto(site.url + '/stock#items');
  await page.locator('#add-item:enabled').waitFor({timeout:8000}).catch(async function (error) { throw new Error(error.message + '\nErrors: '+page.errors.join(' | ')+'\n'+await page.locator('body').innerText()); });
  await page.selectOption('#stock-language','zh-CN');
}
async function addRice(page, count = '8') {
  await page.click('#add-item');
  const form = page.locator('#manual-item');
  await form.locator('[name="original"]').fill('Jasmine rice');
  await form.locator('[name="description"]').fill('大米');
  await form.locator('[name="unit"]').fill('袋');
  await form.locator('[name="location"]').fill('后仓');
  await form.locator('[name="quantity"]').fill(count);
  await form.locator('button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({state:'hidden'});
}
async function movement(page,type,quantity,success = true) {
  await page.locator('[data-movement="'+type+'"]').first().click();
  await page.locator('#movement-form [name="quantity"]').fill(quantity);
  await page.locator('#movement-form button[type="submit"]').click();
  if (success) { await page.locator('#stock-dialog').waitFor({state:'hidden'}); }
}
function balance(page) { return page.locator('.stock-count').first().innerText(); }

test('Chinese worker adds one item, counts shelves, records delivery/usage/waste, and returns to the same stock', async function () {
  const page = await openPage(browser);
  await ready(page);
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
  await addRice(page);
  assert.equal(await balance(page),'8');
  assert.match(await page.locator('[data-stock-row]').innerText(),/Jasmine rice/);
  assert.match(await page.locator('[data-stock-row]').innerText(),/大米/);
  await movement(page,'delivery','2');
  await movement(page,'usage','3');
  await movement(page,'waste','1');
  assert.equal(await balance(page),'6');
  if (process.env.FINDASH_SCREENSHOTS) { await page.screenshot({path:'/tmp/findash-stock-desktop.png',fullPage:true}); }
  await page.reload();
  await page.locator('#add-item:enabled').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
  assert.equal(await balance(page),'6');
  await movement(page,'usage','7',false);
  assert.equal(await page.locator('#form-error').isVisible(),true);
  await page.locator('[data-cancel]').click();
  assert.equal(await balance(page),'6');
  await movement(page,'count','0');
  assert.equal(await balance(page),'0');
  assert.deepEqual(page.errors,[]);
  await page.context().close();
});

test('Chinese invoice review preserves original, waits for shelf count and does not add invoice quantity twice', async function () {
  const page = await openPage(browser);
  await signUp(page,site,newEmail('stock-ui'),'test password');
  const invoice = readFixture('invoice-reading.json');
  invoice.lines = [{...invoice.lines[2], original:'Jasmine rice, 50 lb bag', description:'茉莉香米'}];
  invoice.total_printed = 76;
  invoice.subtotal_printed = 76;
  site.anthropic.replies.photoFirstLook = invoice;
  await ready(page);
  await page.locator('[data-view="files"]').click();
  await page.locator('#stock-files').setInputFiles(photoFile('rice.png'));
  await page.locator('[data-review]').waitFor();
  const before = await page.request.get(site.url+'/api/inventory');
  assert.deepEqual((await before.json()).inventory.items,[]);
  await page.locator('[data-review]').click();
  assert.equal(await page.locator('[name="original-0"]').inputValue(),'Jasmine rice, 50 lb bag');
  assert.equal(await page.locator('[name="description-0"]').inputValue(),'茉莉香米');
  assert.equal(await page.locator('[name="count-0"]').inputValue(),'');
  await page.locator('[name="location-0"]').fill('后仓');
  await page.locator('[name="unit-0"]').fill('袋');
  await page.locator('[name="count-0"]').fill('8');
  await page.locator('#invoice-stock button[type="submit"]').click();
  await page.locator('#stock-dialog').waitFor({state:'hidden'});
  assert.equal(await balance(page),'8');
  await page.locator('[data-view="files"]').click();
  await page.locator('#stock-files').setInputFiles(photoFile('renamed.png'));
  await page.getByText('这张发票已添加，或正在等待核对。',{exact:true}).waitFor();
  await page.reload();
  await page.locator('#add-item:enabled').waitFor();
  await page.locator('[data-view="items"]').click();
  assert.equal(await balance(page),'8');
  assert.deepEqual(page.errors,[]);
  await page.context().close();
});

test('a photo chosen in the file picker is read, though the page reloads its stock as the picker closes', async function () {
  const page = await openPage(browser);
  await signUp(page,site,newEmail('picker'),'test password');
  const invoice = readFixture('invoice-reading.json');
  invoice.lines = [invoice.lines[2]];
  invoice.total_printed = 76;
  invoice.subtotal_printed = 76;
  site.anthropic.replies.photoFirstLook = invoice;
  await page.goto(site.url + '/stock#files');
  await page.locator('#add-item:enabled').waitFor();
  // Closing the picker gives the page focus back, which reloads its stock
  // from the account at the moment the chosen file arrives.
  await page.evaluate(function () { window.dispatchEvent(new Event('focus')); });
  await page.locator('#stock-files').setInputFiles(photoFile('picked.png'));
  await page.locator('[data-review]').waitFor({ timeout: 8000 });
  assert.equal(await page.locator('#stock-message').isVisible(), false, 'no message saying the photo was refused');
  assert.deepEqual(page.errors,[]);
  await page.context().close();
});

test('account load failures never replace a saved account ledger with an empty browser copy', async function () {
  const page = await openPage(browser,{ignore:/503/});
  await signUp(page,site,newEmail('stock-failure'),'test password');
  await page.route('**/api/inventory',function (route) { return route.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}'}); });
  await page.goto(site.url+'/stock');
  await page.selectOption('#stock-language','zh-CN');
  await page.getByText('暂时无法读取账户库存。请刷新重试；为保护已有记录，暂不允许修改。',{exact:true}).waitFor();
  assert.equal(await page.locator('#add-item').isDisabled(),true);
  await page.context().close();
});

test('phone layout fits a Chinese daily-stock task and backup preserves source names', async function () {
  const page = await openPage(browser,{viewport:{width:390,height:844}});
  await ready(page);
  await addRice(page);
  const fits = await page.evaluate(function () { return document.documentElement.scrollWidth <= window.innerWidth; });
  assert.equal(fits,true,'page fits phone; table may scroll within its own container');
  for (const action of ['count','delivery','usage','waste']) {
    const bounds = await page.locator('[data-movement="'+action+'"]').first().boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, action+' is visible without sideways scrolling');
  }
  if (process.env.FINDASH_SCREENSHOTS) { await page.screenshot({path:'/tmp/findash-stock-phone.png',fullPage:true}); }
  await page.locator('[data-view="settings"]').click();
  const download = page.waitForEvent('download');
  await page.click('#backup-stock');
  const file = await download;
  assert.match(file.suggestedFilename(),/^findash-stock-/);
  assert.deepEqual(page.errors,[]);
  await page.context().close();
});
