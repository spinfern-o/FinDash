# Counting a shelf from a photo — the audit behind it, and what P0 is

The owner's question is "I photographed the milk shelf. How many cartons should I put out now?"
The schema and the API for this are in `contracts/inventory.md`; this page is why it was built this
way, what was already here, and what was deliberately left for later.

## What the repository already had

- **The right movement already existed.** `frontend/js/stock/ledger.js` has four movement types, and
  `count` is already "the absolute stock physically present": it re-anchors the balance rather than
  adding to it. A confirmed photo count is exactly that, so no new movement type was added, and no
  usage or delivery is ever recorded for the difference between two photos.
- **An authenticated, rate-limited, bounded photo path already existed.** `backend/api/read-document.js`
  with `lib/ai-access.js`: logged in, same site, a daily allowance per person counted in Supabase,
  structured output, and the model's answer rebuilt field by field before the page sees it.
- **Photo handling already existed.** `frontend/js/dashboard/photos/photo-reader.js` turns a photo
  upright, shrinks it under the request limit and makes a preview; `frontend/js/stock/files.js` takes
  the SHA-256 of the file to catch the same photo sent twice.
- **Buying already existed, and is a different question.** `frontend/js/stock/buying.js` suggests what
  to order from a supplier, in whole packs, from the reorder minimum and target.
- **Saving already protects itself.** `frontend/js/stock/storage.js` saves with a revision and refuses
  a stale write; guest stock and account stock are separate and never merged.

## What was missing

1. Nowhere to say how much should be on a shelf. `reorder.target` is a quantity to buy, counting stock
   held anywhere; a front fridge that holds 10 cartons while 24 wait in the back room is a different
   number, and overloading one field for both would make "refill 3" mean "order 3".
2. No way to count a shelf from a photo: the photo path read invoices only.
3. No "what should I put out now" anywhere in the page.

## What P0 adds

| Added | Where |
| --- | --- |
| `shelfTarget`, one optional positive number on an item | `frontend/js/stock/ledger.js` |
| The refill arithmetic, the duplicate and stale-count guards, the request | `frontend/js/stock/shelf.js` |
| The shelf-counting question, schema and rebuilt answer | `backend/vision/shelf-count.js` |
| `task: "shelf-count"` dispatch, invoices unchanged without it | `backend/api/read-document.js` |
| "Scan shelf" per item, the four-step dialog, the shelf target field | `frontend/js/stock/forms.js` |
| "Needs refilling", and the target beside each count | `frontend/js/stock/views.js` |
| English and Simplified Chinese for all of it | `frontend/js/stock/language.js` |

## Why a second photo replaces the first answer

The ledger is the only record. Each confirmed photo appends a `count`, which sets the balance to that
number; nothing stores a shortage. "Needs refilling" is computed from the ledger every time it is
drawn, so after 7, then 8, then 10 against a target of 10 it reads 3, then 2, then nothing — while all
three counts stay in the movement history with their times. There is no list of tasks to go stale, so
three photos cannot leave three open "refill milk" jobs behind them.

The number used is the ledger's balance for that item, not the raw count: a count re-anchors it, and a
usage or waste recorded afterwards lowers it. That is deliberate, so the shelf list, the stock list and
the dashboard's "Stock on shelves" can never disagree.

## What the model is not allowed to do

It never decides what is saved; the owner confirms or corrects a number first. It is given one product
— the one the owner chose — with the supplier's wording and the owner's unit, and never the item's id,
so it cannot answer with a product. A count that was not a plain count of whole visible units is
dropped to "unknown" by the server. An unreadable, partial or obstructed photo offers no number at all,
and leaves the previous count exactly as it was. Nothing recognised is unknown, never zero: a zero can
only come from the owner confirming it. Its explanation is text on the page, escaped like any other
outside wording, never HTML and never an instruction.

## Deliberately left out of P0

- **One SKU per photo.** The request carries one `item`; several products on one shelf are P1, and
  widening the request to a list of approved candidates is the only wire change that needs.
- **Shelf regions, crops and stored reference images.** No photo or crop is stored anywhere.
- **Supplier ordering from a shelf count.** The buying list is untouched and stays its own tab: a
  shelf being short is not a reason to buy, because the back room is not in the photo.
- **Several shelves for one item.** An item is already one product in one location in one unit, so a
  shelf is an item. Two shelves of the same product are two items, as two locations always were.
- **A confirmation banner after saving.** The dialog closes and "Needs refilling" shows the new
  answer immediately, which is the same information in the place the owner is already looking.

## Privacy

A shelf photo goes to Anthropic to be read, for that one request, and is not stored by FinDash: not in
Supabase, not in the browser, not in logs or error reports. Only the owner's confirmed number and the
photo's digest are saved. `frontend/privacy.html` says so. The digest is of the photo's bytes; it
identifies a repeat of the same file and nothing else.
