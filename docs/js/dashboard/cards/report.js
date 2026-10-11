/* "Financial report": every line in the period, in money and as a share of
   revenue.

   Each cost group shows its total, every line under it that has a value,
   then whatever the total does not account for. The report used to list
   five fixed lines (cost of goods sold, labor, hardware, utilities,
   maintenance) while the group totals added up all fourteen. July listed
   41,750 of 64,420 and the totals silently disagreed with the lines under
   them. Building the lines from COST_GROUPS means a cost can never count
   toward a total without appearing, and the "Other" line takes whatever a
   file could not name. */

import { formatMoney, formatPercent, percentOf, capitalize } from "../format.js";
import { COST_GROUPS, LINE_LABELS, lineValue, sumOfGroupLines } from "../cost-groups.js";
import { roundToCents } from "../numbers.js";
import { helpButton } from "../help-tips.js";

function reportRowHtml(label, amount, revenue, rowClass) {
  let headerAttributes = "";
  if (rowClass === "indent-row") {
    headerAttributes = ' class="indent"';
  }
  let share = "—";
  if (revenue) {
    share = formatPercent(percentOf(amount, revenue));
  }
  return `<tr class="${rowClass}">
    <th scope="row"${headerAttributes}>${label}</th>
    <td class="amt">${formatMoney(amount)}</td>
    <td class="share">${share}</td>
  </tr>`;
}

/* Only shown when it is not zero, so an unnamed cost is never folded into a
   group's total without appearing anywhere. */
function otherRowHtml(amount, revenue) {
  if (!amount) {
    return "";
  }
  return reportRowHtml(`Other (uncategorised)${helpButton("other")}`, amount, revenue, "indent-row");
}

function costGroupRowsHtml(totals, groupName, label, groupTotal) {
  const revenue = totals.revenue;

  let lineRows = "";
  for (const lineKey of COST_GROUPS[groupName]) {
    const amount = lineValue(totals, lineKey);
    if (amount) {
      const lineLabel = LINE_LABELS[lineKey] || capitalize(lineKey);
      lineRows += reportRowHtml(lineLabel, amount, revenue, "indent-row");
    }
  }

  const unlisted = roundToCents(groupTotal - sumOfGroupLines(totals, groupName));
  return reportRowHtml(label + helpButton(groupName), groupTotal, revenue, "group") +
    lineRows +
    otherRowHtml(unlisted, revenue);
}

export function reportHtml(totals) {
  const revenue = totals.revenue;
  const netProfit = totals.netProfit;

  let lossClass = "";
  if (netProfit < 0) {
    lossClass = "neg";
  }
  let netShare = "—";
  if (revenue) {
    netShare = formatPercent(percentOf(netProfit, revenue));
  }

  return `<div class="table-wrap"><table>
    <thead>
      <tr><th scope="col">Line</th><th scope="col">Amount</th>
          <th scope="col"><span class="long">% of revenue</span><span class="short">% of rev.</span>${helpButton("ofRevenue")}</th></tr>
    </thead>
    <tbody>
      ${reportRowHtml("Revenue" + helpButton("revenue"), revenue, revenue, "group")}

      ${costGroupRowsHtml(totals, "direct", "Direct costs", totals.directExpenses)}
      ${costGroupRowsHtml(totals, "operating", "Operating costs", totals.operatingExpenses)}
      ${costGroupRowsHtml(totals, "variable", "Variable overhead", totals.variableOverhead)}
      ${costGroupRowsHtml(totals, "fixed", "Fixed overhead", totals.fixedOverhead)}

      ${reportRowHtml("Total costs" + helpButton("totalCosts"), totals.totalExpenses, revenue, "total")}
      <tr class="total">
        <th scope="row">Net profit${helpButton("netProfit")}</th>
        <td class="amt ${lossClass}">${formatMoney(netProfit)}</td>
        <td class="share ${lossClass}">${netShare}</td>
      </tr>
    </tbody>
  </table></div>`;
}
