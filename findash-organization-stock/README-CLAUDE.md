# FinDash organization + Chinese stock workflow

Implemented locally on branch `codex/chinese-stock-workflow`.
Commit: b53bac0c961f3450ad7eca38c46a05e585c8f453
Base: 3ce6cc79e13eb6e5e72199a4c5c2208eec235f6a
Repository: https://github.com/spinfern-o/FinDash

GitHub's connection returned 403 Resource not accessible by integration for branch creation.
Nothing was pushed, merged, deployed, or changed in the live database.

## Integrate without overwriting Claude's work

Extract this archive outside your repository. Preserve Claude's current branch and working
files. In the existing FinDash repository, create a separate worktree from the exact base:

```bash
git worktree add -b codex/chinese-stock-workflow-import ../findash-stock-workflow 3ce6cc79e13eb6e5e72199a4c5c2208eec235f6a
cd ../findash-stock-workflow
git apply --check /absolute/path/to/findash-organization-stock.patch
git apply --index /absolute/path/to/findash-organization-stock.patch
npm ci
npx playwright install chromium
python3 tools/build-pages.py --check
npm test
```

The patch includes binary font data and all file renames. It was checked with `git apply --check`
against a fresh worktree at the base above. Commit the import, then integrate/rebase Claude's
frontend work explicitly. Old `docs/` changes now belong under `frontend/`; do not recreate a
second website folder. Leave deployment to the integrating owner after database setup.

## What changed

- Canonical website source moved from docs/ to frontend/; Vercel outputDirectory updated.
- Server implementations moved to backend/api/, retaining thin api/ deployment wrappers.
- frontend/AGENTS.md and backend/AGENTS.md define ownership for parallel agents.
- contracts/inventory.md defines the UI/API/ledger contract for Claude + Figma.
- New /stock workspace: Files, To review, Stock, Settings, and a separate P&L link.
- English/Chinese UI, self-hosted Chinese font, original supplier wording beside translation.
- Invoice-image queue with duplicate-content detection, at most 12 active drafts, two readers.
- Review quantities, units, locations and physical shelf counts before saving.
- Manual items, shelf counts, delivery, usage and waste buttons.
- Phone item cards keep all daily actions visible without sideways scrolling.
- Physical stock is separate from purchases and P&L; no guessed unit conversions.
- Guest browser storage plus JSON backups; signed-in stock uses its own RLS-protected table.
- Revisions reject stale saves; account identity changes cannot overwrite another account.
- Existing P&L importer and calculations remain intact; source-specific setup help is collapsed.
- Chinese yuan added to the currency selector (display only, no exchange-rate conversion).

## Database setup before account stock can work

Apply `supabase/migrations/20261018000000_account_inventory.sql` to the existing project.
It creates account_inventory with row-level isolation and revision checking. It has not been
applied by this work. Until applied, signed-in stock fails closed with an error; it does not
replace account records with an empty local ledger. Existing account/AI environment settings
are reused. No new vendor, API key or service is required.

## Validation

205/205 tests passed with npm test: unit, API, browser, legacy P&L, new Chinese stock workflow,
account isolation, concurrent writes, duplicate images, language rereading, mobile layouts,
privacy, generated pages and public API behavior. Generated-source check and whitespace check
passed. Desktop and phone screenshots were visually inspected; Chinese text renders correctly.
The patch was verified against a fresh baseline checkout. Java compilation was not run locally
because Maven was unavailable; the Java changes only update the demo-output path to frontend/.
Invoice recognition tests use a mock Claude service; live OCR/translation quality was not tested.

## Remaining scope

PDF and handwritten count-sheet uploads are not implemented. Use invoice photos or manual counts.
The legacy financial dashboard/help remain English. Chinese localization covers the new daily-stock
workflow. Product-name synonyms and package-size conversions need explicit confirmation rather
than automatic merging. Guest and account stock do not auto-merge. The app has not been deployed.
