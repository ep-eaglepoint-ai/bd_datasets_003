package com.audit.engine;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication
@EnableJpaRepositories
public class AuditEngineApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuditEngineApplication.class, args);
    }
}
