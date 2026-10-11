import java.io.File;
import java.io.FileNotFoundException;
import java.io.PrintWriter;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * Writes docs/data.json, the demo figures the web dashboard opens on.
 *
 * Written by hand rather than with a JSON library so the file stays laid out
 * the way a person would write it, one field per line.
 */
public class DataJsonWriter {

    /** An amount with two decimals and a "." whatever the computer's language settings. */
    private static String number(double value) {
        return String.format(Locale.ROOT, "%.2f", value);
    }

    private static void writeMonth(PrintWriter out, MonthlyFigures month, boolean isLast) {
        Expenses expenses = month.expenses;

        out.println("    {");
        out.println("      \"month\": \"" + month.monthName + "\",");
        out.println("      \"monthNum\": " + month.monthNumber + ",");
        out.println("      \"year\": " + month.year + ",");
        out.println("      \"revenue\": " + number(month.revenue) + ",");
        out.println();
        out.println("      \"maintenance\": " + number(expenses.maintenance) + ",");
        out.println("      \"hardware\": " + number(expenses.hardware) + ",");
        out.println("      \"utilities\": " + number(expenses.utilities) + ",");
        out.println("      \"cogs\": " + number(expenses.costOfGoodsSold) + ",");
        out.println("      \"labor\": " + number(expenses.labor) + ",");
        out.println();
        // Every cost line, named as data/expenses.csv names it, so the web
        // report can list each group in full. The five fields above stay for
        // anything already reading them.
        out.println("      \"lines\": {");
        out.println("        \"cogs\": " + number(expenses.costOfGoodsSold) + ",");
        out.println("        \"labor\": " + number(expenses.labor) + ",");
        out.println("        \"employee meals\": " + number(expenses.employeeMeals) + ",");
        out.println("        \"tax\": " + number(expenses.payrollTax) + ",");
        out.println("        \"packaging\": " + number(expenses.packaging) + ",");
        out.println("        \"credit card fees\": " + number(expenses.creditCardFees) + ",");
        out.println("        \"marketing\": " + number(expenses.marketing) + ",");
        out.println("        \"hardware\": " + number(expenses.hardware) + ",");
        out.println("        \"utilities\": " + number(expenses.utilities) + ",");
        out.println("        \"maintenance\": " + number(expenses.maintenance) + ",");
        out.println("        \"rent\": " + number(expenses.rent) + ",");
        out.println("        \"insurance\": " + number(expenses.insurance) + ",");
        out.println("        \"business license\": " + number(expenses.businessLicense) + ",");
        out.println("        \"telephone\": " + number(expenses.telephone));
        out.println("      },");
        out.println();
        out.println("      \"grossProfit\": " + number(month.grossProfit()) + ",");
        out.println("      \"netProfit\": " + number(month.netProfit()) + ",");
        out.println();
        out.println("      \"variableOverhead\": " + number(month.variableOverhead()) + ",");
        out.println("      \"fixedOverhead\": " + number(month.fixedOverhead()) + ",");
        out.println();
        out.println("      \"directExpenses\": " + number(month.directCosts()) + ",");
        out.println("      \"operatingExpenses\": " + number(month.operatingCosts()) + ",");
        out.println();
        out.println("      \"totalExpenses\": " + number(month.totalCosts()) + ",");
        out.println();
        out.println("      \"budget\": " + number(month.budget) + ",");
        out.println("      \"budgetPercent\": " + number(month.budgetPercent()));
        if (isLast) {
            out.println("    }");
        } else {
            out.println("    },");
        }
    }

    public static void write(List<MonthlyFigures> months, String path) {
        File folder = new File(path).getParentFile();
        if (folder != null) {
            folder.mkdirs();
        }

        try (PrintWriter out = new PrintWriter(path)) {
            out.println("{");
            out.println("  \"generated\": \"" + LocalDate.now() + "\",");
            out.println("  \"months\": [");
            for (int index = 0; index < months.size(); index++) {
                boolean isLast = index == months.size() - 1;
                writeMonth(out, months.get(index), isLast);
            }
            out.println("  ]");
            out.println("}");
        } catch (FileNotFoundException error) {
            System.out.println("Could not write JSON: " + error.getMessage());
        }
    }
}
