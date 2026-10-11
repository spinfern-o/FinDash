/* Four headline numbers for the chosen period, each compared with the run of
   months just before it. */

import { formatWholeMoney, formatPercent } from "../format.js";
import { helpButton } from "../help-tips.js";

/* "↑ 12.0% vs August 2026" under a number.

   The arrow always follows the number; the colour follows whether that is
   good news. lowerIsBetter keeps the two apart: costs rising 9% used to show
   in green, because every increase was treated as an improvement.

   inPoints compares two percentages by their difference ("2.1 pts") rather
   than by how much one grew relative to the other. */
function changeHtml(now, before, inPoints, lowerIsBetter, comparedWith) {
  if (before === undefined || before === null || !isFinite(before) || before === 0) {
    return "";
  }

  let difference;
  if (inPoints) {
    difference = now - before;
  } else {
    difference = ((now - before) / Math.abs(before)) * 100;
  }

  const wentUp = difference >= 0;
  let isGoodNews = wentUp;
  if (lowerIsBetter) {
    isGoodNews = !wentUp;
  }

  let amountText;
  if (inPoints) {
    amountText = Math.abs(difference).toFixed(1) + " pts";
  } else {
    amountText = formatPercent(Math.abs(difference));
  }

  let badNewsClass = "";
  if (!isGoodNews) {
    badNewsClass = " down";
  }
  let arrow = "↓";
  if (wentUp) {
    arrow = "↑";
  }
  return `<p class="chg${badNewsClass}">${arrow} ${amountText} <span>vs ${comparedWith}</span></p>`;
}

function statHtml(label, value, change) {
  return `<div class="stat"><p class="lab">${label}</p><p class="num">${value}</p>${change}</div>`;
}

export function headlineNumbersHtml(totals, previousTotals) {
  let revenueChange = "";
  let marginChange = "";
  let costsChange = "";
  let budgetChange = "";

  if (previousTotals) {
    const comparedWith = previousTotals.label;
    revenueChange = changeHtml(totals.revenue, previousTotals.revenue, false, false, comparedWith);
    if (previousTotals.revenue && totals.revenue) {
      marginChange = changeHtml(totals.margin, previousTotals.margin, true, false, comparedWith);
    }
    costsChange = changeHtml(totals.totalExpenses, previousTotals.totalExpenses, false, true, comparedWith);
    if (previousTotals.budget && totals.budget) {
      budgetChange = changeHtml(totals.budgetPercent, previousTotals.budgetPercent, true, true, comparedWith);
    }
  }

  let margin = "—";
  if (totals.revenue) {
    margin = formatPercent(totals.margin);
  }
  let budgetUsed = "—";
  if (totals.budget) {
    budgetUsed = formatPercent(totals.budgetPercent);
  }

  return `<div class="pulse">
    ${statHtml("Revenue", formatWholeMoney(totals.revenue), revenueChange)}
    ${statHtml("Net margin" + helpButton("netMargin"), margin, marginChange)}
    ${statHtml("Total costs" + helpButton("totalCosts"), formatWholeMoney(totals.totalExpenses), costsChange)}
    ${statHtml("Budget used" + helpButton("budgetUsed"), budgetUsed, budgetChange)}
  </div>`;
}
