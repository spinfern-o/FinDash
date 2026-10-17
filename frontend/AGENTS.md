# Frontend ownership

This folder is the canonical website source (formerly `docs/`). Vercel serves it directly.
Public URLs remain unchanged. HTML/JS/CSS are buildless; use the existing design tokens.

Claude + Figma may own layouts, components, spacing, typography and responsive styling.
The new daily workflow is `/stock` with `#files`, `#review`, `#items`, `#settings`.
`/dashboard` retains the financial report and imports, and reuses the stock forms and ledger for direct stock entry. Reviewed invoice costs sync to its existing arithmetic; counts and movements do not invent financial costs.

- Interface words: `js/stock/language.js` (English and Simplified Chinese).
- Views: `js/stock/views.js`; interactions: `forms.js`, `main.js`, `files.js`.
- Layout: `css/stock.css`; reuse `css/dashboard.css` tokens.
- Shared contract: `js/stock/ledger.js` is imported by the server too. Coordinate changes to it.
- Do not change API payloads to suit a design; update `contracts/inventory.md` with the backend owner.
- Preserve supplier originals; escape all external text; never insert AI output as HTML.
- Keep photos and pending readings in memory only. Account stock is not cached locally.
- Generated heads/Markdown are owned by `tools/build-pages.py`; run it after page edits.

Before integrating an older Claude branch: rename its `docs/` changes to `frontend/`.
Review rename conflicts explicitly. Do not recreate `docs/` as a second copy of the site.
