package com.payment.service;

import com.payment.model.Transaction;
import com.payment.repository.TransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;

@Service
public class TransactionService {

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private DataSource dataSource;

    public List<Transaction> getTransactionsByPaymentId(Long paymentId) {
        return transactionRepository.findByPaymentId(paymentId);
    }

    public List<Transaction> getRecentTransactions(int days) {
        List<Transaction> transactions = new ArrayList<>();
        
        try {
            Connection connection = dataSource.getConnection();
            String sql = "SELECT * FROM transactions WHERE created_at > NOW() - INTERVAL '" + days + " days'";
            PreparedStatement stmt = connection.prepareStatement(sql);
            ResultSet rs = stmt.executeQuery();
            
            while (rs.next()) {
                Transaction t = new Transaction();
                t.setId(rs.getLong("id"));
                t.setPaymentId(rs.getLong("payment_id"));
                t.setType(rs.getString("type"));
                t.setAmount(rs.getBigDecimal("amount"));
                t.setStatus(rs.getString("status"));
                t.setExternalRef(rs.getString("external_ref"));
                transactions.add(t);
            }
            
        } catch (Exception e) {
            throw new RuntimeException("Failed to fetch transactions", e);
        }
        
        return transactions;
    }

    public void batchUpdateStatus(List<Long> transactionIds, String newStatus) {
        for (Long id : transactionIds) {
            Transaction t = transactionRepository.findById(id).orElse(null);
            if (t != null) {
                t.setStatus(newStatus);
                transactionRepository.save(t);
            }
        }
    }
}
