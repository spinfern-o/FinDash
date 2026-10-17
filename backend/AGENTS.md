# Backend ownership

`backend/api/` contains the existing function implementations. The root `api/` files are
thin Vercel entry points, preserving public routes and function count. Add implementation
here and keep deployment wrappers small. `backend/inventory.js` implements `/api/inventory`.
Root `lib/` remains shared server/middleware infrastructure.

Frontend agents own `frontend/`; coordinate changes to the pure shared stock ledger
`frontend/js/stock/ledger.js` and `contracts/inventory.md` before changing the contract.
Reuse existing sessions, same-site checks, RLS, AI limits and provider settings.
Never log customer records or photos. No account data may be exposed without the user's token.

Inventory is separate from P&L. Purchases never imply physical stock. A count establishes
a balance; delivery adds; usage/waste subtract. Never guess units or package conversions.
Stock account writes use revisions and reject stale updates. An unapplied migration returns
503 rather than falling back to an unrelated table or overwriting financial data.
