package com.example.eventsourcing.infrastructure.snapshot;

import com.example.eventsourcing.config.EventSourcingProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Strategy for determining when to create snapshots.
 */
@Component
public class SnapshotStrategy {
    
    @Autowired
    private EventSourcingProperties properties;
    
    /**
     * Determine if a snapshot should be created.
     */
    public boolean shouldCreateSnapshot(Long version) {
        if (!properties.getSnapshot().isEnabled()) {
            return false;
        }
        
        int interval = properties.getSnapshot().getInterval();
        return version > 0 && version % interval == 0;
    }
}

