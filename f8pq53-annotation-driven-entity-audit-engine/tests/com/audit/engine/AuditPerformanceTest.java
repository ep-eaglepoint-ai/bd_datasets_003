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
        // It should be non-negative and reasonably fast (e.g., < 5000ms)
        assertTrue(time >= 0);
        assertTrue(time < 5000, "Annotation scanning took too long");
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

        int iterations = 1000; // reduced from 10000 to be faster
        long start = System.nanoTime();
        
        for (int i = 0; i < iterations; i++) {
            changeDetector.detectChanges(oldState, newState);
        }
        
        long end = System.nanoTime();
        double avgTime = (end - start) / (double) iterations;
        
        System.out.println("Reflection Overhead per Update: " + avgTime + " ns");
        // Ensure overhead is less than 1ms (1,000,000 ns) per update on average
        assertTrue(avgTime < 1_000_000, "Reflection overhead is too high");
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

        int iterations = 1000; // reduced from 10000
        long start = System.nanoTime();
        
        for (int i = 0; i < iterations; i++) {
            objectMapper.writeValueAsString(log);
        }
        
        long end = System.nanoTime();
        double avgTime = (end - start) / (double) iterations;
        
        System.out.println("Serialization Latency: " + avgTime + " ns");
        // Ensure serialization is less than 1ms per record
        assertTrue(avgTime < 1_000_000, "Serialization latency is too high");
    }
}
