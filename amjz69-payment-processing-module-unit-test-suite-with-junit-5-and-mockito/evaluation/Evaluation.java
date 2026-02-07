import java.io.*;
import java.nio.file.*;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

public class Evaluation {

    private static final String REPORT_DIR = "evaluation/reports";
    private static final String REPO_BEFORE = "repository_before";
    private static final String REPO_AFTER = "repository_after";

    public static void main(String[] args) {
        new Evaluation().runEvaluation();
    }

    public void runEvaluation() {
        String runId = UUID.randomUUID().toString();
        Instant startTime = Instant.now();
        System.out.println("Starting evaluation (Run ID: " + runId + ")...");

        ensureReportDirExists();

        // 1. Run Tests against "repository_before" (Baseline)
        System.out.println("Running baseline tests (before)...");
        TestResult beforeResult = runTests(REPO_BEFORE);

        // 2. Run Tests against "repository_after" (Refactor)
        System.out.println("Running refactor tests (after)...");
        TestResult afterResult = runTests(REPO_AFTER);

        Instant endTime = Instant.now();
        double durationSeconds = Duration.between(startTime, endTime).toMillis() / 1000.0;

        // 3. Generate Comparison Summary
        String improvementSummary = "No improvement detected.";
        if (beforeResult.testsRun == 0 && afterResult.testsRun > 0 && afterResult.passed) {
            improvementSummary = String.format("Successfully added %d comprehensive tests. All tests pass.",
                    afterResult.testsRun);
        } else if (!beforeResult.passed && afterResult.passed) {
            improvementSummary = "Refactor fixed failing tests and met requirements.";
        } else if (beforeResult.passed && afterResult.passed && beforeResult.testsRun > 0) {
            improvementSummary = "Tests passed in both states (Verify baseline expectation).";
        } else if (!afterResult.passed) {
            improvementSummary = "Refactored code failed to pass requirements.";
        }

        // 4. Construct the Final Report JSON
        String jsonReport = buildJsonReport(runId, startTime, endTime, durationSeconds, beforeResult, afterResult,
                improvementSummary);

        // Write the report to disk
        Path reportPath = Paths.get(REPORT_DIR, "report.json");
        try {
            Files.writeString(reportPath, jsonReport);
            System.out.println("Evaluation complete. Success: " + afterResult.passed);
            System.out.println("Report written to: " + reportPath.toAbsolutePath());
        } catch (IOException e) {
            System.err.println("Failed to write report: " + e.getMessage());
        }

        // Exit with status code based on the 'After' result
        System.exit(afterResult.passed ? 0 : 1);
    }

    private TestResult runTests(String repoPath) {
        File repoDir = new File(repoPath);
        if (!repoDir.exists()) {
            return new TestResult(false, -1, "Directory not found: " + repoPath, 0);
        }

        // We use mvn test
        ProcessBuilder pb = new ProcessBuilder("mvn", "test");
        pb.directory(repoDir);
        pb.environment().put("JAVA_HOME", System.getProperty("java.home")); // Use current java

        // For Windows, we might need cmd /c
        if (System.getProperty("os.name").toLowerCase().contains("win")) {
            pb.command("cmd.exe", "/c", "mvn", "test");
        }

        StringBuilder output = new StringBuilder();
        boolean passed = false;
        int exitCode = -1;
        int testsRun = 0;

        try {
            Process process = pb.start();

            // Capture stdout
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append(System.lineSeparator());
                    // Simple check for maven success
                    if (line.contains("BUILD SUCCESS")) {
                        passed = true;
                    }
                    // Extract test count
                    if (line.contains("Tests run:")) {
                        try {
                            String[] parts = line.split("Tests run:");
                            if (parts.length > 1) {
                                String numStr = parts[1].trim().split(",")[0].trim();
                                testsRun = Integer.parseInt(numStr);
                            }
                        } catch (Exception ignored) {
                        }
                    }
                }
            }

            exitCode = process.waitFor();
            if (exitCode != 0)
                passed = false; // Double check exit code

        } catch (Exception e) {
            output.append("Error execution maven: ").append(e.getMessage());
            e.printStackTrace();
        }

        // If no tests were run, mark as failed (having no tests is a failure state)
        if (testsRun == 0) {
            passed = false;
        }

        return new TestResult(passed, exitCode, output.toString(), testsRun);
    }

    private void ensureReportDirExists() {
        File dir = new File(REPORT_DIR);
        if (!dir.exists()) {
            dir.mkdirs();
        }
    }

    private String buildJsonReport(String runId, Instant start, Instant end, double duration,
            TestResult before, TestResult after, String summary) {
        // Simple manual JSON construction to avoid external dependencies like
        // Jackson/Gson in this script
        boolean passedGate = after.passed;
        return String.format(
                "{\n" +
                        "  \"run_id\": \"%s\",\n" +
                        "  \"started_at\": \"%s\",\n" +
                        "  \"finished_at\": \"%s\",\n" +
                        "  \"duration_seconds\": %.2f,\n" +
                        "  \"environment\": {\n" +
                        "    \"java_version\": \"%s\",\n" +
                        "    \"os\": \"%s\"\n" +
                        "  },\n" +
                        "  \"before\": {\n" +
                        "    \"tests\": {\n" +
                        "      \"passed\": %b,\n" +
                        "      \"return_code\": %d,\n" +
                        "      \"tests_run\": %d,\n" +
                        "      \"output\": \"%s\"\n" +
                        "    }\n" +
                        "  },\n" +
                        "  \"after\": {\n" +
                        "    \"tests\": {\n" +
                        "      \"passed\": %b,\n" +
                        "      \"return_code\": %d,\n" +
                        "      \"tests_run\": %d,\n" +
                        "      \"output\": \"%s\"\n" +
                        "    }\n" +
                        "  },\n" +
                        "  \"comparison\": {\n" +
                        "    \"passed_gate\": %b,\n" +
                        "    \"improvement_summary\": \"%s\"\n" +
                        "  },\n" +
                        "  \"success\": %b\n" +
                        "}",
                runId, start, end, duration,
                System.getProperty("java.version"), System.getProperty("os.name"),
                before.passed, before.exitCode, before.testsRun, escapeJson(truncate(before.output, 500)),
                after.passed, after.exitCode, after.testsRun, escapeJson(truncate(after.output, 500)),
                passedGate, summary,
                passedGate);
    }

    private String escapeJson(String input) {
        if (input == null)
            return "";
        return input.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "");
    }

    private String truncate(String input, int length) {
        if (input == null)
            return "";
        if (input.length() <= length)
            return input;
        return input.substring(0, length) + "... (truncated)";
    }

    static class TestResult {
        boolean passed;
        int exitCode;
        String output;
        int testsRun;

        public TestResult(boolean passed, int exitCode, String output, int testsRun) {
            this.passed = passed;
            this.exitCode = exitCode;
            this.output = output;
            this.testsRun = testsRun;
        }
    }
}
