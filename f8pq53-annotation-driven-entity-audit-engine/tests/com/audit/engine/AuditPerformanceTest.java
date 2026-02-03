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
    private StartupAnnotationScanner scanner;

    @Test
    void measureAnnotationScanningTime() {
        long time = scanner.getScanningTimeMs();
        System.out.println("Annotation Scanning Time: " + time + " ms");
        assertTrue(time >= 0);
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

        int iterations = 10000;
        long start = System.nanoTime();
        
        for (int i = 0; i < iterations; i++) {
            changeDetector.detectChanges(oldState, newState);
        }
        
        long end = System.nanoTime();
        double avgTime = (end - start) / (double) iterations;
        
        System.out.println("Reflection Overhead per Update: " + avgTime + " ns");
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

        int iterations = 10000;
        long start = System.nanoTime();
        
        for (int i = 0; i < iterations; i++) {
            objectMapper.writeValueAsString(log);
        }
        
        long end = System.nanoTime();
        double avgTime = (end - start) / (double) iterations;
        
        System.out.println("Serialization Latency: " + avgTime + " ns");
    }
}
