/* Recognising column names.

   Headers arrive spelled however the author felt like spelling them. The
   steps here fold the common variations onto FinDash's own field names, so
   everything after can stay simple. All of it runs on the page; nothing is
   sent anywhere. */

/* Lower case, with punctuation and spacing collapsed:
   "Credit_Card-Fees " -> "credit card fees". */
export function normaliseHeader(header) {
  let text = "";
  if (header !== null && header !== undefined) {
    text = String(header);
  }
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/* The fields of the older two-file layout: revenue and budget in one file... */
export const DASHBOARD_FIELDS = ["month", "month num", "revenue", "budget"];

/* ...and the costs in the other. Each file is checked only against its own
   fields: checking against both would mark the other file's fields missing
   on every upload, which both wastes a request and invites a wrong answer,
   since asking where "revenue" lives in an expenses sheet has no right one. */
export const EXPENSE_FIELDS = [
  "month num", "cogs", "packaging", "rent", "utilities", "maintenance",
  "hardware", "insurance", "marketing", "credit card fees",
  "business license", "telephone", "employee meals", "tax", "labor"
];

/* Recognised but not required. A Year column is read when there is one;
   requiring it would mark it missing on every file without one and send a
   column-matching request with nothing to resolve. */
const OPTIONAL_FIELDS = ["year"];

/* Every field name FinDash knows, each once. */
export const KNOWN_FIELDS = [...new Set([...DASHBOARD_FIELDS, ...EXPENSE_FIELDS, ...OPTIONAL_FIELDS])];

/* One sheet holding everything, as the template does. No month number: the
   month's name is enough, and the join it existed for has no second file. */
export const COMBINED_FIELDS = [
  "month",
  "revenue",
  "budget",
  ...EXPENSE_FIELDS.filter(function (field) {
    return field !== "month num";
  })
];

/* Other words for the same thing. The keys are already normalised. */
const SYNONYMS = {
  "cost of goods": "cogs",
  "cost of goods sold": "cogs",
  "food cost": "cogs",
  "salaries": "labor",
  "salaries wages": "labor",
  "wages": "labor",
  "payroll": "labor",
  "staff costs": "labor",
  "labour": "labor",
  // Must be listed: without it the prefix step reads "payroll tax" as
  // "payroll", and payroll tax lands in labor.
  "payroll tax": "tax",
  "premises": "rent",
  "rent expense": "rent",
  "occupancy": "rent",
  "computer and hardware": "hardware",
  "computer hardware": "hardware",
  "equipment": "hardware",
  "telephone internet": "telephone",
  "phone": "telephone",
  "business license and permits": "business license",
  "licenses and permits": "business license",
  "permits": "business license",
  "insurance expenses": "insurance",
  "insurance expense": "insurance",
  "marketing expense": "marketing",
  "advertising": "marketing",
  "packaging supplies": "packaging",
  "maintenance and repairs": "maintenance",
  "repairs": "maintenance",
  "taxes": "tax",
  "payroll taxes": "tax",
  "income": "revenue",
  "sales": "revenue",
  "total revenue": "revenue",
  "month number": "month num",
  "month no": "month num",
  "period": "month num"
};

/* Rows a report works out from the others: subtotals, totals, ratios. Our
   own Excel export has them, and so does any accounting package's Profit
   and Loss. Counting one alongside its parts would count the money twice,
   so they are recognised and set aside rather than matched, added to a
   group, or sent anywhere. Checked before the prefix step, which would
   otherwise read "Budget used" as "budget". */
const WORKED_OUT_ROWS = new Set([
  "direct costs", "direct expenses", "operating costs", "operating expenses",
  "variable overhead", "fixed overhead", "total costs", "total expenses",
  "total cost of goods sold", "total income",
  "gross profit", "gross margin", "net profit", "net income", "net margin",
  "net operating income", "budget used", "of revenue"
]);

/* Put in front of a header that is set aside, so it can never match a field. */
const SET_ASIDE_MARK = "=";

export function isSetAside(header) {
  return header.startsWith(SET_ASIDE_MARK);
}

export function isKnownField(header) {
  return KNOWN_FIELDS.includes(header);
}

/* A header -> FinDash's field name for it, in this order:
     1. normalise the spelling
     2. a worked-out row (a subtotal or ratio) is set aside
     3. an exact synonym
     4. an exact field name
     5. the longest synonym or field name the header starts with, followed
        by a space. This is what rescues labels with a note in brackets:
        "Utilities (gas, electricity, water)" -> "utilities". The space
        means "monthly revenue" can never collapse to "month".
   A header that matches nothing comes back normalised. */
export function fieldNameFor(header) {
  const normalised = normaliseHeader(header);

  if (WORKED_OUT_ROWS.has(normalised)) {
    return SET_ASIDE_MARK + normalised;
  }
  if (SYNONYMS[normalised]) {
    return SYNONYMS[normalised];
  }
  if (KNOWN_FIELDS.includes(normalised)) {
    return normalised;
  }

  let longestPrefix = null;
  for (const name of Object.keys(SYNONYMS).concat(KNOWN_FIELDS)) {
    const isPrefix = normalised.startsWith(name + " ");
    if (isPrefix && (!longestPrefix || name.length > longestPrefix.length)) {
      longestPrefix = name;
    }
  }
  if (longestPrefix) {
    return SYNONYMS[longestPrefix] || longestPrefix;
  }
  return normalised;
}

/* The field name of every column, from the first row of the grid. */
export function fieldNamesOfColumns(grid) {
  if (!grid.length) {
    return [];
  }
  return grid[0].map(fieldNameFor);
}

/* The rows under the header row, each as { fieldName: "cell text" }.
   The field names are passed in rather than worked out here, which is what
   lets a caller correct them before they are baked into every row. */
export function rowsAsRecords(grid, fieldNames) {
  return grid.slice(1).map(function (cells) {
    const record = {};
    fieldNames.forEach(function (fieldName, columnIndex) {
      let cell = cells[columnIndex];
      if (cell === undefined) {
        cell = "";
      }
      record[fieldName] = String(cell).trim();
    });
    return record;
  });
}

/* Which file of the older two-file layout this is, by its columns rather
   than its file name: "dashboard" (revenue), "expenses" (costs) or null. */
export function kindOfFile(fieldNames) {
  if (fieldNames.includes("revenue")) {
    return "dashboard";
  }
  if (fieldNames.includes("cogs")) {
    return "expenses";
  }
  return null;
}

/* One sheet with revenue AND costs: no second file to join it with. */
export function isCombinedFile(fieldNames) {
  return fieldNames.includes("revenue") && fieldNames.includes("cogs");
}
