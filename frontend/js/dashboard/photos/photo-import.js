/* Adding photos of invoices and receipts, one at a time.

   Several photos can be dropped at once. They wait in a queue: each is read,
   shown for the owner to check, and only then is the next one read. */

import { state } from "../state.js";
import { loadCapabilities } from "../capabilities.js";
import { loggedInUser } from "../account.js";
import { showBusy, showStatus } from "../status-line.js";
import { preparePhotoForUpload, readDocument, howBadly } from "./photo-reader.js";
import { showReview, updateReview, closeReview, addReviewedInvoice } from "./photo-review.js";

export function isPhotoFile(file) {
  return /^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

export function queuePhotos(files) {
  state.photoQueue.push(...files);
  if (!state.isHandlingPhoto) {
    readNextPhoto();
  }
}

/* Once the owner is done with a photo: on to the next one, if any. */
function continueWithNextPhoto() {
  if (state.photoQueue.length) {
    readNextPhoto();
  } else {
    state.isHandlingPhoto = false;
  }
}

/* Empties the queue, for "Forget my data". */
export function dropWaitingPhotos() {
  state.photoQueue.length = 0;
  state.isHandlingPhoto = false;
}

/* Reads the photo. A reading that fails its own arithmetic gets one more,
   closer look with the failures spelled out, and whichever reading checks
   out better is kept. */
async function readCarefully(file, photo) {
  let result = await readDocument(photo);

  const isDocument = result.document.legible && result.document.kind !== "other";
  if (isDocument && !result.checks.ok) {
    showBusy("Double-checking", "Some figures on " + file.name + " didn't add up; reading it again.");
    try {
      const secondReading = await readDocument(photo, {
        previous: result.document,
        problems: result.checks.problems
      });
      if (howBadly(secondReading.checks) <= howBadly(result.checks)) {
        result = secondReading;
      }
    } catch (error) {
      // The first reading still stands.
      console.warn("second reading failed:", error.message);
    }
  }
  return result;
}

async function readNextPhoto() {
  const file = state.photoQueue.shift();
  if (!file) {
    state.isHandlingPhoto = false;
    return;
  }
  state.isHandlingPhoto = true;

  try {
    const capabilities = await loadCapabilities();
    if (!capabilities.photos) {
      dropWaitingPhotos();
      showStatus("Photos can't be read here",
        "Reading a photo needs this site's AI service, which isn't set up. Use the template instead.", true);
      return;
    }
    // Each reading costs money, so it is only for someone logged in, within a
    // daily allowance (lib/ai-access.js on the server checks both).
    const user = await loggedInUser();
    if (!user) {
      dropWaitingPhotos();
      showStatus("Log in to read photos",
        "Reading a photo of an invoice needs a free account. Log in (top right), then add the photo again.", true);
      return;
    }

    let waitingNote = "";
    if (state.photoQueue.length) {
      waitingNote = ` (${state.photoQueue.length} more waiting)`;
    }
    showBusy("Reading your photo", file.name + waitingNote + ". This can take up to a minute.");

    const photo = await preparePhotoForUpload(file);
    const result = await readCarefully(file, photo);

    showStatus("Check your photo", "Read from " + file.name + ". Look over the lines below, then add them or not.",
      false);
    showReview(file, photo.preview, result, user.email);
  } catch (error) {
    showStatus("Photo not read", file.name + ": " + error.message, true);
    state.isHandlingPhoto = false;
    if (state.photoQueue.length) {
      readNextPhoto();
    }
  }
}

/* Called once. The review panel is refilled for each photo but never
   replaced, so these listeners cover every photo. */
export function wirePhotoReview() {
  const panel = document.getElementById("review");

  panel.addEventListener("change", function (event) {
    if (event.target.matches('[data-stock-line]')) {
      panel.querySelector(`[data-stock-fields="${event.target.dataset.stockLine}"]`).hidden = !event.target.checked;
    }
    if (event.target.matches("select")) {
      updateReview();
    }
  });

  panel.addEventListener("click", async function (event) {
    if (event.target.closest("#review-cancel")) {
      closeReview();
      continueWithNextPhoto();
    } else if (event.target.closest("#review-add")) {
      const saved = await addReviewedInvoice();
      if (saved) { continueWithNextPhoto(); }
    }
  });
}
