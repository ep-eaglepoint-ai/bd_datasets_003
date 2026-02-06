package evaluation;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileWriter;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Java-based evaluator that mirrors the standard evaluation.py contract.
 *
 * Responsibilities:
 * - Run the shared test suite against repository_before and repository_after
 *   using the -Drepo system property.
 * - Collect basic environment info and test outputs.
 * - Optionally collect metrics (left empty here by design).
 * - Produce a machine-readable JSON report at:
 *     evaluation/reports/latest.json
 * - Exit with a process status code that reflects overall success.
 */
public final class Evaluation {

    private static final int TEST_OUTPUT_LIMIT = 8000;

    private Evaluation() {
    }

    private static Path projectRoot() {
        return Path.of("").toAbsolutePath().normalize();
    }

    private static Path reportsDir() {
        return projectRoot().resolve("evaluation").resolve("reports");
    }

    private static String escapeJson(String s) {
        if (s == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(s.length() + 16);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':
                    sb.append("\\\"");
                    break;
                case '\\':
                    sb.append("\\\\");
                    break;
                case '\n':
                    sb.append("\\n");
                    break;
                case '\r':
                    sb.append("\\r");
                    break;
                case '\t':
                    sb.append("\\t");
                    break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.toString();
    }

    private static TestResult runMavenTests(String repoValue) {
        ProcessBuilder builder = new ProcessBuilder()
                .directory(projectRoot().toFile())
                .command("mvn", "test", "-Drepo=" + repoValue);

        StringBuilder output = new StringBuilder();
        int code;
        try {
            Process process = builder.start();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (output.length() < TEST_OUTPUT_LIMIT) {
                        if (!output.isEmpty()) {
                            output.append('\n');
                        }
                        if (output.length() + line.length() > TEST_OUTPUT_LIMIT) {
                            output.append(line, 0, TEST_OUTPUT_LIMIT - output.length());
                        } else {
                            output.append(line);
                        }
                    }
                }
            }
            code = process.waitFor();
        } catch (Exception e) {
            return new TestResult(false, -1, "mvn test failed: " + e.getMessage());
        }

