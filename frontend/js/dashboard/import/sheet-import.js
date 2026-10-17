/* Adding the owner's spreadsheet: reading it, matching its columns, working
   out the months, and showing them.

   Files are read here, in the page, and never uploaded. Only when some
   column names cannot be matched on the page are those names (never the
   figures) sent to the column-matching service. */

import { state } from "../state.js";
import { showBusy, showStatus } from "../status-line.js";
import { keepOwnerFigures } from "../keep-figures.js";
import { loggedInUser } from "../account.js";
import { showOwnerFigures } from "../figures-on-screen.js";
import { readCsvGrid } from "./csv-reader.js";
import { readXlsxGrid } from "./xlsx-reader.js";
import { withHeadersOnTop } from "./sheet-orientation.js";
import { fieldNamesOfColumns, rowsAsRecords, kindOfFile, isCombinedFile } from "./column-names.js";
import { needsColumnMatching, resolveColumnNames, unrecognisedColumns } from "./column-mapping.js";
import { monthsFromCombinedSheet, monthsFromTwoFiles } from "./months-from-sheet.js";
import { collectCurrencySymbols, adoptCurrency } from "./currency-from-file.js";

export function isSpreadsheetFile(file) {
  return /\.(csv|xlsx)$/i.test(file.name);
}

function isXlsxFile(file) {
  return /\.xlsx$/i.test(file.name);
}

/* What to tell the owner when none of their files could be read at all. */
function whyNotRead(files) {
  const names = files.map(function (file) {
    return file.name;
  }).join(", ");

  const hasOldExcel = files.some(function (file) {
    return /\.xls$/i.test(file.name);
  });
  const hasPdf = files.some(function (file) {
    return /\.pdf$/i.test(file.name);
  });

  if (hasOldExcel) {
    return names + ": .xls is the older Excel format. Open it in Excel and save it as .xlsx or CSV.";
  }
  if (hasPdf) {
    return names + ": PDFs can't be read yet. Take a screenshot of the invoice and add that instead.";
  }
  return names + ": FinDash reads Excel (.xlsx), CSV and photos of invoices. The template shows the " +
    "spreadsheet layout.";
}

/* Lets the browser draw the "Reading" message before a large file keeps it
   busy; without this the spinner never appears in the slow case. */
function letThePagePaint() {
  return new Promise(function (resolve) {
    setTimeout(resolve, 0);
  });
}

/* Reads one file into { fieldNames, rows, leftovers, unrecognised }. Throws
   when the file cannot be opened at all. `progressNote` is " (1 of 2)" or "".
   Currency symbols seen in the file are added to `foundSymbols`.

   canAskClaude says whether column names the page cannot match may be sent
   to the column-matching service, which is only for someone logged in.
   Without it, those columns are listed in `unrecognised` instead. */
async function readSpreadsheet(file, progressNote, foundSymbols, canAskClaude) {
  showBusy("Reading", file.name + progressNote);
  await letThePagePaint();

  let grid;
  if (isXlsxFile(file)) {
    grid = await readXlsxGrid(await file.arrayBuffer());
  } else {
    grid = readCsvGrid(await file.text());
  }
  grid = withHeadersOnTop(grid);
  collectCurrencySymbols(grid, foundSymbols);

  // Column names first, so anything unmatched can be corrected BEFORE the
  // rows are built from them: once built, the names are baked in.
  let fieldNames = fieldNamesOfColumns(grid);
  let leftovers = {};
  if (!canAskClaude) {
    return {
      fieldNames: fieldNames,
      rows: rowsAsRecords(grid, fieldNames),
      leftovers: leftovers,
      unrecognised: unrecognisedColumns(fieldNames)
    };
  }
  try {
    // Only this step can wait on the network, so only it gets its own message.
    if (needsColumnMatching(fieldNames)) {
      showBusy("Matching columns", "checking the column names in " + file.name + progressNote);
    }
    const resolved = await resolveColumnNames(fieldNames);
    fieldNames = resolved.fieldNames;
    leftovers = resolved.leftovers;
  } catch (matchingError) {
    // The page's own matching still stands; only the unmatched columns are lost.
    console.warn("column mapping unavailable:", matchingError.message);
  }

  return { fieldNames: fieldNames, rows: rowsAsRecords(grid, fieldNames), leftovers: leftovers, unrecognised: [] };
}

function plural(count, word) {
  if (count > 1) {
    return word + "s";
  }
  return word;
}

/* The months from the files held so far, or null after telling the owner
   which file is still missing. */
