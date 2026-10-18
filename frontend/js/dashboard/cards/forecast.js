/* "Where this is heading": net profit so far, and where it is going.

   Two ways to the same picture. On the page, a straight line is fitted
   through monthly net profit (least squares) with a range around it: free,
   instant, private, and with a dozen points about as good as anything.
   Chronos-Bolt, a forecasting model, is the upgrade: it returns low,
   expected and high figures directly, from a model trained on far more
   series than this business has months.

   Below six months there is no amount at all. Three points put "Projected
   -$8,100 next month" with a range down to -$18,180 on screen: a frightening
   number with nothing behind it. The direction is still shown. */

import { state } from "../state.js";
import { formatWholeMoney, escapeHtml } from "../format.js";
import { yearOf, allMonthsLabel } from "../months.js";
import { loadCapabilities } from "../capabilities.js";
import { helpButton } from "../help-tips.js";
import { cardHtml } from "./card.js";

export const MINIMUM_MONTHS_FOR_TREND = 3;     // below this there is no line to fit; no card
export const MINIMUM_MONTHS_FOR_AMOUNTS = 6;   // below this the line is shown but no amount
const MONTHS_AHEAD = 3;
/* Returned instead of a projection when the model was refused for a reason
   the reader can do something about: log in, or wait until tomorrow. */
const NEEDS_ACCOUNT = "needs-account";
const CHART_HEIGHT = 150;

/* A least-squares line through `values`, carried `monthsAhead` steps on,
   with a range around it. Null when there are too few values. */
export function trendForecast(values, monthsAhead) {
  const count = values.length;
  if (count < MINIMUM_MONTHS_FOR_TREND) {
    return null;
  }

  // Position 0, 1, 2... along the bottom; the values up the side.
  let positionTotal = 0;
  let valueTotal = 0;
  for (let position = 0; position < count; position++) {
    positionTotal += position;
    valueTotal += values[position];
  }
  const averagePosition = positionTotal / count;
  const averageValue = valueTotal / count;

  let sumOfProducts = 0;
  let sumOfSquares = 0;
  for (let position = 0; position < count; position++) {
    sumOfProducts += (position - averagePosition) * (values[position] - averageValue);
    sumOfSquares += (position - averagePosition) ** 2;
  }
  let slope = 0;
  if (sumOfSquares) {
    slope = sumOfProducts / sumOfSquares;
  }
  const intercept = averageValue - slope * averagePosition;

  // How far the months strayed from the line sets the width of the range,
  // so volatile months widen it honestly rather than the range being a
  // fixed decoration.
  let squaredErrors = 0;
  for (let position = 0; position < count; position++) {
    const error = values[position] - (intercept + slope * position);
    squaredErrors += error * error;
  }
  const standardError = Math.sqrt(squaredErrors / Math.max(1, count - 2));

  const low = [];
  const predicted = [];
  const high = [];
  for (let step = 1; step <= monthsAhead; step++) {
    const position = count - 1 + step;
    const onTheLine = intercept + slope * position;
    // Wider the further out it goes: three months ahead is less certain
    // than one.
    const distance = ((position - averagePosition) ** 2) / (sumOfSquares || 1);
    const spread = 1.96 * standardError * Math.sqrt(1 + 1 / count + distance);
    low.push(onTheLine - spread);
    predicted.push(onTheLine);
    high.push(onTheLine + spread);
  }

  return {
    low: low,
    predicted: predicted,
    high: high,
    slope: slope,
    model: "local trend",
    thin: count < MINIMUM_MONTHS_FOR_AMOUNTS,
    points: count
  };
}

/* "Oct '26" for the month `monthsLater` after `lastMonth`. Real calendar
   months, not "+1/+2/+3": a reader should see at a glance that the
   projection covers Oct, Nov and Dec. The year is in its own span because a
   phone hides it, where six "Mmm 'yy" labels do not fit. */
function futureMonthLabel(lastMonth, monthsLater) {
  const monthCount = lastMonth.monthNum + monthsLater;
  const monthNumber = ((monthCount - 1) % 12) + 1;
  const year = yearOf(lastMonth) + Math.floor((monthCount - 1) / 12);
  const name = new Date(Date.UTC(2000, monthNumber - 1, 1))
    .toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${name}<span class="yr"> '${String(year).slice(2)}</span>`;
}

