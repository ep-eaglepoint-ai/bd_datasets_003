package com.audit.engine.config;

import com.audit.engine.annotation.Auditable;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;

@Component
public class StartupAnnotationScanner implements ApplicationListener<ApplicationReadyEvent> {

    private long scanningTimeMs;

    public long getScanningTimeMs() {
        return scanningTimeMs;
    }

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        Instant start = Instant.now();
        
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Auditable.class));
        
        Set<BeanDefinition> definitions = scanner.findCandidateComponents("com.audit.engine");
        
        Instant end = Instant.now();
        this.scanningTimeMs = Duration.between(start, end).toMillis();
        System.out.println("Annotation Scanning Time: " + scanningTimeMs + " ms");
        System.out.println("Found " + definitions.size() + " auditable entities.");
    }
}
