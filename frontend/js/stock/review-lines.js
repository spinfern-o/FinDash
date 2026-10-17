/* Each line of an invoice being reviewed, shared by the stock page's review
   (forms.js) and the dashboard's (dashboard/photos/stock-review.js):
   - which of the owner's items it is: one its supplier code was confirmed
     as, one with the same supplier wording (suggested, never assumed), or
     a new item;
   - whether it arrived as billed: in full, short, damaged, not at all, or
     not checked yet. An invoice is not proof that anything arrived, so
     every line starts "not checked yet" until the owner says otherwise, one
     line at a time or with "Everything arrived as billed";
   - how the shelf changes: add what arrived to the last count, or count
     the shelf now, never both, or leave it.

   Confirming remembers the supplier code and any pack size for next time,
   records the shelf change, and keeps a delivery check (receiving.js) for
   every line that didn't arrive in full. The invoice itself is never
   changed here. */

import { addItem, recordMovement, stockBalances, addChecks } from './ledger.js';
import { RECEIPT_STATUSES, unitsPer, billedInItemUnits, newCheck } from './receiving.js';
import { suggestedItems, rememberCode, rememberPack } from './matching.js';
import { words } from './language.js';
import { field, html } from './views.js';

const NEW_ITEM = '__new';

/* The item a line's choice names, or null for a new item. */
function chosenItem(inventory, value) {
  return inventory.items.find(function (item) { return item.id === value; }) || null;
}

/* The item to start with: the one the supplier code was confirmed as, or
   the only item with the same wording. Two or more with the same wording
   wait for the owner to choose. */
function startingChoice(suggestions) {
  if (suggestions.length && suggestions[0].reason === 'code') {
    return suggestions[0].item.id;
  }
  if (suggestions.length === 1) {
    return suggestions[0].item.id;
  }
  if (suggestions.length > 1) {
    return '';
  }
  return NEW_ITEM;
}

/* The <option>s for which item a line is. */
function itemOptionsHtml(suggestions, chosen) {
  let options = '';
  if (chosen === '') {
    options += `<option value="" selected>${words('chooseItem')}</option>`;
  }
  for (const suggestion of suggestions) {
    const item = suggestion.item;
    const selected = item.id === chosen ? ' selected' : '';
    const reason = words(suggestion.reason === 'code' ? 'matchedByCode' : 'matchedByWording');
    options += `<option value="${html(item.id)}"${selected}>${html(item.description)} · ${html(item.location)} · ${html(item.unit)} (${reason})</option>`;
  }
  const isNew = chosen === NEW_ITEM ? ' selected' : '';
  return options + `<option value="${NEW_ITEM}"${isNew}>${words('newItem')}</option>`;
}

/* One line's fields, under its description and what the invoice billed. */
function lineHtml(document, line, index, inventory, options) {
  const suggestions = suggestedItems(inventory, document.supplier, line);
  const chosen = startingChoice(suggestions);
  const billed = `${line.quantity === null || line.quantity === undefined ? '—' : html(line.quantity)} ${html(line.unit || '')}`;
  const code = line.code ? ` · ${html(line.code)}` : '';
  const statuses = RECEIPT_STATUSES.map(function (status) {
    const selected = status === 'unchecked' ? ' selected' : '';
    return `<option value="${status}"${selected}>${words('arrival-' + status)}</option>`;
  }).join('');
  const category = options.categoryHtml ? options.categoryHtml(line, index) : '';
  const tracked = options.isTracked(line) ? ' checked' : '';
  return `<fieldset class="stock-review-line" data-review-line="${index}"><legend>${html(line.description)}</legend>
    <p class="stock-secondary">${html(line.original || line.description)}${code} · ${words('billed')}: ${billed}</p>${category}
    <label><input name="include-${index}" type="checkbox"${tracked}> ${words('include')}</label>
    <div class="stock-line-fields">
      <label class="stock-field"><span>${words('whichItem')}</span><select name="item-${index}">${itemOptionsHtml(suggestions, chosen)}</select></label>
      <div class="stock-new-item" data-new-item>${field('original-' + index, 'original', line.original || line.description, 'text', 'maxlength="160"')}${field('description-' + index, 'description', line.description, 'text', 'maxlength="160"')}<div class="stock-grid">${field('unit-' + index, 'unit', line.unit || '', 'text', 'maxlength="40"')}${field('location-' + index, 'location', '', 'text', 'maxlength="120"')}</div></div>
      <div class="stock-grid">
        <label class="stock-field"><span>${words('arrived')}</span><select name="status-${index}">${statuses}</select></label>
        <label class="stock-field" data-received><span>${words('received')} (<span data-unit-label></span>)</span><input name="received-${index}" type="number" min="0" max="1000000000" step="any"></label>
      </div>
      <label class="stock-field" data-pack><span>${words('packOf')} 1 ${html(line.unit || '')} = … <span data-unit-label></span></span><input name="pack-${index}" type="number" min="0" max="1000000" step="any"></label>
      <fieldset class="stock-mode"><legend>${words('updateStockBy')}</legend>
        <label><input type="radio" name="mode-${index}" value="delivery"> ${words('modeDelivery')}</label>
        <label><input type="radio" name="mode-${index}" value="count"> ${words('modeCount')}</label>
        <label><input type="radio" name="mode-${index}" value="none"> ${words('modeNone')}</label>
      </fieldset>
      <label class="stock-field" data-count><span>${words('onHand')} (<span data-unit-label></span>)</span><input name="count-${index}" type="number" min="0" max="1000000000" step="any"></label>
      <label class="stock-field"><span>${words('note')}</span><input name="note-${index}" maxlength="300"></label>
    </div></fieldset>`;
}

