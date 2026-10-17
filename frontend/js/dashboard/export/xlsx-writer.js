/* Writing an Excel (.xlsx) workbook: a zip of a few XML files.

   Built in the page, for the same reason files are read in the page: the
   figures never have to leave the computer. */

import { zipFiles } from "./zip-writer.js";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const OOXML = "http://schemas.openxmlformats.org";
const XML_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;

/* Cell styles, by their position in the styles file below. */
export const CELL_STYLES = { plain: 0, number: 1, bold: 2, boldNumber: 3, percent: 4, indent: 5 };

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${OOXML}/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment indent="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/* Text made safe for XML. Control characters XML cannot hold are dropped. */
function xmlText(text) {
  return String(text)
    .replace(/[&<>"]/g, function (character) {
      return XML_ESCAPES[character];
    })
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/* 0 -> "A", 25 -> "Z", 26 -> "AA". */
function columnLetters(columnIndex) {
  let letters = "";
  let number = columnIndex + 1;
  while (number) {
    letters = String.fromCharCode(65 + ((number - 1) % 26)) + letters;
    number = Math.floor((number - 1) / 26);
  }
  return letters;
}

/* Keeps the first `columns` columns and `rows` rows on screen while the rest
   scrolls. */
function frozenPaneXml(columns, rows) {
  let activePane;
  if (columns && rows) {
    activePane = "bottomRight";
  } else if (rows) {
    activePane = "bottomLeft";
  } else {
    activePane = "topRight";
  }

  let splits = "";
  if (columns) {
    splits += ` xSplit="${columns}"`;
  }
  if (rows) {
    splits += ` ySplit="${rows}"`;
  }

  return `<sheetViews><sheetView workbookViewId="0"><pane${splits}
      topLeftCell="${columnLetters(columns)}${rows + 1}" activePane="${activePane}"
      state="frozen"/></sheetView></sheetViews>`;
}

function columnWidthsXml(widths) {
  if (!widths.length) {
    return "";
  }
  let columns = "";
  widths.forEach(function (width, index) {
    columns += `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  });
  return `<cols>${columns}</cols>`;
}

/* A cell is a string, a number, or { v: value, s: style }. Empty cells are
   left out, as Excel itself writes them. */
function cellXml(cell, rowIndex, columnIndex) {
  let value = cell;
  let style = 0;
  if (cell !== null && typeof cell === "object") {
    value = cell.v;
    style = cell.s;
  }
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  const reference = columnLetters(columnIndex) + (rowIndex + 1);
  let styleAttribute = "";
  if (style) {
    styleAttribute = ` s="${style}"`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
  }
  return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}

/* One worksheet. `sheet` is { rows, widths, freeze: [columns, rows] }. */
function worksheetXml(sheet) {
  let paneXml = "";
  if (sheet.freeze) {
    paneXml = frozenPaneXml(sheet.freeze[0], sheet.freeze[1]);
  }

  let rowsXml = "";
  sheet.rows.forEach(function (row, rowIndex) {
    let cells = "";
    row.forEach(function (cell, columnIndex) {
      cells += cellXml(cell, rowIndex, columnIndex);
    });
    rowsXml += `<row r="${rowIndex + 1}">${cells}</row>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${OOXML}/spreadsheetml/2006/main">${paneXml}${columnWidthsXml(sheet.widths || [])}<sheetData>${rowsXml}</sheetData></worksheet>`;
}

function contentTypesXml(sheetCount) {
  let worksheetTypes = "";
  for (let number = 1; number <= sheetCount; number++) {
    worksheetTypes += `<Override PartName="/xl/worksheets/sheet${number}.xml" ` +
      `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }
  return XML_HEADER +
    `<Types xmlns="${OOXML}/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ` +
    `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ` +
    `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    worksheetTypes +
    `</Types>`;
}

function packageRelationshipsXml() {
  return XML_HEADER +
    `<Relationships xmlns="${OOXML}/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${OOXML}/officeDocument/2006/relationships/officeDocument" ` +
    `Target="xl/workbook.xml"/>` +
    `</Relationships>`;
}

function workbookXml(sheets) {
  let sheetList = "";
  sheets.forEach(function (sheet, index) {
    // Excel allows sheet names of up to 31 characters.
    sheetList += `<sheet name="${xmlText(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`;
  });
  return XML_HEADER +
    `<workbook xmlns="${OOXML}/spreadsheetml/2006/main" ` +
    `xmlns:r="${OOXML}/officeDocument/2006/relationships"><sheets>` +
    sheetList +
    `</sheets></workbook>`;
}

function workbookRelationshipsXml(sheetCount) {
  let relationships = "";
  for (let number = 1; number <= sheetCount; number++) {
    relationships += `<Relationship Id="rId${number}" ` +
      `Type="${OOXML}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${number}.xml"/>`;
  }
  return XML_HEADER +
    `<Relationships xmlns="${OOXML}/package/2006/relationships">` +
    relationships +
    `<Relationship Id="rId${sheetCount + 1}" ` +
    `Type="${OOXML}/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;
}

/* [{ name, rows, widths, freeze }] -> an .xlsx file as a Blob. The first
   sheet is the one this page reads back when the file is dropped on it, so
   it always holds the figures. */
export function xlsxWorkbook(sheets) {
  const encoder = new TextEncoder();
  const files = [
    { name: "[Content_Types].xml", text: contentTypesXml(sheets.length) },
    { name: "_rels/.rels", text: packageRelationshipsXml() },
    { name: "xl/workbook.xml", text: workbookXml(sheets) },
    { name: "xl/_rels/workbook.xml.rels", text: workbookRelationshipsXml(sheets.length) },
    { name: "xl/styles.xml", text: STYLES_XML }
  ];
  sheets.forEach(function (sheet, index) {
    files.push({ name: `xl/worksheets/sheet${index + 1}.xml`, text: worksheetXml(sheet) });
  });

  const encodedFiles = files.map(function (file) {
    return { name: file.name, data: encoder.encode(file.text) };
  });
  return zipFiles(encodedFiles, XLSX_TYPE);
}
