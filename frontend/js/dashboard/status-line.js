/* The two lines at the top of the import box that say what is happening:
   a short heading ("Reading", "Your figures") and a sentence under it. */

import { isShowingOwnerFigures } from "./state.js";
import { escapeHtml } from "./format.js";

/* Progress, not just the outcome. Each step names the file, so a two-file
   upload shows which one is being worked on. */
export function showBusy(heading, detail) {
  document.getElementById("source").textContent = heading;
  const status = document.getElementById("status");
  status.innerHTML = '<span class="spin"></span>' + escapeHtml(detail);
  status.className = "";
  document.getElementById("loader").classList.add("busy");

  const pickButton = document.getElementById("pick");
  if (pickButton) {
    pickButton.disabled = true;
    pickButton.textContent = "Working…";
  }
}

export function endBusy() {
  document.getElementById("loader").classList.remove("busy");

  const pickButton = document.getElementById("pick");
  if (pickButton) {
    pickButton.disabled = false;
    if (isShowingOwnerFigures()) {
      pickButton.textContent = "Add a file or photo";
    } else {
      pickButton.textContent = "Choose file";
    }
  }
}

/* isProblem colours the sentence as a warning. */
export function showStatus(heading, detail, isProblem) {
  endBusy();
  document.getElementById("source").textContent = heading;
  const status = document.getElementById("status");
  status.textContent = detail;
  if (isProblem) {
    status.className = "bad";
  } else {
    status.className = "";
  }
}
