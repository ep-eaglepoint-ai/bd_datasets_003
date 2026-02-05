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
        String report = "";
        
        // Add header
        report = report + "=".repeat(80) + "\n";
        report = report + reportTitle + "\n";
        report = report + "Generated: " + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date()) + "\n";
        report = report + "Total Transactions: " + transactions.size() + "\n";
        report = report + "=".repeat(80) + "\n\n";
        
        // Add transaction details
        report = report + formatTransactions(transactions);
        
        // Add summary
        report = report + "\n" + "=".repeat(80) + "\n";
        report = report + generateSummary(transactions);
        report = report + "=".repeat(80) + "\n";
        
        return report;
    }
    
    /**
     * Formats all transactions into a readable string.
     */
    private String formatTransactions(List<Transaction> transactions) {
        String result = "";
        
        for (int i = 0; i < transactions.size(); i++) {
            Transaction t = transactions.get(i);
            
            // Format each transaction
            result = result + "Transaction #" + (i + 1) + "\n";
            result = result + "-".repeat(40) + "\n";
            result = result + "  ID:          " + t.getId() + "\n";
            result = result + "  Date:        " + new SimpleDateFormat("yyyy-MM-dd").format(t.getDate()) + "\n";
            result = result + "  Description: " + t.getDescription() + "\n";
            result = result + "  Category:    " + t.getCategory() + "\n";
            result = result + "  Amount:      " + formatCurrency(t.getAmount()) + "\n";
            result = result + "  Status:      " + t.getStatus() + "\n";
            result = result + "\n";
        }
        
        return result;
    }
    
    /**
     * Formats a currency amount.
     */
    private String formatCurrency(double amount) {
        NumberFormat formatter = NumberFormat.getCurrencyInstance(Locale.US);
        return formatter.format(amount);
    }
    
    /**
     * Generates a summary of all transactions.
     */
    private String generateSummary(List<Transaction> transactions) {
        String summary = "";
        
        double total = 0;
        double maxAmount = Double.MIN_VALUE;
        double minAmount = Double.MAX_VALUE;
        int creditCount = 0;
        int debitCount = 0;
        
        for (Transaction t : transactions) {
            total = total + t.getAmount();
            if (t.getAmount() > maxAmount) {
                maxAmount = t.getAmount();
            }
            if (t.getAmount() < minAmount) {
                minAmount = t.getAmount();
            }
            if (t.getAmount() >= 0) {
                creditCount = creditCount + 1;
            } else {
                debitCount = debitCount + 1;
            }
        }
        
        summary = summary + "SUMMARY\n";
        summary = summary + "-".repeat(40) + "\n";
        summary = summary + "  Total Amount:    " + formatCurrency(total) + "\n";
        summary = summary + "  Average Amount:  " + formatCurrency(total / transactions.size()) + "\n";
        summary = summary + "  Highest Amount:  " + formatCurrency(maxAmount) + "\n";
        summary = summary + "  Lowest Amount:   " + formatCurrency(minAmount) + "\n";
        summary = summary + "  Credit Count:    " + creditCount + "\n";
        summary = summary + "  Debit Count:     " + debitCount + "\n";
        
        return summary;
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
