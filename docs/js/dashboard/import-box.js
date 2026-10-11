/* The import box at the top of the page: choosing or dropping files,
   removing an invoice, and "Forget my data". */

import { state, isShowingOwnerFigures } from "./state.js";
import { forgetSavedFigures } from "./saved-figures.js";
import { keepOwnerFigures, dropOwnerFigures } from "./keep-figures.js";
import { forgetFiguresInAccount } from "./account-figures.js";
import { showOwnerFigures, showDemoFigures } from "./figures-on-screen.js";
import { showStatus } from "./status-line.js";
import { handleSpreadsheets } from "./import/sheet-import.js";
import { isPhotoFile, queuePhotos, dropWaitingPhotos, wirePhotoReview } from "./photos/photo-import.js";
import { closeReviewQuietly } from "./photos/photo-review.js";

/* Spreadsheets are read first, then photos are queued for reading. */
async function handleFiles(fileList) {
  const files = [...fileList];
  if (!files.length) {
    return;
  }
  const photos = files.filter(isPhotoFile);
  const spreadsheets = files.filter(function (file) {
    return !isPhotoFile(file);
  });

  if (spreadsheets.length) {
    await handleSpreadsheets(spreadsheets);
  }
  if (photos.length) {
    queuePhotos(photos);
  }
}

function wireFilePicker() {
  const input = document.getElementById("file");
  const dropzone = document.getElementById("dropzone");

  function openFilePicker() {
    input.click();
  }

  document.getElementById("pick").addEventListener("click", openFilePicker);
  dropzone.addEventListener("click", openFilePicker);
  dropzone.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  });

  input.addEventListener("change", function (event) {
    handleFiles(event.target.files);
    // Cleared so picking the same file again still counts as a change.
    input.value = "";
  });
}

/* Files can be dropped anywhere on the page. Cancelling "dragover" is what
   stops the browser from simply opening the dropped file. The count is
   needed because dragging over a child element leaves its parent. */
function wireDragAndDrop() {
  const dropzone = document.getElementById("dropzone");
  let dragDepth = 0;

  document.addEventListener("dragenter", function (event) {
    event.preventDefault();
    dragDepth++;
    dropzone.classList.add("over");
  });
  document.addEventListener("dragover", function (event) {
    event.preventDefault();
  });
  document.addEventListener("dragleave", function (event) {
    event.preventDefault();
    dragDepth--;
    if (dragDepth <= 0) {
      dropzone.classList.remove("over");
    }
  });
  document.addEventListener("drop", function (event) {
    event.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove("over");
    handleFiles(event.dataTransfer.files);
  });
}

const FORGET_QUESTION = "Forget your figures?\n\nThey will be removed from this browser and from your " +
  "account, so they won't be there when you log in anywhere. This can't be undone.";

/* "Forget my data". While logged in the figures are in the account too, so
   the owner is asked first, and nothing is removed here unless the
   account's copy could be removed as well. */
async function forgetOwnerFigures() {
  const isLoggedIn = state.account !== null;
  if (isLoggedIn) {
    if (!window.confirm(FORGET_QUESTION)) {
      return;
    }
    const removedFromAccount = await forgetFiguresInAccount();
    if (!removedFromAccount) {
      return;
    }
  }

  forgetSavedFigures();
  closeReviewQuietly();
  dropWaitingPhotos();
  showDemoFigures();
  if (isLoggedIn) {
    showStatus("Demo data", "Your figures were removed from this browser and your account. Showing the demo again.",
      false);
  } else {
    showStatus("Demo data", "Your figures were removed from this browser. Showing the demo again.", false);
  }
}

function wireForgetButton() {
  document.getElementById("forget").addEventListener("click", forgetOwnerFigures);
}

/* Each invoice in the list has a Remove button. Removing the last of the
   owner's figures goes back to the demo. */
function wireInvoiceRemoval() {
  const list = document.getElementById("inv-list");
  list.addEventListener("click", function (event) {
    const button = event.target.closest("[data-remove]");
    if (!button) {
      return;
    }
    const removedId = button.dataset.remove;
    const removed = state.ownerInvoices.find(function (invoice) {
      return invoice.id === removedId;
    });
    state.ownerInvoices = state.ownerInvoices.filter(function (invoice) {
      return invoice.id !== removedId;
    });

    if (!isShowingOwnerFigures()) {
      dropOwnerFigures();
      showDemoFigures();
      showStatus("Demo data", "Removed the last invoice. Showing the demo again.", false);
      return;
    }

    const savedSentence = keepOwnerFigures();
    let removedName = "the invoice";
    if (removed) {
      removedName = removed.supplier;
    }
    showOwnerFigures(`Removed ${removedName}. ${savedSentence}`);
    list.open = true;
  });
}

export function wireImportBox() {
  wireFilePicker();
  wireDragAndDrop();
  wireForgetButton();
  wireInvoiceRemoval();
  wirePhotoReview();
}
