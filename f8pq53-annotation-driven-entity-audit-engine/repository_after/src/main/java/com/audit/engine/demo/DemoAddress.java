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

    @OneToOne(cascade = CascadeType.ALL)
    private DemoZipCode zipCode;

    public DemoAddress(String country, String city) {
        this.country = country;
        this.city = city;
    }
}
