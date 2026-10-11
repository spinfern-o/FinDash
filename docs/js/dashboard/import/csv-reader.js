/* Reading a CSV file into a grid of cells: one array per row.

   Handles quoted fields, commas inside quotes, doubled "" quotes, and both
   \n and \r\n line endings. Rows with nothing in them are left out. */

const BYTE_ORDER_MARK = 0xFEFF;

function rowHasContent(row) {
  return row.some(function (cell) {
    return cell.trim() !== "";
  });
}

export function readCsvGrid(text) {
  // Excel's "CSV UTF-8" export starts with a byte-order mark. Left in place
  // it becomes part of the first header, which then matches nothing.
  if (text.charCodeAt(0) === BYTE_ORDER_MARK) {
    text = text.slice(1);
  }

  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let position = 0; position < text.length; position++) {
    const character = text[position];

    if (insideQuotes) {
      if (character === '"') {
        if (text[position + 1] === '"') {
          // "" inside quotes is one literal quote mark.
          field += '"';
          position++;
        } else {
          insideQuotes = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      insideQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[position + 1] === "\n") {
        position++;
      }
      row.push(field);
      field = "";
      if (rowHasContent(row)) {
        rows.push(row);
      }
      row = [];
    } else {
      field += character;
    }
  }

  row.push(field);
  if (rowHasContent(row)) {
    rows.push(row);
  }
  return rows;
}
