/* The owner's months: the ones from their spreadsheet, with every invoice
   and receipt from a photo added on top. */

import { state } from "./state.js";
import { MONTH_NAMES } from "./months.js";
import { COST_GROUPS, ALL_COST_LINES } from "./cost-groups.js";
import { roundToCents } from "./numbers.js";

/* A month with nothing in it yet, for an invoice dated in a month the
   spreadsheet does not have. */
function emptyMonth(year, monthNumber) {
  const lines = {};
  for (const lineKey of ALL_COST_LINES) {
    lines[lineKey] = 0;
  }
  return {
    month: MONTH_NAMES[monthNumber - 1],
    monthNum: monthNumber,
    year: year,
    revenue: 0,
    budget: 0,
    lines: lines,
    otherDirect: 0,
    otherOperating: 0,
    otherVariable: 0,
    otherFixed: 0
  };
}

function sumOfGroup(month, groupName) {
  let total = 0;
  for (const lineKey of COST_GROUPS[groupName]) {
    total += Number(month.lines[lineKey]) || 0;
  }
  return total;
}

/* Works a month's totals out again from its lines: the same arithmetic as
   for a spreadsheet, run again once invoices have added to the lines. */
function recalculateTotals(month) {
  month.directExpenses = roundToCents(sumOfGroup(month, "direct") + (month.otherDirect || 0));
  month.operatingExpenses = roundToCents(sumOfGroup(month, "operating") + (month.otherOperating || 0));
  month.variableOverhead = roundToCents(sumOfGroup(month, "variable") + (month.otherVariable || 0));
  month.fixedOverhead = roundToCents(sumOfGroup(month, "fixed") + (month.otherFixed || 0));
  month.totalExpenses = roundToCents(
    month.directExpenses + month.operatingExpenses + month.variableOverhead + month.fixedOverhead
  );
  month.grossProfit = roundToCents(month.revenue - month.directExpenses);
  month.netProfit = roundToCents(month.revenue - month.totalExpenses);

  if (month.budget) {
    month.budgetPercent = roundToCents((month.totalExpenses / month.budget) * 100);
  } else {
    month.budgetPercent = 0;
  }

  // The five top-level line fields data.json has, kept in step.
  for (const lineKey of ["cogs", "labor", "utilities", "maintenance", "hardware"]) {
    month[lineKey] = month.lines[lineKey];
  }
  return month;
}

function compareByDate(a, b) {
  const yearDifference = a.year - b.year;
  if (yearDifference) {
    return yearDifference;
  }
  return a.monthNum - b.monthNum;
}

/* Every invoice lands in the month of its date, line by line in the cost
   line the owner confirmed; a receipt for money taken in adds to revenue.
   A month only invoices mention is created with no revenue or budget yet.
   The months passed in are copied, never changed. */
export function combineMonthsAndInvoices(spreadsheetMonths, invoices) {
  const months = spreadsheetMonths.map(function (month) {
    return Object.assign({}, month, { lines: Object.assign({}, month.lines), invoiceCount: 0 });
  });

  for (const invoice of invoices) {
    let month = months.find(function (candidate) {
      return candidate.year === invoice.year && candidate.monthNum === invoice.monthNum;
    });
    if (!month) {
      month = Object.assign(emptyMonth(invoice.year, invoice.monthNum), { invoiceCount: 0 });
      months.push(month);
    }

    if (invoice.kind === "sale") {
      month.revenue = roundToCents(month.revenue + invoice.total);
    } else {
      for (const line of invoice.lines) {
        month.lines[line.category] = roundToCents((month.lines[line.category] || 0) + line.amount);
      }
    }
    month.invoiceCount++;
  }

  for (const month of months) {
    recalculateTotals(month);
  }
  return months.sort(compareByDate);
}

/* The owner's months as they should be on screen right now. */
export function ownerMonthsOnScreen() {
  return combineMonthsAndInvoices(state.ownerMonths || [], state.ownerInvoices);
}

/* What the figures on screen came from, in one phrase:
   "figures.xlsx + 2 invoices from photos". */
export function describeOwnerSource() {
  const invoiceCount = state.ownerInvoices.length;
  const parts = [];
  if (state.ownerSourceName) {
    parts.push(state.ownerSourceName);
  }
  if (invoiceCount === 1) {
    parts.push("1 invoice from photos");
  } else if (invoiceCount > 1) {
    parts.push(`${invoiceCount} invoices from photos`);
  }
  return parts.join(" + ") || "your figures";
}
