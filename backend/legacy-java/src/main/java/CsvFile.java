import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Reading cells out of a CSV file: one row per line, fields separated by
 * commas, and quoted fields for anything containing a comma of its own.
 */
public class CsvFile {

    /** Splits one line into trimmed fields. Empty fields are kept.
     *
     *  A quote opens a field only at its start, as CSV says, so "26,000" is one
     *  cell and a stray quote in the middle of a name is just a character.
     *  Splitting on every comma instead put 26 in the cost of goods and shifted
     *  every later column into the wrong field - rent read as utilities, and so
     *  on - with no error, which is how a whole dashboard comes out wrong and
     *  still looks right. A doubled "" inside a quoted field is one quote. */
    public static String[] splitLine(String line) {
        List<String> fields = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;

        for (int index = 0; index < line.length(); index++) {
            char character = line.charAt(index);
            if (inQuotes) {
                if (character != '"') {
                    field.append(character);
                } else if (index + 1 < line.length() && line.charAt(index + 1) == '"') {
                    field.append('"');
                    index++;
                } else {
                    inQuotes = false;
                }
            } else if (character == '"' && field.toString().isBlank()) {
                field.setLength(0);
                inQuotes = true;
            } else if (character == ',') {
                fields.add(field.toString().trim());
                field.setLength(0);
            } else {
                field.append(character);
            }
        }
        fields.add(field.toString().trim());
        return fields.toArray(new String[0]);
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
