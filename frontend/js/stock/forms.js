/* One focused form per action. Counts are absolute; delivery, usage and
   waste are movements in the item's confirmed unit and location. Item
   settings hold what the owner confirmed about buying an item; resolving a
   delivery check records what the supplier did about it. */
import { addItem, recordMovement, stockOnHand, updateItem, replaceCheck } from './ledger.js';
import { store, saveStock } from './storage.js';
import { drafts, discardDraft, fingerprint } from './files.js';
import { preparePhotoForUpload } from '../dashboard/photos/photo-reader.js';
import { latestCount, recordShelfCount, refillNeeded, requestShelfCount, shelfDraft } from './shelf.js';
import { words, currentLanguage } from './language.js';
import { field, html } from './views.js';
import { financialInvoice, invoiceMonth, invoiceId } from './invoice.js';
import { reviewLinesHtml, wireReviewLines, applyReviewedLines } from './review-lines.js';
import { resolvedCheck, creditInvoice } from './receiving.js';
import { ALL_COST_LINES, LINE_LABELS } from '../dashboard/cost-groups.js';
let refreshed = function () {};
let report = function () {};
const dialog = document.getElementById('stock-dialog');
export function wireForms(onRefresh, onMessage) { refreshed = onRefresh; report = onMessage; }
export function canChange() { return store.ready && !store.busy && !store.dirty; }
function id() { return crypto.randomUUID(); }
function number(form, name) {
  const value = new FormData(form).get(name);
  if (typeof value !== 'string' || !value.trim()) { throw new Error('required'); }
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 0) { throw new Error('quantity'); }
  return quantity;
}
function value(form, name) { return String(new FormData(form).get(name) || '').trim(); }
/* Replaces what the dialog shows. A form with several steps (the shelf
   scan) draws each step with this; cancel always closes. */
function fill(title, body) {
  dialog.innerHTML = `<h2 id="dialog-title">${html(title)}</h2>${body}`;
  dialog.querySelector('[data-cancel]').addEventListener('click', function () { dialog.close(); });
}
function open(title, body) {
  fill(title, body);
  dialog.showModal();
}
function buttons(key) {
  return `<p class="stock-danger" id="form-error" role="alert" hidden></p><div class="stock-actions"><button class="btn" type="button" data-cancel>${words('cancel')}</button><button class="btn primary" type="submit">${words(key)}</button></div>`;
}
/* Validation errors stay in the form; persistence errors remain visible after it closes. */
async function submit(form, operation) {
  if (!canChange()) { return; }
  try {
    const next = operation();
    for (const button of form.querySelectorAll('button')) { button.disabled = true; }
    const saved = await saveStock(next.inventory || next, next.invoice);
    if (saved && next.draftId) { discardDraft(next.draftId); }
    dialog.close();
    refreshed();
    if (!saved) { report(store.note); }
  } catch (problem) {
    const error = document.getElementById('form-error');
    error.textContent = words(FORM_PROBLEMS.includes(problem.message) ? problem.message : 'invalid');
    error.hidden = false;
  }
}
// Problems a form names by their own message rather than the general one.
const FORM_PROBLEMS = ['chooseItem', 'creditNeeded', 'wholeNumber', 'alreadyCounted', 'newerCount'];
export function showAddItem() {
  if (!canChange()) { report(store.note); return; }
  open(words('addItem'), `<form id="manual-item"><p>${words('manualTranslation')}</p>${field('original','original','','text','maxlength="160"')}${field('description','description','','text','maxlength="160"')}<div class="stock-grid">${field('unit','unit','','text','maxlength="40"')}${field('location','location','','text','maxlength="120"')}</div><p class="stock-hint">${words('unitHint')}</p>${field('quantity','onHand','','number','min="0" max="1000000000" step="any"')}${buttons('save')}</form>`);
  const form = document.getElementById('manual-item');
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submit(form, function () {
      const item = { id: id(), original: value(form,'original'), description: value(form,'description'), unit: value(form,'unit'), location: value(form,'location') };
      const exists = store.inventory.items.some(function (existing) { return existing.original === item.original && existing.unit === item.unit && existing.location === item.location; });
      if (exists) { throw new Error('duplicate'); }
      return recordMovement(addItem(store.inventory,item), { id: id(), itemId: item.id, type: 'count', quantity: number(form,'quantity') });
    });
  });
}
export function showMovement(itemId, type) {
  if (!canChange() || !['count','delivery','usage','waste'].includes(type)) { return; }
  const item = store.inventory.items.find(function (entry) { return entry.id === itemId; });
  if (!item) { return; }
  const balance = stockOnHand(store.inventory,itemId);
  open(words(type), `<p><strong>${html(item.description)}</strong><br>${html(item.original)} · ${html(item.location)} · ${html(item.unit)}</p><p>${words('onHand')}: ${balance === null ? words('unknown') : balance}</p><form id="movement-form">${field('quantity',type === 'count' ? 'onHand':'amount','','number','min="0" max="1000000000" step="any"')}<p class="stock-hint">${words('movementHint')}</p><label class="stock-field">${words('note')}<input name="note" maxlength="300"></label>${buttons('save')}</form>`);
  const form = document.getElementById('movement-form');
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submit(form, function () { return recordMovement(store.inventory, { id:id(), itemId:itemId, type:type, quantity:number(form,'quantity'), note:value(form,'note') }); });
  });
}
/* Every invoice line is editable, with source wording alongside translation,
   and checked against what arrived (review-lines.js). */
