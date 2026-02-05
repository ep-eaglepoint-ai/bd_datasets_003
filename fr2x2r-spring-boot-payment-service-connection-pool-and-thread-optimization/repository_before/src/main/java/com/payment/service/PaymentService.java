package com.payment.service;

import com.payment.client.BankClient;
import com.payment.client.FraudCheckClient;
import com.payment.model.Payment;
import com.payment.model.Transaction;
import com.payment.repository.PaymentRepository;
import com.payment.repository.TransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class PaymentService {

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private BankClient bankClient;

    @Autowired
    private FraudCheckClient fraudCheckClient;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    private final ExecutorService executor = Executors.newCachedThreadPool();

    @Transactional
    public Payment processPayment(Long customerId, BigDecimal amount, String currency) {
        Payment payment = new Payment();
        payment.setCustomerId(customerId);
        payment.setAmount(amount);
        payment.setCurrency(currency);
        payment.setStatus("PENDING");
        
        payment = paymentRepository.save(payment);
        
        boolean fraudulent = fraudCheckClient.checkFraud(customerId, amount);
        if (fraudulent) {
            payment.setStatus("REJECTED");
            paymentRepository.save(payment);
            throw new RuntimeException("Payment rejected due to fraud check");
        }
        
        String externalRef = bankClient.processPayment(amount, currency);
        
        Transaction transaction = new Transaction();
        transaction.setPaymentId(payment.getId());
        transaction.setType("CHARGE");
        transaction.setAmount(amount);
        transaction.setStatus("COMPLETED");
        transaction.setExternalRef(externalRef);
        transactionRepository.save(transaction);
        
        payment.setStatus("COMPLETED");
        paymentRepository.save(payment);
        
        cachePaymentStatus(payment.getId(), "COMPLETED");
        
        return payment;
    }

    public Payment getPaymentWithRetry(Long paymentId) {
        String cacheKey = "payment:" + paymentId;
        String cachedStatus = (String) redisTemplate.opsForValue().get(cacheKey);
        
        if (cachedStatus != null) {
            Payment payment = paymentRepository.findById(paymentId).orElse(null);
            return payment;
        }
        
        Payment payment = paymentRepository.findById(paymentId).orElse(null);
        if (payment != null) {
            cachePaymentStatus(payment.getId(), payment.getStatus());
        }
        return payment;
    }

    public CompletableFuture<Payment> processPaymentAsync(Long customerId, BigDecimal amount, String currency) {
        return CompletableFuture.supplyAsync(() -> {
            return processPayment(customerId, amount, currency);
        }, executor);
    }

    public void processBulkPayments(java.util.List<Payment> payments) {
        for (Payment payment : payments) {
            executor.submit(() -> {
                processPayment(payment.getCustomerId(), payment.getAmount(), payment.getCurrency());
            });
        }
    }

    private void cachePaymentStatus(Long paymentId, String status) {
        String cacheKey = "payment:" + paymentId;
        redisTemplate.opsForValue().set(cacheKey, status, Duration.ofMinutes(30));
    }
}
