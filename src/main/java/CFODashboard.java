import java.io.File;
import java.io.FileNotFoundException;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.Scanner;
import java.util.HashMap;
import java.util.Map;
import java.util.List;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.Message;

public class CFODashboard {

    static Scanner input = new Scanner(System.in);

    String month;
    int monthNum;
    double revenue;
    double budget;
    Expenses expenses;

    public CFODashboard(
        String month,
        int monthNum,
        double revenue,
        double budget,
        Expenses expenses
    ) {
        this.month = month;
        this.monthNum = monthNum;
        this.revenue = revenue;
        this.budget = budget;
        this.expenses = expenses;
    }

    public double grossProfit() {
        return revenue - directExpenses();
    }

    public double grossProfitPct() {
        return ((grossProfit()/revenue) * 100);
    }

    public double netProfit() {
        return grossProfit() - operatingExpenses() - variableOverhead() - fixedOverhead();
    }

    public double netProfitPct() {
        return (netProfit()/revenue) * 100;
    }

    public double fixedOverhead() {
        return (expenses.rent() + expenses.insurance() + expenses.businessLicense() + expenses.telephone());
    }

    public double fixedOverheadPct() {
        return (fixedOverhead()/revenue) * 100;
    }

    public double variableOverhead() {
        return (expenses.utilities() + expenses.maintenance());
    }

    public double variableOverheadPct() {
        return (variableOverhead()/revenue) * 100;
    }

    public double directExpenses(){
        return (expenses.COGS() + expenses.labor() + expenses.employeeMeals() + expenses.tax());
    }

    public double directExpensesPct(){
        return (directExpenses()/revenue) * 100;
    }

    public double operatingExpenses(){
        return (expenses.packaging() + expenses.creditCardFees() + expenses.marketing() + expenses.hardware());
    }

    public double operatingExpensesPct(){
        return (operatingExpenses()/revenue) * 100;
    }

    public double totalExpenses(){
        return directExpenses() + operatingExpenses() + variableOverhead() + fixedOverhead();
    }

    public double totalExpensesPct(){
        return (totalExpenses()/revenue) * 100;
    }

    public double budgetPercent(){
        return (totalExpenses()/budget) * 100;
    }

    public void onBudget(){
        double remaining = budget - totalExpenses();
        double percentUsed = (Math.round(budgetPercent() * 100)/100.0); //trucated to 2 decimal numbers w/printf

        if (remaining > 0){
            System.out.printf("You used %.2f%% of your budget ($%,.2f under)%n", percentUsed, remaining);
        } else if (remaining < 0){
            System.out.printf("You used %.2f%% of your budget ($%,.2f over)%n", percentUsed, -remaining);
        } else {
            System.out.println("You're exactly on budget");
        }
    }