export function showInvoiceReview(draftId) {
  if (!canChange()) { return; }
  const draft = drafts.find(function (entry) { return entry.id === draftId && entry.status === 'ready'; });
  if (!draft) { return; }
  if (draft.owner !== store.user?.email) { report('sessionExpired'); return; }
  function categoryHtml(line, index) {
    const options = ALL_COST_LINES.map(function (category) {
      return `<option value="${category}" ${category === line.category ? 'selected' : ''}>${html(words('cost-'+category) === 'cost-'+category ? LINE_LABELS[category] : words('cost-'+category))}</option>`;
    }).join('');
    return `<p>${words('invoiceAmount')}: ${html(line.amount)} ${html(draft.document.currency || '')}</p><label class="stock-field">${words('costLine')}<select name="category-${index}">${options}</select></label>`;
  }
  const lines = reviewLinesHtml(draft.document, store.inventory, {
    isTracked: function (line) { return ['cogs','packaging'].includes(line.category); }, categoryHtml: categoryHtml
  });
  open(words('reviewTitle'), `<p>${html(draft.name)} · ${html(draft.document.supplier || '')}</p><img class="stock-preview" src="${draft.preview}" alt="${html(draft.name)}"><p>${words('countHint')}</p><form id="invoice-stock">${field('month','financialMonth',invoiceMonth(draft.document),'month')}<label><input type="checkbox" name="financial" checked> ${words('addFinancial')}</label><p class="stock-hint">${words('financialHint')}</p>${lines}${buttons('saveReview')}</form>`);
  const form = document.getElementById('invoice-stock');
  wireReviewLines(form, draft.document, store.inventory);
  form.addEventListener('submit',function (event) {
    event.preventDefault();
    submit(form,function () {
      const categories = draft.document.lines.map(function (line, index) { return value(form, 'category-'+index); });
      const result = applyReviewedLines(form, draft.document, store.inventory, draft.hash, invoiceId(draft.hash), categories);
      const corrections = draft.document.lines.map(function (line, index) {
        return Object.assign({ category: categories[index] }, result.corrections[index] || {});
      });
      const invoice = form.elements.financial.checked ? financialInvoice(draft, value(form, 'month'), corrections) : null;
      if (!result.tracked && !invoice) { throw new Error('no items'); }
      return { inventory: result.inventory, invoice: invoice, draftId: draft.id };
    });
  });
}

/* A number the owner may leave empty: undefined when empty. */
function optionalNumber(form, name) {
  const text = value(form, name);
  if (!text) { return undefined; }
  const quantity = Number(text);
  if (!Number.isFinite(quantity) || quantity < 0) { throw new Error('quantity'); }
  return quantity;
}

/* What the owner confirmed about buying an item: the minimum and target to
   keep, who to buy from, what a supplier's pack holds, and the supplier
   codes that are this item (untick one to take a wrong match off). */
