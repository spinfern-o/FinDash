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

## APIs

- `GET /api/inventory` → `{inventory,revision}` (empty ledger and revision 0 for a new owner).
- `PUT /api/inventory` with `{inventory,revision}` → `{revision}`.
- Send `X-FinDash-Owner` with the email returned by `/api/auth?action=me` on GET and PUT; PUT requires it and rejects an account switch.
- Existing session cookies + same-site checks; RLS isolates each owner.
- 401 needs login; 409 means stale revision (do not overwrite); 503 means setup is incomplete.
- Apply `supabase/migrations/20261018000000_account_inventory.sql` before enabling account stock.
- `POST /api/read-document`: existing image payload plus optional `language:'zh-CN'`.
  `document.lines[].description` is Chinese; `original` preserves printed text. English remains default.

## First slice behavior

Manual entry works without signup and is saved on this browser, with a JSON backup/restore.
Signed-in stock saves only to the account and remains in memory until saved. Guest and account
records are separate and never automatically merged. Stock never changes P&L totals.

Invoice images use the existing authenticated, rate-limited reader. Multiple images can be
queued; at most two run concurrently. Readings and photo previews are not persisted. A digest
flags a repeated image. Review confirms source text, translation, unit, location and actual
shelf count before saving. Invoice quantity is displayed separately and is never added twice.

This slice does not read PDF/count-sheet uploads, translate the legacy financial dashboard,
automatically merge item synonyms, or synchronize offline account changes. Printed count
sheets and manually entering counts are available. A live migration/deployment is still required.

## Agent integration

Work on separate branches. Frontend work based on an old `docs/` branch must be rebased and
its paths mapped to `frontend/`. Keep API fields and stable IDs while refining Figma layouts.
Run `python3 tools/build-pages.py`, `npm test`, and `python3 tools/build-pages.py --check`.
