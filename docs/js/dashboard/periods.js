/* Periods: which months a card covers.

   "Month" is the selected month. "Quarter" is the real calendar quarter
   (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec) that month falls in, not just "the two
   rows before it": a selected month that starts a quarter should not pull in
   the tail of the previous one. "Year to date" is every month on file in that
   same calendar year, up to and including the selected month.

   The period drives the cards that describe ONE stretch of time: the net
   result, the headline numbers, budget, where revenue goes and the report.
   Cards that compare months (the charts, what needs attention, the
   estimator, the forecast and the advice) always use every month on file.
   Each card says which it is. */

import { state } from "./state.js";
import { yearOf, describeMonths } from "./months.js";
import { ALL_COST_LINES, lineValue } from "./cost-groups.js";

export const PERIODS = [
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "ytd", label: "Year to date" }
];

export function periodLabel(periodKey) {
  for (const period of PERIODS) {
    if (period.key === periodKey) {
      return period.label;
    }
  }
  return "";
}

function quarterOf(monthNumber) {
  return Math.ceil(monthNumber / 3);
}

/* The months on file that the period around `month` covers, in order. */
export function monthsInPeriod(month, periodKey) {
  const allMonths = state.data.months;
  if (allMonths.indexOf(month) < 0) {
    return [month];
  }

  if (periodKey === "quarter") {
    return allMonths.filter(function (other) {
      return yearOf(other) === yearOf(month) && quarterOf(other.monthNum) === quarterOf(month.monthNum);
    });
  }

  if (periodKey === "ytd") {
    return allMonths.filter(function (other) {
      return yearOf(other) === yearOf(month) && other.monthNum <= month.monthNum;
    });
  }

  return [month];
}

/* The run of the same length just before the period, for the "vs" changes.
   Empty when the file does not go back that far: ten months of year to date
   "up $100,254" on the four months before them would compare lengths, not
   performance. */
export function monthsBeforePeriod(month, periodKey) {
  const allMonths = state.data.months;
  const periodMonths = monthsInPeriod(month, periodKey);
  const firstIndex = allMonths.indexOf(periodMonths[0]);
  if (firstIndex < periodMonths.length) {
    return [];
  }
  return allMonths.slice(firstIndex - periodMonths.length, firstIndex);
}

/* Adds up one field across months. Missing or non-numeric values count as 0. */
function sumOfField(months, fieldName) {
  let total = 0;
  for (const month of months) {
    total += Number(month[fieldName]) || 0;
  }
  return total;
}

/* A run of months folded into one month-shaped set of totals, so every period
   card can draw a quarter exactly the way it draws a month.

   Margins come from the summed figures, never from averaging each month's
   margin: averaging ratios silently gives a small month as much weight as a
   big one. */
export function totalsForMonths(months) {
  const lines = {};
  for (const lineKey of ALL_COST_LINES) {
    let lineTotal = 0;
    for (const month of months) {
      lineTotal += lineValue(month, lineKey);
    }
    lines[lineKey] = lineTotal;
  }

  // "Budget used" compares spending only from months that HAVE a budget, so
  // one month without a figure cannot push the whole quarter past 100%.
  const budgetedMonths = months.filter(function (month) {
    return month.budget;
  });
  let budgetSpent = 0;
  for (const month of budgetedMonths) {
    budgetSpent += month.totalExpenses;
  }

  const totals = {
    months: months,
    label: describeMonths(months),
    lines: lines,
    revenue: sumOfField(months, "revenue"),
    directExpenses: sumOfField(months, "directExpenses"),
    operatingExpenses: sumOfField(months, "operatingExpenses"),
    variableOverhead: sumOfField(months, "variableOverhead"),
    fixedOverhead: sumOfField(months, "fixedOverhead"),
    totalExpenses: sumOfField(months, "totalExpenses"),
    netProfit: sumOfField(months, "netProfit"),
    budget: sumOfField(months, "budget"),
    budgetSpent: budgetSpent,
    budgetMonths: budgetedMonths.length
  };

  if (totals.revenue) {
    totals.margin = (totals.netProfit / totals.revenue) * 100;
  } else {
    totals.margin = 0;
  }
  if (totals.budget) {
    totals.budgetPercent = (totals.budgetSpent / totals.budget) * 100;
  } else {
    totals.budgetPercent = 0;
  }
  return totals;
}
