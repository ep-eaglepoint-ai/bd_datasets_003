package com.audit.engine.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Data
@NoArgsConstructor
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String entityId;
    private String entityType;
    private String action;
    private String userId;
    private LocalDateTime timestamp;

    @OneToMany(cascade = CascadeType.ALL, fetch = FetchType.EAGER)
    @JoinColumn(name = "audit_log_id")
    private List<FieldChange> changes = new ArrayList<>();

    public AuditLog(String entityId, String entityType, String action, String userId) {
        this.entityId = entityId;
        this.entityType = entityType;
        this.action = action;
        this.userId = userId;
        this.timestamp = LocalDateTime.now();
    }

    public void addChange(FieldChange change) {
        this.changes.add(change);
    }
}
