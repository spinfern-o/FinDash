/* One focused form per action. Counts are absolute; delivery, usage and
   waste are movements in the item's confirmed unit and location. */
import { addItem, recordMovement, stockOnHand } from './ledger.js';
import { store, saveStock } from './storage.js';
import { drafts, discardDraft } from './files.js';
import { words } from './language.js';
import { field, html } from './views.js';
import { financialInvoice, invoiceMonth } from './invoice.js';
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
function open(title, body) {
  dialog.innerHTML = `<h2 id="dialog-title">${html(title)}</h2>${body}`;
  dialog.showModal();
  dialog.querySelector('[data-cancel]').addEventListener('click', function () { dialog.close(); });
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
  } catch {
    const error = document.getElementById('form-error');
    error.textContent = words('invalid');
    error.hidden = false;
  }
}
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
/* Every invoice line is editable, with source wording alongside translation.
   Newly received stock is included in the physical count, never added twice. */
export function showInvoiceReview(draftId) {
  if (!canChange()) { return; }
  const draft = drafts.find(function (entry) { return entry.id === draftId && entry.status === 'ready'; });
  if (!draft) { return; }
  if (draft.owner !== store.user?.email) { report('sessionExpired'); return; }
  let lines = '';
  draft.document.lines.forEach(function (line,index) {
    const track = ['cogs','packaging'].includes(line.category);
    const options = ALL_COST_LINES.map(function (category) {
      return `<option value="${category}" ${category === line.category ? 'selected' : ''}>${html(words('cost-'+category) === 'cost-'+category ? LINE_LABELS[category] : words('cost-'+category))}</option>`;
    }).join('');
    lines += `<fieldset class="stock-review-line"><legend>${html(line.description)}</legend><p>${words('invoiceAmount')}: ${html(line.amount)} ${html(draft.document.currency || '')}</p><label class="stock-field">${words('costLine')}<select name="category-${index}">${options}</select></label><label><input name="include-${index}" type="checkbox" ${track ? 'checked':''}> ${words('include')}</label><div class="stock-line-fields" ${track ? '':'hidden'}>${field('original-'+index,'original',line.original || line.description,'text','maxlength="160"')}${field('description-'+index,'description',line.description,'text','maxlength="160"')}<p>${words('quantity')}: ${line.quantity === null ? '—':html(line.quantity)} ${html(line.unit || '')}</p><div class="stock-grid">${field('unit-'+index,'unit',line.unit || '','text','maxlength="40"')}${field('location-'+index,'location','','text','maxlength="120"')}</div>${field('count-'+index,'onHand','','number','min="0" max="1000000000" step="any"')}</div></fieldset>`;
  });
  open(words('reviewTitle'), `<p>${html(draft.name)} · ${html(draft.document.supplier || '')}</p><img class="stock-preview" src="${draft.preview}" alt="${html(draft.name)}"><p>${words('countHint')}</p><form id="invoice-stock">${field('month','financialMonth',invoiceMonth(draft.document),'month')}<label><input type="checkbox" name="financial" checked> ${words('addFinancial')}</label><p class="stock-hint">${words('financialHint')}</p>${lines}${buttons('saveReview')}</form>`);
  const form = document.getElementById('invoice-stock');
  function updateRequired() {
    for (const fieldset of form.querySelectorAll('fieldset')) {
      const included = fieldset.querySelector('input[type="checkbox"]').checked;
      fieldset.querySelector('.stock-line-fields').hidden = !included;
      for (const input of fieldset.querySelectorAll('.stock-line-fields input')) { input.disabled = !included; }
    }
  }
  updateRequired();
  form.addEventListener('change',updateRequired);
  form.addEventListener('submit',function (event) {
    event.preventDefault();
    submit(form,function () {
      let next = store.inventory;
      let count = 0;
      const corrections = [];
      draft.document.lines.forEach(function (line,index) {
        corrections[index] = { category: value(form, 'category-'+index) };
        if (!form.elements['include-'+index].checked) { return; }
        const item = { id:id(), original:value(form,'original-'+index), description:value(form,'description-'+index), unit:value(form,'unit-'+index), location:value(form,'location-'+index) };
        Object.assign(corrections[index], { original: item.original, description: item.description });
        const existing = next.items.find(function (entry) { return entry.original === item.original && entry.unit === item.unit && entry.location === item.location; });
        let itemId = item.id;
        if (existing) { itemId = existing.id; } else { next = addItem(next,item); }
        next = recordMovement(next, { id:id(), itemId:itemId, type:'count', quantity:number(form,'count-'+index), note:'source:'+draft.hash });
        count += 1;
      });
      const invoice = form.elements.financial.checked ? financialInvoice(draft, value(form, 'month'), corrections) : null;
      if (!count && !invoice) { throw new Error('no items'); }
      return { inventory: next, invoice: invoice, draftId: draft.id };
    });
  });
}
