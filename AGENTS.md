# AGENTS.md

Instructions for AI coding agents working on FinDash. Humans: README.md has the fuller tour.

## What this is

FinDash (https://findash.tech) is a free web app that turns a small business's monthly figures into a profit and
loss dashboard. It is a static site in `docs/` (served by Vercel), a handful of Node server functions in `api/`,
Vercel Routing Middleware in `middleware.js`, and the original Java command-line app in `src/main/java/`.

## Layout

- `docs/`: the website. `docs/js/dashboard/` is the dashboard; its arithmetic (`import/months-from-sheet.js`,
  `periods.js`, `cost-groups.js`) is also used by the public API through `docs/js/dashboard/analysis.js`.
- `api/`: server functions. `api/agent.js` serves the public API (`/api/v1/*`) and the two MCP servers
  (`/api/mcp`, `/api/mcp/docs`) through rewrites in `vercel.json`. Vercel's Hobby plan allows twelve functions,
  so add new agent endpoints as routes there rather than as new files.
- `lib/`: code shared by the functions and the middleware.
- `tools/build-pages.py`: writes every generated part of the site (page heads, structured data, the glossary,
  the Markdown versions of the pages in `lib/markdown-pages.js`, the agent-skills index, the schema feed).
- `skills/findash/SKILL.md`: the agent skill, published at `/.well-known/agent-skills/`.
- `tests/`: unit, API and browser tests, against stand-ins for Supabase and Claude.

## Commands

```bash
npm ci                                  # install
npx playwright install chromium         # once, for the browser tests
npm test                                # every test (about two minutes)
python3 tools/build-pages.py            # after changing any page's text, a title or the skill
python3 tools/build-pages.py --check    # fails if generated files are out of date (a test runs it)
```

## Rules

- Never edit generated content by hand: the blocks between `page-head` and `glossary` markers in `docs/*.html`,
  `lib/markdown-pages.js`, `docs/.well-known/agent-skills/`, `docs/schema-feed.jsonl`. Change the source and run
  `tools/build-pages.py`.
- Every figure the dashboard, the API and the MCP tools show comes from the same arithmetic. Don't duplicate it:
  change it in `docs/js/dashboard/` and the API follows.
- Never log, store or send anyone's figures beyond what `docs/privacy.html` says. Errors are logged with the tag
  `findash-error` and only the error and where it happened.
- Describe FinDash only as what it does. It is not accounting, bookkeeping, invoicing, payments, payroll, tax or
  cash-flow software, and it has no QuickBooks or Xero integration (owners copy their totals across).
- Write code to be read by someone who isn't a programmer by trade: ordinary named `function`s with a comment
  saying what each is for, whole-word names, one step per line, small files about one thing.
- Run `npm test` before pushing. Don't skip, disable or weaken a test to get it passing.
