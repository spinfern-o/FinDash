/* The dashboard's starting point: wires up the page, then shows the owner's
   saved figures if there are any, or the demo.

   How the code is laid out, top to bottom:
     state.js               everything the page keeps track of
     draw-dashboard.js      the month buttons, the heading, and every card
     cards/                 one file per card
     import-box.js          adding files and photos; "Forget my data"
     import/                reading spreadsheets
     photos/                reading photos of invoices and receipts
     export/                the template and "Export to Excel"
     saved-figures.js       remembering the figures in this browser
     account-figures.js     saving them to the owner's account when logged in
     items.js               what the owner buys, item by item, from invoices
     count-sheet.js         the count sheet made from those items
     agent-tools.js         tools for AI agents in the browser (WebMCP)
   README.md has a fuller tour. */

import { state, isShowingOwnerFigures } from "./state.js";
import { loadPreferences } from "./preferences.js";
import { loadSavedAdvice } from "./cards/advice.js";
import { loadSavedFigures } from "./saved-figures.js";
import { describeOwnerSource } from "./owner-figures.js";
import { showOwnerFigures, showDemoFigures } from "./figures-on-screen.js";
import { wireMonthSelection } from "./draw-dashboard.js";
import { wireToolbar } from "./toolbar.js";
import { wireImportBox } from "./import-box.js";
import { wireHelpTips } from "./help-tips.js";
import { loadCapabilities } from "./capabilities.js";
import { loggedInUser, showLoggedIn } from "./account.js";
import { startSavingToAccount, stopSavingToAccount } from "./account-figures.js";
import { showStatus } from "./status-line.js";
import { offerAgentTools } from "./agent-tools.js";
import { wireItemLog } from "./cards/item-log.js";

/* Mentions photos only where this copy of FinDash can read them. Where
   accounts are set up, shows who is logged in and saves their figures to
   their account. */
async function showWhatThisSiteCanDo() {
  const capabilities = await loadCapabilities();
  for (const element of document.querySelectorAll(".photo-only")) {
    element.hidden = !capabilities.photos;
  }
  const user = await loggedInUser();
  if (user) {
    showLoggedIn(user, stopSavingToAccount);
    await startSavingToAccount(user);
  }
}

/* Saved figures first: a returning owner should land on their own numbers,
   not watch the demo flash up and get replaced. */
function showSavedFigures() {
  const saved = loadSavedFigures();
  if (!saved) {
    return;
  }
  state.ownerMonths = saved.months;
  state.ownerInvoices = saved.invoices;
  state.ownerSourceName = saved.from;
  state.ownerAccount = saved.account;
  showOwnerFigures(`Saved in this browser: ${describeOwnerSource()}.`);
}

/* When data.json cannot be loaded (usually because the page was opened
   straight from disk) the built-in sample months are shown instead, with a
   note saying why. */
function showDemoWithoutDataFile() {
  showDemoFigures();
  const footer = document.getElementById("footer");
  footer.innerHTML = "Showing sample figures. <code>data.json</code> could not be loaded. " +
    "Serve this folder over http (<code>python3 -m http.server</code>) " +
    "or place data.json alongside this file.";
  footer.classList.add("notice");
  showStatus("Demo data", "Couldn't load the demo figures, so built-in samples are showing. Add your own file above.",
    true);
}

async function loadDemoFigures() {
  let published;
  try {
    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error("data.json returned " + response.status);
    }
    published = await response.json();
  } catch {
    if (!isShowingOwnerFigures()) {
      showDemoWithoutDataFile();
    }
    return;
  }

  state.publishedData = published;
  if (!isShowingOwnerFigures()) {
    showDemoFigures();
  }
}

function start() {
  loadPreferences();
  state.savedAdvice = loadSavedAdvice();

  wireMonthSelection();
  wireItemLog();
  wireToolbar();
  wireImportBox();
  wireHelpTips();
  showWhatThisSiteCanDo();

  showSavedFigures();
  loadDemoFigures();
  offerAgentTools();

  // For checking figures by hand from the browser's console.
  window.findash = { state: state };
}

start();
