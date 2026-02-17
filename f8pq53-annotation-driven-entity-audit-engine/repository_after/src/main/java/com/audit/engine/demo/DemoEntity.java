package com.audit.engine.demo;

import com.audit.engine.annotation.Auditable;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Entity
@Data
@NoArgsConstructor
@Auditable
public class DemoEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String email;

    @Auditable(mask = true)
    private String secret;

    @OneToOne(cascade = CascadeType.ALL)
    private DemoAddress address;

    @ElementCollection(fetch = FetchType.EAGER)
    private List<String> tags = new ArrayList<>();

    @OneToMany(cascade = CascadeType.ALL, fetch = FetchType.EAGER)
    private List<DemoAddress> secondaryAddresses = new ArrayList<>();
}
