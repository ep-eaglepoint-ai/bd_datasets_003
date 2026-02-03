package com.audit.engine.demo;

import com.audit.engine.model.AuditLog;
import com.audit.engine.repo.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/demo")
@RequiredArgsConstructor
public class DemoController {

    private final DemoRepository demoRepository;
    private final AuditLogRepository auditLogRepository;

    @PostMapping
    public DemoEntity create(@RequestBody DemoEntity entity) {
        return demoRepository.save(entity);
    }

    @PutMapping("/{id}")
    public DemoEntity update(@PathVariable Long id, @RequestBody DemoEntity entity) {
        DemoEntity existing = demoRepository.findById(id).orElseThrow();
        existing.setName(entity.getName());
        existing.setEmail(entity.getEmail());
        existing.setSecret(entity.getSecret());
        existing.setAddress(entity.getAddress());
        existing.setTags(entity.getTags());
        return demoRepository.save(existing);
    }
    
    @GetMapping("/{id}")
    public DemoEntity get(@PathVariable Long id) {
        return demoRepository.findById(id).orElseThrow();
    }

    @GetMapping("/audits")
    public List<AuditLog> getAudits() {
        return auditLogRepository.findAll();
    }
}
