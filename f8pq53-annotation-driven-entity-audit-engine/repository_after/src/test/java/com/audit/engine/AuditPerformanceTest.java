package com.audit.engine;

import com.audit.engine.config.StartupAnnotationScanner;
import com.audit.engine.core.ChangeDetector;
import com.audit.engine.demo.DemoAddress;
import com.audit.engine.demo.DemoEntity;
import com.audit.engine.model.AuditLog;
import com.audit.engine.model.FieldChange;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
public class AuditPerformanceTest {

    @Autowired
    private ChangeDetector changeDetector;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private StartupAnnotationScanner annotationScanner;

    @Test
    void measureAnnotationScanningTime() {
        long time = annotationScanner.getScanningTimeMs();
        System.out.println("Annotation Scanning Time: " + time + " ms");
        // High-precision validation: Scanning should be efficient (e.g. < 2000ms for small path)
        assertTrue(time >= 0);
        assertTrue(time < 2000, "Annotation scanning took too long (> 2000ms)");
    }

    @Test
    void measureReflectionOverhead() {
        DemoEntity oldState = new DemoEntity();
        oldState.setName("Old Name");
        oldState.setEmail("old@example.com");
        oldState.setAddress(new DemoAddress("Old Street", "Old City"));
        oldState.setTags(Collections.singletonList("tag1"));

        DemoEntity newState = new DemoEntity();
        newState.setName("New Name");
        newState.setEmail("new@example.com");
        newState.setAddress(new DemoAddress("New Street", "New City"));
        newState.setTags(Collections.singletonList("tag2"));

        // Increase iterations for high precision measurement
        int iterations = 100_000;
        // Warmup
        for (int i = 0; i < 1000; i++) {
             changeDetector.detectChanges(oldState, newState);
        }
        
        long start = System.nanoTime();
        
        for (int i = 0; i < iterations; i++) {
            changeDetector.detectChanges(oldState, newState);
        }
        
        long end = System.nanoTime();
        double avgTime = (end - start) / (double) iterations;
        
        System.out.println("Reflection Overhead per Update: " + avgTime + " ns");
        // High-precision threshold: < 100,000 ns (0.1ms) per update for small graph
        assertTrue(avgTime < 100_000, "Reflection overhead is too high (> 0.1ms)");
    }

    @Test
    void measureSerializationLatency() throws Exception {
        AuditLog log = new AuditLog();
        log.setEntityId("1");
        log.setEntityType("DemoEntity");
        log.setAction("UPDATE");
        log.setUserId("user");
        log.setTimestamp(java.time.LocalDateTime.now());
        log.addChange(new FieldChange("name", "Old Name", "New Name"));
        log.addChange(new FieldChange("address.street", "Old Street", "New Street"));

        int iterations = 100_000;
        // Warmup
        for (int i = 0; i < 1000; i++) {
             objectMapper.writeValueAsString(log);
        }

        long start = System.nanoTime();
        
        for (int i = 0; i < iterations; i++) {
            objectMapper.writeValueAsString(log);
        }
        
        long end = System.nanoTime();
        double avgTime = (end - start) / (double) iterations;
        
        System.out.println("Serialization Latency: " + avgTime + " ns");
        // High-precision threshold: < 200,000 ns (0.2ms)
        assertTrue(avgTime < 200_000, "Serialization latency is too high (> 0.2ms)");
    }
}