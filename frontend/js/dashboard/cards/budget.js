/* "Against budget": total costs in the period against the spending budget. */

import { formatMoney, formatPercent } from "../format.js";

/* The gauge runs to 150% of the budget, so an overspend still has room. */
const GAUGE_MAXIMUM_PERCENT = 150;

export function budgetGaugeHtml(totals) {
  if (!totals.budget) {
    return `<p class="none">No budget on file for ${totals.label}. Add a Budget column (the most you plan
            to spend each month) to compare spending against a plan.</p>`;
  }

  const percentUsed = totals.budgetPercent;
  const amountOver = totals.budgetSpent - totals.budget;
  const isOver = percentUsed > 100;

  let partialNote = "";
  if (totals.budgetMonths < totals.months.length) {
    partialNote = `<p class="gauge-note">Only ${totals.budgetMonths} of ${totals.months.length} months have a budget,
       so only those months are compared.</p>`;
  }

  let usedClass = "";
  let fillClass = "";
  if (isOver) {
    usedClass = "neg";
    fillClass = " over";
  }

  const fillWidth = (Math.min(percentUsed, GAUGE_MAXIMUM_PERCENT) / GAUGE_MAXIMUM_PERCENT) * 100;
  const budgetMarkLeft = (100 / GAUGE_MAXIMUM_PERCENT) * 100;

  let leftOrOver;
  if (amountOver > 0) {
    leftOrOver = formatMoney(amountOver) + " over";
  } else {
    leftOrOver = formatMoney(-amountOver) + " left";
  }

  return `<div class="gaugeline">
      <span>Budget <strong>${formatMoney(totals.budget)}</strong></span>
      <span><strong class="${usedClass}">${formatPercent(percentUsed)} used</strong></span>
    </div>
    <div class="gauge" role="img" aria-label="${formatPercent(percentUsed)} of budget used">
      <div class="gauge-fill${fillClass}" style="width:${fillWidth}%"></div>
      <div class="gauge-mark" style="left:${budgetMarkLeft}%"></div>
    </div>
    <div class="gauge-foot">
      <span>${formatMoney(totals.budgetSpent)} spent</span>
      <span>${leftOrOver}</span>
    </div>${partialNote}`;
}