    public static void compareMonths(CFODashboard month1, CFODashboard month2) {
        System.out.println();
        System.out.println(month1.month + " vs " + month2.month);

        System.out.printf(
            "%-22s %12s %12s %14s%n",
            "Metrics",
            month1.month,
            month2.month,
            "Difference"
        );

        System.out.printf(
            "%-22s $%,11.2f $%,11.2f $%+,12.2f%n%n",
            "Revenue",
            month1.revenue,
            month2.revenue,
            month1.revenue - month2.revenue
        );

        // Profit margins
        System.out.printf(
            "%-22s %11.1f%% %11.1f%% %+11.1f pts%n",
            "Gross Profit",
            month1.grossProfitPct(),
            month2.grossProfitPct(),
            month1.grossProfitPct() - month2.grossProfitPct()
        );

        System.out.printf(
            "%-22s %11.1f%% %11.1f%% %+11.1f pts%n",
            "Net Profit",
            month1.netProfitPct(),
            month2.netProfitPct(),
            month1.netProfitPct() - month2.netProfitPct()
        );

        System.out.printf(
            "%-22s %11.1f%% %11.1f%% %+11.1f pts%n%n",
            "Fixed Overhead",
            month1.fixedOverheadPct(),
            month2.fixedOverheadPct(),
            month1.fixedOverheadPct() - month2.fixedOverheadPct()
        );

        System.out.printf(
            "%-22s %11.1f%% %11.1f%% %+11.1f pts%n%n",
            "Variable Overhead",
            month1.variableOverheadPct(),
            month2.variableOverheadPct(),
            month1.variableOverheadPct() - month2.variableOverheadPct()
        );
        double direct1 =
            month1.directExpensesPct();

        double direct2 =
            month2.directExpensesPct();

        System.out.printf(
            "%-22s %11.1f%% %11.1f%% %+11.1f pts%n",
            "Direct Expenses",
            direct1,
            direct2,
            direct1 - direct2
        );

        double operating1 =
            month1.operatingExpensesPct();

        double operating2 =
            month2.operatingExpensesPct();

        System.out.printf(
            "%-22s %11.1f%% %11.1f%% %+11.1f pts%n",
            "Operating Expenses",
            operating1,
            operating2,
            operating1 - operating2
        );

        double total1 =
            month1.totalExpensesPct();

        double total2 =
            month2.totalExpensesPct();

        System.out.println();
        System.out.printf(
            "\033[1m%-22s %11.1f%% %11.1f%% %+11.1f pts\033[0m%n",
            "Total Expenses",
            total1,
            total2,
            total1 - total2
        );

        System.out.printf(
            "%-22s %11.1f%% %11.1f%% %+11.1f pts%n",
            "Budget Used",
            month1.budgetPercent(),
            month2.budgetPercent(),
            month1.budgetPercent() - month2.budgetPercent());
    }

    public static CFODashboard askForMonth(Scanner input, ArrayList<CFODashboard> months, String prompt){
        while (true){
            System.out.println(prompt);
            String answer = input.nextLine().trim();
            int monthNum;

            try {
                monthNum = Integer.parseInt(answer);
            }catch (NumberFormatException e){
                System.out.println("Please enter an integer");
                continue;
            }

            if (monthNum == 0){
                return null;
            }

            CFODashboard selected = findMonth(months, monthNum);

            if (selected == null){
                System.out.println("No data for month " + monthNum + ".");
                continue;
            }

            return selected;
        }
    }

    public static CFODashboard findMonth(ArrayList<CFODashboard> months, int monthNum){
        for (CFODashboard m: months){
            if (m.monthNum == monthNum){
                return m;
            } 
        }
        return null;
    }

    public void displayBoard() {
        System.out.println(month + "'s financial dashboard");
        System.out.printf("%-22s %12d%n", "Month Number", monthNum);
        System.out.printf("%-22s %12s%n", "Revenue", String.format("$%,.2f", revenue));

        System.out.println();
        System.out.printf("%-22s %12s%n", "Maintenance", String.format("$%,.2f", expenses.maintenance()));
        System.out.printf("%-22s %12s%n", "Hardware",    String.format("$%,.2f", expenses.hardware()));
        System.out.printf("%-22s %12s%n", "Utilities",   String.format("$%,.2f", expenses.utilities()));
        System.out.printf("%-22s %12s%n", "COGS",        String.format("$%,.2f", expenses.COGS()));
        System.out.printf("%-22s %12s%n", "Labor",       String.format("$%,.2f", expenses.labor()));

        System.out.println();
        System.out.printf("\033[1m%-22s %11.1f%%\033[0m%n", "Gross Profit", grossProfitPct());
        System.out.printf("\033[1m%-22s %11.1f%%\033[0m%n", "Net Profit",   netProfitPct());

        System.out.println();
        System.out.printf("\033[1m%-22s %11.1f%%\033[0m%n", "Variable Overhead", variableOverheadPct());
        System.out.printf("\033[1m%-22s %11.1f%%\033[0m%n", "Fixed Overhead",    fixedOverheadPct());

        System.out.println();
        System.out.printf("\033[1m%-22s %11.1f%%\033[0m%n", "Direct Expenses",    directExpensesPct());
        System.out.printf("\033[1m%-22s %11.1f%%\033[0m%n", "Operating Expenses", operatingExpensesPct());

        System.out.println();
        System.out.printf("\033[1m%-22s %11.1f%%\033[0m%n", "Total Expenses", totalExpensesPct());

        System.out.println();
        System.out.printf("%-22s %12s%n", "Budget", String.format("$%,.2f", budget));
        System.out.printf("%-22s %11.1f%%%n", "Budget Used", budgetPercent());

        onBudget();
    }