        boolean passed = code == 0;
        return new TestResult(passed, code, output.toString());
    }

    private static RepoResult evaluateRepo(String repoName) {
        TestResult tests = runMavenTests(repoName);
        // Metrics are optional and left empty for this task.
        return new RepoResult(tests, "{}");
    }

    /**
     * Equivalent to the Python run_evaluation() -> dict contract.
     */
    public static EvaluationResult runEvaluation() {
        String runId = UUID.randomUUID().toString();
        Instant start = Instant.now();

        RepoResult before = evaluateRepo("before");
        RepoResult after = evaluateRepo("after");

        boolean passedGate = after.tests.passed;
        String improvementSummary;
        if (passedGate && !before.tests.passed) {
            improvementSummary = "After implementation passes tests that failed before.";
        } else if (passedGate) {
            improvementSummary = "After implementation passes all tests.";
        } else {
            improvementSummary = "After implementation did not pass all tests.";
        }

        Instant end = Instant.now();
        double durationSeconds = Duration.between(start, end).toMillis() / 1000.0;

        Environment environment = new Environment(
                System.getProperty("java.version"),
                System.getProperty("os.name") + "-" + System.getProperty("os.arch")
        );

        Comparison comparison = new Comparison(passedGate, improvementSummary);

        return new EvaluationResult(
                runId,
                start,
                end,
                durationSeconds,
                environment,
                before,
                after,
                comparison,
                passedGate,
                null
        );
    }

    /**
     * Equivalent to the Python main() -> int contract.
     */
    public static int mainInternal() {
        try {
            Files.createDirectories(reportsDir());
            EvaluationResult result = runEvaluation();

            String json = result.toJson();
            Path reportPath = reportsDir().resolve("latest.json");
            try (FileWriter writer = new FileWriter(reportPath.toFile(), StandardCharsets.UTF_8)) {
                writer.write(json);
            }
            System.out.println("Report written to " + reportPath);
            return result.success ? 0 : 1;
        } catch (Exception e) {
            // On any unexpected error, write a minimal error report.
            try {
                Files.createDirectories(reportsDir());
                Path reportPath = reportsDir().resolve("latest.json");
                String errorJson = "{"
                        + "\"run_id\":\"" + UUID.randomUUID() + "\","
                        + "\"started_at\":null,"
                        + "\"finished_at\":null,"
                        + "\"duration_seconds\":0.0,"
                        + "\"environment\":null,"
                        + "\"before\":null,"
                        + "\"after\":null,"
                        + "\"comparison\":null,"
                        + "\"success\":false,"
                        + "\"error\":\"" + escapeJson(e.getMessage()) + "\""
                        + "}";
                try (FileWriter writer = new FileWriter(reportPath.toFile(), StandardCharsets.UTF_8)) {
                    writer.write(errorJson);
                }
                System.err.println("Evaluation failed, error report written to " + reportPath);
            } catch (Exception ignored) {
                // Swallow secondary errors.
            }
            return 1;
        }
    }

    public static void main(String[] args) {
        System.exit(mainInternal());
    }

    // --- Simple value types for internal organisation ---

    private static String indent(int level) {
        return "  ".repeat(Math.max(0, level));
    }

    private static final class TestResult {
        final boolean passed;
        final int returnCode;
        final String output;

        TestResult(boolean passed, int returnCode, String output) {
            this.passed = passed;
            this.returnCode = returnCode;
            this.output = output;
        }

        String toJson(int level) {
            String ind = indent(level);
            String ind2 = indent(level + 1);
            StringBuilder sb = new StringBuilder();
            sb.append("{\n");
            sb.append(ind2).append("\"passed\":").append(passed).append(",\n");
            sb.append(ind2).append("\"return_code\":").append(returnCode).append(",\n");
            sb.append(ind2).append("\"output\":\"").append(escapeJson(output)).append("\"\n");
            sb.append(ind).append("}");
            return sb.toString();
        }
    }

    private static final class RepoResult {
        final TestResult tests;
        final String metricsJson; // already a JSON object string

        RepoResult(TestResult tests, String metricsJson) {
            this.tests = tests;
            this.metricsJson = metricsJson;
        }

        String toJson(int level) {
            String ind = indent(level);
            String ind2 = indent(level + 1);
            StringBuilder sb = new StringBuilder();
            sb.append("{\n");
            sb.append(ind2).append("\"tests\":").append(tests.toJson(level + 1)).append(",\n");
            sb.append(ind2).append("\"metrics\":").append(metricsJson).append("\n");
            sb.append(ind).append("}");
            return sb.toString();
        }
    }

    private static final class Environment {
        final String javaVersion;
        final String platform;

        Environment(String javaVersion, String platform) {
            this.javaVersion = javaVersion;
            this.platform = platform;
        }

        String toJson(int level) {
            String ind = indent(level);
            String ind2 = indent(level + 1);
            StringBuilder sb = new StringBuilder();
            sb.append("{\n");
            sb.append(ind2).append("\"java_version\":\"").append(escapeJson(javaVersion)).append("\",\n");
            sb.append(ind2).append("\"platform\":\"").append(escapeJson(platform)).append("\"\n");
            sb.append(ind).append("}");
            return sb.toString();
        }
    }

    private static final class Comparison {
        final boolean passedGate;
        final String improvementSummary;

        Comparison(boolean passedGate, String improvementSummary) {
            this.passedGate = passedGate;
            this.improvementSummary = improvementSummary;
        }

        String toJson(int level) {
            String ind = indent(level);
            String ind2 = indent(level + 1);
            StringBuilder sb = new StringBuilder();
            sb.append("{\n");
            sb.append(ind2).append("\"passed_gate\":").append(passedGate).append(",\n");
            sb.append(ind2).append("\"improvement_summary\":\"")
                    .append(escapeJson(improvementSummary)).append("\"\n");
            sb.append(ind).append("}");
            return sb.toString();
        }
    }

    private static final class EvaluationResult {
        final String runId;
        final Instant startedAt;
        final Instant finishedAt;
        final double durationSeconds;
        final Environment environment;
        final RepoResult before;
        final RepoResult after;
        final Comparison comparison;
        final boolean success;
        final String error;

        EvaluationResult(
                String runId,
                Instant startedAt,
                Instant finishedAt,
                double durationSeconds,
                Environment environment,
                RepoResult before,
                RepoResult after,
                Comparison comparison,
                boolean success,
                String error
        ) {
            this.runId = runId;
            this.startedAt = startedAt;
            this.finishedAt = finishedAt;
            this.durationSeconds = durationSeconds;
            this.environment = environment;
            this.before = before;
            this.after = after;
            this.comparison = comparison;
            this.success = success;
            this.error = error;
        }

        String toJson() {
            String started = startedAt == null ? "null" : "\"" + startedAt.toString() + "Z\"";
            String finished = finishedAt == null ? "null" : "\"" + finishedAt.toString() + "Z\"";

            String ind = indent(1);
            String ind2 = indent(2);

            StringBuilder sb = new StringBuilder();
            sb.append("{\n");
            sb.append(ind).append("\"run_id\":\"").append(runId).append("\",\n");
            sb.append(ind).append("\"started_at\":").append(started).append(",\n");
            sb.append(ind).append("\"finished_at\":").append(finished).append(",\n");
            sb.append(ind).append("\"duration_seconds\":").append(durationSeconds).append(",\n");
            sb.append(ind).append("\"environment\":").append(environment.toJson(2)).append(",\n");
            sb.append(ind).append("\"before\":").append(before.toJson(2)).append(",\n");
            sb.append(ind).append("\"after\":").append(after.toJson(2)).append(",\n");
            sb.append(ind).append("\"comparison\":").append(comparison.toJson(2)).append(",\n");
            sb.append(ind).append("\"success\":").append(success).append(",\n");
            sb.append(ind).append("\"error\":")
                    .append(error == null ? "null" : "\"" + escapeJson(error) + "\"").append("\n");
            sb.append("}\n");
            return sb.toString();
        }
    }
}


