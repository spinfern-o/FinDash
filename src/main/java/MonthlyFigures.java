/**
 * One month: its revenue, its budget, its costs, and the figures worked out
 * from them.
 *
 * The two rules everything rests on:
 *   total costs = direct + operating + variable overhead + fixed overhead
 *   net profit  = revenue - total costs
 *
 * "Budget" is the most the owner planned to spend that month in total. It is
 * a spending limit, not a sales target.
 */
public class MonthlyFigures {

    String monthName;
    int monthNumber;
    int year;
    double revenue;
    double budget;
    Expenses expenses;

    public MonthlyFigures(String monthName, int monthNumber, int year, double revenue, double budget,
                          Expenses expenses) {
        this.monthName = monthName;
        this.monthNumber = monthNumber;
        this.year = year;
        this.revenue = revenue;
        this.budget = budget;
        this.expenses = expenses;
    }

    public double directCosts() {
        return expenses.directCosts();
    }

    public double operatingCosts() {
        return expenses.operatingCosts();
    }

    public double variableOverhead() {
        return expenses.variableOverhead();
    }

    public double fixedOverhead() {
        return expenses.fixedOverhead();
    }

    public double totalCosts() {
        return directCosts() + operatingCosts() + variableOverhead() + fixedOverhead();
    }

    /** Revenue minus direct costs, before the running costs. */
    public double grossProfit() {
        return revenue - directCosts();
    }

    /** What is left of revenue after every cost. Negative is a loss. */
    public double netProfit() {
        return grossProfit() - operatingCosts() - variableOverhead() - fixedOverhead();
    }

    /** Total costs as a percentage of the budget. Over 100 means over budget. */
    public double budgetPercent() {
        return (totalCosts() / budget) * 100;
    }

    /** Any amount as a percentage of this month's revenue. */
    public double percentOfRevenue(double amount) {
        return (amount / revenue) * 100;
    }
}
