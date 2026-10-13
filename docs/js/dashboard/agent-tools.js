/* Tools the dashboard offers AI agents working in the browser, through
   WebMCP (document.modelContext.registerTool). An agent helping an owner can
   put their figures on the page, read back what the page shows, pick the
   month and period, and save the template, instead of clicking through the
   page. Browsers without WebMCP skip all of this; nothing on the page changes.

   The figures go through the same checks and arithmetic as the public API
   (analysis.js), and loaded figures are kept exactly as a spreadsheet's
   would be: in this browser, and in the account while logged in. */

import { state, isShowingOwnerFigures } from "./state.js";
import { readMonthRecords, summariseMonths, COST_FIELDS, MAXIMUM_MONTHS } from "./analysis.js";
import { keepOwnerFigures } from "./keep-figures.js";
import { showOwnerFigures } from "./figures-on-screen.js";
import { selectMonth } from "./draw-dashboard.js";
import { downloadTemplate } from "./export/template.js";
import { monthsInPeriod, PERIODS } from "./periods.js";
import { monthLabel } from "./months.js";

/* The WebMCP interface: on document, as the spec has it, or on navigator
   in browsers that shipped an earlier draft. Null without WebMCP. */
function modelContext() {
  if (document.modelContext && typeof document.modelContext.registerTool === "function") {
    return document.modelContext;
  }
  if (navigator.modelContext && typeof navigator.modelContext.registerTool === "function") {
    return navigator.modelContext;
  }
  return null;
}

/* One month's input, as JSON Schema: the same shape as the public API. */
function monthInputSchema() {
  const costs = {};
  for (const field of COST_FIELDS) {
    costs[field.key] = { type: "number" };
  }
  return {
    type: "object",
    required: ["month", "year", "revenue"],
    additionalProperties: false,
    properties: {
      month: { type: ["string", "integer"], description: "The month's name (\"July\") or number (7)." },
      year: { type: "integer", description: "The year, such as 2026." },
      revenue: { type: "number", description: "Everything that came in from sales that month." },
      budget: { type: "number", description: "The most planned to be spent that month in total. Leave out if none." },
      costs: { type: "object", additionalProperties: false, properties: costs,
        description: "The month's costs by line. A cost with no line of its own goes in the closest one." }
    }
  };
}

/* What the page shows now: whose figures, the month and period on screen,
   and every month worked out, as the API reports them. */
function dashboardReport() {
  const months = state.data ? state.data.months : [];
  const report = {
    figures: isShowingOwnerFigures() ? "the owner's" : "demo",
    selectedMonth: state.activeMonth ? monthLabel(state.activeMonth) : null,
    period: state.period,
    currency: state.currency
  };
  if (months.length) {
    const summary = summariseMonths(months, state.currency);
    report.months = summary.months;
    report.total = summary.total;
    report.needsAttention = summary.needsAttention;
    if (state.activeMonth) {
      report.selectedPeriod = summariseMonths(monthsInPeriod(state.activeMonth, state.period), state.currency).total;
    }
  }
  return JSON.stringify(report);
}

function loadFigures(input) {
  const read = readMonthRecords(input && input.months);
  if (read.problems.length) {
    throw new Error("Some of the figures can't be read: " + read.problems.map(function (problem) {
      return problem.field + ": " + problem.message;
    }).join(" "));
  }
  state.ownerMonths = read.months;
  state.ownerSourceName = "figures added by an AI assistant";
  const savedSentence = keepOwnerFigures();
  const count = read.months.length;
  showOwnerFigures(count + (count === 1 ? " month" : " months") + " added by an AI assistant. " + savedSentence);
  return dashboardReport();
}

/* "September 2026", "September", "sep" or 9, with an optional year: the
   matching month on file, latest first. */
function findMonthIndex(month, year) {
  const months = state.data.months;
  const wanted = String(month).trim().toLowerCase();
  for (let index = months.length - 1; index >= 0; index--) {
    const candidate = months[index];
    const matchesYear = !year || candidate.year === year;
    const matchesMonth = wanted === monthLabel(candidate).toLowerCase() ||
      wanted === String(candidate.monthNum) ||
      (wanted.length >= 3 && candidate.month.startsWith(wanted));
    if (matchesYear && matchesMonth) {
      return index;
    }
  }
  return -1;
}

function showMonth(input) {
  if (input.period) {
    const button = document.querySelector(`#periods [data-period="${input.period}"]`);
    if (!button) {
      throw new Error("period is one of: " + PERIODS.map(function (period) {
        return period.key;
      }).join(", ") + ".");
    }
    button.click();
  }
  if (input.month !== undefined) {
    const index = findMonthIndex(input.month, input.year);
    if (index < 0) {
      throw new Error("No such month on file. Months on file: " + state.data.months.map(monthLabel).join(", ") + ".");
    }
    selectMonth(index);
  }
  return dashboardReport();
}

const TOOLS = [
  {
    name: "load_monthly_figures",
    title: "Show figures on the dashboard",
    description: "Put a small business's monthly figures on the FinDash dashboard, in place of the figures on " +
      "screen, and return what it shows. They are kept in this browser like an added spreadsheet. Up to " +
      MAXIMUM_MONTHS + " months.",
    inputSchema: {
      type: "object",
      required: ["months"],
      properties: { months: { type: "array", minItems: 1, maxItems: MAXIMUM_MONTHS, items: monthInputSchema() } }
    },
    annotations: { consequentialHint: true },
    execute: loadFigures
  },
  {
    name: "read_dashboard",
    title: "Read the dashboard",
    description: "What the FinDash dashboard shows now: every month's revenue, costs in four groups, gross and " +
      "net profit, net margin and budget used, the total, the months needing attention, and the month and " +
      "period on screen.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: dashboardReport
  },
  {
    name: "show_month",
    title: "Pick the month and period",
    description: "Choose which month the dashboard shows, and whether its cards cover the month, its quarter or " +
      "the year to date.",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: ["string", "integer"], description: "The month's name or number, or a label such as " +
          "\"September 2026\"." },
        year: { type: "integer", description: "The year, when the figures cover more than one." },
        period: { type: "string", enum: PERIODS.map(function (period) {
          return period.key;
        }) }
      }
    },
    execute: showMonth
  },
  {
    name: "download_template",
    title: "Download the spreadsheet template",
    description: "Save FinDash's spreadsheet template, filled with sample months, for the owner to fill in with " +
      "their own monthly totals.",
    inputSchema: {
      type: "object",
      properties: { format: { type: "string", enum: ["xlsx", "csv"], description: "Excel (xlsx, the default) or CSV." } }
    },
    execute: function (input) {
      const format = input && input.format === "csv" ? "csv" : "xlsx";
      downloadTemplate(format);
      return "Saved findash-template." + format + ".";
    }
  }
];

/* Registers every tool with the browser's agent, where there is one. */
export function offerAgentTools() {
  const context = modelContext();
  if (!context) {
    return;
  }
  for (const tool of TOOLS) {
    const execute = tool.execute;
    const registration = Object.assign({}, tool, {
      execute: async function (input) {
        return execute(input || {});
      }
    });
    Promise.resolve(context.registerTool(registration)).catch(function (error) {
      console.warn("WebMCP tool not registered:", tool.name, error && error.message);
    });
  }
}