    public static double parseAmount(String cell) {
        if (cell == null || cell.trim().isEmpty()) {
            return 0.0;
        }
        try {
            return Double.parseDouble(
                cell.trim().replace(",", "") //in case for inputs w/comma (e.g. 1,800)
            );
        } catch (NumberFormatException e) { 
            return 0.0;
        }
    }

    public static String[] parseCsvLine(String line) {
        String[] fields = line.split(",", -1); //counts for empty fields
        for (int i = 0; i < fields.length; i++) {
            fields[i] = fields[i].trim();
        }
        return fields;
    }

    private static String num(double value) { //formats a double for JSON; .ROOT for US locale formatting issue
        return String.format(java.util.Locale.ROOT, "%.2f", value);
    }

    public static void writeJson(ArrayList<CFODashboard> months, String path) {
        File parent = new File(path).getParentFile();
        if (parent != null) {
            parent.mkdirs();              // create the folder if absent
        }

        try (PrintWriter out = new PrintWriter(path)) {
            out.println("{");
            out.println("  \"generated\": \"" + java.time.LocalDate.now() + "\",");
            out.println("  \"months\": [");

            for (int i = 0; i < months.size(); i++) {
                CFODashboard m = months.get(i);
                out.println("    {");
                out.println("      \"month\": \"" + m.month + "\",");
                out.println("      \"monthNum\": " + m.monthNum + ",");
                out.println("      \"revenue\": " + num(m.revenue) + ",");
                out.println();
                out.println("      \"maintenance\": " + num(m.expenses.maintenance()) + ",");
                out.println("      \"hardware\": " + num(m.expenses.hardware()) + ",");
                out.println("      \"utilities\": " + num(m.expenses.utilities()) + ",");
                out.println("      \"cogs\": " + num(m.expenses.COGS()) + ",");
                out.println("      \"labor\": " + num(m.expenses.labor()) + ",");
                out.println();
                out.println("      \"grossProfit\": " + num(m.grossProfit()) + ",");
                out.println("      \"netProfit\": " + num(m.netProfit()) + ",");
                out.println();
                out.println("      \"variableOverhead\": " + num(m.variableOverhead()) + ",");
                out.println("      \"fixedOverhead\": " + num(m.fixedOverhead()) + ",");
                out.println();
                out.println("      \"directExpenses\": " + num(m.directExpenses()) + ",");
                out.println("      \"operatingExpenses\": " + num(m.operatingExpenses()) + ",");
                out.println();
                out.println("      \"totalExpenses\": " + num(m.totalExpenses()) + ",");
                out.println();
                out.println("      \"budget\": " + num(m.budget) + ",");
                out.println("      \"budgetPercent\": " + num(m.budgetPercent()));
                out.println("    }" + (i < months.size() - 1 ? "," : ""));
            }

            out.println("  ]");
            out.println("}");
        } catch (FileNotFoundException e) {
            System.out.println("Could not write JSON: " + e.getMessage());
        }
    }

    /** Canonical fields in the order data/expenses.csv uses them.
        Doubles as the positional fallback when no mapping is available. */
    static final List<String> EXPENSE_FIELDS = List.of(
        "month num", "cogs", "packaging", "rent", "utilities", "maintenance",
        "hardware", "insurance", "marketing", "credit card fees",
        "business license", "telephone", "employee meals", "tax", "labor");

    /** Canonical fields in the order data/dashboard.csv uses them. */
    static final List<String> DASHBOARD_FIELDS = List.of(
        "month", "month num", "revenue", "budget");

