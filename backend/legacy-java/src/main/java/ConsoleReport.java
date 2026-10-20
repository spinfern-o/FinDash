/**
 * Printing a month's dashboard, and two months side by side, in the terminal.
 *
 * Amounts are printed with two decimals and thousands separators
 * ("$33,000.00"); the rest are percentages of revenue. Bold lines use the
 * terminal's bold code.
 */
public class ConsoleReport {

    private static final String BOLD = "\033[1m";
    private static final String NORMAL = "\033[0m";
    private static final String PERCENT_ROW = "%-22s %11.1f%% %11.1f%% %+11.1f pts%n";

    private static String money(double amount) {
        return String.format("$%,.2f", amount);
    }

    private static void printAmount(String label, double amount) {
        System.out.printf("%-22s %12s%n", label, money(amount));
    }

    private static void printBoldPercent(String label, double percent) {
        System.out.printf(BOLD + "%-22s %11.1f%%" + NORMAL + "%n", label, percent);
    }

    public static void printDashboard(MonthlyFigures month) {
        Expenses expenses = month.expenses;

        System.out.println(month.monthName + "'s financial dashboard");
        System.out.printf("%-22s %12d%n", "Month Number", month.monthNumber);
        printAmount("Revenue", month.revenue);

        System.out.println();
        printAmount("Maintenance", expenses.maintenance);
        printAmount("Hardware", expenses.hardware);
        printAmount("Utilities", expenses.utilities);
        printAmount("COGS", expenses.costOfGoodsSold);
        printAmount("Labor", expenses.labor);

        System.out.println();
        printBoldPercent("Gross Profit", month.percentOfRevenue(month.grossProfit()));
        printBoldPercent("Net Profit", month.percentOfRevenue(month.netProfit()));

        System.out.println();
        printBoldPercent("Variable Overhead", month.percentOfRevenue(month.variableOverhead()));
        printBoldPercent("Fixed Overhead", month.percentOfRevenue(month.fixedOverhead()));

        System.out.println();
        printBoldPercent("Direct Expenses", month.percentOfRevenue(month.directCosts()));
        printBoldPercent("Operating Expenses", month.percentOfRevenue(month.operatingCosts()));

        System.out.println();
        printBoldPercent("Total Expenses", month.percentOfRevenue(month.totalCosts()));

        System.out.println();
        printAmount("Budget", month.budget);
        System.out.printf("%-22s %11.1f%%%n", "Budget Used", month.budgetPercent());

        printBudgetVerdict(month);
    }

    /** "You used 107.76% of your budget ($2,640.00 over)". */
    private static void printBudgetVerdict(MonthlyFigures month) {
        double remaining = month.budget - month.totalCosts();
        double percentUsed = Math.round(month.budgetPercent() * 100) / 100.0;

        if (remaining > 0) {
            System.out.printf("You used %.2f%% of your budget ($%,.2f under)%n", percentUsed, remaining);
        } else if (remaining < 0) {
            System.out.printf("You used %.2f%% of your budget ($%,.2f over)%n", percentUsed, -remaining);
        } else {
            System.out.println("You're exactly on budget");
        }
    }

    /** One row of the comparison: both months' percentages and the gap in points. */
    private static void printPercentRow(String format, String label, double first, double second) {
        System.out.printf(format, label, first, second, first - second);
    }

    public static void printComparison(MonthlyFigures first, MonthlyFigures second) {
        System.out.println();
        System.out.println(first.monthName + " vs " + second.monthName);

        System.out.printf("%-22s %12s %12s %14s%n", "Metrics", first.monthName, second.monthName, "Difference");
        System.out.printf("%-22s $%,11.2f $%,11.2f $%+,12.2f%n%n",
            "Revenue", first.revenue, second.revenue, first.revenue - second.revenue);

        printPercentRow(PERCENT_ROW, "Gross Profit",
            first.percentOfRevenue(first.grossProfit()), second.percentOfRevenue(second.grossProfit()));
        printPercentRow(PERCENT_ROW, "Net Profit",
            first.percentOfRevenue(first.netProfit()), second.percentOfRevenue(second.netProfit()));
        printPercentRow("%-22s %11.1f%% %11.1f%% %+11.1f pts%n%n", "Fixed Overhead",
            first.percentOfRevenue(first.fixedOverhead()), second.percentOfRevenue(second.fixedOverhead()));
        printPercentRow("%-22s %11.1f%% %11.1f%% %+11.1f pts%n%n", "Variable Overhead",
            first.percentOfRevenue(first.variableOverhead()), second.percentOfRevenue(second.variableOverhead()));
        printPercentRow(PERCENT_ROW, "Direct Expenses",
            first.percentOfRevenue(first.directCosts()), second.percentOfRevenue(second.directCosts()));
        printPercentRow(PERCENT_ROW, "Operating Expenses",
            first.percentOfRevenue(first.operatingCosts()), second.percentOfRevenue(second.operatingCosts()));

        System.out.println();
        printPercentRow(BOLD + "%-22s %11.1f%% %11.1f%% %+11.1f pts" + NORMAL + "%n", "Total Expenses",
            first.percentOfRevenue(first.totalCosts()), second.percentOfRevenue(second.totalCosts()));
        printPercentRow(PERCENT_ROW, "Budget Used", first.budgetPercent(), second.budgetPercent());
    }
}