function pastMonthLabel(month) {
  return `${month.month.slice(0, 3)}<span class="yr"> '${String(yearOf(month)).slice(2)}</span>`;
}

/* Turns a list of [x, y] points into the "x,y x,y" text SVG expects. */
function svgPoints(points) {
  return points.map(function (point) {
    return `${point[0]},${point[1]}`;
  }).join(" ");
}

export function forecastChartHtml(months) {
  const netProfits = months.map(function (month) {
    return month.netProfit;
  });
  const localForecast = trendForecast(netProfits, MONTHS_AHEAD);
  if (!localForecast) {
    return "";
  }

  // With a thin history only the direction is shown, so the model's numbers
  // are not used either.
  const isThin = localForecast.thin;
  let forecast = localForecast;
  if (!isThin && state.modelForecast) {
    forecast = state.modelForecast;
  }

  // The vertical scale covers every value that is drawn.
  let drawnValues;
  if (isThin) {
    drawnValues = [...netProfits, ...forecast.predicted];
  } else {
    drawnValues = [...netProfits, ...forecast.low, ...forecast.high];
  }
  const top = Math.max(...drawnValues, 0);
  const bottom = Math.min(...drawnValues, 0);
  const valueRange = (top - bottom) || 1;

  function yFor(value) {
    return CHART_HEIGHT - ((value - bottom) / valueRange) * CHART_HEIGHT;
  }

  // Each month (past and future) gets an equal column; points sit in the
  // middle of their column, as a percentage of the width.
  const columnCount = months.length + forecast.predicted.length;
  const columnWidth = 100 / columnCount;
  function xFor(columnIndex) {
    return (columnIndex + 0.5) * columnWidth;
  }
  function futureColumn(stepIndex) {
    return months.length + stepIndex;
  }

  const lastIndex = months.length - 1;
  const lastPoint = [xFor(lastIndex), yFor(netProfits[netProfits.length - 1])];

  const historyLine = svgPoints(netProfits.map(function (value, index) {
    return [xFor(index), yFor(value)];
  }));

  const projectedLine = svgPoints([lastPoint, ...forecast.predicted.map(function (value, stepIndex) {
    return [xFor(futureColumn(stepIndex)), yFor(value)];
  })]);

  // The range is drawn as one shape: out along the high edge, back along the
  // low edge, closed at the last real month.
  const highEdge = forecast.high.map(function (value, stepIndex) {
    return [xFor(futureColumn(stepIndex)), yFor(value)];
  });
  const lowEdgeBackwards = forecast.low.map(function (value, stepIndex) {
    return [xFor(futureColumn(stepIndex)), yFor(value)];
  }).reverse();
  const rangeShape = svgPoints([lastPoint, ...highEdge, ...lowEdgeBackwards, lastPoint]);

  const zeroY = yFor(0);
  const lastMonth = months[months.length - 1];
  const labels = [
    ...months.map(pastMonthLabel),
    ...forecast.predicted.map(function (value, stepIndex) {
      return futureMonthLabel(lastMonth, stepIndex + 1);
    })
  ];

  const ticks = axisTicks(isThin, netProfits, top, bottom, yFor);

  const isFlat = Math.abs(localForecast.slope) < 0.02 * Math.max(...netProfits.map(Math.abs), 1);
  let direction;
  if (isFlat) {
    direction = "roughly flat";
  } else if (localForecast.slope < 0) {
    direction = "falling";
  } else {
    direction = "rising";
  }

  let legend;
  if (isThin) {
    legend = `<li><i class="fan-sw-hist"></i><b>Actual</b></li>
       <li><i class="fan-sw-mid"></i><b>Direction</b>${helpButton("trend")}</li>`;
  } else {
    legend = `<li><i class="fan-sw-hist"></i><b>Actual</b></li>
       <li><i class="fan-sw-mid"></i><b>Projected</b> ${formatWholeMoney(forecast.predicted[0])} next month</li>
       <li><i class="fan-sw-band"></i><b>Range</b>${helpButton("range")} ${formatWholeMoney(forecast.low[0])} to ${formatWholeMoney(forecast.high[0])}</li>`;
  }

  let zeroLine = "";
  if (bottom < 0) {
    zeroLine = `<line x1="0" y1="${zeroY}" x2="100" y2="${zeroY}" class="fan-zero"/>`;
  }
  let rangePolygon = "";
  if (!isThin) {
    rangePolygon = `<polygon points="${rangeShape}" class="fan-band"/>`;
  }
  let whatIsShown = "projection";
  if (isThin) {
    whatIsShown = "direction";
  }

  let axisHtml = "";
  for (const tick of ticks) {
    axisHtml += `<span style="top:${tick.y}px">${formatWholeMoney(tick.value)}</span>`;
  }

  let labelsHtml = "";
  labels.forEach(function (label, index) {
    let futureClass = "";
    if (index >= months.length) {
      futureClass = "fut";
    }
    labelsHtml += `<span class="${futureClass}">${label}</span>`;
  });

  // Every point is a button, so a reader can pin the exact amount behind any
  // month instead of only seeing it on hover (or not at all on a phone).
  const points = [];
  netProfits.forEach(function (value, index) {
    points.push({ x: xFor(index), y: yFor(value), value: value, label: labels[index], isProjected: false });
  });
  forecast.predicted.forEach(function (value, stepIndex) {
    points.push({
      x: xFor(futureColumn(stepIndex)),
      y: yFor(value),
      value: value,
      label: labels[months.length + stepIndex],
      isProjected: true
    });
  });

  return `<div class="fan">
    <div class="fan-plot">
      <svg viewBox="0 0 100 ${CHART_HEIGHT}" preserveAspectRatio="none" role="img"
           aria-label="Net profit history and ${forecast.predicted.length}-month ${whatIsShown}">
        ${zeroLine}
        ${rangePolygon}
        <polyline points="${historyLine}" class="fan-hist"/>
        <polyline points="${projectedLine}" class="fan-mid"/>
      </svg>
      ${pointButtonsHtml(points)}
    </div>
    <div class="axis-y">
      ${axisHtml}
    </div>
    <div class="fan-labels">${labelsHtml}</div>
    <ul class="key">${legend}</ul>
    ${howItIsWorkedOutHtml(isThin, forecast, months.length, direction)}
  </div>`;
}