export function showItemSettings(itemId) {
  if (!canChange()) { report(store.note); return; }
  const item = store.inventory.items.find(function (entry) { return entry.id === itemId; });
  if (!item) { return; }
  const reorder = item.reorder || {};
  const packs = [...(item.packs || []), { unit: '', contains: '' }];
  let packRows = '';
  packs.forEach(function (pack, index) {
    packRows += `<div class="stock-pack-row"><span>1</span><label class="stock-field"><span>${words('packUnit')}</span><input name="pack-unit-${index}" value="${html(pack.unit)}" maxlength="40"></label><span>=</span><label class="stock-field"><span>${html(item.unit)}</span><input name="pack-contains-${index}" type="number" min="0" step="any" value="${html(pack.contains)}"></label></div>`;
  });
  let buyOptions = `<option value="">${html(item.unit)}</option>`;
  for (const pack of item.packs || []) {
    buyOptions += `<option value="${html(pack.unit)}" ${pack.unit === reorder.buyUnit ? 'selected' : ''}>${html(pack.unit)}</option>`;
  }
  let codes = `<p class="stock-hint">${words('noCodes')}</p>`;
  if ((item.supplierCodes || []).length) {
    codes = item.supplierCodes.map(function (entry, index) {
      return `<label><input type="checkbox" name="code-${index}" checked> ${html(entry.supplier)} · ${html(entry.code)}</label>`;
    }).join('<br>');
  }
  const number = function (name, key, current) {
    return `<label class="stock-field"><span>${words(key)} (${html(item.unit)})</span><input name="${name}" type="number" min="0" max="1000000000" step="any" value="${current === undefined ? '' : html(current)}"></label>`;
  };
  open(words('itemSettings'), `<p><strong>${html(item.description)}</strong><br>${html(item.original)} · ${html(item.location)} · ${html(item.unit)}</p><form id="item-settings"><fieldset class="stock-mode"><legend>${words('needsRefilling')}</legend><p class="stock-hint">${words('shelfTargetHint')}</p>${number('shelf-target','shelfTarget',item.shelfTarget)}</fieldset><p class="stock-hint">${words('reorderHint')}</p><div class="stock-grid">${number('minimum','minimum',reorder.minimum)}${number('target','target',reorder.target)}</div><label class="stock-field"><span>${words('preferredSupplier')}</span><input name="supplier" maxlength="120" value="${html(reorder.supplier || '')}"></label><fieldset class="stock-mode"><legend>${words('packSizes')}</legend><p class="stock-hint">${words('packSizesHint')}</p>${packRows}</fieldset><label class="stock-field"><span>${words('buyIn')}</span><select name="buy-unit">${buyOptions}</select></label><fieldset class="stock-mode"><legend>${words('supplierCodes')}</legend>${codes}</fieldset>${buttons('save')}</form>`);
  const form = document.getElementById('item-settings');
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submit(form, function () {
      const nextPacks = [];
      packs.forEach(function (pack, index) {
        const unit = value(form, 'pack-unit-'+index);
        const contains = optionalNumber(form, 'pack-contains-'+index);
        if (unit && contains > 0) { nextPacks.push({ unit: unit, contains: contains }); }
        else if (unit || contains !== undefined) { throw new Error('pack'); }
      });
      const nextReorder = {};
      const minimum = optionalNumber(form, 'minimum');
      const target = optionalNumber(form, 'target');
      if (minimum !== undefined) { nextReorder.minimum = minimum; }
      if (target !== undefined) { nextReorder.target = target; }
      if (value(form, 'supplier')) { nextReorder.supplier = value(form, 'supplier'); }
      const buyUnit = value(form, 'buy-unit');
      if (buyUnit && nextPacks.some(function (pack) { return pack.unit === buyUnit; })) { nextReorder.buyUnit = buyUnit; }
      const keptCodes = (item.supplierCodes || []).filter(function (entry, index) { return form.elements['code-'+index].checked; });
      const shelfTarget = optionalNumber(form, 'shelf-target');
      return updateItem(store.inventory, itemId, {
        packs: nextPacks.length ? nextPacks : null,
        reorder: Object.keys(nextReorder).length ? nextReorder : null,
        supplierCodes: keptCodes.length ? keptCodes : null,
        shelfTarget: shelfTarget === undefined ? null : shelfTarget
      });
    });
  });
}

