package com.example.eventsourcing.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Event sourcing configuration properties.
 */
@Configuration
@ConfigurationProperties(prefix = "event-sourcing")
public class EventSourcingProperties {
    
    private Snapshot snapshot = new Snapshot();
    private Projection projection = new Projection();
    
    public Snapshot getSnapshot() {
        return snapshot;
    }
    
    public void setSnapshot(Snapshot snapshot) {
        this.snapshot = snapshot;
    }
    
    public Projection getProjection() {
        return projection;
    }
    
    public void setProjection(Projection projection) {
        this.projection = projection;
    }
    
    public static class Snapshot {
        private boolean enabled = true;
        private int interval = 50;
        
        public boolean isEnabled() {
            return enabled;
        }
        
        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }
        
        public int getInterval() {
            return interval;
        }
        
        public void setInterval(int interval) {
            this.interval = interval;
        }
    }
    
    public static class Projection {
        private int rebuildBatchSize = 1000;
        
        public int getRebuildBatchSize() {
            return rebuildBatchSize;
        }
        
        public void setRebuildBatchSize(int rebuildBatchSize) {
            this.rebuildBatchSize = rebuildBatchSize;
        }
    }
}

