/* Turning spreadsheet rows into months: the same arithmetic CFODashboard.java
   does, done in the browser so a file dropped on the page never has to make a
   round trip through the Java app. */

import { parseAmount, roundToCents } from "../numbers.js";
import { escapeHtml } from "../format.js";
import { MONTH_NAMES } from "../months.js";
import { COST_GROUPS, COST_GROUP_ROWS, ALL_COST_LINES, lineValue, sumOfColumns } from "../cost-groups.js";
import { normaliseHeader } from "./column-names.js";
import { monthFromExcelDate, monthFromText, yearInText } from "./period-cells.js";

/* The total of every leftover column (one that matched no line) that the
   column-matching service put in `groupName`. */
function leftoversInGroup(row, leftovers, groupName) {
  let total = 0;
  for (const columnName of Object.keys(leftovers)) {
    if (leftovers[columnName] === groupName) {
      total += parseAmount(row[columnName]);
    }
  }
  return total;
}

/* One month's figures from one row that holds all of them. */
function monthFromRow(entry, leftovers) {
  const row = entry.row;
  const revenue = parseAmount(row.revenue);
  const budget = parseAmount(row.budget);

  // Costs in a column with no line of their own still belong to a group:
  // dropping them would understate total costs and break
  // revenue - costs = net profit.
  const otherDirect = leftoversInGroup(row, leftovers, "direct");
  const otherOperating = leftoversInGroup(row, leftovers, "operating");
  const otherVariable = leftoversInGroup(row, leftovers, "variable");
  const otherFixed = leftoversInGroup(row, leftovers, "fixed");

  const directExpenses = sumOfColumns(row, COST_GROUPS.direct) + otherDirect;
  const operatingExpenses = sumOfColumns(row, COST_GROUPS.operating) + otherOperating;
  const variableOverhead = sumOfColumns(row, COST_GROUPS.variable) + otherVariable;
  const fixedOverhead = sumOfColumns(row, COST_GROUPS.fixed) + otherFixed;
  const totalExpenses = directExpenses + operatingExpenses + variableOverhead + fixedOverhead;
  const grossProfit = revenue - directExpenses;
  const netProfit = grossProfit - operatingExpenses - variableOverhead - fixedOverhead;

  // Every cost line, so the report can list anything that counted toward a
  // group's total. The five top-level line fields stay for data.json's sake.
  const lines = {};
  for (const lineKey of ALL_COST_LINES) {
    lines[lineKey] = parseAmount(row[lineKey]);
  }

  let budgetPercent = 0;
  if (budget) {
    budgetPercent = roundToCents((totalExpenses / budget) * 100);
  }

  return {
    // Made safe for HTML here rather than at each of the ~15 places a month
    // name is drawn: a CSV whose month cell was <img src=x onerror=...> ran
    // its script in the page.
    month: escapeHtml(String(entry.month).toLowerCase()),
    monthNum: entry.monthNum,
    year: entry.year,
    revenue: revenue,
    lines: lines,
    cogs: parseAmount(row.cogs),
    labor: parseAmount(row.labor),
    utilities: parseAmount(row.utilities),
    maintenance: parseAmount(row.maintenance),
    hardware: parseAmount(row.hardware),
    directExpenses: directExpenses,
    operatingExpenses: operatingExpenses,
    variableOverhead: variableOverhead,
    fixedOverhead: fixedOverhead,
    otherDirect: otherDirect,
    otherOperating: otherOperating,
    otherVariable: otherVariable,
    otherFixed: otherFixed,
    totalExpenses: totalExpenses,
    grossProfit: grossProfit,
    netProfit: netProfit,
    budget: budget,
    budgetPercent: budgetPercent
  };
}

/* A Year column with one blank cell used to send that row to the very
   front, because its year sorted as 0. Rows arrive in file order, which is
   nearly always date order, so the last known year is carried forward and
   any blanks at the start get the first year that is known. Files with no
   year at all are left alone: every row stays null and yearOf() handles them
   together. */
function fillInMissingYears(months) {
  const firstKnown = months.find(function (month) {
    return month.year;
  });
  if (!firstKnown) {
    return;
  }
  let carriedYear = firstKnown.year;
  for (const month of months) {
    if (month.year) {
      carriedYear = month.year;
    } else {
      month.year = carriedYear;
    }
  }
}

/* Date order needs the year: sorting on the month number alone would put
   January 2026 before December 2025. */
function compareByDate(a, b) {
  const yearDifference = (a.year || 0) - (b.year || 0);
  if (yearDifference !== 0) {
    return yearDifference;
  }
  return a.monthNum - b.monthNum;
}

/* The two rules the whole dashboard rests on. If a later change to the
   groups or the leftovers breaks one, say so loudly here rather than let a
   plausible wrong total reach the screen. */
