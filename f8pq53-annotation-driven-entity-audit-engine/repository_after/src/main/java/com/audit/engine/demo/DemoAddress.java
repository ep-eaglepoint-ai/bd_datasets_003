package com.audit.engine.demo;

import com.audit.engine.annotation.Auditable;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Data
@NoArgsConstructor
@Auditable
public class DemoAddress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String city;
    private String country;

    public DemoAddress(String country, String city) {
        this.city = city;
        this.country = country;
    }
}
