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
