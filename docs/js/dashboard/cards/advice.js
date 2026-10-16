/* "What to do next": advice written by Claude from the monthly totals.

   This is the one place figures leave the browser, and only when the owner
   presses the button. It covers every month on file (up to the service's
   limit) rather than the period on screen: limited to one month it missed
   the months that went wrong.

   The answer is kept, together with exactly what was sent, so it is still
   there after a redraw or on the next visit. Each press is a paid request;
   nobody should have to press again to see advice they already have. */

import { state } from "../state.js";
import { escapeHtml, unescapeHtml, formatLocalDate } from "../format.js";
import { monthLabel, describeMonths, allMonthsLabel } from "../months.js";
import { cardHtml } from "./card.js";
import { loggedInUser } from "../account.js";

export const ADVICE_KEY = "findash-briefing";
const MAXIMUM_MONTHS_SENT = 36;   // the advice service's own limit

/* Only lists of text survive: the storage is this page's own, but anything
   not in the shape this page wrote is dropped rather than drawn. */
function textItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(function (item) {
    return typeof item === "string";
  });
}

export function loadSavedAdvice() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADVICE_KEY));
    if (!saved || typeof saved.key !== "string" || !saved.result) {
      return null;
    }
    return {
      key: saved.key,
      at: saved.at,
      result: {
        opportunities: textItems(saved.result.opportunities),
        risks: textItems(saved.result.risks),
        actions: textItems(saved.result.actions)
      }
    };
  } catch {
    return null;   // nothing saved, or storage is blocked
  }
}

function saveAdvice(advice) {
  try {
    localStorage.setItem(ADVICE_KEY, JSON.stringify(advice));
  } catch {
    // Storage is blocked; the advice still shows until the page is closed.
  }
}

function monthsToSend() {
  return state.data.months.slice(-MAXIMUM_MONTHS_SENT);
}

/* What is sent: only the totals already on screen. Rebuilt field by field so
   nothing else on a month can travel along by accident. */
function adviceRequest() {
  return {
    currency: state.currency,
    months: monthsToSend().map(function (month) {
      return {
        month: unescapeHtml(monthLabel(month)),
        revenue: month.revenue,
        directExpenses: month.directExpenses,
        operatingExpenses: month.operatingExpenses,
        variableOverhead: month.variableOverhead,
        fixedOverhead: month.fixedOverhead,
        totalExpenses: month.totalExpenses,
        netProfit: month.netProfit,
        budget: month.budget
      };
    })
  };
}

export function adviceCardHtml() {
  const sentMonths = monthsToSend();
  const name = describeMonths(sentMonths);
  let scope = `Latest ${sentMonths.length} months`;
  if (sentMonths.length === state.data.months.length) {
    scope = allMonthsLabel();
  }

  return cardHtml("wide", "What to do next", "Advice written by Claude from your monthly totals", scope,
    `<div class="brief-head no-print">
       <p class="brief-note" id="brief-note">Pressing this sends the monthly totals for ${name}: revenue,
         the four cost groups, net profit and budget. No line items, no names, not your file.</p>
       <button type="button" class="btn primary" id="brief-go">Get advice on ${name}</button>
     </div>
     <div class="brief" id="brief"></div>`);
}

function adviceListHtml(className, title, items) {
  if (!items.length) {
    return "";
  }
  let listItems = "";
  for (const item of items) {
    listItems += `<li>${escapeHtml(item)}</li>`;
  }
  return `<h3>${title}</h3><ul class="${className}">${listItems}</ul>`;
}

function showAdvice(output, advice, monthsName) {
  const result = advice.result;
  const lists = adviceListHtml("up", "Opportunities", result.opportunities) +
    adviceListHtml("risk", "Risks", result.risks) +
    adviceListHtml("act", "Do next", result.actions);

  let body = lists;
  if (!lists) {
    body = `<p class="brief-note">Nothing stood out in these months.</p>`;
  }

  let writtenOn = "";
  if (advice.at) {
    writtenOn = "on " + formatLocalDate(new Date(advice.at)) + " ";
  }

  output.innerHTML = body +
    `<p class="brief-note stamp-note">Written ${writtenOn}from your figures for ${monthsName}.
     Saved here, so you don't need to ask again.</p>`;
}

const NEEDS_LOGIN_HTML = `<p class="brief-note">Advice needs a free account.
  <a href="/login?next=/dashboard">Log in or create one</a>, then press the button again.</p>`;

/* The reason the server gave for a failed request, without its full stop
   (one is added where it is shown), or the status when it gave none. */
async function errorFrom(response) {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string" && body.error) {
      return body.error.replace(/\.$/, "");
    }
  } catch {
    // Not JSON: an error page. The status says enough.
  }
  return "the advice service returned " + response.status;
}

/* This month's advice is used up: the server's words, with its mention of
   the Pricing page made a link to it when Plus is on sale here. */
async function limitReachedHtml(response) {
  let body = {};
  try {
    body = await response.json();
  } catch {
    // Not JSON: the status says enough.
  }
  let text = escapeHtml(body.error || "This month's advice is used up.");
  if (body.upgrade) {
    text = text.replace("the Pricing page", '<a href="/pricing">the Pricing page</a>');
  }
  return `<p class="brief-note">${text}</p>`;
}

function markAsAnswered(button) {
  button.textContent = "Ask again";
  button.classList.remove("primary");
}

/* Wired again after every redraw. */
export function wireAdviceButton() {
  const button = document.getElementById("brief-go");
  const output = document.getElementById("brief");
  if (!button || !output) {
    return;
  }

  // The exact text that would be sent doubles as the key the answer is
  // saved under: different figures, different key.
  const requestBody = JSON.stringify(adviceRequest());
  const monthsName = describeMonths(monthsToSend());

  if (state.savedAdvice && state.savedAdvice.key === requestBody) {
    showAdvice(output, state.savedAdvice, monthsName);
    markAsAnswered(button);
  }

  button.addEventListener("click", async function () {
    // Each request costs money, so advice is only for someone logged in,
    // within a monthly allowance (lib/ai-access.js on the server checks both).
    if (!(await loggedInUser())) {
      output.innerHTML = NEEDS_LOGIN_HTML;
      return;
    }

    button.disabled = true;
    button.textContent = "Reading…";
    output.innerHTML = "";

    try {
      const response = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        credentials: "same-origin"
      });
      if (response.status === 401) {
        output.innerHTML = NEEDS_LOGIN_HTML;
        button.textContent = "Try again";
        return;
      }
      if (response.status === 429) {
        output.innerHTML = await limitReachedHtml(response);
        button.textContent = "Try again";
        return;
      }
      if (!response.ok) {
        throw new Error(await errorFrom(response));
      }

      const answer = await response.json();
      state.savedAdvice = {
        key: requestBody,
        at: new Date().toISOString(),
        result: {
          opportunities: answer.opportunities || [],
          risks: answer.risks || [],
          actions: answer.actions || []
        }
      };
      saveAdvice(state.savedAdvice);
      showAdvice(output, state.savedAdvice, monthsName);
      markAsAnswered(button);
    } catch (error) {
      output.innerHTML = `<p class="brief-note">Could not get advice: ${escapeHtml(error.message)}.
        Your figures were not stored.</p>`;
      button.textContent = "Try again";
    } finally {
      button.disabled = false;
    }
  });
}
