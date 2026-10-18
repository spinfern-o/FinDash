# Frontend/backend integration contract

The first slice is a Chinese/English daily-stock workspace at `/stock`. The existing
`/dashboard` remains the P&L report. Interface organization: Files → Review → Stock;
Settings is separate. Figma/Claude can restyle the workspace without changing these contracts.

## Source boundaries

| Owner | Source |
| --- | --- |
| Frontend / Claude + Figma | `frontend/stock.html`, `frontend/css/stock.css`, `frontend/js/stock/` views and forms |
| Backend | `backend/api/`, `backend/inventory.js`, `supabase/migrations/` |
| Shared contract | This document and pure `frontend/js/stock/ledger.js` |
| Integration | Root `api/` deployment wrappers, `vercel.json`, generated pages and tests |

`docs/` has moved to `frontend/`. Root `api/` is still required by Vercel; it re-exports
backend functions. Root `lib/` remains shared server/middleware code, and tests/tools stay at root.
Public asset URLs stay `/js/...`, `/css/...`, etc. There is no build step.

## Ledger

`{version:1,items:[],movements:[]}`. An item is `{id,original,description,unit,location}`.
Original is the supplier wording; description is the reviewed display-language translation.
IDs are stable strings. Separate locations/units are separate items; no implicit conversion.

A movement is `{id,itemId,type,quantity,at,note?}`. Types:
- `count`: absolute stock physically present, including a delivery already on the shelf.
- `delivery`: add received quantity after a count exists.
- `usage`: subtract used/sold quantity.
- `waste`: subtract discarded quantity.

All quantities are finite/nonnegative; remaining stock cannot be negative. Unknown stock is
`null`, not zero. Events are immutable and unique. The shared ledger validates all operations.

### What the owner confirmed about buying an item (optional item fields)

- `packs`: up to 10 `{unit, contains}`: one of a supplier's `unit` holds `contains` of the item's own unit
  ("1 case = 6 bag"). Never the item's own unit; each unit once.
- `reorder`: `{minimum?, target?, supplier?, buyUnit?}`. `target >= minimum`; `buyUnit` must be one of the
  item's `packs`. The buying list (`frontend/js/stock/buying.js`) lists items below `minimum`; it suggests
  `target − onHand` (or `minimum − onHand`), rounded up to whole `buyUnit` packs only when that pack is
  confirmed. Unknown stock gets no suggestion; a count older than 7 days is flagged.
- `supplierCodes`: up to 20 `{supplier, code}` the owner confirmed are this item. A supplier's code belongs to
  at most one item across the ledger. Review finds an item by it (`frontend/js/stock/matching.js`); an item
  with exactly the same supplier wording is only suggested. Editing these changes only later matches.
- `shelfTarget`: how many of the item's own unit the owner keeps out on this item's own shelf (its location).
  A positive number. It is not `reorder.target`: that is a quantity to buy from a supplier, counting stock
  the owner holds elsewhere, while this one is what should be on this shelf. Each item is one shelf, because
  an item is already one product in one location in one unit.

`updateItem(inventory, itemId, {packs?, reorder?, supplierCodes?, shelfTarget?})` changes only these; name,
unit, location and movements stay. `null` or an empty list removes a field.

### Delivery checks (optional ledger field `checks`, up to 2000)

A line that didn't arrive in full, or wasn't checked yet, keeps a check until resolved:
`{id, at, source, supplier?, number?, itemId?, original, category?, billed:{quantity,unit},
received:{quantity,unit}, status, unitPrice?, possibleValue?, currency?, state, credit?, history}`.
- `status`: `short`, `damaged`, `missing` or `unchecked`. `billed` is exactly what the invoice printed;
  `received` is in the item's unit.
- `possibleValue` only when the price is per the billed unit and what arrived converts to it; it is a figure
  to check with the supplier, never a credit.
- `state`: `open`, `resolved` or `credited`; only an open check can change, so a credit is recorded once.
  `credited` requires `credit: {amount, reference?, invoiceId?}`. `history` (1–30 entries) starts `open`
  and ends at the current state; entries are added, never rewritten.
