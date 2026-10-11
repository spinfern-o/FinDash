/* "Export to Excel": the full report, every line and every month side by
   side, with a Total column when there is more than one month.

   The first sheet keeps the page's own row names, so dropping the export
   back on the page reads it like any other file: the subtotal and ratio
   rows are recognised as worked out from the others and set aside. */

import { state, isShowingOwnerFigures } from "../state.js";
import { unescapeHtml, formatLocalDate } from "../format.js";
import { monthLabel, describeMonths } from "../months.js";
import { COST_GROUPS, COST_GROUP_ROWS, LINE_LABELS, lineValue } from "../cost-groups.js";
import { roundToCents } from "../numbers.js";
import { describeOwnerSource } from "../owner-figures.js";
import { xlsxWorkbook, CELL_STYLES } from "./xlsx-writer.js";
import { downloadFile, fileNamePart } from "./downloads.js";

/* One row: its label, then the value for each month, then (with more than
   one month) the total of those values. */
function amountRow(months, label, valueForMonth, valueStyle, labelStyle) {
  const values = months.map(valueForMonth);
  const cells = [{ v: label, s: labelStyle }];
  for (const value of values) {
    cells.push({ v: value, s: valueStyle });
  }
  if (months.length > 1) {
    let total = 0;
    for (const value of values) {
      total += value;
    }
    cells.push({ v: total, s: valueStyle });
  }
  return cells;
}

/* A ratio row. Its Total is worked out from the totals, never by adding or
   averaging the months' ratios. ratioFor takes a list of months. */
function ratioRow(months, label, ratioFor) {
  const cells = [{ v: label }];
  for (const month of months) {
    cells.push({ v: ratioFor([month]), s: CELL_STYLES.percent });
  }
  if (months.length > 1) {
    cells.push({ v: ratioFor(months), s: CELL_STYLES.percent });
  }
  return cells;
}

function budgetUsed(months) {
  const budgeted = months.filter(function (month) {
    return month.budget;
  });
  let limit = 0;
  let spent = 0;
  for (const month of budgeted) {
    limit += month.budget;
  }
  for (const month of budgeted) {
    spent += month.totalExpenses;
  }
  if (!limit) {
    return "";
  }
  return spent / limit;
}

function netMargin(months) {
  let revenue = 0;
  let netProfit = 0;
  for (const month of months) {
    revenue += month.revenue;
  }
  for (const month of months) {
    netProfit += month.netProfit;
  }
  if (!revenue) {
    return "";
  }
  return netProfit / revenue;
}

/* Whatever a group's total holds beyond its named lines. */
function unlistedAmount(month, group) {
  let listed = 0;
  for (const lineKey of COST_GROUPS[group.group]) {
    listed += lineValue(month, lineKey);
  }
  return roundToCents(month[group.totalKey] - listed);
}

function headerRow(months) {
  const cells = [{ v: "", s: CELL_STYLES.bold }];
  for (const month of months) {
    cells.push({ v: unescapeHtml(monthLabel(month)), s: CELL_STYLES.bold });
  }
  if (months.length > 1) {
    cells.push({ v: "Total", s: CELL_STYLES.bold });
  }
  return cells;
}

function reportRows(months) {
  const rows = [
    headerRow(months),
    amountRow(months, "Revenue", function (month) {
      return month.revenue;
    }, CELL_STYLES.boldNumber, CELL_STYLES.bold)
  ];

  for (const group of COST_GROUP_ROWS) {
    const lineKeys = COST_GROUPS[group.group];

    rows.push(amountRow(months, group.label, function (month) {
      return month[group.totalKey];
    }, CELL_STYLES.boldNumber, CELL_STYLES.bold));

    for (const lineKey of lineKeys) {
      rows.push(amountRow(months, LINE_LABELS[lineKey], function (month) {
        return lineValue(month, lineKey);
      }, CELL_STYLES.number, CELL_STYLES.indent));
    }

    function unlistedInThisGroup(month) {
      return unlistedAmount(month, group);
    }
    if (months.some(unlistedInThisGroup)) {
      rows.push(amountRow(months, "Other " + group.label.toLowerCase(), unlistedInThisGroup,
        CELL_STYLES.number, CELL_STYLES.indent));
    }
  }

  rows.push(amountRow(months, "Total costs", function (month) {
    return month.totalExpenses;
  }, CELL_STYLES.boldNumber, CELL_STYLES.bold));
  rows.push(amountRow(months, "Net profit", function (month) {
    return month.netProfit;
  }, CELL_STYLES.boldNumber, CELL_STYLES.bold));
  rows.push(amountRow(months, "Budget", function (month) {
    return month.budget;
  }, CELL_STYLES.number, CELL_STYLES.plain));
  rows.push(ratioRow(months, "Budget used", budgetUsed));
  rows.push(ratioRow(months, "Net margin", netMargin));
  return rows;
}

function aboutSheet(months) {
  let source = "FinDash demo data";
  if (isShowingOwnerFigures()) {
    source = describeOwnerSource();
  }
  return {
    name: "About",
    widths: [16, 70],
    rows: [
      [{ v: "FinDash monthly report", s: CELL_STYLES.bold }],
      ["Months", unescapeHtml(describeMonths(months))],
      ["Amounts in", state.currency],
      ["Exported", formatLocalDate(new Date())],
      ["Source", source],
      ["Notes", "Each cost group's lines add up to its total. In the Total column, Budget used and " +
        "Net margin are worked out from the totals."]
    ]
  };
}

export function exportWorkbook() {
  const months = state.data.months;

  const widths = [26];
  for (let index = 0; index < months.length; index++) {
    widths.push(15);
  }
  if (months.length > 1) {
    widths.push(15);
  }

  const reportSheet = { name: "Report", rows: reportRows(months), freeze: [1, 1], widths: widths };
  const fileName = `findash-report-${fileNamePart(describeMonths(months))}.xlsx`;
  downloadFile(xlsxWorkbook([reportSheet, aboutSheet(months)]), fileName);
}
