/* Writing a zip file, which is what an .xlsx file is underneath.

   The files are stored as they are rather than compressed: every
   spreadsheet program reads that, and it needs no compression code. The
   layout is the one xlsx-reader.js reads: each file with its own header,
   then a directory listing them all, then an end record. */

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const DIRECTORY_ENTRY_SIGNATURE = 0x02014b50;
const END_OF_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;          // 2.0, the version every reader supports
const NAMES_ARE_UTF8 = 0x0800;
const STORED = 0;
const DOS_DATE_1980_01_01 = (0 << 9) | (1 << 5) | 1;   // a fixed date; no clock needed

/* The CRC-32 checksum each zip entry carries, worked out with a lookup table. */
function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let byte = 0; byte < 256; byte++) {
    let value = byte;
    for (let bit = 0; bit < 8; bit++) {
      if (value & 1) {
        value = 0xEDB88320 ^ (value >>> 1);
      } else {
        value = value >>> 1;
      }
    }
    table[byte] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = buildCrcTable();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function localHeader(name, data, crc) {
  const header = new DataView(new ArrayBuffer(30));
  header.setUint32(0, LOCAL_HEADER_SIGNATURE, true);
  header.setUint16(4, ZIP_VERSION, true);       // version needed to read it
  header.setUint16(6, NAMES_ARE_UTF8, true);
  header.setUint16(8, STORED, true);
  header.setUint16(12, DOS_DATE_1980_01_01, true);
  header.setUint32(14, crc, true);
  header.setUint32(18, data.length, true);      // compressed size
  header.setUint32(22, data.length, true);      // original size
  header.setUint16(26, name.length, true);
  return new Uint8Array(header.buffer);
}

function directoryEntry(name, data, crc, offset) {
  const entry = new DataView(new ArrayBuffer(46));
  entry.setUint32(0, DIRECTORY_ENTRY_SIGNATURE, true);
  entry.setUint16(4, ZIP_VERSION, true);        // version made by
  entry.setUint16(6, ZIP_VERSION, true);        // version needed to read it
  entry.setUint16(8, NAMES_ARE_UTF8, true);
  entry.setUint16(10, STORED, true);
  entry.setUint16(14, DOS_DATE_1980_01_01, true);
  entry.setUint32(16, crc, true);
  entry.setUint32(20, data.length, true);
  entry.setUint32(24, data.length, true);
  entry.setUint16(28, name.length, true);
  entry.setUint32(42, offset, true);            // where the file's header starts
  return new Uint8Array(entry.buffer);
}

function endOfDirectory(fileCount, directorySize, directoryOffset) {
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, END_OF_DIRECTORY_SIGNATURE, true);
  end.setUint16(8, fileCount, true);
  end.setUint16(10, fileCount, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, directoryOffset, true);
  return new Uint8Array(end.buffer);
}

/* [{ name, data: Uint8Array }] -> a zip file as a Blob of the given type. */
export function zipFiles(files, type) {
  const encoder = new TextEncoder();
  const fileParts = [];
  const directoryParts = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    fileParts.push(localHeader(name, data, crc), name, data);
    directoryParts.push(directoryEntry(name, data, crc, offset), name);
    offset += 30 + name.length + data.length;
  }

  let directorySize = 0;
  for (const part of directoryParts) {
    directorySize += part.length;
  }

  return new Blob(
    [...fileParts, ...directoryParts, endOfDirectory(files.length, directorySize, offset)],
    { type: type }
  );
}
