package com.audit.engine.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Data
@NoArgsConstructor
public class FieldChange {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String fieldName;
    
    @Lob
    private String previousValue;
    
    @Lob
    private String newValue;

    public FieldChange(String fieldName, String previousValue, String newValue) {
        this.fieldName = fieldName;
        this.previousValue = previousValue;
        this.newValue = newValue;
    }
}
