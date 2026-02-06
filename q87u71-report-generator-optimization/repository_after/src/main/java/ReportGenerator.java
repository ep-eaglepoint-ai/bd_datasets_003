import java.text.SimpleDateFormat;
import java.text.NumberFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class ReportGenerator {
    
    /**
     * Generates a formatted transaction report.
     * 
     * @param transactions List of transactions to include in the report
     * @param reportTitle Title to display at the top of the report
     * @return Formatted report as a string
     */
    public String generateReport(List<Transaction> transactions, String reportTitle) {
        // OPTIMIZATION 1: Use StringBuilder instead of String concatenation
        // String concatenation in loops creates O(n²) intermediate String objects
        // StringBuilder uses a resizable array and appends in O(1) amortized time
        StringBuilder report = new StringBuilder(estimateCapacity(transactions.size()));
        
        // OPTIMIZATION 2: Create formatters once per method call, not per transaction
        // Requirement 11: Date and number formatters instantiated at most once per method call
        SimpleDateFormat headerDateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        
        // Add header
        report.append("=".repeat(80)).append("\n");
        report.append(reportTitle).append("\n");
        report.append("Generated: ").append(headerDateFormat.format(new Date())).append("\n");
        report.append("Total Transactions: ").append(transactions.size()).append("\n");
        report.append("=".repeat(80)).append("\n\n");
        
        // Add transaction details
        formatTransactions(transactions, report);
        
        // Add summary
        report.append("\n").append("=".repeat(80)).append("\n");
        generateSummary(transactions, report);
        report.append("=".repeat(80)).append("\n");
        
        return report.toString();
    }
    
    /**
     * Estimates the capacity needed for the StringBuilder to minimize resizing.
     * Each transaction takes approximately 250 characters.
     */
    private int estimateCapacity(int transactionCount) {
        // Header: ~200 chars, Summary: ~300 chars, Each transaction: ~250 chars
        return 500 + (transactionCount * 250);
    }
    
    /**
     * Formats all transactions into a readable string.
     * 
     * PERFORMANCE ANALYSIS OF ORIGINAL CODE:
     * - String concatenation (result = result + "...") creates a new String object each time
     * - For N transactions with M operations each, this creates O(N*M) intermediate strings
     * - Each concatenation copies all previous characters, resulting in O(N²) time complexity
     * - Memory usage is O(N²) due to all intermediate string copies being created
     * - Garbage collector pressure increases dramatically with large datasets
     * 
     * OPTIMIZED APPROACH:
     * - StringBuilder maintains a single mutable character buffer
     * - Appends are O(1) amortized (occasional resize is O(n) but rare)
     * - Total time complexity: O(N) where N is number of transactions
     * - Space complexity: O(M) where M is final output size
     * - Single pass through data (Requirement 10)
     */
    private void formatTransactions(List<Transaction> transactions, StringBuilder result) {
        // OPTIMIZATION 2: Create date formatter once, not per transaction (Requirement 11)
        SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd");
        NumberFormat currencyFormat = NumberFormat.getCurrencyInstance(Locale.US);
        
        for (int i = 0; i < transactions.size(); i++) {
            Transaction t = transactions.get(i);
            
            // OPTIMIZATION 3: Handle null values gracefully (Requirement 5)
            // Format each transaction
            result.append("Transaction #").append(i + 1).append("\n");
            result.append("-".repeat(40)).append("\n");
            result.append("  ID:          ").append(t.getId()).append("\n");
            
            // Handle null date
            if (t.getDate() != null) {
                result.append("  Date:        ").append(dateFormat.format(t.getDate())).append("\n");
            } else {
                result.append("  Date:        null\n");
            }
            
            result.append("  Description: ").append(t.getDescription()).append("\n");
            result.append("  Category:    ").append(t.getCategory()).append("\n");
            result.append("  Amount:      ").append(currencyFormat.format(t.getAmount())).append("\n");
            result.append("  Status:      ").append(t.getStatus()).append("\n");
            result.append("\n");
        }
    }
    
    /**
     * Generates a summary of all transactions.
     * 
     * OPTIMIZATION: Uses StringBuilder and single pass through data
     */
    private void generateSummary(List<Transaction> transactions, StringBuilder summary) {
        // OPTIMIZATION 2: Create currency formatter once (Requirement 11)
        NumberFormat currencyFormat = NumberFormat.getCurrencyInstance(Locale.US);
        
        double total = 0;
        double maxAmount = Double.MIN_VALUE;
        double minAmount = Double.MAX_VALUE;
        int creditCount = 0;
        int debitCount = 0;
        
        // OPTIMIZATION: Single pass through transactions (Requirement 10)
        for (Transaction t : transactions) {
            total += t.getAmount();
            if (t.getAmount() > maxAmount) {
                maxAmount = t.getAmount();
            }
            if (t.getAmount() < minAmount) {
                minAmount = t.getAmount();
            }
            if (t.getAmount() >= 0) {
                creditCount++;
            } else {
                debitCount++;
            }
        }
        
        // Handle edge case: empty transaction list (Requirement 5)
        double average = transactions.isEmpty() ? 0 : total / transactions.size();
        
        summary.append("SUMMARY\n");
        summary.append("-".repeat(40)).append("\n");
        summary.append("  Total Amount:    ").append(currencyFormat.format(total)).append("\n");
        summary.append("  Average Amount:  ").append(currencyFormat.format(average)).append("\n");
        summary.append("  Highest Amount:  ").append(currencyFormat.format(maxAmount)).append("\n");
        summary.append("  Lowest Amount:   ").append(currencyFormat.format(minAmount)).append("\n");
        summary.append("  Credit Count:    ").append(creditCount).append("\n");
        summary.append("  Debit Count:     ").append(debitCount).append("\n");
    }
}

class Transaction {
    private String id;
    private Date date;
    private String description;
    private String category;
    private double amount;
    private String status;
    
    public Transaction(String id, Date date, String description, String category, double amount, String status) {
        this.id = id;
        this.date = date;
        this.description = description;
        this.category = category;
        this.amount = amount;
        this.status = status;
    }
    
    public String getId() { return id; }
    public Date getDate() { return date; }
    public String getDescription() { return description; }
    public String getCategory() { return category; }
    public double getAmount() { return amount; }
    public String getStatus() { return status; }
}
