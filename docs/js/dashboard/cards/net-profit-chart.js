/* "Net profit by month": one bar per month on file, above or below zero.
   Months in the selected period are coloured; the rest stay grey for
   context. Each bar is a button that selects its month. */

import { formatWholeMoney } from "../format.js";
import { monthLabel, monthShortLabel } from "../months.js";

const CHART_HEIGHT = 112;

function columnHtml(month, index, isInPeriod, zeroLine, valueRange) {
  const netProfit = month.netProfit;
  const isNegative = netProfit < 0;
  const barHeight = (Math.abs(netProfit) / valueRange) * CHART_HEIGHT;

  // The amount is written beside the bars of the selected period only.
  let valueLabel = "";
  if (isInPeriod) {
    let labelTop;
    if (isNegative) {
      labelTop = zeroLine + barHeight + 4;
    } else {
      labelTop = zeroLine - barHeight - 20;
    }
    valueLabel = `<div class="val" style="top:${labelTop}px">${formatWholeMoney(netProfit)}</div>`;
  }

  let classes = "col";
  if (isInPeriod) {
    classes += " on";
  }
  if (isNegative) {
    classes += " neg";
  }

  let barAbove = "";
  let barBelow = "";
  if (isNegative) {
    barBelow = `<div class="mark" style="height:${barHeight}px"></div>`;
  } else {
    barAbove = `<div class="mark" style="height:${barHeight}px"></div>`;
  }

  return `<div class="${classes}">
      <div class="above" style="height:${zeroLine}px">
        ${barAbove}
      </div>
      <div class="below" style="height:${CHART_HEIGHT - zeroLine}px">
        ${barBelow}
      </div>
      ${valueLabel}
      <button type="button" class="hit" data-idx="${index}"
              aria-label="${monthLabel(month)}, net profit ${formatWholeMoney(netProfit)}"></button>
    </div>`;
}

export function netProfitChartHtml(allMonths, periodMonths) {
  const netProfits = allMonths.map(function (month) {
    return month.netProfit;
  });
  const highest = Math.max(0, ...netProfits);
  const lowest = Math.min(0, ...netProfits);
  const valueRange = (highest - lowest) || 1;
  const zeroLine = (highest / valueRange) * CHART_HEIGHT;

  let columns = "";
  let labels = "";
  allMonths.forEach(function (month, index) {
    const isInPeriod = periodMonths.includes(month);
    columns += columnHtml(month, index, isInPeriod, zeroLine, valueRange);

    let labelClass = "";
    if (isInPeriod) {
      labelClass = "on";
    }
    labels += `<div class="${labelClass}" data-idx="${index}"
     >${monthShortLabel(month)}</div>`;
  });

  let zeroTick = "";
  if (lowest < 0) {
    zeroTick = `<span style="top:${zeroLine}px">${formatWholeMoney(0)}</span>`;
  }

  return `<div class="trend-scroll">
            <div class="trend">
              ${columns}
              <div class="zero" style="top:${zeroLine}px"></div>
              <div class="axis-y">
                <span style="top:0">${formatWholeMoney(highest)}</span>
                ${zeroTick}
                <span style="top:${CHART_HEIGHT}px">${formatWholeMoney(lowest)}</span>
              </div>
            </div>
            <div class="trend-labels">${labels}</div>
          </div>`;
}

/* With many months the row of bars scrolls sideways; keep the selected month
   in the middle of the view. */
export function scrollSelectedMonthIntoView() {
  const scrollBox = document.querySelector(".trend-scroll");
  const selectedColumn = document.querySelector(".trend .col.on");
  if (!scrollBox || !selectedColumn) {
    return;
  }
  if (scrollBox.scrollWidth <= scrollBox.clientWidth) {
    return;   // everything fits; nothing to scroll
  }
  scrollBox.scrollLeft = selectedColumn.offsetLeft - (scrollBox.clientWidth - selectedColumn.offsetWidth) / 2;
}
