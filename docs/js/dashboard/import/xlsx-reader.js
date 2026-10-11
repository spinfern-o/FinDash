/* Reading an Excel (.xlsx) file into a grid of cells.

   An .xlsx file is a zip of XML files. The browser can already unzip
   (DecompressionStream) and read XML (DOMParser), so the two parts needed
   are read directly rather than with a spreadsheet library: no extra code
   to download, and the file still never leaves the computer. Only the first
   worksheet is read. */

const END_OF_DIRECTORY_SIGNATURE = 0x06054b50;
const DIRECTORY_ENTRY_SIGNATURE = 0x02014b50;
const STORED = 0;   // a zip entry kept as it is, not compressed

async function decompress(bytes, method) {
  if (method === STORED) {
    return bytes;
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* The end-of-directory record sits in the last 64 KB of a zip file; it says
   where the list of files (the central directory) starts. */
function findEndOfDirectory(view, length) {
  for (let position = length - 22; position >= 0 && position > length - 65558; position--) {
    if (view.getUint32(position, true) === END_OF_DIRECTORY_SIGNATURE) {
      return position;
    }
  }
  return -1;
}

/* Every file inside a zip: { "path/name.xml": bytes }. */
async function unzip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const endOfDirectory = findEndOfDirectory(view, bytes.length);
  if (endOfDirectory < 0) {
    throw new Error("not a zip archive");
  }

  const entryCount = view.getUint16(endOfDirectory + 10, true);
  let position = view.getUint32(endOfDirectory + 16, true);
  const files = {};

  for (let entry = 0; entry < entryCount; entry++) {
    if (view.getUint32(position, true) !== DIRECTORY_ENTRY_SIGNATURE) {
      break;
    }
    const method = view.getUint16(position + 10, true);
    const compressedLength = view.getUint32(position + 20, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const localHeaderOffset = view.getUint32(position + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(position + 46, position + 46 + nameLength));

    // The file's own (local) header repeats the name and extra field, at
    // its own lengths, before the data starts.
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    files[name] = await decompress(bytes.subarray(dataStart, dataStart + compressedLength), method);

    position += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/* "BC12" -> 54 (counting from 0). Excel leaves empty cells out of the file,
   so a cell's column has to come from its reference. */
function columnIndexOf(cellReference) {
  let number = 0;
  for (const character of cellReference) {
    const code = character.charCodeAt(0);
    if (code < 65 || code > 90) {
      break;   // past the letters, into the row number
    }
    number = number * 26 + (code - 64);
  }
  return number - 1;
}

function textOfAll(elements) {
  let text = "";
  for (const element of elements) {
    text += element.textContent;
  }
  return text;
}

/* Text that appears in many cells is stored once, in sharedStrings.xml, and
   the cells point at it by number. One entry can hold several runs of text. */
function readSharedStrings(readXml, files) {
  if (!files["xl/sharedStrings.xml"]) {
    return [];
  }
  const entries = readXml("xl/sharedStrings.xml").getElementsByTagName("si");
  const strings = [];
  for (const entry of entries) {
    strings.push(textOfAll(entry.getElementsByTagName("t")));
  }
  return strings;
}

function firstWorksheetName(files) {
  const worksheets = Object.keys(files).filter(function (name) {
    return /^xl\/worksheets\/sheet\d+\.xml$/.test(name);
  });
  return worksheets.sort()[0];
}

function cellValue(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return textOfAll(cell.getElementsByTagName("t"));
  }
  const valueElement = cell.getElementsByTagName("v")[0];
  let raw = "";
  if (valueElement) {
    raw = valueElement.textContent;
  }
  if (type === "s") {
    return sharedStrings[Number(raw)] || "";
  }
  return raw;
}

export async function readXlsxGrid(buffer) {
  const files = await unzip(buffer);
  const decoder = new TextDecoder();
  function readXml(name) {
    return new DOMParser().parseFromString(decoder.decode(files[name]), "application/xml");
  }

  const sharedStrings = readSharedStrings(readXml, files);
  const worksheetName = firstWorksheetName(files);
  if (!worksheetName) {
    throw new Error("no worksheet inside the workbook");
  }

  const rows = [];
  for (const rowElement of readXml(worksheetName).getElementsByTagName("row")) {
    const cells = [];
    for (const cellElement of rowElement.getElementsByTagName("c")) {
      const columnIndex = columnIndexOf(cellElement.getAttribute("r") || "");
      // Fill in the empty cells the file left out.
      while (cells.length < columnIndex) {
        cells.push("");
      }
      cells[columnIndex] = cellValue(cellElement, sharedStrings);
    }

    const hasContent = cells.some(function (cell) {
      return String(cell).trim() !== "";
    });
    if (hasContent) {
      rows.push(cells);
    }
  }
  return rows;
}
