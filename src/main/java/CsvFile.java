import java.util.Map;

/**
 * Reading cells out of a simple CSV file: one row per line, fields separated
 * by commas, no quoted fields.
 */
public class CsvFile {

    /** Splits one line into trimmed fields. Empty fields are kept. */
    public static String[] splitLine(String line) {
        String[] fields = line.split(",", -1);
        for (int index = 0; index < fields.length; index++) {
            fields[index] = fields[index].trim();
        }
        return fields;
    }

    /** "1,800" -> 1800.0. A blank or unreadable cell reads as 0. */
    public static double parseAmount(String cell) {
        if (cell == null || cell.trim().isEmpty()) {
            return 0.0;
        }
        try {
            return Double.parseDouble(cell.trim().replace(",", ""));
        } catch (NumberFormatException notANumber) {
            return 0.0;
        }
    }

    /** The column a field is in, or -1 when the file has no such column. */
    private static int columnOf(String[] row, Map<String, Integer> columns, String field) {
        Integer column = columns.get(field);
        if (column == null || column < 0 || column >= row.length) {
            return -1;
        }
        return column;
    }

    /** A field's text, or "" when the row does not have it. */
    public static String text(String[] row, Map<String, Integer> columns, String field) {
        int column = columnOf(row, columns, field);
        if (column < 0) {
            return "";
        }
        return row[column].trim();
    }

    /** A field's amount, or 0 when the row does not have it. */
    public static double amount(String[] row, Map<String, Integer> columns, String field) {
        int column = columnOf(row, columns, field);
        if (column < 0) {
            return 0.0;
        }
        return parseAmount(row[column]);
    }
}
