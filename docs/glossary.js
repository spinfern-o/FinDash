/* Plain-language definitions, shared by the dashboard's "?" buttons and the
   help page, so the two can never explain the same word differently.

   Written for an owner, not an accountant: say what the number is and give an
   everyday example. The bucket names match CFODashboard.java and the README;
   only the explanations are softened. */
window.FINDASH_GLOSSARY = {
  revenue: {
    term: "Revenue",
    text: "Everything that came in from sales in the period, before any costs are taken off."
  },
  direct: {
    term: "Direct costs",
    text: "What it costs to make each sale or do each job: stock and ingredients " +
          "(cost of goods sold), staff wages, staff meals and payroll tax."
  },
  operating: {
    term: "Operating costs",
    text: "Costs that grow when you are busier but are not tied to one sale: " +
          "packaging, card fees, marketing and small equipment."
  },
  variable: {
    term: "Variable overhead",
    text: "Running costs that go up when you are busier, but not in step with sales: " +
          "utilities and maintenance."
  },
  fixed: {
    term: "Fixed overhead",
    text: "Costs that don't change with sales, like rent, insurance, licences and phone. " +
          "Usually the hardest to cut, because most of it is under contract."
  },
  other: {
    term: "Other (uncategorised)",
    text: "Money counted in this group's total that did not match one of the named lines, " +
          "usually a column in your file with a name we did not recognise."
  },
  totalCosts: {
    term: "Total costs",
    text: "Every cost in the four groups added together."
  },
  netProfit: {
    term: "Net profit",
    text: "What is left of revenue after every cost. A negative number is a loss."
  },
  grossProfit: {
    term: "Gross profit",
    text: "Revenue minus direct costs, before rent, marketing and the other running costs."
  },
  netMargin: {
    term: "Net margin",
    text: "The share of revenue you keep after every cost. 10% means you keep 10 of every 100 that comes in."
  },
  budget: {
    term: "Budget",
    text: "The most you planned to spend in total that month. It is a spending limit, not a sales target."
  },
  budgetUsed: {
    term: "Budget used",
    text: "Total costs as a share of your budget. Over 100% means you spent more than you planned."
  },
  ofRevenue: {
    term: "% of revenue",
    text: "Each line as a share of revenue, so a busy month and a quiet one can be compared fairly."
  },
  shortfall: {
    term: "Shortfall",
    text: "How far costs ran past revenue in a month that made a loss."
  },
  typical: {
    term: "Typical month",
    text: "Average total costs across every month on file."
  },
  swing: {
    term: "Swing",
    text: "How much higher the worst month was than the average. “Steady” means within 10%."
  },
  trend: {
    term: "Trend",
    text: "A straight line drawn through your monthly net profit and carried forward. " +
          "It shows the direction things are moving, not a promise."
  },
  range: {
    term: "Range",
    text: "How far past months strayed from the trend. A wider range means the months have been less predictable."
  }
};
