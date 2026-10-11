/* "Budget estimator": what next month could be budgeted at.

   Built from every month on file, not a model. It gives two numbers rather
   than one, because a single "suggested budget" hides the question that
   matters: do you want to cover a typical month, or a bad one? Fixed costs
   barely move and are safe to budget at their average; the lumpy groups are
   where a month goes wrong, so each group is shown with its own worst month.

   It used to follow the period selector, which meant the default "this
   month" view showed a card that only said it needed two months. */

import { formatWholeMoney, formatPercent } from "../format.js";
import { COST_GROUP_ROWS } from "../cost-groups.js";
import { helpButton } from "../help-tips.js";

function averageOf(months, fieldName) {
  let total = 0;
  for (const month of months) {
    total += month[fieldName];
  }
  return total / months.length;
}

function highestOf(months, fieldName) {
  const values = months.map(function (month) {
    return month[fieldName];
  });
  return Math.max(...values);
}

/* One row per cost group: its average, its worst month, and how far apart
   those are. A group whose worst month is close to its average is
   predictable; one that swings is where the risk lives. */
function groupRowsHtml(months) {
  let rows = "";
  for (const row of COST_GROUP_ROWS) {
    const average = averageOf(months, row.totalKey);
    const highest = highestOf(months, row.totalKey);

    let swing = 0;
    if (average) {
      swing = ((highest - average) / average) * 100;
    }
    let swingText;
    if (swing < 10) {
      swingText = "steady";
    } else {
      swingText = "+" + formatPercent(swing);
    }

    rows += `<tr>
      <th scope="row">${row.label}${helpButton(row.group)}</th>
      <td class="amt">${formatWholeMoney(average)}</td>
      <td class="amt">${formatWholeMoney(highest)}</td>
      <td class="share">${swingText}</td>
    </tr>`;
  }
  return rows;
}

/* A candidate budget only means something against what actually happened: a
   budget is "right" if it would have held. Counting the months it would
   have been blown in turns two abstract figures into a choice. */
function wouldHaveCoveredHtml(months, budget) {
  let monthsCovered = 0;
  for (const month of months) {
    if (month.totalExpenses <= budget) {
      monthsCovered += 1;
    }
  }
  const monthsBlown = months.length - monthsCovered;

  if (monthsBlown === 0) {
    return `<span class="ok">would have covered all ${months.length}</span>`;
  }
  return `<span class="miss">would have been blown in ${monthsBlown} of ${months.length}</span>`;
}

function againstLatestBudgetHtml(typicalMonth, latestBudget) {
  if (!latestBudget) {
    return "<em>No budget on file to compare against.</em>";
  }
  if (typicalMonth > latestBudget) {
    return `<em>Your latest budget of ${formatWholeMoney(latestBudget)} is ` +
      `${formatWholeMoney(typicalMonth - latestBudget)} below a typical month.</em>`;
  }
  return `<em>Your latest budget of ${formatWholeMoney(latestBudget)} covers a typical month with ` +
    `${formatWholeMoney(latestBudget - typicalMonth)} to spare.</em>`;
}

export function estimatorHtml(months) {
  const typicalMonth = averageOf(months, "totalExpenses");
  const badMonth = highestOf(months, "totalExpenses");
  const latestBudget = months[months.length - 1].budget;

  return `<div class="est">
    <div class="est-pair">
      <div><p class="lab">Typical month${helpButton("typical")}</p><p class="num">${formatWholeMoney(typicalMonth)}</p>
           <p class="chg">average of ${months.length} &middot; ${wouldHaveCoveredHtml(months, typicalMonth)}</p></div>
      <div><p class="lab">Cover a bad month</p><p class="num">${formatWholeMoney(badMonth)}</p>
           <p class="chg">highest of ${months.length} &middot; ${wouldHaveCoveredHtml(months, badMonth)}</p></div>
    </div>
    <p class="est-note">${againstLatestBudgetHtml(typicalMonth, latestBudget)}</p>
    <div class="table-wrap"><table>
      <thead><tr>
        <th scope="col">Cost group</th><th scope="col">Average</th>
        <th scope="col">Worst</th><th scope="col">Swing${helpButton("swing")}</th>
      </tr></thead>
      <tbody>${groupRowsHtml(months)}</tbody>
    </table></div>
  </div>`;
}
