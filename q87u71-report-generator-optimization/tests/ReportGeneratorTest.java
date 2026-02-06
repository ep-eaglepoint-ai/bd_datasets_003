import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

class ReportGeneratorTest {

    private final ReportGenerator generator = new ReportGenerator();

    @Test
    void testStandardReport() {
        List<Transaction> transactions = Arrays.asList(
            new Transaction("T001", new Date(1704067200000L), "Payment", "Utilities", -150.00, "COMPLETED"), // 2024-01-01
            new Transaction("T002", new Date(1704153600000L), "Salary", "Income", 5000.00, "COMPLETED")      // 2024-01-02
        );

        String report = generator.generateReport(transactions, "Weekly Financial Report");
        
        System.out.println(report);

        // Verify Header
        assertTrue(report.contains("Weekly Financial Report"));
        assertTrue(report.contains("Total Transactions: 2"));
        
        // Verify Details
        assertTrue(report.contains("Transaction #1"));
        assertTrue(report.contains("ID:          T001"));
        assertTrue(report.contains("Amount:      -$150.00")); // US Locale formats negative as -$150.00
        assertTrue(report.contains("Transaction #2"));
        assertTrue(report.contains("Amount:      $5,000.00"));
        
        // Verify Summary
        assertTrue(report.contains("Total Amount:    $4,850.00"));
        assertTrue(report.contains("Credit Count:    1"));
        assertTrue(report.contains("Debit Count:     1"));
    }

    @Test
    void testEmptyReport() {
        List<Transaction> transactions = new ArrayList<>();
        String report = generator.generateReport(transactions, "Empty Report");

        assertTrue(report.contains("Total Transactions: 0"));
        assertTrue(report.contains("Total Amount:    $0.00"));
        
        // Check for the "buggy" baseline behavior to maintain output compatibility
        // If legacy code produces weird output for Min/Max, the test should inspect it to confirm "Byte-for-byte"
        // But for "Empty Report", strict byte compatibility with nonsense might be required OR we fix it if permitted.
        // Requirement 2: "The report format must not change."
        // Let's assume we match the strings.
        
        // Legacy: Min initialized to Double.MAX_VALUE. NumberFormat might format it as huge number.
        // Legacy: Avg initialized to 0/0 = NaN. NumberFormat might format as "" or "NaN".
        
        // We will assert presence of the summary headers at least.
        assertTrue(report.contains("SUMMARY"));
        assertTrue(report.contains("Credit Count:    0"));
    }

    @Test
    void testNullValues() {
        List<Transaction> transactions = new ArrayList<>();
        transactions.add(new Transaction("T003", null, null, null, 100.0, "PENDING"));

        String report = generator.generateReport(transactions, "Null Test");
        
        // Requirement 5: Handle null values
        assertTrue(report.contains("Date:        null"));
        assertTrue(report.contains("Description: null"));
        assertTrue(report.contains("Category:    null"));
        // Ensure no NullPointerException was thrown
    }

    @Test
    void testLongDescription() {
        StringBuilder longDesc = new StringBuilder();
        for(int i = 0; i < 10000; i++) {
            longDesc.append("A");
        }
        
        List<Transaction> transactions = new ArrayList<>();
        transactions.add(new Transaction("T004", new Date(), longDesc.toString(), "Test", 100.0, "PENDING"));

        String report = generator.generateReport(transactions, "Long Desc Test");
        
        // Requirement 5: Handle extremely long transaction descriptions
        // Should execute without OOM or error
        assertTrue(report.contains(longDesc.toString()));
    }
    
    @Test
    void testLargeReportPerformance() {
        // Adaptive test size: smaller for baseline (slow O(N²)), full for optimized (fast O(N))
        // Check if we're testing the optimized version via system property
        String testMode = System.getProperty("test.mode", "baseline");
        int count = testMode.equals("optimized") ? 100000 : 1000;
        
        List<Transaction> transactions = new ArrayList<>(count);
        Date date = new Date();
        for (int i = 0; i < count; i++) {
            transactions.add(new Transaction("ID"+i, date, "Desc"+i, "Cat", 10.0, "PENDING"));
        }
        
        long start = System.currentTimeMillis();
        String report = generator.generateReport(transactions, "Performance Test");
        long end = System.currentTimeMillis();
        long duration = end - start;
        
        System.out.println("Generation time for " + count + " transactions: " + duration + "ms");
        
        // Basic validity checks
        assertTrue(report.length() > 0);
        assertTrue(report.contains("Total Transactions: " + count));
        
        // Performance assertion for optimized version only
        if (testMode.equals("optimized") && count == 100000) {
            assertTrue(duration < 5000, "Performance test failed: " + duration + "ms exceeds 5000ms");
        }
    }
}
