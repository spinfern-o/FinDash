import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/**
 * The CSV splitter, which decides which number lands in which cost line.
 *
 * Every case here is one that used to come out wrong, silently: a row that
 * looked fine and put the rent in the utilities column.
 */
public class CsvFileTest {

    @Test
    void anAmountWithAThousandsSeparatorIsOneCell() {
        // Splitting on every comma made this seven fields instead of four, so
        // the cost of goods read 26 and every later column shifted along one.
        String[] fields = CsvFile.splitLine("7,\"26,000\",3400,\"12,000\"");
        assertArrayEquals(new String[] {"7", "26,000", "3400", "12,000"}, fields);
        assertEquals(26000.0, CsvFile.parseAmount(fields[1]));
        assertEquals(12000.0, CsvFile.parseAmount(fields[3]));
    }

    @Test
    void aQuoteInTheMiddleOfANameIsJustACharacter() {
        // A quote opens a field only at its start. Treating this one as an
        // opening quote swallowed the rest of the line into a single field,
        // and the month was dropped for having no month number.
        assertArrayEquals(new String[] {"jul 5\" pipe", "7", "72000"},
            CsvFile.splitLine("jul 5\" pipe,7,72000"));
    }

    @Test
    void aDoubledQuoteInsideAQuotedFieldIsOneQuote() {
        assertArrayEquals(new String[] {"jul \"peak\"", "7"},
            CsvFile.splitLine("\"jul \"\"peak\"\"\",7"));
    }

    @Test
    void emptyFieldsAreKept() {
        // Including the last one: a blank final cell must read as 0, not
        // disappear and leave the row a column short.
        assertArrayEquals(new String[] {"7", "", "3400", ""}, CsvFile.splitLine("7,,3400,"));
        assertEquals(0.0, CsvFile.parseAmount(""));
    }

    @Test
    void spacesAroundACellAreIgnored() {
        assertArrayEquals(new String[] {"july", "7", "72000"},
            CsvFile.splitLine(" july , 7 , 72000 "));
        assertArrayEquals(new String[] {"26,000"}, CsvFile.splitLine("  \"26,000\"  "));
    }
}
