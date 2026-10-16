/* Drawing the dashboard: the month buttons, the heading, and every card.

   showFigures() is the single way in for data. Anything that produces the
   same shape as data.json - { generated, months } - can be shown with it. */

import { state } from "./state.js";
import { formatMoney, formatLocalDate } from "./format.js";
import { monthLabel, allMonthsLabel } from "./months.js";
import { monthsInPeriod, monthsBeforePeriod, totalsForMonths, periodLabel } from "./periods.js";
import { cardHtml } from "./cards/card.js";
import { heroCardHtml } from "./cards/hero.js";
import { headlineNumbersHtml } from "./cards/headline-numbers.js";
import { prioritiesHtml } from "./cards/priorities.js";
import { budgetGaugeHtml } from "./cards/budget.js";
import { allocationHtml, wireAllocationTooltip } from "./cards/allocation.js";
import { netProfitChartHtml, scrollSelectedMonthIntoView } from "./cards/net-profit-chart.js";
import { revenueVsCostsChartHtml } from "./cards/revenue-vs-costs-chart.js";
import { reportHtml } from "./cards/report.js";
import { estimatorHtml } from "./cards/estimator.js";
import { forecastCardHtml, wireForecastButton, MINIMUM_MONTHS_FOR_TREND } from "./cards/forecast.js";
import { adviceCardHtml, wireAdviceButton } from "./cards/advice.js";
import { itemLogCardHtml } from "./cards/item-log.js";
import { helpButton } from "./help-tips.js";

/* Shows a new set of figures, opening on the latest month. A model forecast
   belongs to the months it was made from, so new figures drop it. */
export function showFigures(figures) {
  state.data = figures;
  state.modelForecast = null;
  drawMonthButtons();

  const footer = document.getElementById("footer");
  footer.textContent = state.sourceNote;
  footer.classList.remove("notice");

  // The latest month, not the oldest. A dashboard opens on the most recent
  // period: opening on July hid the August and September budget breaches.
  selectMonth(state.data.months.length - 1);
}

/* Months are addressed by their position in data.months, not by month
   number: with more than a year on file there are two Julys, and looking one
   up by number always found the first. */
function drawMonthButtons() {
  let buttons = "";
  state.data.months.forEach(function (month, index) {
    buttons += `<li><button type="button" data-idx="${index}">${monthLabel(month)}</button></li>`;
  });
  document.getElementById("months").innerHTML = buttons;
}

export function selectMonth(index) {
  const months = state.data.months;
  state.activeMonth = months[index] || months[months.length - 1];

  const periodMonths = monthsInPeriod(state.activeMonth, state.period);
  for (const button of document.querySelectorAll("#months button")) {
    const month = months[Number(button.dataset.idx)];
    const isSelected = month === state.activeMonth;
    button.setAttribute("aria-pressed", isSelected);
    button.classList.toggle("in-range", !isSelected && periodMonths.includes(month));
  }
  drawDashboard();
}

function plural(count, word) {
  if (count > 1) {
    return word + "s";
  }
  return word;
}

function drawHeading(totals, periodMonths) {
  const allMonths = state.data.months;
  document.getElementById("showing").innerHTML = totals.label;

  let subheading;
  if (state.period === "month") {
    subheading = `${allMonths.length} ${plural(allMonths.length, "month")} on file`;
  } else {
    subheading = `${periodLabel(state.period)} through ${monthLabel(state.activeMonth)} · ` +
      `${periodMonths.length} ${plural(periodMonths.length, "month")}`;
  }
  document.getElementById("showing-sub").innerHTML = subheading;

  document.getElementById("print-meta").textContent =
    `FinDash report · printed ${formatLocalDate(new Date())} · amounts in ${state.currency}`;
}

function invoicesCountedIn(months) {
  let count = 0;
  for (const month of months) {
    count += month.invoiceCount || 0;
  }
  return count;
}

function reportSubtitle(periodMonths) {
  let subtitle = "Every line in the period, in money and as a share of revenue";
  const invoiceCount = invoicesCountedIn(periodMonths);
  if (invoiceCount) {
    subtitle += ` &middot; includes ${invoiceCount} ${plural(invoiceCount, "invoice")} added from photos`;
  }
  return subtitle;
}