/* Resolves a delivery check: nothing more is owed, or the supplier
   confirmed a credit. A credit is only taken off the P&L when the owner
   ticks it, once, in the month they choose. */
export function showResolveCheck(checkId) {
  if (!canChange()) { report(store.note); return; }
  const check = (store.inventory.checks || []).find(function (entry) { return entry.id === checkId && entry.state === 'open'; });
  if (!check) { return; }
  const money = check.possibleValue === undefined ? words('valueUnknown') : `${html(check.possibleValue.toFixed(2))} ${html(check.currency || '')}`;
  const toFinance = store.user ? `<label><input type="checkbox" name="to-finance"> ${words('creditToFinance')}</label>${field('credit-month','financialMonth',new Date().toISOString().slice(0, 7),'month')}` : '';
  open(words('resolveTitle'), `<p><strong>${html(check.original)}</strong><br>${html(check.supplier)} ${html(check.number)}</p><p>${words('billed')}: ${html(check.billed.quantity)} ${html(check.billed.unit)} · ${words('received')}: ${check.status === 'unchecked' ? words('arrival-unchecked') : html(check.received.quantity) + ' ' + html(check.received.unit)}</p><p>${words('possibleValue')}: ${money}</p><form id="resolve-check"><label><input type="radio" name="state" value="resolved" checked> ${words('resolvedNoCredit')}</label><label><input type="radio" name="state" value="credited"> ${words('creditReceived')}</label><div data-credit hidden><div class="stock-grid"><label class="stock-field"><span>${words('creditAmount')}</span><input name="credit-amount" type="number" min="0" step="any"></label><label class="stock-field"><span>${words('creditReference')}</span><input name="credit-reference" maxlength="60"></label></div>${toFinance}</div><label class="stock-field"><span>${words('note')}</span><input name="note" maxlength="300"></label>${buttons('save')}</form>`);
  const form = document.getElementById('resolve-check');
  const creditFields = form.querySelector('[data-credit]');
  function showCredit() {
    const crediting = form.elements.state.value === 'credited';
    creditFields.hidden = !crediting;
    for (const input of creditFields.querySelectorAll('input')) { input.disabled = !crediting; }
  }
  showCredit();
  form.addEventListener('change', showCredit);
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submit(form, function () {
      const state = form.elements.state.value;
      const resolution = { state: state, at: new Date().toISOString(), note: value(form, 'note') };
      let invoice = null;
      if (state === 'credited') {
        const amount = optionalNumber(form, 'credit-amount');
        if (!(amount > 0)) { throw new Error('creditNeeded'); }
        resolution.credit = { amount: amount, reference: value(form, 'credit-reference') };
        if (form.elements['to-finance']?.checked) {
          invoice = creditInvoice(check, resolution.credit, value(form, 'credit-month'), new Date().toISOString().slice(0, 10));
          resolution.credit.invoiceId = invoice.id;
        }
      }
      return { inventory: replaceCheck(store.inventory, resolvedCheck(check, resolution)), invoice: invoice };
    });
  });
}

/* Counting one shelf from a photo: the owner picks the photo, Claude reads
   it, the owner checks or corrects the number, and only then is it saved,
   as the ledger's own absolute count of that one item on that one shelf.
   Nothing else is touched, the photo is not kept, and how much to refill
   is worked out from the owner's shelf target, never from the photo. */