function monthsFromHeldFiles() {
  const held = state.heldFiles;

  // One sheet with revenue and costs together needs no partner file.
  if (held.combined) {
    return {
      months: monthsFromCombinedSheet(held.combined),
      skipped: [],
      from: held.combined.fileName
    };
  }

  if (!held.dashboard) {
    showStatus("Need one more file", "Got the expenses file. Also add the one with month, revenue and " +
      "budget, or use the template, which holds everything in one file.", true);
    return null;
  }
  if (!held.expenses) {
    showStatus("Need one more file", "Got the revenue file. Also add the one with the cost columns, or " +
      "use the template, which holds everything in one file.", true);
    return null;
  }

  const result = monthsFromTwoFiles(held.dashboard, held.expenses);
  return {
    months: result.months,
    skipped: result.skipped,
    from: held.dashboard.fileName + " + " + held.expenses.fileName
  };
}

/* Said when some columns could not be matched and nobody is logged in to
   have them matched by the column-matching service. */
function unrecognisedNote(columnNames) {
  if (!columnNames.length) {
    return "";
  }
  return " Not counted, because the column names weren't recognised: " + columnNames.join(", ") + ". " +
    "Log in to have unusual column names matched automatically, or rename them to the template's names.";
}

/* The sentence shown once the months are on screen. */
function addedMessage(months, skipped, from, savedSentence, currencyNote) {
  let skippedNote = "";
  if (skipped.length) {
    skippedNote = ". Skipped " + skipped.join(", ") + " (no costs row)";
  }

  let invoicesNote = "";
  const invoiceCount = state.ownerInvoices.length;
  if (invoiceCount === 1) {
    invoicesNote = " Your 1 invoice from photos is still added on top; remove any this file already counts.";
  } else if (invoiceCount > 1) {
    invoicesNote = ` Your ${invoiceCount} invoices from photos are still added on top; ` +
      "remove any this file already counts.";
  }

  return months.length + " " + plural(months.length, "month") + " from " + from + skippedNote + ". " +
    savedSentence + currencyNote + invoicesNote;
}

export async function handleSpreadsheets(files) {
  const unusable = files.filter(function (file) {
    return !isSpreadsheetFile(file);
  });
  const usable = files.filter(isSpreadsheetFile);

  if (!usable.length) {
    showStatus("Not read", whyNotRead(unusable), true);
    return;
  }

  const unrecognised = [];
  const unreadable = [];
  const unmatchedColumns = [];
  const canAskClaude = Boolean(await loggedInUser());
  const foundSymbols = new Set();
  const kindsRead = new Set();

  for (let index = 0; index < usable.length; index++) {
    const file = usable[index];
    let progressNote = "";
    if (usable.length > 1) {
      progressNote = ` (${index + 1} of ${usable.length})`;
    }

    let table;
    try {
      table = await readSpreadsheet(file, progressNote, foundSymbols, canAskClaude);
    } catch (error) {
      // A file that could not be opened at all is a different problem from
      // one whose columns were not recognised: no column advice for a
      // broken file.
      unreadable.push(file.name + " (" + error.message + ")");
      continue;
    }

    // A sheet with revenue AND costs stands alone; the two-file layout
    // still has to be paired up.
    let kind = kindOfFile(table.fieldNames);
    if (isCombinedFile(table.fieldNames)) {
      kind = "combined";
    }
    for (const columnName of table.unrecognised) {
      if (!unmatchedColumns.includes(columnName)) {
        unmatchedColumns.push(columnName);
      }
    }
    if (kind) {
      table.fileName = file.name;
      state.heldFiles[kind] = table;
      kindsRead.add(kind);
    } else {
      unrecognised.push(file.name);
    }
  }

  // The newest files win. A one-file sheet held from an earlier drop used to
  // take precedence over a fresh pair of files, so the pair was ignored.
  if (kindsRead.has("combined")) {
    state.heldFiles.dashboard = null;
    state.heldFiles.expenses = null;
  } else if (kindsRead.size) {
    state.heldFiles.combined = null;
  }

  if (unreadable.length) {
    showStatus("Could not open", unreadable.join(", "), true);
    return;
  }
  if (unrecognised.length) {
    showStatus("Columns not recognised", unrecognised.join(", ") + ": the file needs a Revenue column " +
      "and cost columns such as Rent or Cost of goods sold. Download the template above to see the layout.",
      true);
    return;
  }

  const result = monthsFromHeldFiles();
  if (!result) {
    return;
  }
  if (!result.months.length) {
    showStatus("Nothing to show", "No month in this file could be read. The template shows the layout.", true);
    return;
  }

  // A month with no year is shown in the current year. Fix that now, or the
  // same saved file would read as next year's figures after New Year, and
  // an invoice could not find its month.
  for (const month of result.months) {
    if (!month.year) {
      month.year = new Date().getUTCFullYear();
    }
  }

  let currencyNote = "";
  if (foundSymbols.size === 1) {
    currencyNote = adoptCurrency([...foundSymbols][0]);
  }

  state.ownerMonths = result.months;
  state.ownerSourceName = result.from;
  const savedSentence = keepOwnerFigures();
  showOwnerFigures(addedMessage(result.months, result.skipped, result.from, savedSentence, currencyNote) +
    unrecognisedNote(unmatchedColumns));
}
