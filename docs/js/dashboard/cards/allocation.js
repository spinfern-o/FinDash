/* "Where revenue goes": one bar split into the four cost groups and profit.

   The bar is scaled to whichever is larger, revenue or total costs, so a
   loss month cannot run off the end. When costs outrun revenue, a marker
   shows where the revenue ran out. */

import { formatMoney, formatPercent, percentOf } from "../format.js";
import { COST_GROUP_ROWS } from "../cost-groups.js";
import { helpButton } from "../help-tips.js";

function segmentHtml(className, width, name, amount, revenue) {
  const money = formatMoney(amount);
  const share = formatPercent(percentOf(amount, revenue));
  return `<button type="button" class="seg ${className}" style="flex:0 0 ${width}%"
         data-name="${name}" data-amt="${money}" data-share="${share}"
         aria-label="${name}: ${money}, ${share} of revenue"></button>`;
}

export function allocationHtml(totals) {
  const netProfit = totals.netProfit;
  const isLoss = netProfit < 0;
  const barLength = Math.max(totals.revenue, totals.totalExpenses) || 1;

  let segments = "";
  for (const row of COST_GROUP_ROWS) {
    const amount = totals[row.totalKey];
    if (amount > 0) {
      segments += segmentHtml(`seg-${row.slot}`, percentOf(amount, barLength), row.label, amount, totals.revenue);
    }
  }
  if (!isLoss && netProfit > 0) {
    segments += segmentHtml("seg-rest", percentOf(netProfit, barLength), "Profit", netProfit, totals.revenue);
  }

  // On a loss month the costs run past the revenue line. The stretch beyond
  // it is the shortfall, marked under the bar rather than stacked into it.
  let revenueMarker = "";
  if (isLoss) {
    const revenueAt = percentOf(totals.revenue, barLength);
    revenueMarker = `<div class="revmark" style="left:${revenueAt}%"><span>Revenue</span></div>
       <div class="shortspan" style="left:${revenueAt}%;right:0"></div>`;
  }

  let legend = "";
  for (const row of COST_GROUP_ROWS) {
    const share = formatPercent(percentOf(totals[row.totalKey], totals.revenue));
    legend += `<li><i class="seg-${row.slot}"></i><b>${row.label}</b>${helpButton(row.group)} ${share}</li>`;
  }
  if (isLoss) {
    const shortfallShare = formatPercent(percentOf(Math.abs(netProfit), totals.revenue));
    legend += `<li><i class="seg-short"></i><b>Shortfall</b>${helpButton("shortfall")} ${shortfallShare}</li>`;
  } else {
    const profitShare = formatPercent(percentOf(netProfit, totals.revenue));
    legend += `<li><i class="seg-rest"></i><b>Profit</b> ${profitShare}</li>`;
  }

  return `
    <div class="barwrap">
      <div class="bar">${segments}</div>
      ${revenueMarker}
      <div class="tip" id="tip"></div>
    </div>
    <ul class="key">${legend}</ul>`;
}

/* The readout above the bar when a piece of it is hovered, focused or
   tapped. The same numbers are in the legend and the report below, so the
   readout only ever adds convenience. Wired again after every redraw. */
export function wireAllocationTooltip() {
  const barWrap = document.querySelector(".barwrap");
  const tooltip = document.getElementById("tip");
  if (!barWrap || !tooltip) {
    return;
  }
  const segments = barWrap.querySelectorAll(".seg");

  function showFor(segment) {
    const segmentBox = segment.getBoundingClientRect();
    const wrapBox = barWrap.getBoundingClientRect();
    tooltip.innerHTML = `<b>${segment.dataset.name}</b> &middot; ${segment.dataset.amt}` +
      `<br>${segment.dataset.share} of revenue`;
    tooltip.style.left = (segmentBox.left - wrapBox.left + segmentBox.width / 2) + "px";
    tooltip.style.top = "-8px";
    tooltip.classList.add("on");
  }

  function hide() {
    tooltip.classList.remove("on");
  }

  // Touch screens get neither hover nor reliable focus-on-tap, so a tap
  // toggles the same readout a mouse would show on hover.
  function toggleFor(segment) {
    if (segment.classList.contains("tip-on")) {
      hide();
    } else {
      showFor(segment);
    }
    for (const other of segments) {
      other.classList.toggle("tip-on", other === segment);
    }
  }

  for (const segment of segments) {
    segment.addEventListener("mouseenter", function () {
      showFor(segment);
    });
    segment.addEventListener("focus", function () {
      showFor(segment);
    });
    segment.addEventListener("mouseleave", hide);
    segment.addEventListener("blur", hide);
    segment.addEventListener("click", function () {
      toggleFor(segment);
    });
  }
}
