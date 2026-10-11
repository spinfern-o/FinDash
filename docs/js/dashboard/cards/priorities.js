/* "What needs attention": observations read straight off the figures.

   No model is involved and nothing leaves the computer: these are arithmetic
   facts about the months on file, ranked so the ones that cost money come
   first.

   Always every month on file, whatever the period. Limited to the selected
   month this said "nothing demanding attention" on a profitable July while
   August and September both ran over budget. A problem that includes the
   latest month is urgent; an older one is worth watching. */

import { formatWholeMoney, formatPercent, capitalize } from "../format.js";
import { monthLabel, describeMonths, yearOf } from "../months.js";
import { LINE_LABELS, lineValue } from "../cost-groups.js";
import { helpButton } from "../help-tips.js";

/* A line item this many times its own average stands out. */
const SPIKE_FACTOR = 2.5;

/* "July 2026, August 2026", or the latest four and how many more. */
function listMonthNames(months) {
  const names = months.map(monthLabel);
  if (names.length > 4) {
    return names.slice(-4).join(", ") + ` and ${names.length - 4} earlier`;
  }
  return names.join(", ");
}

function plural(count, word) {
  if (count > 1) {
    return word + "s";
  }
  return word;
}

/* Costs recorded but no sales: a gap in the figures, not a loss. Invoices
   can put costs into a month before its sales are on file, and calling that
   a loss would alarm for nothing. */
function monthsWithoutSales(allMonths) {
  const unsold = allMonths.filter(function (month) {
    return !month.revenue && month.totalExpenses > 0;
  });
  if (!unsold.length) {
    return null;
  }
  return {
    level: "watch",
    html: `<strong>No sales on file for ${listMonthNames(unsold)}</strong>: costs are recorded but
      revenue isn't yet. <em>Add your sales with the template to see the profit.</em>`
  };
}

function monthsAtALoss(allMonths, latestMonth) {
  const losses = allMonths.filter(function (month) {
    return month.netProfit < 0 && month.revenue > 0;
  });
  if (!losses.length) {
    return null;
  }

  let level = "watch";
  if (losses.includes(latestMonth)) {
    level = "urgent";
  }
  return {
    level: level,
    html: `<strong>${losses.length} ${plural(losses.length, "month")} at a loss</strong>:
       ${listMonthNames(losses)}. <em>Costs were more than revenue.</em>`
  };
}

function monthsOverBudget(allMonths, latestMonth) {
  const overBudget = allMonths.filter(function (month) {
    return month.budget && month.budgetPercent > 100;
  });
  if (!overBudget.length) {
    return null;
  }

  let worst = overBudget[0];
  for (const month of overBudget) {
    if (month.budgetPercent > worst.budgetPercent) {
      worst = month;
    }
  }

  let level = "watch";
  if (overBudget.includes(latestMonth)) {
    level = "urgent";
  }
  const amountOver = formatWholeMoney(worst.totalExpenses - worst.budget);
  return {
    level: level,
    html: `<strong>Over budget in ${overBudget.length} of ${allMonths.length} ${plural(allMonths.length, "month")}</strong>:
       ${listMonthNames(overBudget)}. <em>Worst: ${monthLabel(worst)}, ${amountOver}
       over (${formatPercent(worst.budgetPercent)} of budget).</em>`
  };
}

/* A line item far above its own history is the clearest "look at this"
   signal. One finding per line: the latest month it spiked in. */
function costSpikes(allMonths) {
  const findings = [];

  for (const lineKey of Object.keys(LINE_LABELS)) {
    const monthsWithThisCost = [];
    for (const month of allMonths) {
      const amount = lineValue(month, lineKey);
      if (amount > 0) {
        monthsWithThisCost.push(amount);
      }
    }
    if (monthsWithThisCost.length < 3) {
      continue;
    }

    let total = 0;
    for (const amount of monthsWithThisCost) {
      total += amount;
    }
    const average = total / monthsWithThisCost.length;

    const spikeMonths = allMonths.filter(function (month) {
      return lineValue(month, lineKey) > average * SPIKE_FACTOR;
    });
    if (!spikeMonths.length) {
      continue;
    }

    const latestSpike = spikeMonths[spikeMonths.length - 1];
    const amount = lineValue(latestSpike, lineKey);
    findings.push({
      level: "watch",
      html: `<strong>${LINE_LABELS[lineKey]} jumped in ${monthLabel(latestSpike)}</strong>:
        ${formatWholeMoney(amount)} against a ${formatWholeMoney(average)} average.
        <em>${(amount / average).toFixed(1)} times its usual level.</em>`
    });
  }

  return findings;
}

