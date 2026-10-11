/* Getting a photo ready to send, and asking /api/read-document to read it.

   A spreadsheet is read here, in the page; a photo cannot be. It goes to
   /api/read-document, where Claude reads it. The photo is shrunk first: the
   model reads up to 2576 pixels on the long edge, and the hosting limit is
   4.5 MB a request. */

const LONGEST_EDGE_READ = 2576;
const LARGEST_UPLOAD_BYTES = 3_000_000;
const PREVIEW_EDGE = 320;

/* Draws the picture at `scale` onto a white canvas and encodes it as JPEG.
   White, because a transparent PNG would turn black as a JPEG. */
function drawAsJpeg(bitmap, scale, quality) {
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise(function (resolve) {
    canvas.toBlob(function (blob) {
      resolve({ blob: blob, canvas: canvas });
    }, "image/jpeg", quality);
  });
}

function blobAsBase64(blob) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      // A data URL is "data:image/jpeg;base64,<the data>"; keep the data.
      resolve(String(reader.result).split(",")[1]);
    };
    reader.onerror = function () {
      reject(new Error("the photo could not be read from disk"));
    };
    reader.readAsDataURL(blob);
  });
}

/* Opens the photo, turns it upright, shrinks it until it is small enough to
   send, and makes a small preview for the review panel. Returns
   { data, mediaType, preview }.

   createImageBitmap reads the file straight from disk, which the page's
   security policy allows where an <img> pointed at a blob: address would
   not. */
export async function preparePhotoForUpload(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("this browser can't open that kind of photo. Save it as a JPEG, or take a " +
      "screenshot of it, and add that instead.");
  }

  const longestEdge = Math.max(bitmap.width, bitmap.height);
  let scale = Math.min(1, LONGEST_EDGE_READ / longestEdge);

  for (let attempt = 0; attempt < 5; attempt++) {
    const drawn = await drawAsJpeg(bitmap, scale, 0.88);
    if (drawn.blob && drawn.blob.size <= LARGEST_UPLOAD_BYTES) {
      const preview = await drawAsJpeg(bitmap, Math.min(1, PREVIEW_EDGE / longestEdge), 0.7);
      return {
        data: await blobAsBase64(drawn.blob),
        mediaType: "image/jpeg",
        preview: preview.canvas.toDataURL("image/jpeg", 0.7)
      };
    }
    scale *= 0.75;
  }
  throw new Error("this photo is too large to send. Try a smaller one.");
}

/* Sends the photo to be read. `review`, when given, is
   { previous, problems }: the first reading and what did not add up in it,
   for a second, closer look. Returns { document, checks }. */
export async function readDocument(photo, review) {
  let response;
  try {
    response = await fetch("/api/read-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: photo.data, mediaType: photo.mediaType, review: review })
    });
  } catch {
    throw new Error("the photo could not be sent. Check your connection and try again.");
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // An HTML error page; the status says enough.
  }

  if (!response.ok || !body || !body.document) {
    if (response.status === 404) {
      throw new Error("reading photos isn't available on this copy of FinDash.");
    }
    if (response.status === 413) {
      throw new Error("this photo is too large to send. Try a smaller one.");
    }
    throw new Error((body && body.error) || "the reading service returned " + response.status);
  }
  return body;
}

/* How badly a reading fails its own arithmetic: every problem counts more
   than any difference in money. Lower is better. */
export function howBadly(checks) {
  return checks.problems.length * 1000 + Math.abs(checks.difference || 0);
}