    // Built on first use, not at class load, so a missing API key breaks only
    // the mapping step instead of stopping the program from starting at all.
    private static AnthropicClient anthropic;

    private static AnthropicClient anthropic() {
        if (anthropic == null) {
            anthropic = AnthropicOkHttpClient.fromEnv();
        }
        return anthropic;
    }

    /** Lowercase, collapse punctuation - so "Cost of Goods " and "cost_of_goods"
        compare equal. */
    static String normalise(String s) {
        return s == null ? "" : s.toLowerCase().replaceAll("[^a-z0-9]+", " ").trim();
    }

    /**
     * Works out which column index holds each canonical field for one CSV file.
     *
     * Headers that already match by name are resolved locally for free; only the
     * leftovers go to the model, and only header text ever leaves the machine -
     * never a row of figures. If the call fails, falls back to the positional
     * order in `fields`, which is what the old hardcoded indices did.
     */
    static Map<String, Integer> resolveColumns(String[] headers, List<String> fields) {
        Map<String, Integer> col = new HashMap<>();

        // 1. free pass: exact match after normalising
        for (int i = 0; i < headers.length; i++) {
            String h = normalise(headers[i]);
            for (String f : fields) {
                if (!col.containsKey(f) && normalise(f).equals(h)) {
                    col.put(f, i);
                    break;
                }
            }
        }
        if (col.size() == fields.size()) {
            return col;                      // everything placed, no API call needed
        }

        List<String> unplaced = new ArrayList<>();
        for (String f : fields) {
            if (!col.containsKey(f)) unplaced.add(f);
        }

        String prompt = """
            You are mapping spreadsheet column headers to canonical accounting fields.

            Canonical fields still needing a column: %s

            The file's headers, in order: %s

            Reply with JSON only - no prose, no code fences. One key per canonical
            field listed above, whose value is the header text it corresponds to,
            or null if no header fits. Copy header text exactly as given.
            Example: {"cogs": "Cost of Goods", "labor": null}
            """.formatted(String.join(", ", unplaced), String.join(", ", headers));

        try {
            MessageCreateParams params = MessageCreateParams.builder()
                .model("claude-opus-5")
                .maxTokens(1024L)
                .addUserMessage(prompt)
                .build();

            Message response = anthropic().messages().create(params);

            String text = response.content().stream()
                .flatMap(block -> block.text().stream())
                .map(t -> t.text())
                .collect(Collectors.joining());

            // Be forgiving about fences or stray prose around the object.
            int open = text.indexOf('{'), close = text.lastIndexOf('}');
            if (open < 0 || close <= open) {
                System.out.println("Column mapping: model did not return JSON, using column order instead");
                return positional(fields);
            }

            Map<String, String> reply = new ObjectMapper().readValue(
                text.substring(open, close + 1),
                new TypeReference<Map<String, String>>() {});

            // 2. turn header NAMES into column INDICES, rejecting anything invented
            for (Map.Entry<String, String> e : reply.entrySet()) {
                String field = e.getKey(), header = e.getValue();
                if (header == null || !unplaced.contains(field)) continue;

                int idx = -1;
                for (int i = 0; i < headers.length; i++) {
                    if (normalise(headers[i]).equals(normalise(header))) { idx = i; break; }
                }
                if (idx < 0) {
                    System.out.println("Column mapping: ignoring \"" + header + "\" - not a header in this file");
                    continue;
                }
                if (!col.containsValue(idx)) col.put(field, idx);
            }

            for (String f : fields) {
                if (!col.containsKey(f)) {
                    System.out.println("Column mapping: no column for \"" + f + "\", treating it as 0");
                }
            }
            return col;

        } catch (Exception e) {
            System.out.println("Column mapping unavailable (" + e.getMessage() + "), using column order instead");
            return positional(fields);
        }
    }

