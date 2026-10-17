/* "Revenue vs costs": revenue beside total costs, month by month.

   Two bars on one scale: the gap between them IS the profit, which is what a
   reader is looking for. Each month's net profit is written above its pair
   and the figures sit under the month name, so the numbers can be read
   without hovering. */

import { formatWholeMoney } from "../format.js";
import { monthLabel, monthShortLabel } from "../months.js";

const CHART_HEIGHT = 150;

function pairHtml(month, index, highest) {
  const revenueHeight = (month.revenue / highest) * CHART_HEIGHT;
  const costsHeight = (month.totalExpenses / highest) * CHART_HEIGHT;

  let lossClass = "";
  if (month.netProfit < 0) {
    lossClass = " loss";
  }

  return `<div class="pair">
      <div class="net${lossClass}">${formatWholeMoney(month.netProfit)}</div>
      <button type="button" class="bar2 bar-rev" style="height:${revenueHeight}px"
              data-idx="${index}"
              aria-label="${monthLabel(month)} revenue ${formatWholeMoney(month.revenue)}"></button>
      <button type="button" class="bar2 bar-exp" style="height:${costsHeight}px"
              data-idx="${index}"
              aria-label="${monthLabel(month)} total costs ${formatWholeMoney(month.totalExpenses)}"></button>
    </div>`;
}

export function revenueVsCostsChartHtml(allMonths, periodMonths) {
  const largestPerMonth = allMonths.map(function (month) {
    return Math.max(month.revenue, month.totalExpenses);
  });
  const highest = Math.max(1, ...largestPerMonth);

  let pairs = "";
  let names = "";
  let figures = "";
  allMonths.forEach(function (month, index) {
    pairs += pairHtml(month, index, highest);

    let nameClass = "";
    if (periodMonths.includes(month)) {
      nameClass = "on";
    }
    names += `<div class="${nameClass}" data-idx="${index}">${monthShortLabel(month)}</div>`;
    figures += `<div>${formatWholeMoney(month.revenue)} &middot; ${formatWholeMoney(month.totalExpenses)}</div>`;
  });

  return `<div class="pair-scroll">
            <div class="pairs">
              ${pairs}
              <div class="axis-y">
                <span style="top:0">${formatWholeMoney(highest)}</span>
                <span style="top:${CHART_HEIGHT}px">${formatWholeMoney(0)}</span>
              </div>
            </div>
            <div class="pair-labels">${names}</div>
            <div class="pair-vals">${figures}</div>
          </div>
          <ul class="key">
            <li><i class="bar-rev"></i><b>Revenue</b></li>
            <li><i class="bar-exp"></i><b>Total costs</b></li>
            <li><b>Figure above each pair:</b> net profit</li>
          </ul>`;
}
