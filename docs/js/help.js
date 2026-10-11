/* The help page's glossary, built from glossary.js: the same file behind the
   dashboard's "?" buttons, so the two pages can never define a word
   differently. */

import { GLOSSARY } from "./glossary.js";

const GROUPS = [
  { label: "The four cost groups", terms: ["direct", "operating", "variable", "fixed", "other"] },
  {
    label: "Results",
    terms: ["revenue", "totalCosts", "grossProfit", "netProfit", "netMargin", "shortfall", "ofRevenue"]
  },
  { label: "Budget", terms: ["budget", "budgetUsed", "typical", "swing"] },
  { label: "Forecast", terms: ["trend", "range"] }
];

function glossaryHtml() {
  let html = "";
  for (const group of GROUPS) {
    html += '<div class="group-label">' + group.label + "</div>";
    for (const key of group.terms) {
      const entry = GLOSSARY[key];
      if (entry) {
        html += '<dt id="term-' + key + '">' + entry.term + "</dt><dd>" + entry.text + "</dd>";
      }
    }
  }
  return html;
}

const termsList = document.getElementById("terms");
if (termsList) {
  termsList.innerHTML = glossaryHtml();
}
