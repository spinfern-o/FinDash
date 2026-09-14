# CFO Dashboard

A Java console app that turns two CSV files of monthly business financials into a
readable dashboard of KPIs, and lets you compare any two months side by side.

Costs are grouped into four non-overlapping buckets — direct expenses, operating
expenses, variable overhead, and fixed overhead — so the same structure works for a
restaurant, a retailer, a trades business, or a service firm.

## Requirements

- JDK 17 or newer (developed against Temurin 21)

## Quick start

Compile and run from the project root:

```bash
javac -d bin CFODashboard.java Expenses.java && java -cp bin CFODashboard
```

> **Run from the project root.** The CSV paths (`data/expenses.csv`, `data/dashboard.csv`)
> are relative to the working directory. In VS Code, the included `.vscode/launch.json`
> config named **CFODashboard** already handles this.

## Example usage

The app lists the months it loaded, writes `docs/data.json`, then loops on two prompts:

1. **Pick a month** — enter its month number to print that month's dashboard.
2. **Pick a month to compare against** — enter another month number for a side-by-side
   table. Keep entering numbers to compare against more months.

Enter `0` at the second prompt to pick a different month; `0` at the first prompt exits.

### Example session

```
Months on file:
7 - july
8 - august
9 - september
Which month's dashboard do you wish to see? (month num, 0 to quit)
7
july's financial dashboard
Month Number                      7
Revenue                  $72,000.00

Maintenance                  $950.00
Hardware                       $0.00
Utilities                  $2,800.00
COGS                      $26,000.00
Labor                     $12,000.00

Gross Profit                  36.8%
Net Profit                    10.5%

Variable Overhead              5.2%
Fixed Overhead                10.3%

Direct Expenses               63.2%
Operating Expenses            10.8%

Total Expenses                89.5%

Budget                    $66,000.00
Budget Used                   97.6%
You used 97.61% of your budget ($1,580.00 under)
Which month's dashboard would you like to compare it to? (month num, 0 to quit)
9

july vs september
Metrics                        july    september     Difference
Revenue                $  72,000.00 $  33,000.00 $  +39,000.00

Gross Profit                  36.8%        38.8%        -2.0 pts
Net Profit                    10.5%       -11.0%       +21.5 pts
Fixed Overhead                10.3%        26.3%       -16.0 pts

Variable Overhead              5.2%         6.7%        -1.5 pts

Direct Expenses               63.2%        61.2%        +2.0 pts
Operating Expenses            10.8%        16.8%        -6.1 pts

Total Expenses                89.5%       111.0%       -21.6 pts
Budget Used                   97.6%       107.8%       -10.2 pts
```

The difference column is computed as **month 1 minus month 2**, so a cost that rose
from the first month to the second prints negative.

## Data files

Both files live in `data/` and are joined on the **month num** column.

### `data/dashboard.csv`

| Column      | Meaning                                       |
| ----------- | --------------------------------------------- |
| `month`     | Display name (e.g. `july`)                    |
| `month num` | Integer key, also what you type at the prompt |
| `revenue`   | Total revenue for the month                   |
| `budget`    | Planned total expense budget for the month    |

```csv
month,month num,revenue,budget
july,7,72000,66000
august,8,64000,57000
september,9,33000,34000
```

### `data/expenses.csv`

Fifteen columns. Every line item is stored individually; the four category totals are
derived in Java rather than stored, so they cannot drift out of sync with their parts.

| Column              | Bucket             |
| ------------------- | ------------------ |
| `month num`         | Integer key matching `dashboard.csv` |
| `cogs`              | Direct             |
| `packaging`         | Operating          |
| `rent`              | Fixed overhead     |
| `utilities`         | Variable overhead  |
| `maintenance`       | Variable overhead  |
| `hardware`          | Operating          |
| `insurance`         | Fixed overhead     |
| `marketing`         | Operating          |
| `credit card fees`  | Operating          |
| `business license`  | Fixed overhead     |
| `telephone`         | Fixed overhead     |
| `employee meals`    | Direct             |
| `tax`               | Direct             |
| `labor`             | Direct             |

```csv
month num,cogs,packaging,rent,utilities,maintenance,hardware,insurance,marketing,credit card fees,business license,telephone,employee meals,tax,labor
7,26000,3400,6000,2800,950,0,1100,2200,2150,0,320,2500,5000,12000
8,21000,2600,6200,3100,4200,0,1100,1800,1760,0,320,2000,5500,9000
9,11000,1350,6000,1900,310,2400,1100,900,910,1250,320,500,5200,3500
```

**Every line item appears in exactly one bucket.** Fourteen costs, fourteen slots, no
double counting — so the four category totals sum to total expenses, and revenue minus
total expenses equals net profit.

Column order matters: the parser reads by index, not by header name. Reordering columns
will silently load values into the wrong fields rather than throwing an error.

Parsing notes:

- The first line of each file is treated as a header and skipped.
- Amounts may contain commas (`1,800`) — they're stripped before parsing.
- Empty or unparseable cells fall back to `0.0` rather than crashing.
- Trailing empty columns are preserved, so a blank final cell reads as `0`, not an error.
- A month present in `dashboard.csv` with no matching row in `expenses.csv` is skipped
  with a message; it won't appear in the menu.

## Metrics

All ratios are expressed as a percentage of revenue, except Budget Used.