/* The amounts written up the side. On a thin history the scale names only
   amounts that actually happened, so no projected amount reaches the
   screen by way of the axis. */
function axisTicks(isThin, netProfits, top, bottom, yFor) {
  const ticks = [];
  if (isThin) {
    const highestActual = Math.max(...netProfits);
    const lowestActual = Math.min(...netProfits);
    ticks.push({ value: highestActual, y: yFor(highestActual) });
    if (bottom < 0 && highestActual > 0) {
      ticks.push({ value: 0, y: yFor(0) });
    }
    if (lowestActual < 0) {
      ticks.push({ value: lowestActual, y: yFor(lowestActual) });
    }
    return ticks;
  }

  ticks.push({ value: top, y: 0 });
  if (bottom < 0) {
    ticks.push({ value: 0, y: yFor(0) });
  }
  ticks.push({ value: bottom, y: CHART_HEIGHT });
  return ticks;
}

function pointButtonsHtml(points) {
  let html = "";
  points.forEach(function (point, index) {
    let projectedClass = "";
    let projectedWord = "";
    if (point.isProjected) {
      projectedClass = " proj";
      projectedWord = " (projected)";
    }
    html += `
    <button type="button" class="fan-pt${projectedClass}"
            style="left:${point.x}%;top:${point.y}px" data-fan-pt="${index}" aria-expanded="false"
            aria-label="${escapeHtml(point.label)}${projectedWord}: ${formatWholeMoney(point.value)}"></button>
    <span class="fan-pt-label" id="fan-lbl-${index}" style="left:${point.x}%;top:${point.y}px">${formatWholeMoney(point.value)}</span>
  `;
  });
  return html;
}

function howItIsWorkedOutHtml(isThin, forecast, monthCount, direction) {
  if (isThin) {
    return `<p class="fc-msg"><b>Add more months for a forecast.</b> With ${monthCount} months on file this
         shows the direction only: net profit has been ${direction}. A projected amount appears once you
         have ${MINIMUM_MONTHS_FOR_AMOUNTS} months.</p>`;
  }

  let explanation;
  if (forecast.model === "local trend") {
    explanation = "a straight line through your monthly net profit, carried three months forward. " +
      "The shaded range shows how far past months strayed from that line, so treat it as a rough " +
      "guide, not a promise. Worked out on this page; nothing is sent.";
  } else {
    explanation = "Chronos, a forecasting model that has learned common patterns from a large " +
      "collection of real-world figures, projected your monthly net profit. The shaded range covers " +
      "the middle 80% of its estimates.";
  }
  return `<p class="brief-note">How this is worked out: ${explanation}</p>`;
}

