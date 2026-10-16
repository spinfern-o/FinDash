# FinDash

**A monthly finance dashboard for small business owners who aren't accountants.**

FinDash takes the monthly totals a business already has, from QuickBooks, Xero, a
spreadsheet or a photo of a supplier invoice, and shows them as one clear dashboard:
revenue, costs in four groups, profit, and spending against budget. Every term has a plain
label and a **?** beside it. Spreadsheets are read in the browser and never uploaded, and
the dashboard works without an account.

It was built for a restaurant, but the cost groups work just as well for a shop, a trade
or a service business.

- [What it does](#what-it-does)
- [How your data is handled](#how-your-data-is-handled)
- [How the numbers are worked out](#how-the-numbers-are-worked-out)
- [Getting figures in](#getting-figures-in)
- [Running your own copy](#running-your-own-copy)
- [Working on the code](#working-on-the-code)
- [The Java command-line app](#the-java-command-line-app)

## What it does

- **Reads your figures.** Drop in an Excel or CSV file: the template, or a layout of
  your own. FinDash works out which column is which, and turns a sheet that runs
  sideways the right way round.
- **Shows one period at a glance.** Pick a month, a quarter or the year to date to see
  the net result, the headline numbers, spending against budget, where the revenue went,
  and a full report with every cost line.
- **Compares months.** Net profit by month, revenue against costs, and a "What needs
  attention" list of losses, budget overruns and unusual costs.
- **Looks ahead.** A budget estimator for next month, and a trend line through net
  profit (from three months on file, with a dollar range from six).
- **Reads invoice photos** *(with a free account; more each month with Plus)*. Take a
  photo of a supplier invoice or receipt; Claude reads every line, FinDash checks the
  arithmetic, and you confirm before anything is added.
- **Writes advice** *(with a free account; more each month with Plus)*. Press **Get
  advice** and Claude writes opportunities, risks and next steps from your monthly totals.
- **Remembers.** Figures stay in your browser for next time. Log in and they are saved
  to your account, so they're there on any computer.
- **Shares.** Print or save as PDF, or export everything to Excel.
- **Any currency.** Euros, pounds, dollars and more, and both `1.250,00` and `1,250.00`
  are read correctly.

## How your data is handled

Your spreadsheet is opened and added up by your own browser. It never leaves it. Only
these things are ever sent anywhere, always through this site's own server (the browser
never contacts Supabase, Claude or Stripe itself). The help page lists the same nine, and the
[privacy policy](docs/privacy.html) names every service involved.

| When | What is sent | To |
| --- | --- | --- |
| Logging in or creating an account | email and password | Supabase |
| While logged in | the worked-out monthly figures and confirmed invoice lines (not the file, not photos) | Supabase (your account) |
| Adding a photo | the photo, to be read (it isn't kept) | Claude |
| Pressing **Get advice** | each month's totals: revenue, the four cost groups, net profit, budget | Claude |
| A column name isn't recognised | the column names only, never the numbers | Claude |
| Getting Plus | card details (typed on Stripe's own page) and email; never figures | Stripe |
| Pressing the forecast model's button (if one is set up) | the net profit figure for each month | the forecast service |
| Something on the page breaks | the error message and which file it came from | this site's own log |
| Every page visit | which page, the linking site, browser, device type, country (no cookies) | Vercel Web Analytics |

Photos, advice and column matching need a free account, because each one is a paid
request (see [Plans and monthly limits](#plans-and-monthly-limits)).
**Forget my data** removes everything from the browser and the account.

## How the numbers are worked out

### Fourteen cost lines, four groups

Every cost line belongs to exactly one group, so the four group totals always add up to
total costs, and revenue minus total costs is net profit. Nothing is counted twice.

| Group | Cost lines | What belongs here |
| --- | --- | --- |
| **Direct costs** | cost of goods sold, labor, employee meals, payroll tax | Costs you can trace to what you sell. With labor, this is prime cost: usually the biggest share, and the part you can change week to week. |
| **Operating costs** | packaging, credit card fees, marketing, hardware | Costs that grow with sales but can't be traced to one sale. |
| **Variable overhead** | utilities, maintenance | Costs that rise with activity, but not in step with it. |
| **Fixed overhead** | rent, insurance, business license, telephone | Costs that don't move with sales at all, and are the hardest to cut. |

A cost without a line of its own belongs in the group that matches how it behaves, so the
four totals stay meaningful.

### The figures

All ratios are a percentage of revenue, except budget used.

| Figure | How it's worked out |
| --- | --- |
| Gross profit | revenue − direct costs |
| Net profit | revenue − total costs |
| Each group's share | group total ÷ revenue |
| Budget used | total costs ÷ budget (the budget is a spending limit, not a sales target) |

Because revenue is in every ratio, a ratio can move because the cost changed **or**
because revenue did. In the demo figures, fixed overhead jumps from 10.3% to 26.3% in
September, but the dollars barely moved: revenue halved. When a ratio spikes, check the
dollar figure first. Watch percentages on the large, steady lines (cost of goods, labor)
and dollars on the lumpy ones (maintenance, hardware, business license).

### Benchmarks

Healthy ranges depend on the industry, so your own trend is the best comparison. As a
rough guide for a full-service restaurant (the sources are on
[the restaurant page](https://findash.tech/restaurant-profit-and-loss)):

| Figure | Typical range |
| --- | --- |
| Cost of goods sold | 25–35% |
| Labor | 25–35% |
| Prime cost | 60–65% |
| Occupancy | under 8–10% |
| Net margin | 3–5% |

### Judgment calls

These are choices, not rules. Changing one partway through a year makes months hard to
compare.

- **Payroll tax** sits with labor in direct costs. Property tax belongs in fixed overhead,
  and income tax doesn't belong in costs at all (it comes after net profit).
- **Hardware** is treated as a cost in the month it's bought. Anything above your
  capitalization threshold (often $2,500) is really an asset, spread over time as
  depreciation.
- **Maintenance** counts as variable. Strictly, service contracts are fixed and repairs
  are variable.
- **Employee meals** are pay, not cost of goods. If your cost-of-goods figure already
  includes that food, take it out, or it's counted twice.
- **Packaging** is an operating cost, so prime cost stays comparable with published
  benchmarks. A mostly-takeout business may prefer it in cost of goods.

## Getting figures in

### A spreadsheet

The simplest layout is **one row per month**. Press **Download Excel template** (or CSV)
on the dashboard for a copy filled with sample months. Its columns:

`Month`, `Year`, `Revenue`, `Budget`, `Cost of goods sold`, `Labor`, `Employee meals`,
`Payroll tax`, `Packaging`, `Credit card fees`, `Marketing`, `Hardware`, `Utilities`,
`Maintenance`, `Rent`, `Insurance`, `Business license`, `Telephone`

Your own layout works too:

- Column order doesn't matter, and common other names are recognised.
- Months like `July`, `Sept 2026` or `2026-07` are read.
- A sheet with cost lines down the side and months across the top is turned round.
- Rows a report works out from the others (`Total costs`, `Gross profit`, `Net income`,
  ...) are set aside, so nothing is counted twice. That's also why the **Export to
  Excel** file can be dropped straight back on the page.
- The currency is taken from the symbols in the file.
- A column name FinDash doesn't know is matched by Claude when you're logged in (only
  the names are sent). Logged out, the import says which columns it left out.

The older two-file layout (`dashboard.csv` and `expenses.csv`, see the
[Java app](#the-java-command-line-app)) still works: drop both, in either order.

Excel (.xlsx) and CSV files are read. PDFs and bank statements are not.

### A photo of an invoice or receipt

Drop a JPEG, PNG or WebP of a supplier invoice, bill or receipt on the dashboard, while
logged in. The browser shrinks it and sends it to `api/read-document.js`, which asks
Claude for the supplier, number, date and every charged line (quantity, unit price,
amount, and which cost line it is).

The server then checks the arithmetic itself: each line's quantity × price, and the lines
against the printed total. A reading that doesn't add up gets one more careful look. You
see every line, can change any line's cost line and the month, and nothing is added until
you press **Add**.

Confirmed invoices are kept apart from the spreadsheet's months and added on top of their
month, so each can be removed again and a new spreadsheet doesn't drop them. A receipt
for money taken in adds to revenue. The photo itself is not kept.

## Running your own copy

The site is static pages in `docs/` plus small server functions in `api/`, hosted on
**Vercel**. Accounts use **Supabase**, the AI features use **Claude** (Anthropic), and
emails go through any SMTP service (these steps use **Resend**). Every service is
optional: without its settings, the features that need it are switched off, and the
rest of the dashboard works.

### 1. Vercel

Import the repository into Vercel; `vercel.json` already sets everything up. Then add
these under **Settings → Environment Variables** and redeploy:

| Variable | What it turns on |
| --- | --- |
| `SUPABASE_URL` and `SUPABASE_ANON_KEY` | Accounts. The Supabase integration in the Vercel Marketplace adds these for you. `SUPABASE_PUBLISHABLE_KEY` and the `NEXT_PUBLIC_` forms work too. |
| `ANTHROPIC_API_KEY` | Photos, advice and column matching (also needs accounts) |
| `SITE_URL` | Optional: the address used in login emails, e.g. `https://yourdomain.com` |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` | Optional: selling FinDash Plus (see [Paid plans with Stripe](#paid-plans-with-stripe)) |
| `STRIPE_AUTOMATIC_TAX` | Optional: `on` to have Stripe Tax add sales tax at checkout |
| `FORECAST_URL` and `FORECAST_TOKEN` | Optional: the forecast model (see `forecast/README.md`) |

The site never uses Supabase's service-role key (the integration adds one; nothing reads
it). `/api/capabilities` says which features are on, as true or false, never the keys.

To count page visits, open the project in Vercel, then **Analytics**, and press
**Enable**. Every page already loads Vercel's script; until Analytics is on, it does
nothing.

### 2. Supabase (accounts)

1. In Supabase open **SQL Editor**. For each file in `supabase/migrations/`, in order,
   paste it and press **Run**:
   - `20261011000000_account_figures.sql`: where saved figures are kept
   - `20261012000000_ai_usage_limits.sql`: the usage counts for paid features
   - `20261016000000_plans_and_billing.sql`: monthly limits, token counts, and which
     Stripe customer is whose

   Running a file twice does no harm. Until the first is run, figures stay in the browser;
   until the last two are run, photos, advice and column matching say "not set up yet".
   Run each new file **before** deploying the code that needs it.
2. Under **Authentication → URL Configuration**, set the Site URL to your live address
   and add `https://yourdomain.com/login` to the redirect URLs, so the links in emails
   come back to the login page.

The browser never talks to Supabase directly: the pages call `api/auth.js` and
`api/figures.js`, which keep the login in cookies page scripts can't read. Each person can
only ever reach their own row (row-level security).

### 3. Email (Resend)

Supabase sends the sign-up and password-reset emails. Its built-in email is only for
testing: it sends just a few an hour, and **only to members of your Supabase
organization**, so customers can't sign up until a real email service is connected.

1. **Resend → Domains:** add your domain and add the DNS records it shows wherever your
   domain is managed. Wait until it says **Verified**.
2. **Resend → API Keys:** create a key with **Sending access** for that domain. Copy it
   (it starts with `re_` and is shown once).
3. **Supabase → Authentication → Emails → SMTP Settings:** turn on custom SMTP:

   | Field | Value |
   | --- | --- |
   | Sender email | an address on the verified domain, e.g. `no-reply@yourdomain.com` |
   | Sender name | `FinDash` |
   | Host | `smtp.resend.com` |
   | Port | `465` (or `587`) |
   | Username | `resend` |
   | Password | the `re_...` API key |

4. **Supabase → Authentication → Rate Limits:** raise the emails-per-hour limit.

The API key goes only into Supabase. Vercel and the code never send email.

If creating an account fails, the login page says why:

| The page says | Fix |
| --- | --- |
| This site can't send emails to that address yet | Connect an email service (the steps above) |
| The confirmation email couldn't be sent | Check the SMTP settings: domain verified, username `resend`, password the API key, sender on that domain |
| This site has sent all the emails it can for now | Raise the email rate limit in Supabase |
| This site isn't taking new accounts at the moment | Supabase → Authentication → Sign In / Providers: allow new sign-ups, with Email on |

### Plans and monthly limits

Reading a photo, writing advice and matching column names each cost money, paid from
your Anthropic account. So each needs someone logged in, and each person has a monthly
allowance that depends on their plan (months run from the 1st, in UTC):

| Feature | Free | Plus |
| --- | --- | --- |
| Reading photos | 10 (a photo is one request, or two when it gets a second look) | 100 |
| Advice | 2 | 20 |
| Matching column names | 200 | 200 |

Change them, and Plus's prices, in `docs/js/plans.js`: the server enforces them from there
and the account box shows them. The pricing page (`docs/pricing.html`) and the prices in
`tools/build-pages.py` must say the same; a test checks they do. The counts are kept in
Supabase; without the migrations, the three features stay off rather than run without a
limit. Set a monthly spending limit in the Anthropic Console as well.

**What each use really costs.** Every request also records the tokens Claude used. In the
Supabase SQL Editor:

```sql
select feature, sum(uses) as uses, sum(input_tokens) as input, sum(output_tokens) as output
from public.ai_usage where day >= date_trunc('month', now()) group by feature;
```

Divide by the uses and multiply by Claude's price per token (input and output are priced
differently) to get the cost of one photo read or one piece of advice.

### Paid plans with Stripe

FinDash Plus is sold through Stripe, with Stripe's own checkout and billing pages, so
card details never reach this site. `lib/billing.js` explains the design: Stripe is the
only record of who has paid, asked directly whenever a plan matters, so there is no
webhook and the site still never needs Supabase's admin key. Without the Stripe settings,
everyone is on the free plan and the Plus buttons don't appear.

1. **Test mode first.** In the [Stripe dashboard](https://dashboard.stripe.com), switch on
   test mode.
2. **The product.** Under **Product catalog**, add a product named FinDash Plus with two
   recurring prices: $19 a month and $190 a year (the prices in `docs/js/plans.js`). Copy
   each price's ID (`price_...`).
3. **The billing page.** Under **Settings → Billing → Customer portal**, save the default
   settings once, with cancellation allowed ("at the end of the billing period") and
   invoice history on. People reach it with **Manage billing**.
4. **Failed payments.** Under **Settings → Billing → Revenue recovery**, choose how often
   Stripe retries and what happens after the last try: "cancel the subscription" puts the
   account back on Free. Turn on Stripe's emails for receipts and failed payments.
5. **Vercel.** Add `STRIPE_SECRET_KEY` (the test secret key, `sk_test_...`),
   `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`, and redeploy. Run the third
   migration first (see Supabase above).
6. **Try it.** Log in, open the login page, press **Get Plus**, and pay with Stripe's test
   card `4242 4242 4242 4242` (any future date, any CVC). The plan box should say Plus.
   Then try **Manage billing** and cancel, and **Delete my account** on a test account.
7. **Sales tax (optional).** Set up Stripe Tax in the dashboard, then add
   `STRIPE_AUTOMATIC_TAX=on`; the checkout page then asks for an address and adds tax.
   Whether you must collect tax, and where, is a question for an accountant.
8. **Going live.** Repeat steps 2 to 4 with test mode off, and replace the three Stripe
   settings with the live key and live price IDs.

### Deleting an account

**Delete my account** on the login page first ends Plus (it removes the person's customer
from Stripe, which cancels the subscription at once and drops the saved card; if Stripe
can't be reached, nothing is deleted). Then it removes their saved figures (from the
account and the browser), logs them out, and opens an email to the site's owner
(`OWNER_EMAIL` in `docs/js/login.js`) asking for the login to be deleted. Deleting a login
needs Supabase admin rights, which the site deliberately never has, so the owner finishes
it: **Supabase → Authentication → Users**, find the email, **Delete user**. Their usage
counts and Stripe customer number go with it.

### Speed

The fonts (Inter and JetBrains Mono, under the SIL Open Font License) are served from
`docs/fonts/`, not Google Fonts, so a page needs no other site to draw its text and
the Content-Security-Policy in `vercel.json` allows fonts from this site only. Fonts
are cached for a year (their names never change), icons and images for a week. The
dashboard's head lists every script it imports (`modulepreload`), which
`tools/build-pages.py` works out from the imports, so the browser fetches them all at
once instead of one after another. A test checks the dashboard doesn't jump about while
it loads (layout shift under 0.1 on a desktop, a tablet and a phone).

### When something goes wrong

Every problem the server functions run into, and every error in a visitor's browser, is
logged with the tag `findash-error`. In Vercel, open the project, then **Logs**, and
search for `findash-error`. Only the error and where it happened are logged, never
anyone's figures.

### Search engines and sharing

Every page has its own title and description, a canonical address on
`https://findash.tech`, and a preview for when a link is shared (`docs/og-image.png`,
1200 × 630). `tools/build-pages.py` writes those tags into every page; change a title or
description there and run `python3 tools/build-pages.py`. `tools/og-image/` redraws the
share image.

`docs/robots.txt` lets search engines read every page except `/api/`, and points them at
`docs/sitemap.xml`, which lists the pages worth finding. The log in, thank-you and 404
pages say `noindex` and are left out. If the site moves to another address, change
`SITE` in `tools/build-pages.py`, the addresses in `robots.txt` and `sitemap.xml`, and the
`og:image` lines, then run the script.

Google only lists a site it knows about. To get FinDash into Google:

1. Open [Google Search Console](https://search.google.com/search-console), **Add
   property**, choose **Domain**, and enter `findash.tech`.
2. Google shows a TXT record. Add it to the domain's DNS (wherever `findash.tech` is
   managed: the same place as Resend's records), then press **Verify**.
3. Under **Sitemaps**, submit `https://findash.tech/sitemap.xml`.
4. Under **URL inspection**, enter `https://findash.tech/` and press **Request
   indexing**.

Pages usually appear within a few days to a couple of weeks. To check, search Google for
`site:findash.tech`; Search Console's **Pages** report says which pages are indexed and
why any aren't.

Microsoft Copilot answers from Bing's index, so add the site to
[Bing Webmaster Tools](https://www.bing.com/webmasters) too: it can import the site
straight from Search Console.

### Wording for search engines and AI answers

AI answer engines (ChatGPT search, Perplexity, Google's AI Overviews, Copilot) quote pages
that say plainly what something is and answer the questions people actually ask. So:

- **Titles and descriptions** use the words people search with (free small business
  profit and loss dashboard, budget vs actual, Excel or CSV). They live in
  `tools/build-pages.py`.
- **The home page says what FinDash is** in one sentence, under "What is FinDash?", and
  answers common questions under "Questions people ask". Both are ordinary page text,
  because most AI crawlers don't run JavaScript.
- **Structured data** (schema.org JSON-LD: the site, the organisation, the web app and the
  questions) is written into the home page by `tools/build-pages.py`, from those two
  sections, and the questions on the restaurant page the same way. After changing the
  definition or a question, run the script again; a test checks the two still match
  word for word.
- **The help page's glossary** is written into the page by the same script, from
  `docs/js/glossary.js`, so crawlers see it too. After changing a definition, run it
  again.
- **`/restaurant-profit-and-loss`** is a page for the people FinDash was first built
  for: food cost, labor and prime cost, with the demo restaurant's figures and sourced
  benchmarks. If the demo figures change, update its example table.
- **The dashboard's heading** has plain fallback text for crawlers that don't run its
  script.
- **`docs/llms.txt`** describes FinDash for AI tools in plain text: what it is, when an
  agent should (and shouldn't) recommend it, and how an agent should use it. The help,
  dashboard and developers pages each have a smaller one (`/help/llms.txt` and so on).
- **Every page as Markdown.** An AI agent that asks for a page with the header
  `Accept: text/markdown`, or adds `.md` to its address (`/index.md` for the home page),
  gets the page as Markdown; `?mode=agent` gets llms.txt; an address with no page gets a
  Markdown 404 pointing to `llms.txt` and the sitemap. Browsers and search engines get the
  HTML exactly as before, with `Link` headers saying where the Markdown, llms.txt and the
  API's descriptions are. `middleware.js` (Vercel Routing Middleware) decides, using
  `lib/markdown-negotiation.js`; the Markdown itself is in `lib/markdown-pages.js`, which
  `tools/build-pages.py` converts from each page's own HTML. **After changing any page's
  text, run `python3 tools/build-pages.py`**: a test fails if the Markdown no longer
  matches the pages.
- **`/about` and `/contact`** say who runs FinDash and how to reach it, which AI tools
  check before recommending a site. The structured data names the support address as a
  `ContactPoint`.
- **`docs/schema-feed.jsonl`** has every page's structured data in one file (NLWeb Schema
  Feeds), listed in `docs/schemamap.xml`, which `robots.txt` names. The script writes both.

### For developers and AI agents

`/developers` documents all of this for people; the pieces are:

- **The API** (`/api/v1`): monthly figures in, a profit and loss summary out, with the
  template's columns and the glossary. No account or key, no AI model, nothing stored.
  `docs/openapi.json` describes it and `/.well-known/api-catalog` (RFC 9727) points to it.
  Every error is JSON with a code and a hint.
- **Two MCP servers** over Streamable HTTP: `/api/mcp` (the same jobs as tools) and
  `/api/mcp/docs` (read and search the pages). Each has an MCP Server Card at its address
  plus `/server-card`, listed in `/.well-known/ai-catalog.json`.
- **WebMCP tools on the dashboard** (`docs/js/dashboard/agent-tools.js`), for agents in
  browsers that support it: load figures, read the dashboard, pick the month, save the
  template.
- **An agent skill**, `skills/findash/SKILL.md`, published by the script at
  `/.well-known/agent-skills/` with its digest; and `AGENTS.md` for coding agents.

The API and both MCP servers are one server function, `api/agent.js` (Vercel's Hobby plan
allows twelve), reached through the rewrites in `vercel.json`, and they use the
dashboard's own arithmetic through `docs/js/dashboard/analysis.js`, so they always agree
with the page. To check the live site after a deploy:

```bash
curl -sS -i -H 'Accept: text/markdown' https://findash.tech/                # 200, text/markdown, Vary: Accept
curl -sS -i -H 'Accept: text/markdown' https://findash.tech/no-such-page    # 404, in Markdown
curl -sS -i https://findash.tech/index.md                                   # 200, text/markdown
curl -sS -X POST https://findash.tech/api/v1/analyze -H 'Content-Type: application/json' \
  -d '{"months": [{"month": "July", "year": 2026, "revenue": 72000, "costs": {"rent": 6000}}]}'
curl -sS -i https://findash.tech/api/mcp/server-card                        # 200, application/mcp-server-card+json
```

Preview deployments sit behind Vercel's login, so check those with `vercel curl` instead.

There is deliberately no meta keywords tag: Google has ignored it since 2009, and Bing may
treat a stuffed one as spam.

Keep the wording to what FinDash does. Don't describe it as accounting or bookkeeping
software, invoicing, payments, payroll or tax, a bank connection, cash flow, a QuickBooks
or Xero integration (people copy their totals across), or "fintech". The FAQ says plainly
that it does none of these, which is also what people searching for them need to know.

### Before taking customers

1. **Anthropic:** a monthly spending limit.
2. **Supabase:** both migrations run, and a real test: create an account, add a file,
   log in on another device.
3. **Email:** Resend (or another service) connected, as above.
4. **Plans:** Vercel's free Hobby plan is for non-commercial use, and selling Plus makes
   the site commercial: move to Vercel Pro. Supabase's free plan pauses after a week
   without activity: move to Supabase Pro before taking payments.
5. **Legal:** `docs/privacy.html` and `docs/terms.html` describe what the site actually
   does, including Plus's renewal, cancellation and refund terms, but have them read by
   someone qualified where you operate (auto-renewal rules differ by country and US state). The terms name no
   governing law yet. Some countries (Germany, for one) also require a postal address on
   a business website. Once there is one to publish, put it in `POSTAL_ADDRESS` in
   `tools/build-pages.py` and run the script: it is added to the structured data, where
   AI tools look for it when deciding whether a business is real.
6. **Analytics and search:** Web Analytics enabled in Vercel, and the site added to
   Google Search Console (see above).

## Working on the code

### Running it locally

```bash
python3 -m http.server 8000 --directory docs
```

Then open <http://localhost:8000>. This serves the pages only: the dashboard and
spreadsheets work, and the features that need a server stay hidden. To run the server
functions too, use the Vercel CLI (`npx vercel dev`), which uses your Vercel project's
settings.

Opening the files straight from disk won't work: browsers don't run the page's scripts
from a `file://` address, so always serve the folder.

### Tests

```bash
npm install
npx playwright install chromium   # the first time only
npm test
```

Over 150 tests, in a few minutes, against stand-ins for Supabase and Claude, so no keys
are needed and nothing is spent:

- `tests/unit/`: the arithmetic and file reading
- `tests/api/`: the server functions: logins, saved figures, monthly limits, Plus, what is sent
  to Claude, error reports
- `tests/browser/`: the pages in a real (headless) Chromium: the dashboard, photos,
  accounts, saving, deleting an account, two people taking turns on one browser, and
  the basics of every page (titles, share previews, icons, robots.txt, the sitemap, the
  404 page, phone layouts, the cookie notice, footers)
- `tests/api/agent-readiness.test.mjs`: what AI agents get: Markdown pages, the Markdown
  404, `.md` addresses, Link headers, the section llms.txt files, the schema feed, and
  that everything generated is up to date with the pages
- `tests/api/developer-api.test.mjs`: the public API against its OpenAPI description, its
  errors, the API catalog, both MCP servers through the official MCP client, the Server
  Cards against their JSON Schema, and the agent skill's digest
- `tests/browser/agent-tools.test.mjs`: the dashboard's WebMCP tools

GitHub runs the same tests, and builds the Java app, on every pull request
(`.github/workflows/tests.yml`).

### Reading the code

The code is written to be read by someone who isn't a programmer by trade:

- Every function is an ordinary named `function`, with a comment above it saying what
  it's for.
- Names are whole words: `month`, `revenue`, `formatMoney`, not `m`, `rev`, `fmt`.
- One step per line: `if` and `else` instead of `? :` chains, and loops instead of long
  chains of `.map().filter().reduce()`.
- Small files, each about one thing.

Where to start:

| To understand... | Read |
| --- | --- |
| How the dashboard starts | `docs/js/dashboard/main.js` |
| What the page keeps track of | `docs/js/dashboard/state.js` |
| How the cards are drawn | `docs/js/dashboard/draw-dashboard.js`, then `cards/` |
| How a spreadsheet becomes months | `import/sheet-import.js`, `import/months-from-sheet.js` |
| How a photo becomes an invoice | `photos/photo-import.js`, `photos/photo-review.js`, `api/read-document.js` |
| How figures are remembered | `saved-figures.js` (this browser), `account-figures.js` (the account) |
| What you buy and the count sheet | `items.js`, `cards/item-log.js`, `count-sheet.js` |
| How logging in works | `api/auth.js`, `lib/session.js`, `docs/js/login.js` |
| Who may use the paid features | `lib/ai-access.js`, with the plans in `docs/js/plans.js` |
| How Plus is sold and checked | `lib/billing.js`, `api/billing.js`, `docs/js/plan-box.js` |
| The cost groups | `docs/js/dashboard/cost-groups.js` |
| What the tests check | `tests/browser/dashboard.test.mjs`, then the rest of `tests/` |

### Project layout

```
docs/                    The website (Vercel serves this folder)
  index.html             Landing page
  dashboard.html         The dashboard
  help.html              Getting data in, glossary, how data is handled
  pricing.html           What's free and what Plus adds (plans.js has the numbers)
  about.html, contact.html   Who runs FinDash and how to reach it
  developers.html        The API, MCP servers, WebMCP tools and agent skill
  openapi.json           The API's OpenAPI description
  .well-known/           The API catalog, the AI Catalog and the agent skills index
  schema-feed.jsonl, schemamap.xml   Every page's structured data in one file
  restaurant-profit-and-loss.html   Food cost, labor and prime cost, for restaurants
  login.html             Log in, create an account, reset a password, delete an account
  privacy.html, terms.html   The privacy policy and terms of service
  thanks.html            After creating an account: "check your email"
  404.html               Shown for any address with no page
  robots.txt, sitemap.xml    For search engines
  llms.txt               What FinDash is, in plain text for AI tools
  og-image.png           The preview shown when a link is shared
  screenshot-dashboard.jpg   The dashboard, for search engines' app listings
  fonts/                 Inter and JetBrains Mono, with their licences
  favicon.ico, icon-*.png, apple-touch-icon.png, site.webmanifest   Icons
  data.json              The demo figures, written by the Java app
  css/                   One stylesheet per page, and site.css shared by all
  js/
    glossary.js          Plain-language definitions for the ? buttons and the help page
    error-reporter.js    Sends errors on the page to the site's log
    cookie-notice.js     The one-time note that only login cookies are used
    sticky-cta.js        The landing page's Open dashboard button that follows on phones
    theme-init.js, theme-toggle.js   Light and dark mode
    landing.js, login.js, thanks.js   Each page's own script
    dashboard/
      main.js            Starts the dashboard
      state.js           Everything the dashboard keeps track of
      draw-dashboard.js  The month buttons, the heading and every card
      cards/             One file per card
      import/            Reading spreadsheets: CSV, Excel, column names, months
      photos/            Reading photos of invoices and checking them
      export/            The template and Export to Excel
      saved-figures.js   Remembering figures in this browser
      account-figures.js Saving them to the account
      items.js           What the owner buys, item by item, from the invoices
      count-sheet.js     The count sheet made from those items, printed or for Excel
api/                     Server functions: accounts, saved figures, photo reading, advice,
                         column matching, forecast, capabilities, error reports, Plus
                         (billing.js), and agent.js: the public API and the MCP servers
lib/                     Shared by the functions: Supabase, login cookies, monthly limits,
                         Stripe (billing.js),
                         the API (agent-api.js) and MCP servers (mcp-servers.js); and the
                         Markdown versions of the pages (markdown-pages.js, written by
                         tools/build-pages.py) with the rules for serving them
middleware.js            Sends AI agents the Markdown version of a page, and Link headers
skills/                  The agent skill (SKILL.md), published under .well-known/
AGENTS.md                Instructions for AI coding agents working on this code
supabase/migrations/     The SQL for saved figures, usage limits and Stripe customers
tests/                   The tests (npm test)
.github/workflows/       Runs the tests on every pull request
forecast/                The optional forecast service (Python, Chronos)
tools/                   build-pages.py (head tags, structured data, the glossary, the
                         Markdown versions of the pages, the skill index, the schema feed),
                         og-image/ (the share image)
src/main/java/           The Java command-line app
data/                    The Java app's input CSVs
```

## The Java command-line app

The project began as a Java console app, and it still works: it reads two CSV files from
`data/`, prints a month's figures, compares any two months, and writes `docs/data.json`
(the demo figures the website opens on).

You'll need JDK 21 or newer and Maven. Run it from the project root, since the CSV paths
are relative to it:

```bash
mvn -q compile exec:java
```

It lists the months it loaded, then asks for a month number to show, and another to
compare it with. `0` goes back, and `0` at the first question quits. A comparison
(shortened):

```
july vs september
Metrics                        july    september     Difference
Revenue                $  72,000.00 $  33,000.00 $  +39,000.00
Gross Profit                  36.8%        38.8%        -2.0 pts
Net Profit                    10.5%       -11.0%       +21.5 pts
Total Expenses                89.5%       111.0%       -21.6 pts
Budget Used                   97.6%       107.8%       -10.2 pts
```

The difference is the first month minus the second, in dollars for revenue and in
percentage points (`pts`) for everything else.

### Its two files

`data/dashboard.csv` has one row per month: `month` (a name), `month num` (the number you
type, and the key that joins the two files), `revenue`, `budget`, and optionally `year`.

```csv
month,month num,revenue,budget
july,7,72000,66000
august,8,64000,57000
september,9,33000,34000
```

`data/expenses.csv` has `month num` and the fourteen cost lines. The group totals are
always worked out from the lines, never stored, so they can't drift apart.

```csv
month num,cogs,packaging,rent,utilities,maintenance,hardware,insurance,marketing,credit card fees,business license,telephone,employee meals,tax,labor
7,26000,3400,6000,2800,950,0,1100,2200,2150,0,320,2500,5000,12000
```

- Columns are matched by name, so their order doesn't matter. A name the app can't place
  is sent to Claude (the name only) when `ANTHROPIC_API_KEY` is set; without a key, the
  file is read in the order above.
- Amounts may contain commas (`1,800`). Empty or unreadable cells count as `0`.
- A month in `dashboard.csv` with no row in `expenses.csv` is skipped, with a message.
  A month with no revenue prints `NaN`, since every ratio divides by revenue.

### `docs/data.json`

Each run writes every month with its finished figures (revenue, all fourteen lines under
`lines`, the four group totals, gross and net profit, budget and budget used), so whatever
reads it never has to redo the arithmetic. One month, shortened:

```json
{
  "generated": "2026-09-14",
  "months": [
    {
      "month": "july", "monthNum": 7, "year": 2026, "revenue": 72000.00,
      "lines": { "cogs": 26000.00, "labor": 12000.00, "rent": 6000.00, "...": "..." },
      "directExpenses": 45500.00, "operatingExpenses": 7750.00,
      "variableOverhead": 3750.00, "fixedOverhead": 7420.00, "totalExpenses": 64420.00,
      "grossProfit": 26500.00, "netProfit": 7580.00,
      "budget": 66000.00, "budgetPercent": 97.61
    }
  ]
}
```
