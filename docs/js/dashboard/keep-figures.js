/* Keeping the owner's figures after every change: always in this browser,
   and in their account too while they are logged in. */

import { saveOwnerFigures, savedNote, forgetSavedFigures } from "./saved-figures.js";
import { isSavingToAccount, saveToAccountSoon } from "./account-figures.js";

/* Saves the figures on screen. Returns the sentence that tells the owner
   where they were kept. */
export function keepOwnerFigures() {
  const savedInBrowser = saveOwnerFigures();
  if (isSavingToAccount()) {
    saveToAccountSoon();
    return "Saved to your account, so it will be there wherever you log in.";
  }
  return savedNote(savedInBrowser);
}

/* After the last of the owner's figures was removed: nothing is left to
   keep, here or in the account. */
export function dropOwnerFigures() {
  forgetSavedFigures();
  saveToAccountSoon();
}