export function forecastCardHtml() {
  return cardHtml("wide", "Where this is heading", "Net profit so far, and the direction it is moving",
    allMonthsLabel(),
    forecastChartHtml(state.data.months) +
    `<div class="brief-head no-print">
       <p class="brief-note" id="fc-note" hidden></p>
       <button type="button" class="btn" id="fc-go" hidden>Use the forecasting model</button>
     </div>`);
}

/* Offers the forecasting model when this site has one, and swaps the trend
   line for its projection when asked. `redraw` draws the dashboard again
   with the model's numbers. Wired again after every redraw. */
export function wireForecastButton(redraw) {
  const button = document.getElementById("fc-go");
  const note = document.getElementById("fc-note");
  if (!button) {
    return;
  }
  // A model cannot make three points trustworthy either; the button only
  // appears once there is enough history for a projected amount.
  if (state.data.months.length < MINIMUM_MONTHS_FOR_AMOUNTS) {
    return;
  }

  // Not offered when this site has no model: a button that always fails is
  // worse than none. Nor is "a model could be connected" said to visitors;
  // that is a note for whoever runs the site, so it goes to the console.
  loadCapabilities().then(function (capabilities) {
    if (!capabilities.forecast) {
      console.info("no forecast model configured; using the local trend");
      return;
    }
    if (state.modelForecast) {
      return;
    }
    button.hidden = false;
    note.hidden = false;
    note.textContent = "A forecasting model is available. Pressing this sends only your monthly " +
      "net profit figures: no month names, no line items, no budget.";
  });

  button.addEventListener("click", async function () {
    button.disabled = true;
    button.textContent = "Forecasting…";
    try {
      const result = await requestModelForecast();
      if (result === null) {
        // The service is there but has no usable model. Trying again cannot
        // fix that, so the button goes rather than failing every time.
        button.hidden = true;
        note.hidden = true;
        return;
      }
      if (result === NEEDS_ACCOUNT) {
        // Running the model costs this site money, so it needs an account.
        // Saying "could not be reached" here would blame the service for
        // something the reader can fix in a few seconds.
        note.textContent = "The forecasting model needs a free account. Log in (top right), " +
          "then press this again. The trend on the chart is worked out on this page either way.";
        button.disabled = false;
        button.textContent = "Use the forecasting model";
        return;
      }
      state.modelForecast = result;
      redraw();
    } catch (error) {
      // The reason can name a setting of the site: useful in a log, not on
      // screen. Readers get the consequence, the console gets the cause.
      console.warn("forecast unavailable:", error.message);
      note.textContent = "The forecasting service could not be reached. " +
        "Showing the trend worked out on this page instead.";
      button.disabled = false;
      button.textContent = "Try again";
    }
  });
}

/* Sends only the net profit figures, in order. Returns the projection, null
   when the service says it has no model to use, or NEEDS_ACCOUNT when this
   person has to log in or has used up today's allowance. */
async function requestModelForecast() {
  const series = state.data.months.map(function (month) {
    return month.netProfit;
  });
  const response = await fetch("/api/forecast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ series: series, horizon: MONTHS_AHEAD })
  });

  // A missing service answers with an HTML 404 page, not JSON; saying
  // "unexpected token <" would help nobody.
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("no forecast service is deployed yet");
  }

  if (response.status === 503) {
    console.warn("forecast model not available:", body.error || body.hint || "503");
    return null;
  }
  // Not logged in, or today's allowance is gone. Both are the reader's to
  // act on, unlike every other failure here, which names a site setting.
  if (response.status === 401 || response.status === 429) {
    return NEEDS_ACCOUNT;
  }
  if (!response.ok) {
    throw new Error(body.hint || body.error || "returned " + response.status);
  }
  return { low: body.low, predicted: body.predicted, high: body.high, model: body.model };
}
