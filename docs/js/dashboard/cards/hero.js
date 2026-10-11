/* "Did you make money?" - the first thing on the page, because it is the
   first thing an owner asks.

   The change is shown in money, not percent: net profit swinging from +5,420
   to -3,640 is "-167%", which says nothing a reader can use. */

import {
  formatMoney,
  formatWholeMoney,
  formatPercent,
  percentOf
} from "../format.js";

/* The change since the period before, e.g. "↓ $9,060 vs August 2026". */
function changeSinceHtml(totals, previousTotals) {
  if (!previousTotals) {
    return "";
  }

  const difference = Math.round(totals.netProfit - previousTotals.netProfit);
  if (difference === 0) {
    return `<span class="delta"><span>same as ${previousTotals.label}</span></span>`;
  }

  let downClass = "";
  let arrow = "↑";
  if (difference < 0) {
    downClass = " down";
    arrow = "↓";
  }
  return `<span class="delta${downClass}">${arrow} ${formatWholeMoney(Math.abs(difference))}
             <span>vs ${previousTotals.label}</span></span>`;
}

/* The answer in words. */
function answerHtml(totals) {
  const revenue = totals.revenue;
  const netProfit = totals.netProfit;

  if (!revenue && !totals.totalExpenses) {
    return "Nothing was recorded for this period.";
  }

  if (!revenue) {
    return `<b>Not known yet.</b> Costs are on file but no revenue is. Add your sales for
      this period to see whether you made money.`;
  }

  if (netProfit < 0) {
    return `<b>No.</b> Costs ran past revenue by ${formatMoney(-netProfit)}, which is
      ${formatPercent(percentOf(-netProfit, revenue))} of the ${formatMoney(revenue)} that came in.`;
  }

  if (netProfit === 0) {
    return `<b>You broke even.</b> Costs matched the ${formatMoney(revenue)} that came in.`;
  }

  return `<b>Yes.</b> You kept ${formatMoney(netProfit)} after every cost:
    ${formatPercent(percentOf(netProfit, revenue))} of the ${formatMoney(revenue)} that came in.`;
}

export function heroCardHtml(totals, previousTotals) {
  let figureClass = "";
  if (totals.netProfit < 0 && totals.revenue) {
    figureClass = " loss";
  }

  return `<section class="card hero">
    <div class="card-head"><div><p class="eyebrow">Did you make money?</p></div>
      <span class="scope">${totals.label}</span></div>
    <p class="figure${figureClass}">${formatMoney(totals.netProfit)}${changeSinceHtml(totals, previousTotals)}</p>
    <p class="note">${answerHtml(totals)}</p>
  </section>`;
}
