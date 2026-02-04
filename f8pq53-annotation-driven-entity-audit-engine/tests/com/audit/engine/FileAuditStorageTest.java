package com.audit.engine;

import com.audit.engine.demo.DemoEntity;
import com.audit.engine.demo.DemoRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(properties = {
    "audit.storage.type=file",
    "audit.storage.file.path=test_audit_logs.json"
})
public class FileAuditStorageTest {

    @Autowired
    private DemoRepository demoRepository;

    @Autowired
    private TransactionTemplate transactionTemplate;

    private static final String FILE_PATH = "test_audit_logs.json";

    @BeforeEach
    @AfterEach
    void cleanUp() throws IOException {
        Files.deleteIfExists(Path.of(FILE_PATH));
        demoRepository.deleteAll();
    }

    @Test
    void testFileStorage() throws IOException {
        Long id = transactionTemplate.execute(status -> {
            DemoEntity user = new DemoEntity();
            user.setName("file_test");
            return demoRepository.save(user).getId();
        });

        transactionTemplate.execute(status -> {
            DemoEntity saved = demoRepository.findById(id).orElseThrow();
            saved.setName("file_test_updated");
            demoRepository.save(saved);
            return null;
        });

        // Verification
        File file = new File(FILE_PATH);
        assertTrue(file.exists(), "Audit log file should verify existence");
        List<String> lines = Files.readAllLines(file.toPath());
        assertTrue(lines.size() >= 1, "Should have at least one audit log");
        assertTrue(lines.stream().anyMatch(l -> l.contains("file_test_updated") && l.contains("UPDATE")), "Should contain update log");
    }
}
