package com.audit.engine;

import com.audit.engine.demo.DemoAddress;
import com.audit.engine.demo.DemoEntity;
import com.audit.engine.demo.DemoRepository;
import com.audit.engine.model.AuditLog;
import com.audit.engine.model.FieldChange;
import com.audit.engine.repo.AuditLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = "audit.storage.type=database")
public class AuditEngineTest {

    @Autowired
    private DemoRepository demoRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;
    
    @Autowired
    private TransactionTemplate transactionTemplate;

    @BeforeEach
    void setUp() {
        auditLogRepository.deleteAll();
        demoRepository.deleteAll();
    }

    @Test
    void testSimpleFieldChange() {
        Long id = transactionTemplate.execute(status -> {
            DemoEntity user = new DemoEntity();
            user.setName("alice");
            user.setEmail("alice@example.com");
            return demoRepository.save(user).getId();
        });

        transactionTemplate.execute(status -> {
            DemoEntity saved = demoRepository.findById(id).orElseThrow();
            saved.setEmail("alice_new@example.com");
            demoRepository.save(saved);
            return null;
        });
        
        List<AuditLog> logs = auditLogRepository.findAll();
        assertEquals(1, logs.size());
        AuditLog log = logs.get(0);
        assertEquals("UPDATE", log.getAction());
        assertEquals("DemoEntity", log.getEntityType());
        
        assertEquals(1, log.getChanges().size());
        FieldChange fc = log.getChanges().get(0);
        assertEquals("email", fc.getFieldName());
        assertEquals("alice@example.com", fc.getPreviousValue());
        assertEquals("alice_new@example.com", fc.getNewValue());
    }

    @Test
    void testMasking() {
        Long id = transactionTemplate.execute(status -> {
            DemoEntity user = new DemoEntity();
            user.setName("bob");
            user.setSecret("secret123");
            return demoRepository.save(user).getId();
        });
        
        transactionTemplate.execute(status -> {
            DemoEntity saved = demoRepository.findById(id).orElseThrow();
            saved.setSecret("newsecret");
            demoRepository.save(saved);
            return null;
        });
        
        List<AuditLog> logs = auditLogRepository.findAll();
        assertEquals(1, logs.size());
        FieldChange fc = logs.get(0).getChanges().get(0);
        assertEquals("secret", fc.getFieldName());
        assertEquals("****", fc.getPreviousValue());
        assertEquals("****", fc.getNewValue());
    }

    @Test
    void testNestedObjectChange() {
        Long id = transactionTemplate.execute(status -> {
            DemoEntity user = new DemoEntity();
            user.setName("charlie");
            user.setAddress(new DemoAddress("Street 1", "City A"));
            return demoRepository.save(user).getId();
        });
        
        transactionTemplate.execute(status -> {
            DemoEntity saved = demoRepository.findById(id).orElseThrow();
            saved.getAddress().setCity("City B");
            demoRepository.save(saved);
            return null;
        });
        
        List<AuditLog> logs = auditLogRepository.findAll();
        assertEquals(1, logs.size());
        FieldChange fc = logs.get(0).getChanges().get(0);
        assertEquals("address.city", fc.getFieldName());
        assertEquals("City A", fc.getPreviousValue());
        assertEquals("City B", fc.getNewValue());
    }

    @Test
    void testCollectionChange() {
        Long id = transactionTemplate.execute(status -> {
            DemoEntity user = new DemoEntity();
            user.setName("david");
            user.getTags().add("tag1");
            return demoRepository.save(user).getId();
        });
        
        transactionTemplate.execute(status -> {
            DemoEntity saved = demoRepository.findById(id).orElseThrow();
            saved.getTags().add("tag2");
            demoRepository.save(saved);
            return null;
        });
        
        List<AuditLog> logs = auditLogRepository.findAll();
        assertEquals(1, logs.size());
        FieldChange fc = logs.get(0).getChanges().get(0);
        assertEquals("tags", fc.getFieldName());
        assertTrue(fc.getNewValue().contains("Added: [tag2]"));
    }
    
    @Test
    void testTransactionRollback() {
        // Setup: Create an entity
        Long id = transactionTemplate.execute(status -> {
            DemoEntity user = new DemoEntity();
            user.setName("eve");
            return demoRepository.save(user).getId();
        });

        // Test: Update and Rollback
        try {
            transactionTemplate.execute(status -> {
                DemoEntity saved = demoRepository.findById(id).orElseThrow();
                saved.setName("eve_updated");
                demoRepository.save(saved);
                
                // Rollback
                status.setRollbackOnly();
                return null;
            });
        } catch (Exception e) {}
        
        // Assert: No audit log should be present because transaction rolled back
        // (AuditLogListener is AFTER_COMMIT)
        
        assertEquals(0, auditLogRepository.count());
    }

    @Test
    void testNullToNonNull() {
         Long id = transactionTemplate.execute(status -> {
            DemoEntity user = new DemoEntity();
            user.setName("frank");
            return demoRepository.save(user).getId();
        });

        transactionTemplate.execute(status -> {
            DemoEntity saved = demoRepository.findById(id).orElseThrow();
            // old email is null
            saved.setEmail("frank@example.com");
            demoRepository.save(saved);
            return null;
        });

        List<AuditLog> logs = auditLogRepository.findAll();
        assertEquals(1, logs.size());
        FieldChange fc = logs.get(0).getChanges().get(0);
        assertEquals("email", fc.getFieldName());
        assertEquals("null", fc.getPreviousValue()) ; // "null" string
        assertEquals("frank@example.com", fc.getNewValue());
    }

    @Test
    void testNonNullToNull() {
         Long id = transactionTemplate.execute(status -> {
            DemoEntity user = new DemoEntity();
            user.setName("grace");
            user.setEmail("grace@example.com");
            return demoRepository.save(user).getId();
        });

        transactionTemplate.execute(status -> {
            DemoEntity saved = demoRepository.findById(id).orElseThrow();
            saved.setEmail(null);
            demoRepository.save(saved);
            return null;
        });
        
        List<AuditLog> logs = auditLogRepository.findAll();
        assertEquals(1, logs.size());
        FieldChange fc = logs.get(0).getChanges().get(0);
        assertEquals("email", fc.getFieldName());
        assertEquals("grace@example.com", fc.getPreviousValue());
        assertEquals("null", fc.getNewValue()); 
    }
}