export function showShelfScan(itemId) {
  if (!canChange()) { report(store.note); return; }
  const item = store.inventory.items.find(function (entry) { return entry.id === itemId; });
  if (!item) { return; }
  // The newest count for this shelf as the photo is taken. A count saved
  // in the meantime stops this one rather than writing over it.
  const since = latestCount(store.inventory, itemId);
  const heading = `<p><strong>${html(item.description)}</strong><br>${html(item.original)} · ${html(item.location)} · ${html(item.unit)}</p>`;
  const targetLine = item.shelfTarget === undefined
    ? `<p class="stock-hint">${words('setShelfTarget')}</p>`
    : `<p>${words('shelfTarget')}: ${html(item.shelfTarget)} ${html(item.unit)}</p>`;

  /* Step one, and where every failure comes back to: choose a photo. */
  function choosePhoto(problem) {
    fill(words('scanTitle'), `${heading}${targetLine}${problem ? `<p class="stock-danger" role="alert">${words(problem)}</p>` : ''}<p class="stock-hint">${words('photoAdvice')}</p><p class="stock-hint">${words('shelfPhotoPrivacy')}</p><input id="shelf-photo" type="file" accept="image/*" capture="environment" hidden><div class="stock-actions"><button class="btn" type="button" data-cancel>${words('cancel')}</button><button class="btn primary" type="button" id="choose-shelf-photo">${words('takePhoto')}</button></div>`);
    const input = document.getElementById('shelf-photo');
    document.getElementById('choose-shelf-photo').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () { if (input.files.length) { readPhoto(input.files[0]); } });
  }

  /* Step two: shrink the photo as the invoice reader does, and ask the
     site's authenticated reader to count this one shelf. */
  async function readPhoto(file) {
    if (file.size > 20_000_000 || !/^image\/(jpeg|png|webp)$/.test(file.type)) { choosePhoto('unsupportedPhoto'); return; }
    let hash;
    let photo;
    try {
      hash = await fingerprint(file);
      photo = await preparePhotoForUpload(file);
    } catch { choosePhoto('failed'); return; }
    if (!dialog.open) { return; }
    fill(words('scanTitle'), `${heading}<img class="stock-preview" src="${photo.preview}" alt=""><p role="status">${words('readingPhoto')}</p><div class="stock-actions"><button class="btn" type="button" data-cancel>${words('cancel')}</button></div>`);
    let reading;
    try {
      reading = await requestShelfCount(photo, item, currentLanguage());
    } catch (problem) {
      // A reading that arrives after the owner has closed the dialog is
      // simply dropped: nothing it says can reach the ledger on its own.
      if (dialog.open) { choosePhoto(problem.message === 'authNeeded' ? 'signInToScan' : 'scanFailed'); }
      return;
    }
    if (!dialog.open) { return; }
    checkCount(hash, photo, reading);
  }

  /* Step three: the number to check, in a sentence, with whatever stopped
     it being offered. The owner may change it, or type one themselves. */
  function checkCount(hash, photo, reading) {
    const draft = shelfDraft(reading);
    let sentence = '';
    if (draft.seen !== null) { sentence += `${words('iCanSee')} ${html(draft.seen)} ${html(item.unit)}. `; }
    if (item.shelfTarget !== undefined) { sentence += `${words('target')}: ${html(item.shelfTarget)} ${html(item.unit)}. `; }
    if (draft.count !== null && item.shelfTarget !== undefined) {
      sentence += `${words('refill')}: ${html(refillNeeded(item.shelfTarget, draft.count))} ${html(item.unit)}.`;
    }
    const problem = draft.problem ? `<p class="stock-danger" role="alert">${words(draft.problem)}</p>` : '';
    const explanation = reading.explanation ? `<p class="stock-secondary">${html(reading.explanation)}</p>` : '';
    fill(words('scanTitle'), `${heading}<img class="stock-preview" src="${photo.preview}" alt=""><p><strong>${sentence}</strong></p>${problem}${explanation}<form id="shelf-scan">${field('count', 'onThisShelf', draft.count === null ? '' : draft.count, 'number', 'min="0" max="100000" step="1"')}<p class="stock-hint">${words('emptyShelfCheck')}</p>${buttons('confirmCounts')}</form>`);
    const form = document.getElementById('shelf-scan');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submit(form, function () {
        const confirmed = number(form, 'count');
        return recordShelfCount(store.inventory, {
          id: id(), itemId: itemId, quantity: confirmed, hash: hash,
          // The number the reading offered, kept beside the owner's so how
          // often and how far it is wrong can be measured later.
          offered: draft.count,
          at: new Date().toISOString(), since: since ? since.id : null
        });
      });
    });
  }

  choosePhoto(null);
  dialog.showModal();
}
