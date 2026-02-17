import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class MetaTest {

    // Paths
    private static final Path ROOT = resolveRoot();
    private static final Path REPO_DIR = ROOT.resolve("repository_after");
    private static final Path SOURCE_FILE = REPO_DIR.resolve("src/main/java/com/cloudscale/SimpleConnectionPool.java");
    private static final Path BROKEN_DIR = ROOT.resolve("tests/broken");
    private static final Path CORRECT_DIR = ROOT.resolve("tests/correct");

    private static Path resolveRoot() {
        // Assume run from project root or checks parent if in 'tests'
        Path cwd = Paths.get("").toAbsolutePath();
        if (Files.exists(cwd.resolve("repository_after"))) {
            return cwd;
        } else if (Files.exists(cwd.resolve("../repository_after"))) {
            return cwd.resolve("..");
        }
        // Fallback to CWD if assumption fails, mostly likely will fail later if wrong
        return cwd; 
    }

    private static class TestResult {
        boolean passed;
        String output;

        TestResult(boolean passed, String output) {
            this.passed = passed;
            this.output = output;
        }
    }

    public static void main(String[] args) {
        System.out.println("Starting Meta-Test (Java)...");
        try {
            runMetaTest();
        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static void runMetaTest() throws IOException, InterruptedException {
        // 1. Sanity Check: Correct implementation must pass
        System.out.println("\n[Meta-Test] Verifying CORRECT implementation...");

        // Ensure we start with correct code
        if (!Files.exists(CORRECT_DIR)) {
            Files.createDirectories(CORRECT_DIR);
            if (Files.exists(SOURCE_FILE)) {
                Files.copy(SOURCE_FILE, CORRECT_DIR.resolve("SimpleConnectionPool.java"), StandardCopyOption.REPLACE_EXISTING);
            } else {
                System.err.println("Error: Source file not found and no backup exists.");
                System.exit(1);
            }
        }

        Files.copy(CORRECT_DIR.resolve("SimpleConnectionPool.java"), SOURCE_FILE, StandardCopyOption.REPLACE_EXISTING);

        TestResult result = runMavenTest();
        if (!result.passed) {
            System.err.println("CRITICAL: The valid implementation FAILED tests! (See output above)");
            System.exit(1);
        }
        System.out.println("MATCH: Correct implementation passed.");

        // 2. Iterate Broken Implementations
        List<Path> brokenFiles;
        try (Stream<Path> stream = Files.list(BROKEN_DIR)) {
            brokenFiles = stream
                    .filter(p -> p.toString().endsWith(".java"))
                    .collect(Collectors.toList());
        }

        if (brokenFiles.isEmpty()) {
            System.out.println("Warning: No broken implementations found in tests/broken");
        }

        boolean allCaught = true;

        for (Path brokenFile : brokenFiles) {
            System.out.println("\n[Meta-Test] Testing BROKEN implementation: " + brokenFile.getFileName());
            Files.copy(brokenFile, SOURCE_FILE, StandardCopyOption.REPLACE_EXISTING);

            result = runMavenTest();

            if (result.passed) {
                System.out.println("FAILURE: Test suite PASSED against broken implementation: " + brokenFile.getFileName());
                System.out.println("The test suite failed to detect the bug.");
                allCaught = false;
            } else {
                System.out.println("SUCCESS: Test suite FAILED against broken implementation: " + brokenFile.getFileName());
                // Optional: Check if the failure reason is correct
            }
        }

        // 3. Restore Correct Implementation
        System.out.println("\n[Meta-Test] Restoring correct implementation...");
        Files.copy(CORRECT_DIR.resolve("SimpleConnectionPool.java"), SOURCE_FILE, StandardCopyOption.REPLACE_EXISTING);

        if (allCaught) {
            System.out.println("\nMETA-TEST PASSED: All broken implementations were caught.");
            System.exit(0);
        } else {
            System.out.println("\nMETA-TEST FAILED: Some broken implementations evaded the test suite.");
            System.exit(1);
        }
    }

    private static TestResult runMavenTest() throws IOException, InterruptedException {
        boolean isWindows = System.getProperty("os.name").toLowerCase().contains("win");
        String mvnCommand = isWindows ? "mvn.cmd" : "mvn";

        ProcessBuilder pb = new ProcessBuilder(
            mvnCommand, "clean", "test", "-Dsurefire.useFile=false", "-DtrimStackTrace=false"
        );
        pb.directory(REPO_DIR.toFile());
        pb.inheritIO(); // Stream output directly to console

        Process process = pb.start();
        
        boolean finished = process.waitFor(300, TimeUnit.SECONDS);

        if (!finished) {
            process.destroyForcibly();
            return new TestResult(false, "TIMEOUT: Test execution exceeded 300 seconds.");
        }

        return new TestResult(process.exitValue() == 0, "");
    }
}
