import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.models.messages.ContentBlock;
import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.MessageCreateParams;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Works out which column of a CSV file holds each field.
 *
 * Headers that already match a field's name are matched here, for free. Only
 * what is left goes to Claude, and only the header TEXT ever leaves the
 * computer, never a row of figures. If that request fails, the columns are
 * assumed to be in the usual order, which is what the program did before it
 * could match columns at all.
 */
public class ColumnMapper {

    /** Which column each field is in, and which cost group each unmatched column belongs to. */
    public static class ColumnMap {
        final Map<String, Integer> columns = new HashMap<>();   // field name -> column index
        final Map<Integer, String> leftovers = new HashMap<>(); // column index -> cost group
    }

    /** The four cost groups an unmatched column can be put in. */
    static final List<String> COST_GROUPS = List.of("direct", "operating", "variable", "fixed");

    /** Columns that are read when a file has them but are never asked about:
        a Year column is not a cost, and asking about it would send a request
        on every run for nothing. */
    static final List<String> OPTIONAL_HEADERS = List.of("year");

    // Made on first use, not when the program starts, so a missing API key
    // only breaks the matching step instead of stopping the program.
    private static AnthropicClient anthropic;

    private static AnthropicClient anthropic() {
        if (anthropic == null) {
            anthropic = AnthropicOkHttpClient.fromEnv();
        }
        return anthropic;
    }

    /** Lower case with punctuation collapsed, so "Cost of Goods " and "cost_of_goods" are equal. */
    static String normalise(String text) {
        if (text == null) {
            return "";
        }
        return text.toLowerCase().replaceAll("[^a-z0-9]+", " ").trim();
    }

    /** Where a header is, compared loosely. -1 when the file does not have it. */
    static int indexOfHeader(String[] headers, String header) {
        for (int index = 0; index < headers.length; index++) {
            if (normalise(headers[index]).equals(normalise(header))) {
                return index;
            }
        }
        return -1;
    }

    /** Field 0 in column 0, field 1 in column 1, and so on, with no leftovers. */
    static ColumnMap columnsInUsualOrder(List<String> fields) {
        ColumnMap map = new ColumnMap();
        for (int index = 0; index < fields.size(); index++) {
            map.columns.put(fields.get(index), index);
        }
        return map;
    }

    /** The total of every unmatched column put in this cost group, for one row. */
    static double leftoverTotal(String[] row, ColumnMap map, String costGroup) {
        double total = 0;
        for (Map.Entry<Integer, String> leftover : map.leftovers.entrySet()) {
            if (!costGroup.equals(leftover.getValue())) {
                continue;
            }
            int column = leftover.getKey();
            if (column >= 0 && column < row.length) {
                total += CsvFile.parseAmount(row[column]);
            }
        }
        return total;
    }

    private static String buildPrompt(String[] headers, List<String> unplacedFields, List<Integer> unclaimedColumns) {
        List<String> unclaimedHeaders = new ArrayList<>();
        for (int column : unclaimedColumns) {
            unclaimedHeaders.add(headers[column]);
        }

        return """
            You are mapping spreadsheet column headers to canonical accounting fields.

            Canonical fields still needing a column: %s

            Columns not yet spoken for: %s

            All of the file's headers, in order: %s

            Reply with JSON only - no prose, no code fences - shaped like:
            {"mapping": {"cogs": "Cost of Goods", "labor": null},
             "other":   {"Bank service charge": "operating"}}

            "mapping": one key per canonical field listed above, whose value is the
            header text it corresponds to, or null if no header fits.

            "other": for each unspoken-for column that is a real cost, which of these
            four buckets it behaves like: direct (traceable to a unit or job),
            operating (scales with volume but not per-unit), variable (rises with
            activity, not proportionally), fixed (does not move with sales).
            Omit a column entirely if it is not a cost, or if it is a subtotal of
            other columns - counting a subtotal alongside its parts double-counts it.

            Copy header text exactly as given.
            """.formatted(String.join(", ", unplacedFields),
                          String.join(", ", unclaimedHeaders),
                          String.join(", ", headers));
    }

