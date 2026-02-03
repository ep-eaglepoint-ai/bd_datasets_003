package com.example.eventsourcing.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration properties for the Event Sourcing system.
 */
@Configuration
@ConfigurationProperties(prefix = "eventsourcing")
public class EventSourcingProperties {
    
    private SnapshotConfig snapshot = new SnapshotConfig();
    private ProjectionConfig projection = new ProjectionConfig();
    
    public SnapshotConfig getSnapshot() {
        return snapshot;
    }
    
    public void setSnapshot(SnapshotConfig snapshot) {
        this.snapshot = snapshot;
    }
    
    public ProjectionConfig getProjection() {
        return projection;
    }
    
    public void setProjection(ProjectionConfig projection) {
        this.projection = projection;
    }
    
    public static class SnapshotConfig {
        private int threshold = 10;
        
        public int getThreshold() {
            return threshold;
        }
        
        public void setThreshold(int threshold) {
            this.threshold = threshold;
        }
    }
    
    public static class ProjectionConfig {
        private int batchSize = 100;
        
        public int getBatchSize() {
            return batchSize;
        }
        
        public void setBatchSize(int batchSize) {
            this.batchSize = batchSize;
        }
    }
}