/* Costs outrunning revenue is what an owner most wants flagged early.
   Measured over the latest three months, so a long file is judged on where
   it is now rather than where it started. */
function recentSqueeze(allMonths) {
  const findings = [];
  const recentMonths = allMonths.slice(-3);
  if (recentMonths.length < 2) {
    return findings;
  }

  const first = recentMonths[0];
  const last = recentMonths[recentMonths.length - 1];

  let firstName;
  if (yearOf(first) === yearOf(last)) {
    firstName = capitalize(first.month);
  } else {
    firstName = monthLabel(first);
  }
  const span = `${firstName} to ${monthLabel(last)}`;

  if (first.revenue && last.revenue && first.totalExpenses) {
    const revenueChange = ((last.revenue - first.revenue) / first.revenue) * 100;
    const costChange = ((last.totalExpenses - first.totalExpenses) / first.totalExpenses) * 100;

    if (costChange > revenueChange + 5) {
      // Both can be falling and the margin still shrink. Say which it is
      // rather than claim costs rose when the figures show them dropping.
      let heading;
      if (costChange >= 0 && revenueChange < costChange) {
        heading = "Costs rising faster than revenue";
      } else if (costChange < 0) {
        heading = "Revenue falling faster than costs";
      } else {
        heading = "Costs outpacing revenue";
      }

      let costDirection = "down";
      if (costChange >= 0) {
        costDirection = "up";
      }
      let revenueDirection = "fell";
      if (revenueChange >= 0) {
        revenueDirection = "rose";
      }

      findings.push({
        level: "watch",
        html: `<strong>${heading}</strong>: costs ${costDirection}
          ${formatPercent(Math.abs(costChange))} while revenue ${revenueDirection}
          ${formatPercent(Math.abs(revenueChange))}, ${span}. <em>Your margin is being squeezed.</em>`
      });
    }
  }

  let firstMargin = 0;
  if (first.revenue) {
    firstMargin = first.netProfit / first.revenue;
  }
  let lastMargin = 0;
  if (last.revenue) {
    lastMargin = last.netProfit / last.revenue;
  }
  const marginDrop = firstMargin - lastMargin;

  if (marginDrop > 0.03) {
    findings.push({
      level: "watch",
      html: `<strong>Net margin down ${(marginDrop * 100).toFixed(1)} points</strong>${helpButton("netMargin")}:
        ${span}. <em>You are keeping less of every sale.</em>`
    });
  }

  return findings;
}

export function prioritiesHtml(allMonths) {
  const latestMonth = allMonths[allMonths.length - 1];
  const findings = [];

  const noSales = monthsWithoutSales(allMonths);
  if (noSales) {
    findings.push(noSales);
  }
  const losses = monthsAtALoss(allMonths, latestMonth);
  if (losses) {
    findings.push(losses);
  }
  const overBudget = monthsOverBudget(allMonths, latestMonth);
  if (overBudget) {
    findings.push(overBudget);
  }
  findings.push(...costSpikes(allMonths));
  findings.push(...recentSqueeze(allMonths));

  if (!findings.length) {
    return `<p class="none">Nothing needs attention across ${describeMonths(allMonths)}: no losses, nothing over
            budget, no cost far above its usual level.</p>`;
  }

  // Urgent first; otherwise the order above stands (sort keeps ties in order).
  findings.sort(function (a, b) {
    return urgencyRank(a) - urgencyRank(b);
  });

  let items = "";
  for (const finding of findings) {
    let tagText = "Watch";
    if (finding.level === "urgent") {
      tagText = "Urgent";
    }
    items += `<li><span class="tag ${finding.level}">${tagText}</span><p>${finding.html}</p></li>`;
  }
  return `<ul class="prio">${items}</ul>`;
}

function urgencyRank(finding) {
  if (finding.level === "urgent") {
    return 0;
  }
  return 1;
}
