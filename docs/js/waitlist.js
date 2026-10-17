/* The waitlist page: fills the form's choices from waitlist-options.js,
   checks the answers, and sends them to /api/waitlist. Once someone has
   joined, the form is replaced by a thank-you. Nothing is kept in the
   browser. */

import {
  BUSINESS_TYPES, LANGUAGES, LANGUAGE_GROUPS, INVOICE_COUNTS, COUNTRY_SUGGESTIONS, TEXT_LIMITS
} from "./waitlist-options.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const form = document.getElementById("waitlist-form");
const submitButton = document.getElementById("submit");

function element(id) {
  return document.getElementById(id);
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, function (character) {
    return HTML_ESCAPES[character];
  });
}

/* A select's options, with a first one asking for a choice. */
function selectOptionsHtml(options, prompt) {
  let html = `<option value="">${prompt}</option>`;
  for (const option of options) {
    html += `<option value="${option.value}">${escapeHtml(option.label)}</option>`;
  }
  return html;
}

/* One row of the languages table: the language, then a tick box for each
   of you, your staff and your supplier invoices. */
function languageRowHtml(language) {
  let ownName = "";
  if (language.own) {
    ownName = ` <span class="own-name" lang="${language.value}">${language.own}</span>`;
  }
  let boxes = "";
  for (const group of LANGUAGE_GROUPS) {
    boxes += `<td><input type="checkbox" name="${group.key}" value="${language.value}"
      aria-label="${escapeHtml(language.label)}: ${escapeHtml(group.label)}"></td>`;
  }
  return `<tr><th scope="row">${escapeHtml(language.label)}${ownName}</th>${boxes}</tr>`;
}

function fillChoices() {
  element("business-type").innerHTML = selectOptionsHtml(BUSINESS_TYPES, "Choose one");
  element("invoices-per-month").innerHTML = selectOptionsHtml(INVOICE_COUNTS, "Choose one");

  let countries = "";
  for (const country of COUNTRY_SUGGESTIONS) {
    countries += `<option value="${escapeHtml(country)}"></option>`;
  }
  element("countries").innerHTML = countries;

  const headings = form.querySelector(".language-table thead tr");
  for (const group of LANGUAGE_GROUPS) {
    headings.insertAdjacentHTML("beforeend", `<th scope="col">${escapeHtml(group.label)}</th>`);
  }
  let rows = "";
  for (const language of LANGUAGES) {
    rows += languageRowHtml(language);
  }
  form.querySelector(".language-table tbody").innerHTML = rows;

  element("other-languages").maxLength = TEXT_LIMITS.otherLanguages;
  element("hardest-part").maxLength = TEXT_LIMITS.hardestPart;
  element("country").maxLength = TEXT_LIMITS.country;
  element("email").maxLength = TEXT_LIMITS.email;
}

/* The languages ticked in one column. */
function tickedLanguages(groupKey) {
  const ticked = [];
  for (const box of form.querySelectorAll(`input[name="${groupKey}"]:checked`)) {
    ticked.push(box.value);
  }
  return ticked;
}

function answersFromForm() {
  const answers = {
    email: element("email").value.trim(),
    businessType: element("business-type").value,
    country: element("country").value.trim(),
    otherLanguages: element("other-languages").value.trim(),
    invoicesPerMonth: element("invoices-per-month").value,
    hardestPart: element("hardest-part").value.trim(),
    website: element("website").value
  };
  for (const group of LANGUAGE_GROUPS) {
    answers[group.key] = tickedLanguages(group.key);
  }
  return answers;
}

/* The first answer that needs fixing, as { field, message }, or null. The
   server checks them all again. */
function problemWithAnswers(answers) {
  if (!EMAIL_PATTERN.test(answers.email)) {
    return { field: "email", message: "Enter a valid email address." };
  }
  if (!answers.businessType) {
    return { field: "businessType", message: "Choose what kind of business you run." };
  }
  if (!answers.country) {
    return { field: "country", message: "Enter the country your business is in." };
  }
  if (!answers.invoicesPerMonth) {
    return { field: "invoicesPerMonth", message: "Choose about how many supplier invoices you get a month." };
  }
  return null;
}

/* The control on the page for an answer, by the answer's name. */
function controlFor(field) {
  return form.querySelector(`[name="${field}"]`);
}

function showMessage(text, kind) {
  const box = element("message");
  box.hidden = !text;
  box.className = "message";
  if (kind) {
    box.className += " " + kind;
  }
  box.textContent = text;
}

function clearInvalidMarks() {
  for (const control of form.querySelectorAll("[aria-invalid]")) {
    control.removeAttribute("aria-invalid");
  }
}

/* Says what to fix, and puts the cursor there. */
function showProblem(problem) {
  showMessage(problem.message, "bad");
  const control = controlFor(problem.field);
  if (control) {
    control.setAttribute("aria-invalid", "true");
    control.focus();
  }
}

function showJoined(email) {
  form.hidden = true;
  showMessage("", "");
  element("joined-email").textContent = email;
  element("joined").hidden = false;
  element("joined").scrollIntoView({ block: "nearest" });
}

async function sendAnswers(event) {
  event.preventDefault();
  clearInvalidMarks();
  const answers = answersFromForm();
  const problem = problemWithAnswers(answers);
  if (problem) {
    showProblem(problem);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Joining…";
  let answer = {};
  let ok = false;
  try {
    const response = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers)
    });
    answer = await response.json();
    ok = response.ok;
  } catch {
    answer = { error: "Couldn't reach FinDash. Check your connection and try again." };
  }
  submitButton.disabled = false;
  submitButton.textContent = "Join the waitlist";

  if (ok) {
    showJoined(answers.email);
    return;
  }
  showProblem({ field: answer.field, message: answer.error || "That didn't work. Try again in a moment." });
}

fillChoices();
form.addEventListener("submit", sendAnswers);