| Metric             | Formula                                                     |
| ------------------ | ----------------------------------------------------------- |
| Direct Expenses    | `(cogs + labor + employee meals + tax) / revenue`           |
| Operating Expenses | `(packaging + credit card fees + marketing + hardware) / revenue` |
| Variable Overhead  | `(utilities + maintenance) / revenue`                       |
| Fixed Overhead     | `(rent + insurance + business license + telephone) / revenue` |
| Total Expenses     | `(direct + operating + variable OH + fixed OH) / revenue`   |
| Gross Profit       | `(revenue − direct expenses) / revenue`                     |
| Net Profit         | `(revenue − total expenses) / revenue`                      |
| Budget Used        | `total expenses / budget`                                   |

In the comparison table, the revenue row shows a signed dollar difference and every
percentage row shows a signed change in **percentage points** (`pts`).

### What each bucket means

**Direct expenses** are costs traceable to a specific unit, job, or client. If you can
name what it was for, it belongs here. This plus direct labor is prime cost — usually
the largest share of spend and the part management can actually change week to week.

**Operating expenses** scale with volume but aren't traceable to one unit — packaging,
processing fees, marketing.

**Variable overhead** rises with activity, but not proportionally. Utilities are the
textbook case.

**Fixed overhead** doesn't move with sales at all. It's also the hardest to cut, since
most of it is contractual.

### Reading the ratios

Every percentage has revenue in the denominator, so a ratio can move because the cost
changed **or** because revenue changed. September in the sample data shows this: fixed
overhead jumps from 10.3% to 26.3%, but those dollars barely moved — revenue halved.
When a ratio spikes, check the dollar figure before concluding anything about spending.

Watch percentages on the large, steady lines (COGS, labor) where stability is the
signal. Watch dollars on the lumpy ones (maintenance, hardware, business license),
where a percentage of an irregular number tells you little.

### Benchmarks

Healthy ranges are entirely industry-dependent, so the most useful comparison is
against your own trend rather than a published figure. As a rough orientation for
full-service food operations:

| Metric      | Target  |
| ----------- | ------- |
| COGS        | 28–35%  |
| Labor       | 28–32%  |
| Prime cost  | 55–65%  |
| Occupancy   | 6–10%   |
| Net margin  | 3–6%    |

## Assumptions worth knowing

A few judgment calls are baked into the categories. They're defensible, but they're
choices, and changing one mid-year makes months incomparable.

- **`tax` is treated as payroll tax** and sits in direct expenses alongside labor. If
  your figure includes property tax it belongs in fixed overhead; if it includes income
  tax it shouldn't be in total expenses at all, since income tax comes after net profit.
- **`hardware` is expensed, not capitalized.** Anything above your capitalization
  threshold (commonly $2,500) is really a fixed asset that should reach the P&L as
  depreciation instead.
- **`maintenance` is treated as variable.** Strictly it splits: recurring service
  contracts are fixed, unplanned breakdowns are variable.
- **`employee meals` are compensation,** not cost of goods. If your COGS figure already
  includes that food, credit it out or the same inventory is counted twice.
- **`packaging` is an operating expense,** not COGS, so prime cost stays comparable to
  published benchmarks. Heavy takeout operations may prefer it in COGS.

## JSON output

Every run writes `docs/data.json` — the same months and metrics in machine-readable
form, for charting or a web front end. All calculations happen in Java, so the JSON
carries finished values and consumers never recompute them.

```json
{
  "generated": "2026-09-14",
  "months": [
    {
      "month": "july",
      "monthNum": 7,
      "revenue": 72000.00,
      "maintenance": 950.00,
      "hardware": 0.00,
      "utilities": 2800.00,
      "cogs": 26000.00,
      "labor": 12000.00,
      "grossProfit": 26500.00,
      "netProfit": 7580.00,
      "variableOverhead": 3750.00,
      "fixedOverhead": 7420.00,
      "directExpenses": 45500.00,
      "operatingExpenses": 7750.00,
      "totalExpenses": 64420.00,
      "budget": 66000.00,
      "budgetPercent": 97.61
    }
  ]
}
```

## Using your own numbers

1. Replace the rows in `data/dashboard.csv` and `data/expenses.csv`, keeping the
   headers and column order intact.
2. Make sure every `month num` in `dashboard.csv` has a matching row in `expenses.csv`.
   A month with no revenue row will divide by zero and print `NaN` in every cell.
3. Recompile and run — the menu is built from whatever loaded.

### Without recompiling

The web dashboard can also read the two CSVs directly. Open the published page,
click **Choose CSV files**, and pick `dashboard.csv` and `expenses.csv` (together
or one at a time, in either order — each file is identified by its headers, not
its name). The browser runs the same bucket arithmetic the Java app does and
renders the result; **Use published figures** switches back to `data.json`.

Files are read locally and never uploaded anywhere. CSV is the only format read —
PDFs and bank statements are not supported.

Costs that don't fit an existing column should be added to the bucket that matches
their behavior, not appended arbitrarily — the point of the structure is that the four
totals stay meaningful.

## Project layout

```
CFODashboard.java   Main class: CSV loading, metrics, prompts, display, comparison
Expenses.java       Per-month expense record with getters and derived sums
data/               Input CSVs
docs/data.json      Generated on every run
docs/index.html     Web dashboard, published by GitHub Pages from /docs
bin/                Compiled classes (git-ignored)
.vscode/launch.json VS Code run configuration
```
