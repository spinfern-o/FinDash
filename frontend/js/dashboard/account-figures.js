/* Saving the owner's figures to their account while they are logged in, so
   the same months and invoices are there on any computer they log in on.

   The figures are always kept in this browser too (saved-figures.js). This
   module keeps the account's copy in step:
     - on logging in, the account's figures are loaded, or this browser's
       are saved to the account, or the owner chooses when the two differ;
       but figures this browser kept from a different account are never
       saved to this one or offered to it: they are removed
     - after every change, the figures are saved to the account
     - on logging out, the figures are removed from this browser, since they
       are safe in the account (unless a change never reached it)

   The requests go to /api/figures on this site, which saves them with
   Supabase as the logged-in person. */

import { state, isShowingOwnerFigures } from "./state.js";
import { escapeHtml, formatLocalDate } from "./format.js";
import { figuresToSave, cleanSavedFigures, saveOwnerFigures, forgetSavedFigures, savedFiguresAreSynced } from "./saved-figures.js";
import { describeOwnerSource } from "./owner-figures.js";
import { showOwnerFigures, showDemoFigures } from "./figures-on-screen.js";
import { showStatus } from "./status-line.js";

const BROWSER_ONLY_NOTE = "Your figures only leave when you press <b>Get advice</b>.";
const ACCOUNT_NOTE = "While you're logged in, your figures (not your file or photos) are saved to " +
  "your account. They go nowhere else unless you press <b>Get advice</b>.";

let isSaving = false;
let saveAgainWhenDone = false;
let accountVersion = 0;
let refreshing = false;

/* True when changes should be saved to the account right away. Not while
   the owner is still choosing between two different sets of figures. */
export function isSavingToAccount() {
  return state.account !== null && !state.account.isWaitingForChoice;
}

/* Sends a request to /api/figures. Returns the answer, or throws an Error
   whose message is a sentence an owner can read. The error's status is the
   HTTP status (0 when the site could not be reached). */
