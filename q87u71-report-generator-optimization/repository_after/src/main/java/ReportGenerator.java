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
        StringBuilder report = new StringBuilder(estimateCapacity(transactions.size()));
        
        // OPTIMIZATION 2: Create formatters once per method call (Requirement 11)
        // Strictly instantiated once and reused throughout the method
        SimpleDateFormat headerDateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        SimpleDateFormat transactionDateFormat = new SimpleDateFormat("yyyy-MM-dd");
        NumberFormat currencyFormat = NumberFormat.getCurrencyInstance(Locale.US);
        
        // Add header
        report.append("=".repeat(80)).append("\n");
        report.append(reportTitle).append("\n");
        report.append("Generated: ").append(headerDateFormat.format(new Date())).append("\n");
        report.append("Total Transactions: ").append(transactions.size()).append("\n");
        report.append("=".repeat(80)).append("\n\n");
        
        // Initialize summary variables
        double total = 0;
        double maxAmount = Double.MIN_VALUE;
        double minAmount = Double.MAX_VALUE;
        int creditCount = 0;
        int debitCount = 0;
        
        // OPTIMIZATION: Single pass through transactions (Requirement 10)
        // Combines formatting and summary calculation in one loop
        for (int i = 0; i < transactions.size(); i++) {
            Transaction t = transactions.get(i);
            
            // --- Formatting Logic ---
            
            // OPTIMIZATION 3: Handle null values gracefully (Requirement 5)
            report.append("Transaction #").append(i + 1).append("\n");
            report.append("-".repeat(40)).append("\n");
            report.append("  ID:          ").append(t.getId()).append("\n");
            
            if (t.getDate() != null) {
                report.append("  Date:        ").append(transactionDateFormat.format(t.getDate())).append("\n");
            } else {
                report.append("  Date:        null\n");
            }
            
            report.append("  Description: ").append(t.getDescription()).append("\n");
            report.append("  Category:    ").append(t.getCategory()).append("\n");
            report.append("  Amount:      ").append(currencyFormat.format(t.getAmount())).append("\n");
            report.append("  Status:      ").append(t.getStatus()).append("\n");
            report.append("\n");
            
            // --- Summary Logic ---
            double amt = t.getAmount();
            total += amt;
            if (amt > maxAmount) {
                maxAmount = amt;
            }
            if (amt < minAmount) {
                minAmount = amt;
            }
            if (amt >= 0) {
                creditCount++;
            } else {
                debitCount++;
            }
        }
        
        // Add summary section
        // Handle edge case: empty transaction list (Requirement 5)
        double average = transactions.isEmpty() ? 0 : total / transactions.size();
        
        report.append("\n").append("=".repeat(80)).append("\n");
        report.append("SUMMARY\n");
        report.append("-".repeat(40)).append("\n");
        report.append("  Total Amount:    ").append(currencyFormat.format(total)).append("\n");
        report.append("  Average Amount:  ").append(currencyFormat.format(average)).append("\n");
        report.append("  Highest Amount:  ").append(currencyFormat.format(maxAmount)).append("\n");
        report.append("  Lowest Amount:   ").append(currencyFormat.format(minAmount)).append("\n");
        report.append("  Credit Count:    ").append(creditCount).append("\n");
        report.append("  Debit Count:     ").append(debitCount).append("\n");
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
