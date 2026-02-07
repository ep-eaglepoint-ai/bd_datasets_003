import java.io.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;

public class Evaluation {
    private static final String ROOT = new File(System.getProperty("user.dir")).getParent();
    private static final String REPORTS_DIR = System.getProperty("user.dir") + "/reports";

    public static void main(String[] args) {
        String startTime = Instant.now().toString();
        try {
            Files.createDirectories(Paths.get(REPORTS_DIR));
            System.out.println("--- Starting Evaluation ---");

            // Baseline
            TestResult beforeResult = runHardenedSuite("repository_before");

            // Implementation
            TestResult afterResult = runHardenedSuite("repository_after");

            // Comparison Logic
            boolean improvement = afterResult.passed && !beforeResult.passed;
            String finishedTime = Instant.now().toString();

            // Construct JSON
            StringBuilder json = new StringBuilder();
            json.append("{\n");
            json.append("  \"run_id\": \"").append(UUID.randomUUID()).append("\",\n");
            json.append("  \"started_at\": \"").append(startTime).append("\",\n");
            json.append("  \"finished_at\": \"").append(finishedTime).append("\",\n");
            
            json.append("  \"before\": {\n");
            json.append("    \"tests\": ").append(testResultToJson(beforeResult)).append("\n");
            json.append("  },\n");
            
            json.append("  \"after\": {\n");
            json.append("    \"tests\": ").append(testResultToJson(afterResult)).append("\n");
            json.append("  },\n");
            
            json.append("  \"comparison\": {\n");
            json.append("    \"passed_gate\": ").append(afterResult.passed).append(",\n");
            json.append("    \"improvement\": ").append(improvement).append("\n");
            json.append("  },\n");
            
            json.append("  \"success\": ").append(afterResult.passed).append("\n");
            json.append("}");

            Files.writeString(Paths.get(REPORTS_DIR, "report.json"), json.toString());

            System.out.println("\nEvaluation Complete! Success: " + afterResult.passed);
            System.exit(afterResult.passed ? 0 : 1);

        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static TestResult runHardenedSuite(String repoPath) {
        System.out.println("--- Validating " + repoPath + " ---");
        StringBuilder output = new StringBuilder();
        File repoDir = new File(ROOT, repoPath);
        
        if (!repoDir.exists()) return new TestResult(false, 1, "Directory Missing: " + repoPath);

        try {
            int mvn = executeProcess(repoDir, output, "mvn", "compile", "dependency:copy-dependencies");
            if (mvn != 0) return new TestResult(false, mvn, output.toString());

            File testsDir = new File(ROOT, "tests");
            File testFile = new File(testsDir, "SystemTestSuite.java");
            
            int javac = executeProcess(repoDir, output, "javac", "-cp", "target/classes" + File.pathSeparator + "target/dependency/*", testFile.getAbsolutePath());
            if (javac != 0) return new TestResult(false, javac, output.toString());

            int java = executeProcess(repoDir, output, "java", "-cp", "target/classes" + File.pathSeparator + "target/dependency/*" + File.pathSeparator + testsDir.getAbsolutePath(), "SystemTestSuite");
            
            boolean passed = (java == 0) && (output.toString().contains("MAJOR") || output.toString().contains("RECEIPT"));
            return new TestResult(passed, java, output.toString());

        } catch (Exception e) {
            return new TestResult(false, 1, "Exception: " + e.getMessage());
        }
    }

    private static String testResultToJson(TestResult res) {
        String cleanOutput = res.output.length() > 1000 ? res.output.substring(0, 1000) : res.output;
        cleanOutput = cleanOutput.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "");
        
        return "{\n" +
               "      \"passed\": " + res.passed + ",\n" +
               "      \"output\": \"" + cleanOutput + "\",\n" +
               "      \"return_code\": " + res.returnCode + "\n" +
               "    }";
    }

    private static int executeProcess(File dir, StringBuilder output, String... command) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(dir);
        pb.redirectErrorStream(true);
        Process p = pb.start();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
            String line;
            while ((line = r.readLine()) != null) { output.append(line).append("\n"); }
        }
        return p.waitFor(2, TimeUnit.MINUTES) ? p.exitValue() : 124;
    }

    static class TestResult {
        boolean passed;
        int returnCode;
        String output;
        TestResult(boolean p, int r, String o) { this.passed = p; this.returnCode = r; this.output = o; }
    }
}