function checkMonthsAddUp(months) {
  for (const month of months) {
    const groupsTotal = month.directExpenses + month.operatingExpenses +
      month.variableOverhead + month.fixedOverhead;
    if (Math.abs(groupsTotal - month.totalExpenses) > 0.005) {
      console.error("reconciliation failed: buckets do not sum to total expenses",
        month.month, groupsTotal, month.totalExpenses);
    }
    if (Math.abs((month.revenue - month.totalExpenses) - month.netProfit) > 0.005) {
      console.error("reconciliation failed: revenue - expenses != net profit", month.month);
    }

    // Each group against the lines under it. Comparing groups only with the
    // grand total stayed true the whole time the report was leaving out nine
    // of the fourteen lines, so it never caught that.
    for (const row of COST_GROUP_ROWS) {
      let listed = 0;
      for (const lineKey of COST_GROUPS[row.group]) {
        listed += lineValue(month, lineKey);
      }
      listed += month[row.otherKey];
      if (Math.abs(listed - month[row.totalKey]) > 0.005) {
        console.error("reconciliation failed: " + row.group + " does not match its line items",
          month.month, listed, month[row.totalKey]);
      }
    }
  }
}

/* The arithmetic, shared by the one-file and two-file layouts. Each entry is
   { month, monthNum, year, row } with every figure for the month on `row`. */
function monthsFromEntries(entries, leftovers) {
  const months = entries.map(function (entry) {
    return monthFromRow(entry, leftovers || {});
  });
  fillInMissingYears(months);
  months.sort(compareByDate);
  checkMonthsAddUp(months);
  return months;
}

/* A report's Total or Year-to-date column is a sum of the months beside it,
   not another month; reading it as one doubles every figure in the charts. */
function isTotalRow(periodText) {
  return /^(total|ytd|year to date)\b/.test(normaliseHeader(periodText));
}

/* Which month a row of a one-file sheet is, from its period cell. */
function entryForRow(row, rowIndex, periodColumn) {
  let periodText = row[periodColumn];
  if (periodText === null || periodText === undefined) {
    periodText = "";
  }
  periodText = String(periodText).trim();

  const excelDate = monthFromExcelDate(periodText);
  if (excelDate) {
    return { month: excelDate.month, monthNum: excelDate.monthNum, year: excelDate.year, row: row };
  }

  // The template has a plain Month column ("July") and no month number.
  // Without reading the name, every row became month 1, 2, 3 by position.
  const namedMonth = monthFromText(periodText);

  let month;
  if (namedMonth) {
    month = MONTH_NAMES[namedMonth - 1];
  } else {
    month = periodText.toLowerCase() || ("period " + (rowIndex + 1));
  }
  const monthNum = parseAmount(row["month num"]) || namedMonth || rowIndex + 1;
  const year = parseAmount(row.year) || yearInText(periodText) || null;

  return { month: month, monthNum: monthNum, year: year, row: row };
}

/* One sheet with revenue and costs on each row, as the template has it.
   `table` is { fieldNames, rows, leftovers }. */
export function monthsFromCombinedSheet(table) {
  // A sideways sheet's period column often has a blank header, and holds
  // either an Excel date or a label like "Sept 2026".
  let periodColumn = table.fieldNames.find(function (fieldName) {
    return fieldName === "" || fieldName === "month";
  });
  if (periodColumn === undefined) {
    periodColumn = "";
  }

  const monthRows = table.rows.filter(function (row) {
    return !isTotalRow(row[periodColumn]);
  });
  const entries = monthRows.map(function (row, rowIndex) {
    return entryForRow(row, rowIndex, periodColumn);
  });
  return monthsFromEntries(entries, table.leftovers || {});
}

/* The older two-file layout: revenue and budget in one file, costs in the
   other, joined on "month num" onto a single row so the arithmetic sees the
   same shape either way. Months without a costs row are skipped and named. */
export function monthsFromTwoFiles(revenueTable, expensesTable) {
  const costsByMonthNumber = new Map();
  for (const row of expensesTable.rows) {
    costsByMonthNumber.set(parseAmount(row["month num"]), row);
  }

  const entries = [];
  const skipped = [];
  for (const revenueRow of revenueTable.rows) {
    const monthNumber = parseAmount(revenueRow["month num"]);
    const monthName = revenueRow.month || ("month " + monthNumber);
    const costsRow = costsByMonthNumber.get(monthNumber);
    if (!costsRow) {
      skipped.push(monthName);
      continue;
    }
    entries.push({
      month: monthName,
      monthNum: monthNumber,
      year: parseAmount(revenueRow.year) || yearInText(revenueRow.month) || null,
      row: Object.assign({}, costsRow, { revenue: revenueRow.revenue, budget: revenueRow.budget })
    });
  }

  return { months: monthsFromEntries(entries, expensesTable.leftovers), skipped: skipped };
}
