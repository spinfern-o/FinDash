/* Asking the column-matching service about headers the page could not place.

   Everything in column-names.js runs on the page and is free. This is the
   one step of reading a spreadsheet that leaves the computer, and only the
   header TEXT goes, never a row of figures. It only runs when the page's own
   pass left something unsettled. */

import { COST_GROUP_NAMES } from "../cost-groups.js";
import {
  COMBINED_FIELDS,
  DASHBOARD_FIELDS,
  EXPENSE_FIELDS,
  KNOWN_FIELDS,
  isCombinedFile,
  isKnownField,
  isSetAside,
  kindOfFile
} from "./column-names.js";

/* The fields this kind of file should have. Decided from what already
   matched on the page; when even that is unclear, every field, and the
   service sorts it out. */
function expectedFields(fieldNames) {
  if (isCombinedFile(fieldNames)) {
    return COMBINED_FIELDS;
  }
  const kind = kindOfFile(fieldNames);
  if (kind === "dashboard") {
    return DASHBOARD_FIELDS;
  }
  if (kind === "expenses") {
    return EXPENSE_FIELDS;
  }
  return KNOWN_FIELDS;
}

/* What the page's own pass could not settle:
     unplacedFields   fields the file should have but no column matched
     unclaimedColumns columns that matched no field
   One definition, so the progress message and the request itself can never
   disagree about whether a request will be made. */
function openQuestions(fieldNames) {
  const expected = expectedFields(fieldNames);
  const placed = new Set(fieldNames.filter(function (fieldName) {
    return expected.includes(fieldName);
  }));

  // A one-file sheet names its months by a Month column, a month number, or
  // the blank-headed period column of a sideways sheet: any one will do.
  // Treated as the two-file revenue sheet, it marked "month num" missing and
  // sent every template upload to the matching service for nothing.
  if (isCombinedFile(fieldNames) && (fieldNames.includes("month num") || fieldNames.includes(""))) {
    placed.add("month");
  }

  const unplacedFields = expected.filter(function (field) {
    return !placed.has(field);
  });

  // A blank header has no name to ask about (it is usually the period column
  // of a sideways sheet), and a worked-out row is set aside on purpose.
  const unclaimedColumns = fieldNames.filter(function (fieldName) {
    return fieldName !== "" && !isSetAside(fieldName) && !isKnownField(fieldName);
  });

  return { unplacedFields: unplacedFields, unclaimedColumns: unclaimedColumns };
}

/* The columns the page could not match to any field, by their (normalised)
   names. Their money only reaches a total once the column-matching service
   has said which cost group each belongs to. */
export function unrecognisedColumns(fieldNames) {
  return openQuestions(fieldNames).unclaimedColumns;
}

/* True when resolveColumnNames will actually make a request. */
export function needsColumnMatching(fieldNames) {
  const questions = openQuestions(fieldNames);
  return questions.unplacedFields.length > 0 || questions.unclaimedColumns.length > 0;
}

/* A column the service may rename: one that matched nothing on the page. */
function isOpenColumn(fieldName) {
  return !isKnownField(fieldName) && !isSetAside(fieldName);
}

/* Fills in what is still unknown. Returns the corrected field names, plus
   { columnName: costGroup } for columns that match no field but are real
   costs ("leftovers"), so their money still counts in the right group. */
export async function resolveColumnNames(fieldNames) {
  const questions = openQuestions(fieldNames);

  // Every field placed and every column spoken for: nothing to ask.
  if (!questions.unplacedFields.length && !questions.unclaimedColumns.length) {
    return { fieldNames: fieldNames, leftovers: {} };
  }

  const response = await fetch("/api/map-columns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Say which columns are still free. Without that the model happily puts
    // columns already matched into a group, and their money would count twice.
    credentials: "same-origin",
    body: JSON.stringify({
      headers: fieldNames,
      fields: questions.unplacedFields,
      unclaimed: questions.unclaimedColumns
    })
  });
  if (!response.ok) {
    throw new Error("mapping service returned " + response.status);
  }

  const answer = await response.json();
  const mapping = answer.mapping || {};
  const other = answer.other || {};
  const corrected = fieldNames.slice();

  // The service answers with header text; the list is indexed by position.
  for (const [field, header] of Object.entries(mapping)) {
    const index = corrected.indexOf(header);
    if (index >= 0 && isOpenColumn(corrected[index])) {
      corrected[index] = field;
    }
  }

  const leftovers = {};
  for (const [header, group] of Object.entries(other)) {
    const index = corrected.indexOf(header);
    if (index >= 0 && isOpenColumn(corrected[index]) && COST_GROUP_NAMES.includes(group)) {
      leftovers[corrected[index]] = group;
    }
  }
  return { fieldNames: corrected, leftovers: leftovers };
}
