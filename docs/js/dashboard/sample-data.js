/* The built-in sample months, shown when data.json cannot be loaded (for
   example when the page is opened straight from disk). The same figures as
   data/expenses.csv. */

/* The fourteen cost lines of one month, in the order the cost groups list
   them, so the months below stay readable. */
function sampleLines(cogs, labor, meals, tax, packaging, cards, marketing, hardware,
                     utilities, maintenance, rent, insurance, license, telephone) {
  return {
    "cogs": cogs,
    "labor": labor,
    "employee meals": meals,
    "tax": tax,
    "packaging": packaging,
    "credit card fees": cards,
    "marketing": marketing,
    "hardware": hardware,
    "utilities": utilities,
    "maintenance": maintenance,
    "rent": rent,
    "insurance": insurance,
    "business license": license,
    "telephone": telephone
  };
}

export const SAMPLE_DATA = {
  generated: "sample data",
  months: [
    {
      month: "july", monthNum: 7, year: 2026,
      revenue: 72000, budget: 66000, budgetPercent: 97.61,
      cogs: 26000, labor: 12000, utilities: 2800, maintenance: 950, hardware: 0,
      directExpenses: 45500, operatingExpenses: 7750, variableOverhead: 3750, fixedOverhead: 7420,
      totalExpenses: 64420, grossProfit: 26500, netProfit: 7580,
      lines: sampleLines(26000, 12000, 2500, 5000, 3400, 2150, 2200, 0, 2800, 950, 6000, 1100, 0, 320)
    },
    {
      month: "august", monthNum: 8, year: 2026,
      revenue: 64000, budget: 57000, budgetPercent: 102.77,
      cogs: 21000, labor: 9000, utilities: 3100, maintenance: 4200, hardware: 0,
      directExpenses: 37500, operatingExpenses: 6160, variableOverhead: 7300, fixedOverhead: 7620,
      totalExpenses: 58580, grossProfit: 26500, netProfit: 5420,
      lines: sampleLines(21000, 9000, 2000, 5500, 2600, 1760, 1800, 0, 3100, 4200, 6200, 1100, 0, 320)
    },
    {
      month: "september", monthNum: 9, year: 2026,
      revenue: 33000, budget: 34000, budgetPercent: 107.76,
      cogs: 11000, labor: 3500, utilities: 1900, maintenance: 310, hardware: 2400,
      directExpenses: 20200, operatingExpenses: 5560, variableOverhead: 2210, fixedOverhead: 8670,
      totalExpenses: 36640, grossProfit: 12800, netProfit: -3640,
      lines: sampleLines(11000, 3500, 500, 5200, 1350, 910, 900, 2400, 1900, 310, 6000, 1100, 1250, 320)
    }
  ]
};