    private static String askClaude(String prompt) {
        // Room for the model's thinking as well as the small reply: Claude
        // Opus 5.5 always thinks before it answers.
        MessageCreateParams request = MessageCreateParams.builder()
            .model("claude-opus-5-5")
            .maxTokens(16000L)
            .addUserMessage(prompt)
            .build();
        Message response = anthropic().messages().create(request);

        StringBuilder text = new StringBuilder();
        for (ContentBlock block : response.content()) {
            if (block.text().isPresent()) {
                text.append(block.text().get().text());
            }
        }
        return text.toString();
    }

    /** Fills map.columns from Claude's "mapping", refusing any header the file does not have. */
    private static void useMapping(JsonNode mapping, String[] headers, List<String> unplacedFields, ColumnMap map) {
        for (Iterator<String> names = mapping.fieldNames(); names.hasNext(); ) {
            String field = names.next();
            JsonNode header = mapping.get(field);
            if (header == null || header.isNull() || !unplacedFields.contains(field)) {
                continue;
            }

            int column = indexOfHeader(headers, header.asText());
            if (column < 0) {
                System.out.println("Column mapping: ignoring \"" + header.asText() + "\" - not a header in this file");
                continue;
            }
            if (!map.columns.containsValue(column)) {
                map.columns.put(field, column);
            }
        }
    }

    /** Puts each still-unmatched column in the cost group Claude says it behaves
        like, so its money reaches the totals instead of disappearing. */
    private static void useLeftovers(JsonNode other, String[] headers, ColumnMap map) {
        for (Iterator<String> names = other.fieldNames(); names.hasNext(); ) {
            String header = names.next();
            String costGroup = other.get(header).asText("");
            if (!COST_GROUPS.contains(costGroup)) {
                continue;
            }
            int column = indexOfHeader(headers, header);
            if (column < 0 || map.columns.containsValue(column)) {
                continue;   // made up, or already matched
            }
            map.leftovers.put(column, costGroup);
        }
    }

    private static void reportWhatIsMissing(String[] headers, List<String> fields, ColumnMap map) {
        for (String field : fields) {
            if (!map.columns.containsKey(field)) {
                System.out.println("Column mapping: no column for \"" + field + "\", treating it as 0");
            }
        }
        for (int column = 0; column < headers.length; column++) {
            if (!map.columns.containsValue(column) && !map.leftovers.containsKey(column)) {
                System.out.println("Column mapping: \"" + headers[column] + "\" left out of every bucket");
            }
        }
    }

    /** Which column holds each of `fields` in a file with these headers. */
    public static ColumnMap resolveColumns(String[] headers, List<String> fields) {
        ColumnMap map = new ColumnMap();

        // 1. The free pass: a header that is a field's name, once normalised.
        for (int column = 0; column < headers.length; column++) {
            String header = normalise(headers[column]);
            for (String field : fields) {
                if (!map.columns.containsKey(field) && normalise(field).equals(header)) {
                    map.columns.put(field, column);
                    break;
                }
            }
        }

        List<String> unplacedFields = new ArrayList<>();
        for (String field : fields) {
            if (!map.columns.containsKey(field)) {
                unplacedFields.add(field);
            }
        }
        List<Integer> unclaimedColumns = new ArrayList<>();
        for (int column = 0; column < headers.length; column++) {
            boolean isOptional = OPTIONAL_HEADERS.contains(normalise(headers[column]));
            if (!map.columns.containsValue(column) && !isOptional) {
                unclaimedColumns.add(column);
            }
        }

        // Every field placed and every column spoken for: nothing to ask.
        if (unplacedFields.isEmpty() && unclaimedColumns.isEmpty()) {
            return map;
        }

        try {
            String reply = askClaude(buildPrompt(headers, unplacedFields, unclaimedColumns));

            // Forgiving about code fences or stray words around the object.
            int start = reply.indexOf('{');
            int end = reply.lastIndexOf('}');
            if (start < 0 || end <= start) {
                System.out.println("Column mapping: model did not return JSON, using column order instead");
                return columnsInUsualOrder(fields);
            }
            JsonNode answer = new ObjectMapper().readTree(reply.substring(start, end + 1));

            // 2. Header names into column positions; 3. leftovers into cost groups.
            useMapping(answer.path("mapping"), headers, unplacedFields, map);
            useLeftovers(answer.path("other"), headers, map);
            reportWhatIsMissing(headers, fields, map);
            return map;
        } catch (Exception error) {
            System.out.println("Column mapping unavailable (" + error.getMessage() + "), using column order instead");
            return columnsInUsualOrder(fields);
        }
    }
}
