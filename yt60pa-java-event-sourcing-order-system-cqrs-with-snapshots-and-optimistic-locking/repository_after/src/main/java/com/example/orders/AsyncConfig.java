package com.example.orders;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

@Configuration
@EnableAsync
public class AsyncConfig {
    // Default executor is sufficient for this demo, 
    // properties in application.properties (spring.task.execution...) handle the pool config.
}
