/* The small "?" buttons beside a term, and the explanation they open.

   The words come from glossary.js, which the help page uses too, so the two
   can never explain a term differently. Hovering or focusing a button
   previews the explanation; a click or tap pins it open, which is the only
   way a touch screen can read it. */

import { GLOSSARY } from "../glossary.js";

let popup = null;
let pinnedButton = null;   // the button whose explanation was clicked open
let shownButton = null;    // the button whose explanation is on screen

/* The "?" button for a glossary term, as HTML. Empty for an unknown term. */
export function helpButton(glossaryKey) {
  const entry = GLOSSARY[glossaryKey];
  if (!entry) {
    return "";
  }
  return `<button type="button" class="help" data-help="${glossaryKey}" aria-expanded="false"
         aria-label="What does ${entry.term.toLowerCase()} mean?"></button>`;
}

/* Puts the explanation just below its button, or above it when there is no
   room below, and never past the edge of the window. */
function placePopupBy(button) {
  const buttonBox = button.getBoundingClientRect();
  const popupWidth = popup.offsetWidth;
  const popupHeight = popup.offsetHeight;

  const centredLeft = buttonBox.left + buttonBox.width / 2 - popupWidth / 2;
  const left = Math.max(8, Math.min(centredLeft, innerWidth - popupWidth - 8));

  const topBelow = buttonBox.bottom + 6;
  let top = topBelow;
  if (topBelow + popupHeight > innerHeight - 8) {
    top = buttonBox.top - popupHeight - 6;
  }

  popup.style.left = left + "px";
  popup.style.top = top + "px";
}

function showExplanation(button) {
  const entry = GLOSSARY[button.dataset.help];
  if (!entry) {
    return;
  }
  popup.innerHTML = `<b>${entry.term}</b>${entry.text}`;
  popup.hidden = false;
  shownButton = button;
  placePopupBy(button);
  button.setAttribute("aria-expanded", "true");
}

function hideExplanation() {
  popup.hidden = true;
  pinnedButton = null;
  shownButton = null;
  const openButtons = document.querySelectorAll('.help[aria-expanded="true"]');
  for (const button of openButtons) {
    button.setAttribute("aria-expanded", "false");
  }
}

/* The help button an event happened on, if any. Focus events can come from
   the window itself, which has no closest(). */
function helpButtonFrom(event) {
  if (!event.target.closest) {
    return null;
  }
  return event.target.closest(".help");
}

function handleMouseOver(event) {
  const button = helpButtonFrom(event);
  if (button && !pinnedButton) {
    showExplanation(button);
  }
}

function handleMouseOut(event) {
  if (helpButtonFrom(event) && !pinnedButton) {
    hideExplanation();
  }
}

function handleClick(event) {
  const button = helpButtonFrom(event);

  // A click anywhere else closes a pinned explanation.
  if (!button) {
    if (pinnedButton) {
      hideExplanation();
    }
    return;
  }

  // A second click on the same button closes it.
  if (pinnedButton === button) {
    hideExplanation();
    return;
  }

  hideExplanation();
  showExplanation(button);
  pinnedButton = button;
}

function handleKeyDown(event) {
  if (event.key === "Escape") {
    hideExplanation();
  }
}

/* Keeps the explanation beside its button while the page scrolls, and closes
   it once the button is off screen. Closing on any scroll lost the
   explanation to the smallest nudge of a finger, and to the scroll a browser
   makes to bring a tapped button into view. */
function followShownButton() {
  if (popup.hidden || !shownButton) {
    return;
  }
  const buttonBox = shownButton.getBoundingClientRect();
  const isOffScreen = buttonBox.bottom < 0 || buttonBox.top > innerHeight;
  if (!shownButton.isConnected || isOffScreen) {
    hideExplanation();
  } else {
    placePopupBy(shownButton);
  }
}

/* Called once. The listeners sit on the whole document, so buttons in cards
   that are redrawn later work without being wired again. */
export function wireHelpTips() {
  popup = document.createElement("div");
  popup.className = "help-pop";
  popup.setAttribute("role", "status");
  popup.hidden = true;
  document.body.appendChild(popup);

  document.addEventListener("mouseover", handleMouseOver);
  document.addEventListener("mouseout", handleMouseOut);
  document.addEventListener("focusin", handleMouseOver);
  document.addEventListener("focusout", handleMouseOut);
  document.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleKeyDown);
  addEventListener("scroll", followShownButton, { passive: true });
  addEventListener("resize", followShownButton);
}
