package com.audit.engine;

import com.audit.engine.demo.DemoAddress;
import com.audit.engine.demo.DemoEntity;
import com.audit.engine.demo.DemoRepository;
import com.audit.engine.demo.DemoZipCode;
import com.audit.engine.model.AuditLog;
import com.audit.engine.model.FieldChange;
import com.audit.engine.repo.AuditLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.transaction.PlatformTransactionManager;
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
    void testDeepNestedObjectChange() {
        Long id = transactionTemplate.execute(status -> {
            DemoEntity user = new DemoEntity();
            user.setName("dan");
            DemoAddress addr = new DemoAddress("CountryA", "CityA");
            addr.setZipCode(new DemoZipCode("11111"));
            user.setAddress(addr);
            return demoRepository.save(user).getId();
        });
        
        transactionTemplate.execute(status -> {
            DemoEntity saved = demoRepository.findById(id).orElseThrow();
            saved.getAddress().getZipCode().setCode("22222");
            demoRepository.save(saved);
            return null;
        });
        
        List<AuditLog> logs = auditLogRepository.findAll();
        assertEquals(1, logs.size());
        // Verify we found the change at level 3 (root -> address -> zipCode -> code)
        // With MAX_DEPTH=3, this is allowed (0, 1, 2 recurses, 3 is simple)
        assertFalse(logs.get(0).getChanges().isEmpty(), "Should detect deep change");
        FieldChange fc = logs.get(0).getChanges().get(0);
        assertEquals("address.zipCode.code", fc.getFieldName());
        assertEquals("11111", fc.getPreviousValue());
        assertEquals("22222", fc.getNewValue());
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
        boolean found = false;
        for (FieldChange fc : logs.get(0).getChanges()) {
            if ("tags".equals(fc.getFieldName()) && fc.getNewValue().contains("Added: tag2")) {
                found = true;
            }
        }
        assertTrue(found, "Should detect added tag");
    }
    
    @Test
    void testObjectCollectionModification() {
        // Req 6: Modified items within a collection
        Long id = transactionTemplate.execute(status -> {
            DemoEntity user = new DemoEntity();
            user.setName("collection_mod_user");
            DemoAddress addr1 = new DemoAddress("C1", "City1"); 
            user.getSecondaryAddresses().add(addr1);
            return demoRepository.save(user).getId();
        });
        
        transactionTemplate.execute(status -> {
            DemoEntity saved = demoRepository.findById(id).orElseThrow();
            // Modify existing address
            saved.getSecondaryAddresses().get(0).setCity("City1_Modified");
            // Add new
            saved.getSecondaryAddresses().add(new DemoAddress("C2", "City2"));
            demoRepository.save(saved);
            return null;
        });
        
        List<AuditLog> logs = auditLogRepository.findAll();
        assertEquals(1, logs.size());
        AuditLog log = logs.get(0);
        
        boolean foundMod = false;
        boolean foundAdd = false;
        
        for (FieldChange fc : log.getChanges()) {
            // Check for modification of existing item
            // Expected format depends on ChangeDetector for Lists/Collections
            // For List, it uses index: secondaryAddresses[0].city
            if (fc.getFieldName().contains("secondaryAddresses") && fc.getFieldName().contains("city") && fc.getNewValue().equals("City1_Modified")) {
                foundMod = true;
            }
            // Check for added item
            if (fc.getFieldName().startsWith("secondaryAddresses") && fc.getNewValue().contains("Added:")) {
                foundAdd = true;
            }
        }
        assertTrue(foundMod, "Should detect modification in object collection item");
        assertTrue(foundAdd, "Should detect addition to object collection");
    }

    @Test
    void testTransactionRollback() {
        Long id = transactionTemplate.execute(status -> {
            DemoEntity user = new DemoEntity();
            user.setName("eve");
            return demoRepository.save(user).getId();
        });

        try {
            transactionTemplate.execute(status -> {
                DemoEntity saved = demoRepository.findById(id).orElseThrow();
                saved.setName("eve_updated");
                demoRepository.save(saved);
                status.setRollbackOnly();
                return null;
            });
        } catch (Exception e) {}
        
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
            saved.setEmail("frank@example.com");
            demoRepository.save(saved);
            return null;
        });

        List<AuditLog> logs = auditLogRepository.findAll();
        assertEquals(1, logs.size());
        FieldChange fc = logs.get(0).getChanges().get(0);
        assertEquals("email", fc.getFieldName());
        assertEquals("null", fc.getPreviousValue());
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
    
    @TestConfiguration
    static class TestConfig {
        @Bean
        public TransactionTemplate transactionTemplate(PlatformTransactionManager tm) {
            return new TransactionTemplate(tm);
        }
    }
}
