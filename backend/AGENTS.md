# Backend ownership

`backend/api/` contains the existing function implementations. The root `api/` files are
thin Vercel entry points, preserving public routes and function count. Add implementation
here and keep deployment wrappers small. `backend/api/inventory.js` implements `/api/inventory`.
`backend/lib/` holds shared server/middleware infrastructure. `services/` holds business
operations and the optional Python forecast service. `database/supabase/migrations/`
holds database setup. `legacy-java/` holds the original console app and its sample CSVs.

Frontend agents own `frontend/`; coordinate changes to the pure shared stock ledger
`frontend/js/stock/ledger.js` and `docs/contracts/inventory.md` before changing the contract.
Reuse existing sessions, same-site checks, RLS, AI limits and provider settings.
Never log customer records or photos. No account data may be exposed without the user's token.

Physical quantities and P&L amounts have separate meanings. A reviewed invoice may atomically save both its confirmed shelf counts and its purchase costs. Purchases never imply physical stock. A count establishes
a balance; delivery adds; usage/waste subtract. Never guess units or package conversions.
Stock account writes use revisions and reject stale updates. An unapplied migration returns
503 rather than falling back to an unrelated table or overwriting financial data.