/* Every line, with the "Everything arrived as billed" button above them.
   options: isTracked(line) says which lines start ticked; categoryHtml
   (line, index) may add a cost-line choice to each. */
export function reviewLinesHtml(document, inventory, options) {
  let lines = '';
  document.lines.forEach(function (line, index) {
    lines += lineHtml(document, line, index, inventory, options);
  });
  return `<div class="stock-arrival"><h3>${words('didItArrive')}</h3><p class="stock-hint">${words('arrivalHint')}</p>
    <button type="button" class="btn" data-all-arrived>${words('allArrived')}</button></div>${lines}`;
}

/* The line's current item, as chosen or as typed for a new one. */
function lineItem(container, inventory, index) {
  const value = container.querySelector(`[name="item-${index}"]`).value;
  const existing = chosenItem(inventory, value);
  if (existing) {
    return existing;
  }
  return { unit: container.querySelector(`[name="unit-${index}"]`).value.trim(), packs: [] };
}

/* Shows the fields that apply to one line as it now stands. */
function updateLine(container, document, inventory, balances, index) {
  const fieldset = container.querySelector(`[data-review-line="${index}"]`);
  const line = document.lines[index];
  const included = fieldset.querySelector(`[name="include-${index}"]`).checked;
  fieldset.querySelector('.stock-line-fields').hidden = !included;
  const choice = fieldset.querySelector(`[name="item-${index}"]`).value;
  const existing = chosenItem(inventory, choice);
  const newItem = fieldset.querySelector('[data-new-item]');
  newItem.hidden = choice !== NEW_ITEM;
  for (const input of newItem.querySelectorAll('input')) { input.disabled = !included || choice !== NEW_ITEM; }

  const item = lineItem(container, inventory, index);
  for (const label of fieldset.querySelectorAll('[data-unit-label]')) { label.textContent = item.unit || '?'; }
  const status = fieldset.querySelector(`[name="status-${index}"]`).value;
  const needsPack = Boolean(line.unit) && item.unit && unitsPer(item, line.unit) === null;
  const pack = fieldset.querySelector('[data-pack]');
  pack.hidden = !needsPack;
  pack.querySelector('input').disabled = !included || !needsPack;

  const received = fieldset.querySelector(`[name="received-${index}"]`);
  fieldset.querySelector('[data-received]').hidden = status === 'unchecked';
  received.disabled = !included || status === 'unchecked' || status === 'missing' || status === 'full';
  if (status === 'missing') { received.value = '0'; }
  if (status === 'full') {
    const billed = billedInItemUnits({ ...item, packs: packsWithTyped(fieldset, line, item, index) }, line);
    received.value = billed === null ? '' : String(billed);
    received.disabled = !included || billed !== null;
  }

  const balance = existing ? balances.get(existing.id) : null;
  const canAdd = balance !== null && balance !== undefined && status !== 'unchecked';
  const modes = fieldset.querySelectorAll(`[name="mode-${index}"]`);
  for (const mode of modes) {
    mode.disabled = !included || (mode.value === 'delivery' && !canAdd);
  }
  // Until the owner picks how the shelf changes, it follows what is known:
  // add what arrived when there is a count to add to, otherwise count.
  const current = fieldset.querySelector(`[name="mode-${index}"]:checked`);
  if (!current || current.disabled || !fieldset.dataset.modeChosen) {
    fieldset.querySelector(`[name="mode-${index}"][value="${canAdd ? 'delivery' : 'count'}"]`).checked = true;
  }
  const mode = fieldset.querySelector(`[name="mode-${index}"]:checked`).value;
  fieldset.querySelector('[data-count]').hidden = mode !== 'count';
  fieldset.querySelector(`[name="count-${index}"]`).disabled = !included || mode !== 'count';
}

/* The item's pack sizes, with the one typed on this line for the
   invoice's unit, so "in full" can be worked out before it is saved. */
