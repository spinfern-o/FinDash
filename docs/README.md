# Understanding the FinDash code

Start in `frontend/` for what an owner sees, or `backend/` for what the server does.
The root README describes the product and setup. This page explains where to work.

## The main folders

| Folder | What belongs here |
| --- | --- |
| `frontend/` | The website served by Vercel: HTML pages, CSS, browser JavaScript, images and fonts. |
| `backend/api/` | Server request handlers: accounts, figures, inventory and document reading. |
| `backend/services/` | Business operations: invoice synchronization, shelf-photo reading in `vision/`, and the optional Python service in `forecast/`. |
| `backend/lib/` | Shared server helpers: sessions, Supabase, usage limits, API/MCP helpers and the app launch gate. |
| `backend/database/supabase/migrations/` | Ordered SQL files for database setup and changes. |
| `backend/legacy-java/` | The original Java app: `src/`, `data/` and `pom.xml`. |
| `docs/contracts/` | The inventory data format and the agreement between frontend and backend. |
| `docs/design/` | Design tokens, components and Figma guidance. |
| `docs/skills/` | The source of the public FinDash agent skill. The page generator publishes it. |
| `tests/` | Unit, API and browser checks, plus fixtures and test helpers. |
| `tools/` | Page generation, screenshots and other development scripts. |

## Why a few things stay at the root

`api/` contains tiny Vercel entry points that forward to `backend/api/`; it is not a
second backend. `middleware.js` runs before a page is served and imports helpers from
`backend/lib/`. `vercel.json` tells Vercel to serve `frontend/`. `package.json`, its lock
file and `.github/workflows/` keep dependency installation and tests in one place.

HTML pages stay directly inside `frontend/` because this is a buildless website with
Vercel clean URLs: `frontend/stock.html` serves `/stock`. CSS and JavaScript already
have their own subfolders. There is no separate `frontend/pages/` copy or extra build step.

## Follow the Stock page

| Read in this order | What to look for |
| --- | --- |
| `frontend/stock.html` | The sidebar, language selector, Add an item button and empty `stock-panel` area. |
| `frontend/js/stock/main.js` | `render()` chooses the section and puts its content in that area; click handlers open forms. |
| `frontend/js/stock/views.js` | `itemsHtml()` builds the Stock list and its buttons. |
| `frontend/css/stock.css` | Spacing, colours and layout. |
| `frontend/js/stock/forms.js` | Forms for items, counts, deliveries, usage, waste and reviews. |
| `frontend/js/stock/ledger.js` | Inventory rules and quantities. This pure module is also used by the server. |
| `frontend/js/stock/storage.js` | Guest records on the device, or account requests to `/api/inventory`. |
| `api/inventory.js` | The Vercel entry point; forwards to `backend/api/inventory.js`. |
| `backend/api/inventory.js` | Validates account requests and saves or loads inventory through Supabase. |

`/stock#files`, `/stock#review`, `/stock#items` and `/stock#settings` are sections of
one HTML page. Their content is drawn by JavaScript rather than written entirely in
`stock.html`. Interface translations live in `frontend/js/stock/language.js`.

A future visible "Coming soon" label belongs in the relevant HTML or view and the
language file. Changing access to the whole workspace is a separate decision:
`backend/lib/app-gate.js` currently controls Stock and the P&L dashboard together.
This folder reorganization does not change that setting or any product behaviour.

## Previous paths and their new homes

| Previous location | Current location |
| --- | --- |
| `lib/` | `backend/lib/` |
| `backend/inventory.js` | `backend/api/inventory.js` |
| `backend/invoice-sync.js` | `backend/services/invoice-sync.js` |
| `backend/vision/` | `backend/services/vision/` |
| `forecast/` | `backend/services/forecast/` |
| `supabase/` | `backend/database/supabase/` |
| `src/`, `data/`, `pom.xml` | `backend/legacy-java/` |
| `contracts/` | `docs/contracts/` |
| `DESIGN-SYSTEM.md` | `docs/design/DESIGN-SYSTEM.md` |
| `skills/` | `docs/skills/` |

## Working alongside another agent

Frontend work belongs in `frontend/`; server work belongs in `backend/`. Read
`docs/frontend-rules.md` and `backend/AGENTS.md`. Coordinate any changes to the shared ledger and contracts before
changing request fields. Rebase older branches before merging; use the path table above
to resolve moves instead of recreating old root folders.

Run commands from the repository root:

```bash
npm ci
npx playwright install chromium
python3 tools/build-pages.py
python3 tools/build-pages.py --check
npm test
mvn -q -f backend/legacy-java/pom.xml test
```

The Java console app runs from the root with
`mvn -q -f backend/legacy-java/pom.xml compile exec:java`; its input paths are now
`backend/legacy-java/data/`, and it still writes `frontend/data.json`.
The forecast service instructions are in `backend/services/forecast/README.md`.
Database setup still uses the Supabase SQL Editor and the same migration filenames and
order; only their repository folder changed. If using the Supabase CLI, choose
`backend/database` as its work directory so it finds the nested `supabase/` folder.