- Taking a credit off the P&L is the owner's choice: a purchase invoice with one negative line, id
  `credit-<check id>` (first 40 characters), saved with the ledger through the same atomic RPC.

Review never applies a shelf count and a delivery for the same line: the owner picks one (or neither).
Older ledgers without these fields stay valid; a page from before this change refuses a ledger that has
them rather than overwriting it.

### Counting a shelf from a photo

`frontend/js/stock/shelf.js` is the whole of it, and it keeps no records of its own:

- What to put out is worked out every time it is shown: `refill = max(0, shelfTarget − what the ledger says
  is on the shelf)`, and `null` when the shelf was never counted. Photographing the same shelf again
  replaces that answer; shortages are never added up and a newer count is never taken off an older one.
- A confirmed photo count is saved as the existing `count` movement — an absolute observation, which is what
  `count` already means — with `note: "photo-count:<the photo's SHA-256> saw:<the number the reading
  offered>"`. ` saw:` is left off when the reading offered no number (unreadable or partial photo) and the
  owner counted the shelf themselves; a correction is the movement's quantity differing from ` saw:`. No
  image, no reading text and no other model output is stored, here or anywhere else.
- The note stops the same photo counting the same product twice (a retry, a double press, a second tab).
  It is per product, not per photo: one photo counting the milk and the oat milk is one photo doing its job.
  The id of the newest `count` for that item when the photo was taken is checked before saving, so a reading
  confirmed after a newer count is refused rather than written over it; an account save then also has the
  usual revision check behind it.
- A photo never records usage, waste, a delivery, a purchase or a cost, and never touches a product on
  another shelf.

One photo answers for every product the owner tracks on that shelf — a fridge holds whole milk, oat milk and
soy milk at once. `shelfCandidates(inventory, location)` picks them: everything at that location, the ones
with a shelf target first, at most 12. Each is counted, reviewed and saved on its own, and all of them are
saved in one ledger write, so a shelf is never left half counted. A product the owner leaves blank is not
written at all and keeps whatever the ledger already holds for it.

`POST /api/read-document` with `task: "shelf-count"` counts one shelf. A request without `task` is an
invoice, exactly as before. The same login, same-site check and same daily `photo` allowance apply, so there
is no new feature name and no migration. The request adds `items: [{id, name, original, unit, location}]` —
1 to 12 products the owner tracks on one shelf, each bounded as the ledger bounds those fields, with no
repeats. The model is given them as a numbered list with their wording and units, never their ids, and
answers by number, so it cannot name a product the owner did not pick.

The answer is `{reading, model}`, rebuilt field by field in `backend/vision/shelf-count.js`:
`{usable, qualityFlags, unmatched, explanation, observations}`. There is exactly one observation per product
asked about, in the order asked: an answer pointing outside the list is dropped, the first answer for a
product wins, and a product the model said nothing about comes back unobserved. Each observation is
`{itemId, showsItem, usable, coverage, visibleCount, countType, reliability, obstructed, explanation}`.
`visibleCount` is a whole number of that product's own unit or `null`, and it is dropped to `null` unless the
model counted whole visible units of a product it could actually find (`countType: "visible-exact"`,
`present: true`). `showsItem` false means the photo does not show that product, which is unknown and never
zero. `unmatched` names what is on the shelf but tracked by nobody; it never becomes an item. `reliability`
is a qualitative hint for the owner's review, not a probability. Nothing in the answer decides anything: the
page shows one row per product, the owner confirms or corrects each number, and only those numbers are
saved.

## Invoice details for comparing prices