/* The cards follow the questions an owner asks, in the order they ask them:
   did I make money, what needs my attention, am I within budget, how is it
   trending, show me the detail. The forecast and the advice come last of
   the money cards; they are the only ones that guess rather than report.
   What the owner buys, item by item, follows them. */
export function drawDashboard() {
  const activeMonth = state.activeMonth;
  const allMonths = state.data.months;

  const periodMonths = monthsInPeriod(activeMonth, state.period);
  const totals = totalsForMonths(periodMonths);
  const earlierMonths = monthsBeforePeriod(activeMonth, state.period);
  let previousTotals = null;
  if (earlierMonths.length) {
    previousTotals = totalsForMonths(earlierMonths);
  }

  drawHeading(totals, periodMonths);

  let estimatorCard = "";
  if (allMonths.length >= 2) {
    estimatorCard = cardHtml("wide", "Budget estimator",
      "What next month should be budgeted at, from the months on file",
      `From ${allMonths.length} months`, estimatorHtml(allMonths));
  }

  let forecastCard = "";
  if (allMonths.length >= MINIMUM_MONTHS_FOR_TREND) {
    forecastCard = forecastCardHtml();
  }

  document.getElementById("sheet").innerHTML = `
    ${heroCardHtml(totals, previousTotals)}
    ${headlineNumbersHtml(totals, previousTotals)}
    <div class="grid">
      ${cardHtml("wide", "What needs attention",
        "Losses, budget overruns and unusual costs, read straight off your figures. Nothing is sent anywhere.",
        allMonthsLabel(), prioritiesHtml(allMonths))}

      ${cardHtml("", "Against budget", "Total costs against the spending budget you set" + helpButton("budget"),
        totals.label, budgetGaugeHtml(totals))}
      ${cardHtml("", "Where revenue goes", `Each cost group as a share of ${formatMoney(totals.revenue)} in revenue`,
        totals.label, allocationHtml(totals))}

      ${cardHtml("", "Net profit by month", `Every month on file, with ${totals.label} highlighted`,
        allMonthsLabel(), netProfitChartHtml(allMonths, periodMonths))}
      ${cardHtml("", "Revenue vs costs", "The gap between the bars is that month's profit",
        allMonthsLabel(), revenueVsCostsChartHtml(allMonths, periodMonths))}

      ${cardHtml("wide", "Financial report", reportSubtitle(periodMonths), totals.label, reportHtml(totals))}

      ${estimatorCard}

      ${forecastCard}

      ${adviceCardHtml()}

      ${itemLogCardHtml()}
    </div>`;

  wireAdviceButton();
  wireForecastButton(drawDashboard);
  wireAllocationTooltip();
  scrollSelectedMonthIntoView();
}

/* Clicks inside the cards. #sheet is never replaced, only refilled, so this
   one listener covers every redraw. */
function handleSheetClick(event) {
  // Chart bars and month labels carry their position in data.months as
  // data-idx (two Julys on file have the same month number, so a number
  // cannot identify one).
  const monthTarget = event.target.closest("[data-idx]");
  if (monthTarget) {
    selectMonth(Number(monthTarget.dataset.idx));
    return;
  }

  // A forecast point shows or hides its amount.
  const point = event.target.closest("[data-fan-pt]");
  if (point) {
    const label = document.getElementById("fan-lbl-" + point.dataset.fanPt);
    if (label) {
      const isOpen = label.classList.toggle("on");
      point.setAttribute("aria-expanded", String(isOpen));
    }
  }
}

function handleMonthButtonClick(event) {
  const button = event.target.closest("button");
  if (button) {
    selectMonth(Number(button.dataset.idx));
  }
}

/* Called once. The month list's buttons are redrawn for new figures, but the
   list itself stays, so its listener is added only once; adding it on every
   redraw stacked handlers and one click redrew the page many times. */
export function wireMonthSelection() {
  document.getElementById("sheet").addEventListener("click", handleSheetClick);
  document.getElementById("months").addEventListener("click", handleMonthButtonClick);
}