    /** field 0 -> column 0, field 1 -> column 1 ... the original hardcoded behaviour. */
    static Map<String, Integer> positional(List<String> fields) {
        Map<String, Integer> col = new HashMap<>();
        for (int i = 0; i < fields.size(); i++) col.put(fields.get(i), i);
        return col;
    }

    /** Reads one field out of a row, tolerating a missing or out-of-range column. */
    static double cell(String[] row, Map<String, Integer> col, String field) {
        Integer i = col.get(field);
        if (i == null || i < 0 || i >= row.length) return 0.0;
        return parseAmount(row[i]);
    }

    public static void main(String[] args) {
        ArrayList<CFODashboard> months = new ArrayList<>();
        HashMap<Integer, Expenses> expensesByMonth = new HashMap<>(); //creates hashmap to link all the .javas via monthNum
        
        try{ //expenses .csv first; double check on the order of the csvs3
            File file = new File("data/expenses.csv");
            Scanner expenseReader = new Scanner(file);
            expenseReader.nextLine();

            while(expenseReader.hasNextLine()){
                String line = expenseReader.nextLine();
                String[] eData = parseCsvLine(line);

                int monthNum           = (int) parseAmount(eData[0]);
                double COGS            = parseAmount(eData[1]);
                double packaging       = parseAmount(eData[2]);
                double rent            = parseAmount(eData[3]);
                double utilities       = parseAmount(eData[4]);
                double maintenance     = parseAmount(eData[5]);
                double hardware        = parseAmount(eData[6]);
                double insurance       = parseAmount(eData[7]);
                double marketing       = parseAmount(eData[8]);
                double creditCardFees  = parseAmount(eData[9]);
                double businessLicense = parseAmount(eData[10]);
                double telephone       = parseAmount(eData[11]);
                double employeeMeals   = parseAmount(eData[12]);
                double tax             = parseAmount(eData[13]);
                double labor           = parseAmount(eData[14]);

                Expenses expenses = new Expenses(
                    monthNum,
                    COGS,
                    packaging,
                    rent,
                    utilities,
                    maintenance,
                    hardware,
                    insurance,
                    marketing,
                    creditCardFees,
                    businessLicense,
                    telephone,
                    employeeMeals,
                    tax,
                    labor
                );

                expensesByMonth.put(monthNum, expenses); //into hashmap
            }
            expenseReader.close();
        } catch (FileNotFoundException e){
            System.out.println("Expenses file not found"); 
        }

        try{
            File file = new File("data/dashboard.csv");
            Scanner fileReader = new Scanner(file);
            fileReader.nextLine(); //skips the header

            while(fileReader.hasNextLine()){
                String line = fileReader.nextLine();

                String[] data = parseCsvLine(line);
                String month = data[0];
                int monthNum = (int) parseAmount(data[1]);
                double revenue = parseAmount(data[2]);
                double budget = parseAmount(data[3]);
                Expenses expenses = expensesByMonth.get(monthNum); //retrieves the monthNum's expenses object

                if (expenses == null){
                    System.out.println("No expenses for month " + monthNum + ", skipping month");
                    continue;
                }
                
                CFODashboard monthly = new CFODashboard(
                    month,
                    monthNum,
                    revenue,
                    budget,
                    expenses
                );

                months.add(monthly);
            }
            fileReader.close();

        } catch (FileNotFoundException e) {
                System.out.println("File not found");
        } 

        System.out.println("Months on file:");
        for (CFODashboard m: months){
            System.out.println(m.monthNum + " - " + m.month);
        }

        writeJson(months, "docs/data.json");

        while(true){
            CFODashboard selectedMonth = askForMonth(input, months, "Which month's dashboard do you wish to see? (month num, 0 to quit)");
            
            if (selectedMonth == null){
                break;
            }

            selectedMonth.displayBoard();
            
            while(true){
                CFODashboard comparativeMonth = askForMonth(input, months, "Which month's dashboard would you like to compare it to? (month num, 0 to quit)");
                
                if (comparativeMonth == null){
                    break;
                }

                compareMonths(selectedMonth, comparativeMonth);
            }
        }

        
        input.close();
    }
}