Confirmed purchase invoices (the dashboard's financial records, not the ledger) may carry:
- `currency` on the invoice: a three-letter code from the reading, e.g. `"USD"`. Prices from invoices in
  different currencies are never compared; an invoice without one is taken to be in the dashboard's currency.
- `pack` on a line: `{quantity, unit}`, what one of the line's `unit` (case, bag...) holds, as the owner
  confirmed it. `unit` is one of `lb kg g l ml each`.
- `billedPer` on a line: one of `lb kg g l ml each`, when the owner confirmed the printed `unitPrice` is per
  that rather than per the line's `unit` (a case billed by the pound).

`pack` and `billedPer` are set on the delivery they were confirmed from; later deliveries of the same item in
the same unit use them until another is confirmed, and earlier ones keep their own, so history is never
rewritten. Both are optional and validated in `frontend/js/dashboard/line-details.js` (browser and server);
anything else is dropped. Conversions are only lb/kg/g, L/mL and each/dozen (`frontend/js/dashboard/units.js`);
a price change is shown only when both prices are for the same amount (`price-comparison.js`).

## APIs

- `GET /api/inventory` → `{inventory,revision}` (empty ledger and revision 0 for a new owner).
- `PUT /api/inventory` with `{inventory,revision}` → `{revision}`.
- Invoice confirmation adds optional `invoice` (the standard reviewed purchase shape). One SQL transaction saves the stock and merges the invoice into the latest financial figures. Response: `{revision,figuresUpdatedAt,invoiceAdded,figures}`; use that committed financial snapshot with its token. The invoice ID is stable across retries. Matching retries are no-ops; changed contents, stale stock or an already-recorded supplier/number/date return 409 without either write.
- `PUT /api/figures` accepts `expectedUpdatedAt` (null for a known empty account) and returns 409 on stale financial data. Legacy requests without the token preserve invoices synced from stock. Explicit current-client removal and DELETE remain available. Send the optional owner header on financial requests too.
- Send `X-FinDash-Owner` with the email returned by `/api/auth?action=me` on GET and PUT; PUT requires it and rejects an account switch.
- Existing session cookies + same-site checks; RLS isolates each owner.
- 401 needs login; 409 means stale revision (do not overwrite); 503 means setup is incomplete.
- Apply `supabase/migrations/20261018000000_account_inventory.sql` and then `supabase/migrations/20261019000000_stock_invoice_sync.sql` before deploying the new handlers. The second migration is required for financial PUT as well as invoice/stock confirmation. Missing RPCs fail with 503; there is no partial-save fallback.
- `POST /api/read-document`: existing image payload plus optional `language:'zh-CN'`.
  `document.lines[].description` is Chinese; `original` preserves printed text. English remains default.
  With `task:'shelf-count'` and `items`, the same address counts one shelf instead (above); it answers
  `{reading,model}` and no `document`. An unknown `task`, or `items` that is missing, empty, over 12,
  repeated or oversized, is 400 before anything is sent to the model.

## First slice behavior

Manual entry works without signup and is saved on this browser, with a JSON backup/restore.
Signed-in stock saves only to the account and remains in memory until saved. Guest and account
records are separate and never automatically merged. The P&L page and Stock page use the same ledger. Counts, delivery, usage and waste only change quantities; confirmed invoice costs update P&L through the existing invoice arithmetic. The owner can exclude costs already included in a monthly spreadsheet.

Invoice images use the existing authenticated, rate-limited reader. Multiple images can be
queued; at most two run concurrently. Readings and photo previews are not persisted. A digest
flags a repeated image. Review confirms source text, translation, unit, location and actual
shelf count before saving. Invoice quantity is displayed separately and is never added twice. A posting-month picker and editable cost category accompany financial confirmation. The dashboard invoice review offers the same explicit stock-count fields. Open tabs refresh after a record-change signal (no business data in the signal) or when focused; pending forms and unsaved edits are protected. Drafts stay bound to the account that uploaded them.

This slice does not read PDF/count-sheet uploads, translate the legacy financial dashboard,
automatically merge item synonyms, or synchronize offline account changes. Printed count
sheets and manually entering counts are available. A live migration/deployment is still required.

## Agent integration

Work on separate branches. Frontend work based on an old `docs/` branch must be rebased and
its paths mapped to `frontend/`. Keep API fields and stable IDs while refining Figma layouts.
Run `python3 tools/build-pages.py`, `npm test`, and `python3 tools/build-pages.py --check`.

The optional `tools/check-stock-sync-sql.mjs` smoke check executes the real migrations and
PL/pgSQL in an isolated PostgreSQL database using PGlite (verified with 0.5.10). Install it
outside the repository, then set `FINDASH_PGLITE_MODULE` to that package's `dist/index.js`
and run the script. It checks transaction rollback, safe retries, financial revision
conflicts, legacy-save protection and RLS without touching production.
