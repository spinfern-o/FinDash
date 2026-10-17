import java.io.File;
import java.io.FileNotFoundException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner;

/**
 * The FinDash command-line app.
 *
 * Reads data/dashboard.csv (month, revenue, budget) and data/expenses.csv
 * (the cost lines), joins them on the month number, writes frontend/data.json for
 * the web dashboard, then lets you look at any month in the terminal and
 * compare it with another.
 *
 *   mvn -q compile exec:java
 *
 * The other classes:
 *   MonthlyFigures   one month and the figures worked out from it
 *   Expenses         one month's cost lines and their four groups
 *   ColumnMapper     which column holds which field
 *   CsvFile          reading cells out of a CSV file
 *   DataJsonWriter   writing frontend/data.json
 *   ConsoleReport    printing a month, or two side by side
 */
public class CFODashboard {

    /** The fields of data/expenses.csv, in the order that file has them. Also
        the order assumed when the columns cannot be matched by name. */
    static final List<String> EXPENSE_FIELDS = List.of(
        "month num", "cogs", "packaging", "rent", "utilities", "maintenance",
        "hardware", "insurance", "marketing", "credit card fees",
        "business license", "telephone", "employee meals", "tax", "labor");

    /** The fields of data/dashboard.csv, in the order that file has them. */
    static final List<String> DASHBOARD_FIELDS = List.of("month", "month num", "revenue", "budget");

    /** Reads data/expenses.csv: each month's costs, by month number. */
    static Map<Integer, Expenses> readExpenses(String path) {
        Map<Integer, Expenses> expensesByMonth = new HashMap<>();
        try (Scanner reader = new Scanner(new File(path))) {
            String[] headers = CsvFile.splitLine(reader.nextLine());
            ColumnMapper.ColumnMap map = ColumnMapper.resolveColumns(headers, EXPENSE_FIELDS);
            Map<String, Integer> columns = map.columns;

            while (reader.hasNextLine()) {
                String[] row = CsvFile.splitLine(reader.nextLine());

                int monthNumber = (int) CsvFile.amount(row, columns, "month num");
                Expenses expenses = new Expenses(monthNumber);
                expenses.costOfGoodsSold = CsvFile.amount(row, columns, "cogs");
                expenses.packaging = CsvFile.amount(row, columns, "packaging");
                expenses.rent = CsvFile.amount(row, columns, "rent");
                expenses.utilities = CsvFile.amount(row, columns, "utilities");
                expenses.maintenance = CsvFile.amount(row, columns, "maintenance");
                expenses.hardware = CsvFile.amount(row, columns, "hardware");
                expenses.insurance = CsvFile.amount(row, columns, "insurance");
                expenses.marketing = CsvFile.amount(row, columns, "marketing");
                expenses.creditCardFees = CsvFile.amount(row, columns, "credit card fees");
                expenses.businessLicense = CsvFile.amount(row, columns, "business license");
                expenses.telephone = CsvFile.amount(row, columns, "telephone");
                expenses.employeeMeals = CsvFile.amount(row, columns, "employee meals");
                expenses.payrollTax = CsvFile.amount(row, columns, "tax");
                expenses.labor = CsvFile.amount(row, columns, "labor");
                expenses.otherDirect = ColumnMapper.leftoverTotal(row, map, "direct");
                expenses.otherOperating = ColumnMapper.leftoverTotal(row, map, "operating");
                expenses.otherVariable = ColumnMapper.leftoverTotal(row, map, "variable");
                expenses.otherFixed = ColumnMapper.leftoverTotal(row, map, "fixed");

                expensesByMonth.put(monthNumber, expenses);
            }
        } catch (FileNotFoundException missing) {
            System.out.println("Expenses file not found");
        }
        return expensesByMonth;
    }

    /** Reads data/dashboard.csv and pairs each month with its costs. A month
        with no costs row is skipped. A Year column is optional; without one,
        every month is taken to be in the current year. */
    static List<MonthlyFigures> readMonths(String path, Map<Integer, Expenses> expensesByMonth) {
        List<MonthlyFigures> months = new ArrayList<>();
        try (Scanner reader = new Scanner(new File(path))) {
            String[] headers = CsvFile.splitLine(reader.nextLine());
            Map<String, Integer> columns = ColumnMapper.resolveColumns(headers, DASHBOARD_FIELDS).columns;
            int yearColumn = ColumnMapper.indexOfHeader(headers, "year");

            while (reader.hasNextLine()) {
                String[] row = CsvFile.splitLine(reader.nextLine());
                String monthName = CsvFile.text(row, columns, "month");
                int monthNumber = (int) CsvFile.amount(row, columns, "month num");
                double revenue = CsvFile.amount(row, columns, "revenue");
                double budget = CsvFile.amount(row, columns, "budget");

                int year = LocalDate.now().getYear();
                if (yearColumn >= 0 && yearColumn < row.length) {
                    int yearInFile = (int) CsvFile.parseAmount(row[yearColumn]);
                    if (yearInFile >= 1900 && yearInFile <= 2100) {
                        year = yearInFile;
                    }
                }

                Expenses expenses = expensesByMonth.get(monthNumber);
                if (expenses == null) {
                    System.out.println("No expenses for month " + monthNumber + ", skipping month");
                    continue;
                }
                months.add(new MonthlyFigures(monthName, monthNumber, year, revenue, budget, expenses));
            }
        } catch (FileNotFoundException missing) {
            System.out.println("File not found");
        }
        return months;
    }

    static MonthlyFigures findMonth(List<MonthlyFigures> months, int monthNumber) {
        for (MonthlyFigures month : months) {
            if (month.monthNumber == monthNumber) {
                return month;
            }
        }
        return null;
    }

    /** Asks for a month number until it gets one that is on file. Returns
        null when the answer is 0, meaning "quit". */
    static MonthlyFigures askForMonth(Scanner input, List<MonthlyFigures> months, String question) {
        while (true) {
            System.out.println(question);
            String answer = input.nextLine().trim();

            int monthNumber;
            try {
                monthNumber = Integer.parseInt(answer);
            } catch (NumberFormatException notANumber) {
                System.out.println("Please enter an integer");
                continue;
            }

            if (monthNumber == 0) {
                return null;
            }
            MonthlyFigures month = findMonth(months, monthNumber);
            if (month == null) {
                System.out.println("No data for month " + monthNumber + ".");
                continue;
            }
            return month;
        }
    }

    public static void main(String[] args) {
        Map<Integer, Expenses> expensesByMonth = readExpenses("data/expenses.csv");
        List<MonthlyFigures> months = readMonths("data/dashboard.csv", expensesByMonth);

        System.out.println("Months on file:");
        for (MonthlyFigures month : months) {
            System.out.println(month.monthNumber + " - " + month.monthName);
        }

        DataJsonWriter.write(months, "frontend/data.json");

        Scanner input = new Scanner(System.in);
        while (true) {
            MonthlyFigures shown = askForMonth(input, months,
                "Which month's dashboard do you wish to see? (month num, 0 to quit)");
            if (shown == null) {
                break;
            }
            ConsoleReport.printDashboard(shown);

            while (true) {
                MonthlyFigures compared = askForMonth(input, months,
                    "Which month's dashboard would you like to compare it to? (month num, 0 to quit)");
                if (compared == null) {
                    break;
                }
                ConsoleReport.printComparison(shown, compared);
            }
        }
        input.close();
    }
}
