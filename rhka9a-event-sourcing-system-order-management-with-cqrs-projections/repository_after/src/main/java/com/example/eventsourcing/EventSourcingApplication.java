package com.example.eventsourcing;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * Main Spring Boot application for Event Sourcing System.
 */
@SpringBootApplication
@EnableTransactionManagement
@EnableConfigurationProperties
public class EventSourcingApplication {
    
    public static void main(String[] args) {
        SpringApplication.run(EventSourcingApplication.class, args);
    }
}

