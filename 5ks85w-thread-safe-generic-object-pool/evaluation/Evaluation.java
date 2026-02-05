import java.io.*;
import java.nio.file.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.TimeUnit;

public class Evaluation {
    private static final String ROOT = new File(System.getProperty("user.dir")).getParent();
    private static final String REPORTS_DIR = ROOT + "/evaluation/reports";

    public static void main(String[] args) {
        try {
            // Ensure reports directory exists
            Files.createDirectories(Paths.get(REPORTS_DIR));

            String runId = UUID.randomUUID().toString();
            long startTime = System.currentTimeMillis();
            String startTimeIso = Instant.ofEpochMilli(startTime).toString();

            System.out.println("Starting evaluation (Run ID: " + runId + ")...");

            System.out.println("Running baseline tests (repository_before)...");
            TestResult beforeResult = runTests("repository_before");

            System.out.println("Running implementation tests (repository_after)...");
            TestResult afterResult = runTests("repository_after");

            long endTime = System.currentTimeMillis();
            String endTimeIso = Instant.ofEpochMilli(endTime).toString();
            double durationSeconds = (endTime - startTime) / 1000.0;

            String improvementSummary;
            if (!beforeResult.passed && afterResult.passed) {
                improvementSummary = "The code generation met all requirements.";
            } else if (beforeResult.passed && afterResult.passed) {
                improvementSummary = "The code generation met all requirements.";
            } else if (!afterResult.passed) {
                improvementSummary = "The code generation failed to meet all requirements.";
            } else {
                improvementSummary = "No improvement detected.";
            }

            // Build JSON report
            Map<String, Object> report = new LinkedHashMap<>();
            report.put("run_id", runId);
            report.put("started_at", startTimeIso);
            report.put("finished_at", endTimeIso);
            report.put("duration_seconds", durationSeconds);
            report.put("environment", getEnvironmentInfo());

            Map<String, Object> before = new LinkedHashMap<>();
            Map<String, Object> beforeTests = new LinkedHashMap<>();
            beforeTests.put("passed", beforeResult.passed);
            beforeTests.put("return_code", beforeResult.returnCode);
            beforeTests.put("output", truncate(beforeResult.output, 5000));
            before.put("tests", beforeTests);
            before.put("metrics", new HashMap<>());
            report.put("before", before);

            Map<String, Object> after = new LinkedHashMap<>();
            Map<String, Object> afterTests = new LinkedHashMap<>();
            afterTests.put("passed", afterResult.passed);
            afterTests.put("return_code", afterResult.returnCode);
            afterTests.put("output", truncate(afterResult.output, 5000));
            after.put("tests", afterTests);
            after.put("metrics", new HashMap<>());
            report.put("after", after);

            Map<String, Object> comparison = new LinkedHashMap<>();
            comparison.put("passed_gate", afterResult.passed);
            comparison.put("improvement_summary", improvementSummary);
            report.put("comparison", comparison);

            report.put("success", afterResult.passed);
            report.put("error", null);

            // Write report
            String reportPath = REPORTS_DIR + "/report.json";
            writeJsonReport(reportPath, report);

            System.out.println("\nEvaluation complete.");
            System.out.println("Before Success: " + beforeResult.passed);
            System.out.println("After Success: " + afterResult.passed);
            System.out.println("Report written to: " + reportPath);

            System.exit(afterResult.passed ? 0 : 1);

        } catch (Exception e) {
            System.err.println("Evaluation failed with fatal error: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static TestResult runTests(String repoPath) {
        try {
            String fullPath = ROOT + "/" + repoPath;
            File repoDir = new File(fullPath);
            
            if (!repoDir.exists()) {
                return new TestResult(false, 1, "Repository directory does not exist: " + repoPath);
            }

            // Check if pom.xml exists
            File pomFile = new File(repoDir, "pom.xml");
            if (!pomFile.exists()) {
                // For repository_before, this is expected - it should be empty
                if (repoPath.contains("before")) {
                    return new TestResult(false, 1, "No implementation in " + repoPath + " (expected baseline state)");
                }
                return new TestResult(false, 1, "No pom.xml found in " + repoPath);
            }

            ProcessBuilder pb = new ProcessBuilder("mvn", "test");
            pb.directory(repoDir);
            pb.redirectErrorStream(true);

            Process process = pb.start();
            StringBuilder output = new StringBuilder();

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                }
            }

            boolean finished = process.waitFor(5, TimeUnit.MINUTES);
            if (!finished) {
                process.destroyForcibly();
                return new TestResult(false, 124, "Test execution timed out after 5 minutes");
            }

            int exitCode = process.exitValue();
            String outputStr = output.toString();
            
            // Check for BUILD SUCCESS and test results
            boolean passed = exitCode == 0 && 
                           outputStr.contains("BUILD SUCCESS") &&
                           !outputStr.contains("Failures: 0") == false;

            return new TestResult(passed, exitCode, outputStr);

        } catch (Exception e) {
            return new TestResult(false, 1, "Exception running tests: " + e.getMessage());
        }
    }

    private static Map<String, Object> getEnvironmentInfo() {
        Map<String, Object> env = new LinkedHashMap<>();
        env.put("java_version", System.getProperty("java.version"));
        env.put("os_name", System.getProperty("os.name"));
        env.put("os_arch", System.getProperty("os.arch"));
        env.put("available_processors", Runtime.getRuntime().availableProcessors());
        return env;
    }

    private static String truncate(String str, int maxLength) {
        if (str == null) return "";
        return str.length() <= maxLength ? str : str.substring(0, maxLength);
    }

    private static void writeJsonReport(String path, Map<String, Object> report) throws IOException {
        StringBuilder json = new StringBuilder();
        appendJsonObject(json, report, 0);
        Files.write(Paths.get(path), json.toString().getBytes());
    }

    private static void appendJsonObject(StringBuilder sb, Map<String, Object> map, int indent) {
        String indentStr = "  ".repeat(indent);
        String nextIndent = "  ".repeat(indent + 1);
        
        sb.append("{\n");
        boolean first = true;
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            if (!first) sb.append(",\n");
            first = false;
            sb.append(nextIndent).append("\"").append(entry.getKey()).append("\": ");
            appendJsonValue(sb, entry.getValue(), indent + 1);
        }
        sb.append("\n").append(indentStr).append("}");
    }

    private static void appendJsonValue(StringBuilder sb, Object obj, int indent) {
        if (obj instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) obj;
            appendJsonObject(sb, map, indent);
        } else if (obj instanceof String) {
            sb.append("\"").append(escape((String) obj)).append("\"");
        } else if (obj instanceof Boolean || obj instanceof Number) {
            sb.append(obj);
        } else if (obj == null) {
            sb.append("null");
        } else {
            sb.append("\"").append(escape(obj.toString())).append("\"");
        }
    }

    private static String escape(String str) {
        return str.replace("\\", "\\\\")
                  .replace("\"", "\\\"")
                  .replace("\n", "\\n")
                  .replace("\r", "\\r")
                  .replace("\t", "\\t");
    }

    static class TestResult {
        boolean passed;
        int returnCode;
        String output;

        TestResult(boolean passed, int returnCode, String output) {
            this.passed = passed;
            this.returnCode = returnCode;
            this.output = output;
        }
    }
}
