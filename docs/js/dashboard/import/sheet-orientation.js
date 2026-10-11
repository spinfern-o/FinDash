/* Turning a sideways sheet the right way up.

   A sheet made for people to read often runs the lines DOWN the first column
   with the months across the top: the other way round from a CSV. Guessing
   from the sheet beats asking: whichever edge has more recognised field
   names on it is the header edge. Worked out on the page; nothing is sent. */

import { fieldNameFor, isKnownField } from "./column-names.js";

function countKnownFields(cells) {
  let count = 0;
  for (const cell of cells) {
    if (isKnownField(fieldNameFor(cell))) {
      count += 1;
    }
  }
  return count;
}

function cellOrBlank(cells, index) {
  if (cells[index] === undefined) {
    return "";
  }
  return cells[index];
}

/* Rows become columns and columns become rows. */
function flip(grid) {
  let width = 0;
  for (const row of grid) {
    width = Math.max(width, row.length);
  }

  const flipped = [];
  for (let column = 0; column < width; column++) {
    flipped.push(grid.map(function (row) {
      return cellOrBlank(row, column);
    }));
  }
  return flipped;
}

/* The grid with its headers across the top, flipped if they ran down. */
export function withHeadersOnTop(grid) {
  if (!grid.length) {
    return grid;
  }
  const firstRow = grid[0];
  const firstColumn = grid.map(function (row) {
    return cellOrBlank(row, 0);
  });
  if (countKnownFields(firstColumn) > countKnownFields(firstRow)) {
    return flip(grid);
  }
  return grid;
}
