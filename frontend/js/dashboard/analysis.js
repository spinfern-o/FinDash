/* Monthly figures in, a profit and loss summary out: for everything that
   isn't the page itself. The public API and the MCP server (api/agent.js)
   use it, and so do the tools the dashboard offers browser agents
   (agent-tools.js).

   The arithmetic is the dashboard's own: months are built by
   monthsFromCombinedSheet and added up by totalsForMonths, exactly as for a
   spreadsheet dropped on the page, so an agent gets the numbers the page
   would show. Nothing here reads or changes the page. */

import { monthsFromCombinedSheet } from "./import/months-from-sheet.js";
import { totalsForMonths } from "./periods.js";
import { MONTH_NAMES, describeMonths } from "./months.js";
import { LINE_LABELS } from "./cost-groups.js";
import { roundToCents } from "./numbers.js";
import { capitalize } from "./format.js";
import { GLOSSARY } from "../glossary.js";

/* The fourteen cost lines under the names the API uses, with the line each
   one fills and the group it counts toward. */
export const COST_FIELDS = [
  { key: "costOfGoodsSold", line: "cogs", group: "directCosts" },
  { key: "labor", line: "labor", group: "directCosts" },
  { key: "employeeMeals", line: "employee meals", group: "directCosts" },
  { key: "payrollTax", line: "tax", group: "directCosts" },
  { key: "packaging", line: "packaging", group: "operatingCosts" },
  { key: "creditCardFees", line: "credit card fees", group: "operatingCosts" },
  { key: "marketing", line: "marketing", group: "operatingCosts" },
  { key: "hardware", line: "hardware", group: "operatingCosts" },
  { key: "utilities", line: "utilities", group: "variableOverhead" },
  { key: "maintenance", line: "maintenance", group: "variableOverhead" },
  { key: "rent", line: "rent", group: "fixedOverhead" },
  { key: "insurance", line: "insurance", group: "fixedOverhead" },
  { key: "businessLicense", line: "business license", group: "fixedOverhead" },
  { key: "telephone", line: "telephone", group: "fixedOverhead" }
];

/* What each cost group is called, and where its total lives on a month. */
export const COST_GROUP_FIELDS = [
  { key: "directCosts", totalKey: "directExpenses", glossary: "direct" },
  { key: "operatingCosts", totalKey: "operatingExpenses", glossary: "operating" },
  { key: "variableOverhead", totalKey: "variableOverhead", glossary: "variable" },
  { key: "fixedOverhead", totalKey: "fixedOverhead", glossary: "fixed" }
];

export const MAXIMUM_MONTHS = 120;
const LARGEST_AMOUNT = 1e12;
const MONTH_FIELDS = ["month", "year", "revenue", "budget", "costs"];

/* "July", "jul", "7" or 7 -> 7. Anything else -> null. */
function monthNumberOf(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim().toLowerCase();
  if (/^\d{1,2}$/.test(text)) {
    return monthNumberOf(Number(text));
  }
  if (text.length < 3) {
    return null;
  }
  const index = MONTH_NAMES.findIndex(function (name) {
    return name.startsWith(text);
  });
  if (index < 0) {
    return null;
  }
  return index + 1;
}

/* An amount from the input, to the cent, or null when it isn't one. */
function amountOf(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) >= LARGEST_AMOUNT) {
    return null;
  }
  return roundToCents(value);
}

/* Checks the months an agent sent. Returns { months, problems }: the months
   in the dashboard's own shape, or a list of what is wrong, each problem
   { field, message } naming exactly which value to fix. */
export function readMonthRecords(records) {
  const problems = [];
  if (!Array.isArray(records) || records.length === 0) {
    problems.push({ field: "months", message: "Send a list of 1 to " + MAXIMUM_MONTHS + " months." });
    return { months: null, problems: problems };
  }
  if (records.length > MAXIMUM_MONTHS) {
    problems.push({ field: "months", message: "Send at most " + MAXIMUM_MONTHS + " months at a time." });
    return { months: null, problems: problems };
  }

  const costKeys = COST_FIELDS.map(function (field) {
    return field.key;
  });
  const rows = [];
  const seen = new Set();

  records.forEach(function (record, index) {
    const at = "months[" + index + "]";
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      problems.push({ field: at, message: "Each month is an object with month, year, revenue and costs." });
      return;
    }
    for (const key of Object.keys(record)) {
      if (!MONTH_FIELDS.includes(key)) {
        problems.push({ field: at + "." + key, message: "Unknown field. A month has: " + MONTH_FIELDS.join(", ") + "." });
      }
    }

    const monthNumber = monthNumberOf(record.month);
    if (!monthNumber) {
      problems.push({ field: at + ".month", message: "The month's name (\"July\") or number (7)." });
    }
    const year = record.year;
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      problems.push({ field: at + ".year", message: "The year as a whole number, such as 2026." });
    }
    if (monthNumber && Number.isInteger(year)) {
      const key = year + "-" + monthNumber;
      if (seen.has(key)) {
        problems.push({ field: at, message: "This month appears twice. Send each month once." });
      }
      seen.add(key);
    }

    const revenue = amountOf(record.revenue);
    if (revenue === null) {
      problems.push({ field: at + ".revenue", message: "Revenue is required: a number, such as 72000." });
    }
    let budget = 0;
    if (record.budget !== undefined && record.budget !== null) {
      budget = amountOf(record.budget);
      if (budget === null || budget < 0) {
        problems.push({ field: at + ".budget", message: "The most planned to be spent that month, a number of 0 or more. Leave it out if there is none." });
      }
    }

    const row = { month: monthNumber ? capitalize(MONTH_NAMES[monthNumber - 1]) : "", year: year,
      revenue: String(revenue), budget: String(budget) };
    const costs = record.costs === undefined ? {} : record.costs;
    if (!costs || typeof costs !== "object" || Array.isArray(costs)) {
      problems.push({ field: at + ".costs", message: "An object of cost lines, such as {\"rent\": 6000}." });
    } else {
      for (const key of Object.keys(costs)) {
        if (!costKeys.includes(key)) {
          problems.push({ field: at + ".costs." + key, message: "Unknown cost line. Use one of: " + costKeys.join(", ") + ". Put a cost with no line of its own in the closest one." });
        }
      }
      for (const field of COST_FIELDS) {
        const value = costs[field.key];
        if (value === undefined || value === null) {
          row[field.line] = "0";
          continue;
        }
        const amount = amountOf(value);
        if (amount === null) {
          problems.push({ field: at + ".costs." + field.key, message: "A number, such as 2500." });
        } else {
          row[field.line] = String(amount);
        }
      }
    }
    rows.push(row);
  });

  if (problems.length) {
    return { months: null, problems: problems };
  }
  const fieldNames = ["month", "year", "revenue", "budget"].concat(COST_FIELDS.map(function (field) {
    return field.line;
  }));
  const months = monthsFromCombinedSheet({ fieldNames: fieldNames, rows: rows, leftovers: {} });
  return { months: months, problems: [] };
}

