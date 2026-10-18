/* What each shelf still needs, and counting one from a photo.

   One photo of one shelf answers for every product the owner tracks on it:
   a fridge holds whole milk, oat milk and soy milk at once. Each product is
   counted, reviewed and saved on its own, and a product the photo does not
   show is left exactly as it was.

   A photo the owner confirms is an absolute observation of one shelf, so it
   is saved as the ledger's existing `count`: the balance is re-anchored,
   not added to. How much to put out is worked out from that balance every
   time it is shown, never kept anywhere of its own:

     refill = max(0, shelf target - what the ledger says is there)

   So photographing the same shelf at 7, then 8, then 10 against a target of
   10 asks for 3, then 2, then nothing. The earlier counts stay in the
   history; they are not added together and the newer one is not subtracted
   from the older.

   Refilling a shelf is not buying from a supplier. That is a different
   question, with its own quantities and pack sizes, answered by buying.js.
   The model only reports what it can see; the owner confirms or corrects
   the number, and only then is anything saved. */

import { stockBalances, recordMovement } from './ledger.js';

// More units than any one shelf holds; a photo cannot claim more.
const MAXIMUM_VISIBLE = 100000;
// Products one photo is asked about. Beyond this the photo is not of one
// shelf, and the owner cannot check that many answers either.
export const MAXIMUM_CANDIDATES = 12;

/* The newest confirmed count for an item, or null when it was never
   counted. Movements are append-only, so the last one recorded is the
   newest; their stated times are not trusted to reorder them. */
export function latestCount(inventory, itemId) {
  let latest = null;
  for (const movement of inventory.movements) {
    if (movement.itemId === itemId && movement.type === 'count') {
      latest = movement;
    }
  }
  return latest;
}

/* How much to put out on the shelf: the gap up to the target, never below
   zero. `onShelf` is null when the shelf was never counted, and then
   nothing is suggested rather than the whole target being assumed. */
export function refillNeeded(shelfTarget, onShelf) {
  if (shelfTarget === undefined || onShelf === null) {
    return null;
  }
  return Math.max(0, Math.round((shelfTarget - onShelf) * 1000) / 1000);
}

/* Every shelf the owner set a target for: { item, onShelf, target, refill,
   countedAt }. `onShelf` is what the ledger says is there now, which is the
   newest confirmed count with any delivery, usage or waste recorded since
   it, so the page and the dashboard never show two different numbers. */
export function shelfRefill(inventory) {
  const balances = stockBalances(inventory);
  const list = [];
  for (const item of inventory.items) {
    if (item.shelfTarget === undefined) {
      continue;
    }
    const counted = latestCount(inventory, item.id);
    const onShelf = balances.get(item.id);
    list.push({
      item: item,
      onShelf: onShelf,
      target: item.shelfTarget,
      refill: refillNeeded(item.shelfTarget, onShelf),
      countedAt: counted ? counted.at : null
    });
  }
  return list;
}

/* The products one photo of `location` is asked about: everything the
   owner tracks there, the ones with a shelf target first, since those are
   the ones that can answer "how many to put out". At most
   MAXIMUM_CANDIDATES of them; a fuller shelf needs more than one photo. */
export function shelfCandidates(inventory, location) {
  const here = inventory.items.filter(function (item) { return item.location === location; });
  here.sort(function (a, b) {
    const byTarget = (a.shelfTarget === undefined) - (b.shelfTarget === undefined);
    return byTarget || a.description.localeCompare(b.description);
  });
  return here.slice(0, MAXIMUM_CANDIDATES);
}

/* The note kept with a counted photo: which photo it was, and the number
   the reading offered, so the model's accuracy can be read off the ledger
   later. `saw:` is left off when no number was offered, and a correction is
   then the movement's quantity differing from `saw:`. No image, and no
   reading text. */
function countNote(hash, offered) {
  return 'photo-count:' + hash + (offered === null ? '' : ' saw:' + offered);
}

/* The owner's confirmed count from a photo, as the ledger's own absolute
   count event.

   `hash` is the photo's digest, so sending the same photo twice (a retry, a
   double press, two tabs) cannot count it twice. `since` is the id of the
   newest count for this item when the photo was taken, or null if there was
   none: a count saved in the meantime stops this one rather than quietly
   writing over a newer reading of the same shelf. `offered` is the number
   the reading put in front of the owner, or null when it offered none. */
export function recordShelfCount(inventory, { itemId, quantity, hash, offered = null, id, at, since = null }) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAXIMUM_VISIBLE) {
    throw new Error('wholeNumber');
  }
  if (offered !== null && (!Number.isInteger(offered) || offered < 0 || offered > MAXIMUM_VISIBLE)) {
    throw new Error('invalid');
  }
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error('invalid');
  }
  // Per product: one photo counting the milk and the oat milk is one photo
  // doing its job; the same photo counting the milk twice is a resend.
  const already = inventory.movements.some(function (movement) {
    return movement.itemId === itemId && typeof movement.note === 'string' &&
      movement.note.split(' ')[0] === 'photo-count:' + hash;
  });
  if (already) {
    throw new Error('alreadyCounted');
  }
  const latest = latestCount(inventory, itemId);
  if ((latest ? latest.id : null) !== since) {
    throw new Error('newerCount');
  }
  return recordMovement(inventory, {
    id: id, itemId: itemId, type: 'count', quantity: quantity, at: at, note: countNote(hash, offered)
  });
}

/* Several products counted from the one photo, saved together: either the
   whole set is recorded or none of it is, so a shelf is never left half
   counted. Products the owner left empty are not in `counts` and keep
   whatever the ledger already holds for them. */
export function recordShelfCounts(inventory, { counts, hash, at }) {
  if (!Array.isArray(counts) || !counts.length) {
    throw new Error('noCounts');
  }
  let next = inventory;
  for (const count of counts) {
    next = recordShelfCount(next, { ...count, hash: hash, at: at });
  }
  return next;
}

/* What to put in front of the owner from one product's reading: `count` is a number
   to check only when the whole shelf was clearly visible, `seen` is what
   the model reported whatever its doubts, and `problem` names what stops
   the number being offered. Nothing here saves anything. */
export function shelfDraft(reading) {
  const seen = reading.visibleCount;
  if (!reading.showsItem) {
    return { count: null, seen: seen, problem: 'wrongItem' };
  }
  if (!reading.usable || seen === null || reading.reliability === 'poor') {
    return { count: null, seen: seen, problem: 'cantCount' };
  }
  if (reading.coverage !== 'complete' || reading.obstructed) {
    return { count: null, seen: seen, problem: 'partialShelf' };
  }
  return { count: seen, seen: seen, problem: null };
}

/* Asks the site's existing authenticated, rate-limited reader to count one
   shelf, naming the products the owner tracks on it. The photo is sent for
   this one request and is not stored, here or there. The answer carries one
   observation per product asked about, in the same order. */
export async function requestShelfCount(photo, items, language) {
  const response = await fetch('/api/read-document', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: 'shelf-count', image: photo.data, mediaType: photo.mediaType, language: language,
      items: items.map(function (item) {
        return { id: item.id, name: item.description, original: item.original, unit: item.unit, location: item.location };
      })
    })
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('authNeeded');
  }
  if (!response.ok) {
    throw new Error('scanFailed');
  }
  const body = await response.json();
  if (!body.reading || !Array.isArray(body.reading.observations)) {
    throw new Error('scanFailed');
  }
  return body.reading;
}
