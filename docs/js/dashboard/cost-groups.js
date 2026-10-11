/* The fourteen cost lines and the four groups they belong to, exactly as
   CFODashboard.java defines them. Every total on the page is built from
   these lists, so a cost can never count toward a total without also
   appearing on a line somewhere. */

import { parseAmount } from "./numbers.js";

export const COST_GROUPS = {
  direct: ["cogs", "labor", "employee meals", "tax"],
  operating: ["packaging", "credit card fees", "marketing", "hardware"],
  variable: ["utilities", "maintenance"],
  fixed: ["rent", "insurance", "business license", "telephone"]
};

export const COST_GROUP_NAMES = ["direct", "operating", "variable", "fixed"];

/* Every cost line, in the order the groups list them. */
export const ALL_COST_LINES = [
  ...COST_GROUPS.direct,
  ...COST_GROUPS.operating,
  ...COST_GROUPS.variable,
  ...COST_GROUPS.fixed
];

/* How each group is shown, and where its figures live on a month:
     slot      the colour the group gets in the charts (1 to 4)
     label     its name on the page
     group     its key in COST_GROUPS, also its key in the glossary
     totalKey  the month field holding the group's total
     otherKey  the month field holding costs from columns that matched no
               line but still belong to this group */
export const COST_GROUP_ROWS = [
  {
    slot: 1,
    label: "Direct costs",
    group: "direct",
    totalKey: "directExpenses",
    otherKey: "otherDirect"
  },
  {
    slot: 2,
    label: "Operating costs",
    group: "operating",
    totalKey: "operatingExpenses",
    otherKey: "otherOperating"
  },
  {
    slot: 3,
    label: "Variable overhead",
    group: "variable",
    totalKey: "variableOverhead",
    otherKey: "otherVariable"
  },
  {
    slot: 4,
    label: "Fixed overhead",
    group: "fixed",
    totalKey: "fixedOverhead",
    otherKey: "otherFixed"
  }
];

/* The name every cost line is shown under. Without an entry here a line
   would reach the report as its raw column header. */
export const LINE_LABELS = {
  "cogs": "Cost of goods sold",
  "labor": "Labor",
  "employee meals": "Employee meals",
  "tax": "Payroll tax",
  "packaging": "Packaging",
  "credit card fees": "Credit card fees",
  "marketing": "Marketing",
  "hardware": "Hardware",
  "utilities": "Utilities",
  "maintenance": "Maintenance",
  "rent": "Rent",
  "insurance": "Insurance",
  "business license": "Business license",
  "telephone": "Telephone"
};

/* One cost line's amount for a month.
   A month read from a file or a photo carries all fourteen lines under
   .lines; data.json from the Java app carries five of them as top-level
   fields. This reads whichever shape the month is. */
export function lineValue(month, lineKey) {
  if (month.lines) {
    return parseAmount(month.lines[lineKey]);
  }
  return parseAmount(month[lineKey]);
}

/* The total of several cost lines on one spreadsheet row. */
export function sumOfColumns(row, lineKeys) {
  let total = 0;
  for (const lineKey of lineKeys) {
    total += parseAmount(row[lineKey]);
  }
  return total;
}

/* The total of one group's named lines for a month. */
export function sumOfGroupLines(month, groupName) {
  let total = 0;
  for (const lineKey of COST_GROUPS[groupName]) {
    total += lineValue(month, lineKey);
  }
  return total;
}
