---
name: findash
description: Turn a small business's monthly revenue, costs and budget into a profit and loss (P&L) summary with FinDash (findash.tech) - costs in four groups, gross and net profit, net margin, budget vs actual, and the months that made a loss or went over budget. Use when someone asks how their business did month by month, wants their P&L or budget explained, or wants their figures in the FinDash dashboard. Free, no account or API key.
---

# FinDash

FinDash (findash.tech) is a free web app that turns a small business's monthly figures into a profit and loss
dashboard. Use this skill to work out and explain an owner's monthly results, or to prepare their figures for
the dashboard. FinDash shows profit, not cash flow, and it is not accounting software: it doesn't keep books,
connect to banks, send invoices, run payroll or file taxes.

## 1. Gather each month's figures

For every month you need: the month and year, **revenue** (everything that came in from sales), an optional
**budget** (the most the owner planned to spend that month in total; it is a spending limit, not a sales
target), and the month's **costs**. Take them from the owner's Profit and Loss report (QuickBooks, Xero) or
their own records. Ask rather than guess when a figure is missing.

Put each cost on one of FinDash's fourteen lines. A cost with no line of its own goes in the closest one.

| Line (API key) | Typical P&L lines | Group |
|---|---|---|
| `costOfGoodsSold` | Stock, ingredients, food and drink purchases | Direct costs |
| `labor` | Wages and salaries | Direct costs |
| `employeeMeals` | Staff meals | Direct costs |
| `payrollTax` | Payroll taxes | Direct costs |
| `packaging` | Packaging, takeout containers | Operating costs |
| `creditCardFees` | Card processing, delivery-app commissions | Operating costs |
| `marketing` | Advertising, promotions | Operating costs |
| `hardware` | Small equipment, POS terminals | Operating costs |
| `utilities` | Gas, electricity, water | Variable overhead |
| `maintenance` | Repairs, cleaning | Variable overhead |
| `rent` | Rent | Fixed overhead |
| `insurance` | Insurance | Fixed overhead |
| `businessLicense` | Licenses and permits | Fixed overhead |
| `telephone` | Phone and internet | Fixed overhead |

## 2. Work out the results

Call the FinDash API (no key needed). Send amounts as plain numbers, one object per month, at most 120 months:

```bash
curl -sS https://findash.tech/api/v1/analyze \
  -H 'Content-Type: application/json' \
  -d '{"currency": "USD", "months": [{"month": "July", "year": 2026, "revenue": 72000, "budget": 66000,
       "costs": {"costOfGoodsSold": 26000, "labor": 12000, "rent": 6000, "utilities": 2800}}]}'
```

The answer gives, for every month and in total: the four cost groups, `totalCosts`, `grossProfit` (revenue minus
direct costs), `netProfit` (after every cost), `netMarginPercent`, `budgetUsedPercent`, and `needsAttention`,
the months that made a loss or went over budget. A `400` answer lists each value to fix under
`error.problems`.

With an MCP client, use the server at `https://findash.tech/api/mcp` instead: the tool
`analyze_monthly_figures` takes the same months. Full reference: https://findash.tech/developers and
https://findash.tech/openapi.json.

## 3. Explain the results

- Lead with what needs attention: losses first, then budget overruns, then the trend in net profit.
- Explain a term with the glossary (`GET https://findash.tech/api/v1/glossary`, or the `explain_term` tool):
  for example, net margin is net profit as a share of revenue.
- Fixed costs (rent, insurance) don't shrink when sales do, which is how a slow month turns into a loss.
- Say plainly that the figures are a guide, not accounting, tax or investment advice, and that profit is not
  cash: a profitable month can still leave the owner short of cash.

## 4. Put the figures in the dashboard

For charts and month-by-month views, the owner can use https://findash.tech/dashboard themselves: no
signup, and their spreadsheet is read in their own browser, not uploaded. Prepare a spreadsheet with one row
per month and the columns from `GET https://findash.tech/api/v1/template` (Month, Year, Revenue, Budget and the
fourteen cost lines), or tell them to press **Download Excel template** on the dashboard and fill it in.