async function figuresRequest(method, body, owner = state.account?.email) {
  const options = { method: method, credentials: "same-origin", cache: "no-store", headers: {} };
  if (owner) { options.headers['X-FinDash-Owner'] = owner; }
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch("/api/figures", options);
  } catch {
    const error = new Error("Your account couldn't be reached. Check your connection.");
    error.status = 0;
    throw error;
  }

  let answer = null;
  try {
    answer = await response.json();
  } catch {
    answer = null;
  }
  if (!response.ok) {
    let message = "The account service returned " + response.status + ".";
    if (answer && answer.error) {
      message = answer.error;
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return answer;
}

/* Swaps the privacy sentence in the import box. */
function showPrivacyNote(isLoggedIn) {
  const note = document.getElementById("privacy-figures");
  if (!note) {
    return;
  }
  if (isLoggedIn) {
    note.innerHTML = ACCOUNT_NOTE;
  } else {
    note.innerHTML = BROWSER_ONLY_NOTE;
  }
}

function plural(count, word) {
  if (count === 1) {
    return word;
  }
  return word + "s";
}

/* "3 months from figures.xlsx + 2 invoices from photos", as HTML. */
function summariseFigures(figures) {
  const parts = [];
  let monthCount = 0;
  if (figures.months) {
    monthCount = figures.months.length;
  }
  if (monthCount) {
    let monthsPart = `${monthCount} ${plural(monthCount, "month")}`;
    if (figures.from) {
      monthsPart += " from " + escapeHtml(figures.from);
    }
    parts.push(monthsPart);
  }
  const invoiceCount = figures.invoices.length;
  if (invoiceCount) {
    parts.push(`${invoiceCount} ${plural(invoiceCount, "invoice")} from photos`);
  }
  return parts.join(" + ");
}

/* Two sets of figures are the same when everything that is shown matches. */
function areSameFigures(first, second) {
  const firstShown = JSON.stringify({ months: first.months, invoices: first.invoices, from: first.from });
  const secondShown = JSON.stringify({ months: second.months, invoices: second.invoices, from: second.from });
  return firstShown === secondShown;
}

/* A new reviewed invoice extends a clean browser copy. A replacement monthly
   spreadsheet or an edited/deleted invoice still needs the owner's choice. */
function onlyNewInvoices(inAccount, inBrowser) {
  if (JSON.stringify(inAccount.months) !== JSON.stringify(inBrowser.months) || inAccount.from !== inBrowser.from ||
      inAccount.invoices.length < inBrowser.invoices.length) { return false; }
  return inBrowser.invoices.every(function (invoice) {
    const saved = inAccount.invoices.find(function (candidate) { return candidate.id === invoice.id; });
    return saved && JSON.stringify(saved) === JSON.stringify(invoice);
  });
}

/* Puts the account's figures on screen and keeps a copy in this browser. */
function useAccountFigures(figures) {
  accountVersion += 1;
  state.ownerMonths = figures.months;
  state.ownerInvoices = figures.invoices;
  state.ownerSourceName = figures.from;
  saveOwnerFigures(true);
  showOwnerFigures(`Loaded from your account: ${describeOwnerSource()}.`);
}

/* One attempt to make the account match what is on screen: the figures, or
   nothing when the owner's figures are gone. Returns true when it worked. */
async function sendFiguresToAccount() {
  const account = state.account;
  try {
    if (isShowingOwnerFigures()) {
      const answer = await figuresRequest("PUT", { figures: figuresToSave(), expectedUpdatedAt: state.account.updatedAt });
      if (state.account !== account) { return false; }
      account.updatedAt = answer.updatedAt;
    } else {
      await figuresRequest("DELETE");
      if (state.account !== account) { return false; }
      account.updatedAt = null;
    }
    if (state.account) {
      state.account.hasUnsavedChanges = saveAgainWhenDone;
      if (!saveAgainWhenDone && isShowingOwnerFigures()) { saveOwnerFigures(true); }
    }
    return true;
  } catch (error) {
    if (state.account !== account) { return false; }
    if (error.status === 409 && state.account) {
      try {
        const latest = await figuresRequest('GET');
        state.account.updatedAt = latest.updatedAt;
        const inAccount = cleanSavedFigures(latest.figures);
        const inBrowser = cleanSavedFigures(figuresToSave());
        if (inAccount && inBrowser) { askWhichToKeep(inAccount, latest.updatedAt, inBrowser); }
      } catch { /* The unsaved warning below remains available. */ }
    }
    if (error.status === 401) {
      // The login ran out. The figures are still in this browser.
      state.account = null;
      showPrivacyNote(false);
      showStatus("Not saved to your account", "You've been logged out, so your figures are saved in this " +
        "browser only. Log in again to save them to your account.", true);
      return false;
    }
    showStatus("Not saved to your account", error.message + " Your figures are still saved in this browser.", true);
    return false;
  }
}

/* Saves to the account now. If a save is already on its way, one more is
   made once it is done, so the account always ends up with the latest. */
async function saveToAccountNow() {
  isSaving = true;
  const succeeded = await sendFiguresToAccount();
  isSaving = false;

  if (saveAgainWhenDone) {
    saveAgainWhenDone = false;
    if (succeeded && isSavingToAccount()) {
      return saveToAccountNow();
    }
  }
  return succeeded;
}

/* Adopt the exact financial snapshot committed with a shelf count. Its
   concurrency token must never be paired with older local figures. */
export function acceptConfirmedFigures(figures, updatedAt, owner) {
  if (!state.account || state.account.email !== owner || state.account.hasUnsavedChanges || state.account.isWaitingForChoice) { return false; }
  const cleaned = cleanSavedFigures(figures);
  if (!cleaned) { return false; }
  state.account.updatedAt = updatedAt;
  useAccountFigures(cleaned);
  return true;
}

/* Called after every change to the owner's figures. */
export function saveToAccountSoon() {
  accountVersion += 1;
  if (!isSavingToAccount()) {
    return;
  }
  state.account.hasUnsavedChanges = true;
  if (isSaving) {
    saveAgainWhenDone = true;
    return;
  }
  saveToAccountNow();
}

function hideChoice() {
  const panel = document.getElementById("sync-choice");
  panel.hidden = true;
  panel.innerHTML = "";
}

/* This browser and the account hold different figures: the owner picks
   which to keep, and the other is replaced. Guessing could throw away
   months of someone's figures. */
function askWhichToKeep(inAccount, accountSavedAt, inBrowser) {
  state.account.isWaitingForChoice = true;

  let savedOn = "";
  const savedTime = Date.parse(accountSavedAt);
  if (Number.isFinite(savedTime)) {
    savedOn = ", saved " + formatLocalDate(new Date(savedTime));
  }

  const panel = document.getElementById("sync-choice");
  panel.innerHTML = `<div class="review-top"><div>
      <p class="review-kicker">Logged in as ${escapeHtml(state.account.email)}</p>
      <h3>This browser and your account have different figures</h3>
      <p class="review-meta">Your account: ${summariseFigures(inAccount)}${savedOn}.</p>
      <p class="review-meta">This browser: ${summariseFigures(inBrowser)}.</p>
    </div></div>
    <div class="review-actions">
      <button type="button" class="btn" id="keep-browser">Keep this browser's</button>
      <button type="button" class="btn primary" id="keep-account">Keep my account's</button>
    </div>
    <p class="review-foot">The figures you don't keep are replaced, in this browser and in your account.</p>`;
  panel.hidden = false;

  document.getElementById("keep-account").addEventListener("click", function () {
    hideChoice();
    state.account.isWaitingForChoice = false;
    state.account.hasUnsavedChanges = false;
    useAccountFigures(inAccount);
  });

  document.getElementById("keep-browser").addEventListener("click", async function () {
    hideChoice();
    state.account.isWaitingForChoice = false;
    saveOwnerFigures();
    state.account.hasUnsavedChanges = true;
    const saved = await saveToAccountNow();
    if (saved) {
      showStatus("Your figures", "This browser's figures are now saved to your account.", false);
    }
  });
}

/* True when the figures in this browser were saved under an account other
   than `email`: left behind by someone else, whose login ran out or who
   logged out before their last change reached their account. */
function belongToAnotherAccount(email) {
  return state.ownerAccount !== null && state.ownerAccount !== String(email).toLowerCase();
}

/* Called once someone is known to be logged in. */
export async function startSavingToAccount(user) {
  let answer;
  try {
    answer = await figuresRequest("GET", undefined, user.email);
  } catch (error) {
    // Saving to accounts may not be set up on this site yet; the dashboard
    // works as before, in this browser only.
    console.warn("account figures unavailable:", error.message);
    return;
  }

  state.account = { email: user.email, hasUnsavedChanges: false, isWaitingForChoice: false, updatedAt: answer.updatedAt };
  showPrivacyNote(true);

  const inAccount = cleanSavedFigures(answer.figures);
  let inBrowser = null;
  if (isShowingOwnerFigures()) {
    inBrowser = cleanSavedFigures(figuresToSave());
  }

  // Someone else's figures: never this person's to keep or to see.
  let removedAnotherAccounts = false;
  if (inBrowser && belongToAnotherAccount(user.email)) {
    forgetSavedFigures();
    showDemoFigures();
    inBrowser = null;
    removedAnotherAccounts = true;
  }

  if (!inAccount && !inBrowser) {
    if (removedAnotherAccounts) {
      showStatus("Demo data", "The figures in this browser were from another account, so they were " +
        "removed from this browser and not added to yours. Showing the demo.", false);
    }
    return;
  }

  if (inAccount && !inBrowser) {
    useAccountFigures(inAccount);
    return;
  }

  if (inAccount && inBrowser && state.ownerAccount === String(user.email).toLowerCase() && savedFiguresAreSynced() && onlyNewInvoices(inAccount, inBrowser)) {
    useAccountFigures(inAccount);
    return;
  }

  if (!inAccount && inBrowser) {
    // Figures added before logging in become this person's.
    saveOwnerFigures();
    state.account.hasUnsavedChanges = true;
    const saved = await saveToAccountNow();
    if (saved) {
      showStatus("Your figures", "Your figures are now saved to your account too, so they'll be there " +
        "wherever you log in.", false);
    }
    return;
  }

  if (!areSameFigures(inAccount, inBrowser)) {
    askWhichToKeep(inAccount, answer.figures.saved, inBrowser);
  }
}

/* Pick up a confirmed stock invoice on an already-open financial dashboard.
   Local edits and reconciliation choices always take precedence over refresh. */
export async function refreshAccountFigures() {
  if (refreshing || !state.account || state.account.hasUnsavedChanges || state.account.isWaitingForChoice || isSaving || state.photoReview) { return; }
  refreshing = true;
  const account = state.account;
  const version = accountVersion;
  try {
    const answer = await figuresRequest('GET');
    if (state.account !== account || accountVersion !== version || state.account.hasUnsavedChanges || state.account.isWaitingForChoice || state.photoReview || isSaving) { return; }
    const figures = cleanSavedFigures(answer.figures);
    const current = cleanSavedFigures(figuresToSave());
    state.account.updatedAt = answer.updatedAt;
    if (figures && (!current || !areSameFigures(figures, current))) { useAccountFigures(figures); }
    else if (!figures && current) { forgetSavedFigures(); showDemoFigures(); }
  } catch {
    showStatus('Could not refresh your account', 'Your figures have not been changed. Check your connection and try again.', true);
  } finally {
    refreshing = false;
  }
}

/* For "Forget my data" while logged in. Returns true once the account's copy
   is gone; on failure says so and returns false, and nothing is removed. */
export async function forgetFiguresInAccount() {
  try {
    await figuresRequest("DELETE");
  } catch (error) {
    showStatus("Nothing was removed", error.message + " Try again in a moment.", true);
    return false;
  }
  hideChoice();
  state.account.updatedAt = null;
  state.account.isWaitingForChoice = false;
  state.account.hasUnsavedChanges = false;
  return true;
}

/* Called after logging out. The figures leave this browser too, so the
   next person at this computer cannot see them, unless a change never
   reached the account, in which case removing them would lose it. */
export function stopSavingToAccount() {
  accountVersion += 1;
  const account = state.account;
  state.account = null;
  showPrivacyNote(false);
  hideChoice();

  if (!account || !isShowingOwnerFigures()) {
    return;
  }
  if (account.hasUnsavedChanges || account.isWaitingForChoice) {
    showStatus("Logged out", "Some of your figures hadn't been saved to your account, so they're still in " +
      "this browser.", false);
    return;
  }

  forgetSavedFigures();
  showDemoFigures();
  showStatus("Logged out", "Your figures are saved in your account and were removed from this browser. " +
    "Log in to see them again.", false);
}