function packsWithTyped(fieldset, line, item, index) {
  const typed = Number(fieldset.querySelector(`[name="pack-${index}"]`).value);
  const packs = [...(item.packs || [])];
  if (line.unit && typed > 0 && unitsPer(item, line.unit) === null) {
    packs.push({ unit: line.unit, contains: typed });
  }
  return packs;
}

/* Keeps every line's fields in step with what the owner chooses. */
export function wireReviewLines(container, document, inventory) {
  const balances = stockBalances(inventory);
  function updateAll() {
    document.lines.forEach(function (line, index) { updateLine(container, document, inventory, balances, index); });
  }
  container.addEventListener('change', function (event) {
    if (/^mode-/.test(event.target.name || '')) {
      event.target.closest('[data-review-line]').dataset.modeChosen = 'yes';
    }
    updateAll();
  });
  container.addEventListener('input', function (event) {
    if (/^(unit|pack)-/.test(event.target.name || '')) { updateAll(); }
  });
  container.querySelector('[data-all-arrived]').addEventListener('click', function () {
    document.lines.forEach(function (line, index) {
      if (container.querySelector(`[name="include-${index}"]`).checked) {
        container.querySelector(`[name="status-${index}"]`).value = 'full';
      }
    });
    updateAll();
  });
  updateAll();
}

/* A number the owner typed, or an error naming what is missing. */
function typedNumber(container, name) {
  const input = container.querySelector(`[name="${name}"]`);
  const value = input.value.trim();
  const number = Number(value);
  if (!value || !Number.isFinite(number) || number < 0) {
    throw new Error('invalid');
  }
  return number;
}

/* The item for a line, adding a new one to `inventory` when needed:
   { inventory, item }. */
function itemForLine(container, inventory, index) {
  const value = container.querySelector(`[name="item-${index}"]`).value;
  if (value === '') {
    throw new Error('chooseItem');
  }
  const existing = chosenItem(inventory, value);
  if (existing) {
    return { inventory: inventory, item: existing };
  }
  const read = function (name) { return container.querySelector(`[name="${name}-${index}"]`).value.trim(); };
  const item = { id: crypto.randomUUID(), original: read('original'), description: read('description'), unit: read('unit'), location: read('location') };
  const same = inventory.items.find(function (entry) { return entry.original === item.original && entry.unit === item.unit && entry.location === item.location; });
  if (same) {
    return { inventory: inventory, item: same };
  }
  return { inventory: addItem(inventory, item), item: item };
}

/* Applies every ticked line to `inventory`: { inventory, tracked,
   corrections }. `source` marks the movements (the invoice photo's
   fingerprint); `checkSource` names the invoice on any delivery check;
   `categories[index]` is the cost line the owner chose, when there was a
   choice. Throws 'invalid' or 'chooseItem' when a line isn't finished. */
export function applyReviewedLines(container, document, inventory, source, checkSource, categories = []) {
  let next = inventory;
  let tracked = 0;
  const checks = [];
  const corrections = [];
  const now = new Date().toISOString();
  document.lines.forEach(function (line, index) {
    if (!container.querySelector(`[name="include-${index}"]`).checked) {
      return;
    }
    const found = itemForLine(container, next, index);
    next = found.inventory;
    let item = found.item;
    corrections[index] = { original: item.original, description: item.description };

    const packInput = container.querySelector(`[name="pack-${index}"]`);
    if (!packInput.disabled && packInput.value.trim()) {
      const contains = typedNumber(container, `pack-${index}`);
      if (contains > 0) {
        next = rememberPack(next, item.id, line.unit, contains);
      }
    }
    next = rememberCode(next, item.id, document.supplier, line.code);
    item = next.items.find(function (entry) { return entry.id === item.id; });

    const status = container.querySelector(`[name="status-${index}"]`).value;
    let received = 0;
    if (status === 'full') {
      received = billedInItemUnits(item, line);
      if (received === null) { received = typedNumber(container, `received-${index}`); }
    } else if (status === 'short' || status === 'damaged') {
      received = typedNumber(container, `received-${index}`);
    }

    const mode = container.querySelector(`[name="mode-${index}"]:checked`).value;
    const note = container.querySelector(`[name="note-${index}"]`).value.trim();
    if (mode === 'count') {
      next = recordMovement(next, { id: crypto.randomUUID(), itemId: item.id, type: 'count', quantity: typedNumber(container, `count-${index}`), note: 'source:' + source });
    } else if (mode === 'delivery' && received > 0) {
      next = recordMovement(next, { id: crypto.randomUUID(), itemId: item.id, type: 'delivery', quantity: received, note: 'source:' + source });
    }
    if (status !== 'full') {
      checks.push(newCheck({ id: crypto.randomUUID(), at: now, source: checkSource, document: document,
        line: { ...line, category: categories[index] || line.category }, item: item, received: received, status: status, note: note }));
    }
    tracked += 1;
  });
  return { inventory: addChecks(next, checks), tracked: tracked, corrections: corrections };
}