function percent(part, whole) {
  if (!whole) {
    return null;
  }
  return Math.round((part / whole) * 10000) / 100;
}

/* "July 2026" for a month built by readMonthRecords or read from a file. */
function labelOf(month) {
  return capitalize(MONTH_NAMES[month.monthNum - 1]) + " " + month.year;
}

function groupTotals(source) {
  const groups = {};
  for (const group of COST_GROUP_FIELDS) {
    groups[group.key] = roundToCents(source[group.totalKey]);
  }
  return groups;
}

/* One month, as the API and the agent tools report it. */
export function describeMonth(month) {
  const costs = {};
  for (const field of COST_FIELDS) {
    costs[field.key] = roundToCents(month.lines ? month.lines[field.line] || 0 : month[field.line] || 0);
  }
  const overBudgetBy = month.budget ? roundToCents(Math.max(0, month.totalExpenses - month.budget)) : null;
  return {
    label: labelOf(month),
    month: month.monthNum,
    year: month.year,
    revenue: roundToCents(month.revenue),
    budget: month.budget ? roundToCents(month.budget) : null,
    costs: costs,
    costGroups: groupTotals(month),
    totalCosts: roundToCents(month.totalExpenses),
    grossProfit: roundToCents(month.grossProfit),
    netProfit: roundToCents(month.netProfit),
    netMarginPercent: percent(month.netProfit, month.revenue),
    budgetUsedPercent: percent(month.totalExpenses, month.budget),
    overBudgetBy: overBudgetBy
  };
}

/* What needs a look: months at a loss and months over budget, the two
   signals the dashboard puts first. */
function needsAttention(months) {
  const found = [];
  for (const month of months) {
    if (month.netProfit < 0) {
      found.push({ kind: "loss", month: labelOf(month),
        message: labelOf(month) + " made a loss of " + roundToCents(-month.netProfit) + ": costs ran past revenue." });
    }
    if (month.budget && month.totalExpenses > month.budget) {
      found.push({ kind: "over-budget", month: labelOf(month),
        message: labelOf(month) + " went " + roundToCents(month.totalExpenses - month.budget) +
          " over its budget (" + percent(month.totalExpenses, month.budget) + "% used)." });
    }
  }
  return found;
}

/* Every month, the total across them, and what needs attention. */
export function summariseMonths(months, currency) {
  const totals = totalsForMonths(months);
  return {
    currency: currency || null,
    months: months.map(describeMonth),
    total: {
      label: describeMonths(months),
      months: months.length,
      revenue: roundToCents(totals.revenue),
      costGroups: groupTotals(totals),
      totalCosts: roundToCents(totals.totalExpenses),
      grossProfit: roundToCents(totals.revenue - totals.directExpenses),
      netProfit: roundToCents(totals.netProfit),
      netMarginPercent: percent(totals.netProfit, totals.revenue),
      budget: totals.budget ? roundToCents(totals.budget) : null,
      budgetUsedPercent: totals.budget ? Math.round(totals.budgetPercent * 100) / 100 : null
    },
    needsAttention: needsAttention(months)
  };
}

/* The template's columns, for an agent preparing a spreadsheet for the
   dashboard: the header to write, and what goes in it. */
export function templateColumns() {
  const columns = [
    { header: "Month", field: "month", description: "The month's name, such as July." },
    { header: "Year", field: "year", description: "The year, such as 2026." },
    { header: "Revenue", field: "revenue", description: GLOSSARY.revenue.text },
    { header: "Budget", field: "budget", description: GLOSSARY.budget.text }
  ];
  for (const field of COST_FIELDS) {
    columns.push({ header: LINE_LABELS[field.line], field: "costs." + field.key,
      description: "Counts toward " + GLOSSARY[COST_GROUP_FIELDS.find(function (group) {
        return group.key === field.group;
      }).glossary].term.toLowerCase() + "." });
  }
  return columns;
}

/* Every glossary entry as { key, term, text }. */
export function glossaryEntries() {
  return Object.keys(GLOSSARY).map(function (key) {
    return { key: key, term: GLOSSARY[key].term, text: GLOSSARY[key].text };
  });
}
