import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Evaluation {
    private static final Path ROOT = Paths.get("").toAbsolutePath();
    private static final Path REPORTS = ROOT.resolve("evaluation").resolve("reports");

    private static Map<String, Object> environmentInfo() {
        Map<String, Object> env = new HashMap<>();
        env.put("java", System.getProperty("java.version"));
        env.put("platform", System.getProperty("os.name") + " " + System.getProperty("os.version"));
        return env;
    }

    private static String stripAnsi(String str) {
        String pattern = "\\u001B\\[[;?0-9]*[ -/]*[@-~]";
        return str.replaceAll(pattern, "");
    }

    private static Map<String, Object> parseTestOutput(String output) {
        int testsRun = 0;
        int failures = 0;
        int errors = 0;
        int skipped = 0;

        String clean = stripAnsi(output);
        Pattern p = Pattern.compile("Tests run: (\\d+), Failures: (\\d+), Errors: (\\d+), Skipped: (\\d+)");
        Matcher m = p.matcher(clean);
        while (m.find()) {
            testsRun = Integer.parseInt(m.group(1));
            failures = Integer.parseInt(m.group(2));
            errors = Integer.parseInt(m.group(3));
            skipped = Integer.parseInt(m.group(4));
        }

        int testsPassed = Math.max(0, testsRun - failures - errors - skipped);
        boolean success = (failures == 0 && errors == 0 && testsRun > 0);

        Map<String, Object> result = new HashMap<>();
        result.put("passed", success);
        result.put("tests_passed", testsPassed);
        result.put("tests_failed", failures + errors);
        result.put("tests_skipped", skipped);
        result.put("tests_run", testsRun);
        return result;
    }

    private static Map<String, Object> runTestsDirect(String repoType) {
        System.out.println("  [Executing] mvn test -Dsurefire.failIfNoSpecifiedTests=false (REPO: " + repoType + ")");

        ProcessBuilder pb = new ProcessBuilder("mvn", "test", "-Dsurefire.failIfNoSpecifiedTests=false");
        pb.directory(ROOT.toFile());
        pb.redirectErrorStream(true);
        pb.environment().put("AUDIT_STORAGE_TYPE", "database");

        String output = "";
        int exitCode = -1;
        final String[] parsedOutput = new String[1];
        try {
            Process p = pb.start();
            
            // Read output in a separate thread to avoid blocking
            Thread outputThread = new Thread(() -> {
                try {
                    String s = readAll(p.getInputStream());
                    synchronized (parsedOutput) {
                        parsedOutput[0] = s;
                    }
                } catch (IOException e) {
                    synchronized (parsedOutput) {
                        parsedOutput[0] = "Error reading output: " + e.getMessage();
                    }
                }
            });
            outputThread.start();

            boolean finished = p.waitFor(300, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                synchronized (parsedOutput) {
                    if (parsedOutput[0] == null) {
                         output = "Process timed out. Output read so far: " + parsedOutput[0];
                         output = "Process timed out after 300 seconds.";
                    } else {
                        output = parsedOutput[0] + "\nProcess timed out.";
                    }
                }
            } else {
                exitCode = p.exitValue();
                outputThread.join(5000); // Wait for reader to finish
                synchronized (parsedOutput) {
                     output = parsedOutput[0];
                }
            }
        } catch (Exception e) {
            output = "Error executing tests: " + e.getMessage();
        }

        if (output == null) output = "No output captured.";

        Map<String, Object> parsed = parseTestOutput(output);
        boolean success = (boolean) parsed.get("passed");

        System.out.println("  [Results] " + repoType + ": Passed=" + parsed.get("tests_passed") +
                ", Failed=" + parsed.get("tests_failed") +
                ", Skipped=" + parsed.get("tests_skipped") +
                ", Success=" + success);

        if (!success) {
            System.out.println("  [Output Dump] \n" + output);
        }

        Map<String, Object> tests = new HashMap<>();
        tests.put("passed", success);
        tests.put("return_code", exitCode);
        tests.put("tests_passed", parsed.get("tests_passed"));
        tests.put("tests_failed", parsed.get("tests_failed"));
        tests.put("tests_skipped", parsed.get("tests_skipped"));
        tests.put("output", output.length() > 8000 ? output.substring(0, 8000) : output);

        Map<String, Object> result = new HashMap<>();
        result.put("tests", tests);
        result.put("metrics", new HashMap<>());
        return result;
    }

    private static void printSeparator(String ch, int length) {
        System.out.println(ch.repeat(length));
    }

    private static void printTestSummary(String name, Map<String, Object> result) {
        System.out.println("\n" + "─".repeat(35));
        System.out.println("  " + name);
        System.out.println("─".repeat(35));
        if (result == null) {
            System.out.println("  Status:          SKIPPED (Null)");
            return;
        }
        Map<String, Object> tests = (Map<String, Object>) result.get("tests");
        boolean passed = (boolean) tests.get("passed");
        String status = passed ? "✅ PASS" : "❌ FAIL";
        System.out.println("  Status:          " + status);
        System.out.println("  Tests Passed:    " + tests.get("tests_passed"));
        System.out.println("  Tests Failed:    " + tests.get("tests_failed"));
        System.out.println("  Tests Skipped:   " + tests.get("tests_skipped"));
        System.out.println("  Return Code:     " + tests.get("return_code"));
    }

    private static Map<String, Object> runEvaluation() throws IOException {
        String runId = UUID.randomUUID().toString();
        Instant start = Instant.now();

        printSeparator("=", 70);
        System.out.println("  AUDIT ENGINE EVALUATION");
        printSeparator("=", 70);

        System.out.println("\n  Run ID:     " + runId);
        System.out.println("  Started:    " + DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                .withZone(ZoneOffset.UTC).format(start) + " UTC");
        System.out.println("  Java:       " + System.getProperty("java.version"));
        System.out.println("  Platform:   " + System.getProperty("os.name"));

        boolean inDocker = Files.exists(Paths.get("/.dockerenv")) || System.getenv("DOCKER_CONTAINER") != null;
        System.out.println("  Environment: " + (inDocker ? "Docker container" : "Host system"));

        System.out.println("\n" + "─".repeat(70));
        System.out.println("  Running Performance & Logic Verification...");
        System.out.println("─".repeat(70));

        System.out.println("\n  [1/2] repository_before (Skipped - Setting to null)...");
        Map<String, Object> before = null;

        System.out.println("\n  [2/2] Testing repository_after (Ground Truth)...");
        Map<String, Object> after = runTestsDirect("after");

        if (after != null) {
            Map<String, Object> tests = (Map<String, Object>) after.get("tests");
            tests.remove("output");
        }

        Map<String, Object> comparison = new HashMap<>();
        Map<String, Object> afterTests = (Map<String, Object>) after.get("tests");
        boolean passedGate = (boolean) afterTests.get("passed");
        comparison.put("before_passed", null);
        comparison.put("after_passed", passedGate);
        comparison.put("before_failed_count", null);
        comparison.put("after_failed_count", afterTests.get("tests_failed"));
        comparison.put("passed_gate", passedGate);
        comparison.put("improvement_summary", passedGate
                ? "Implementation successful: repository_after passes all " + afterTests.get("tests_passed") + " tests."
                : "Failed: repository_after did not meet all requirements.");

        Instant end = Instant.now();
        double duration = Duration.between(start, end).toMillis() / 1000.0;

        Map<String, Object> result = new HashMap<>();
        result.put("run_id", runId);
        result.put("started_at", start.toString());
        result.put("finished_at", end.toString());
        result.put("duration_seconds", duration);
        result.put("environment", environmentInfo());
        result.put("before", before);
        result.put("after", after);
        result.put("comparison", comparison);
        result.put("success", passedGate);
        result.put("error", null);

        String dateStr = DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneOffset.UTC).format(start);
        String timeStr = DateTimeFormatter.ofPattern("HH-mm-ss").withZone(ZoneOffset.UTC).format(start);
        Path reportDir = REPORTS.resolve(dateStr).resolve(timeStr);
        Files.createDirectories(reportDir);
        Path reportPath = reportDir.resolve("report.json");
        Files.writeString(reportPath, toJson(result), StandardCharsets.UTF_8);

        System.out.println("\n" + "─".repeat(70));
        System.out.println("  RESULTS SUMMARY");
        System.out.println("─".repeat(70));

        printTestSummary("repository_before", before);
        printTestSummary("repository_after (Ground Truth)", after);

        System.out.println("\n" + "─".repeat(70));
        System.out.println("  COMPARISON");
        System.out.println("─".repeat(70));

        String gateStatus = passedGate ? "✅ PASSED" : "❌ FAILED";
        System.out.println("\n  Implementation Gate:     " + gateStatus);
        System.out.println("  Summary: " + comparison.get("improvement_summary"));

        System.out.println("\n  Report saved to: " + reportPath);
        System.out.println("\n" + "=".repeat(70));
        System.out.println(passedGate ? "  ✅ EVALUATION SUCCESSFUL ✅" : "  ❌ EVALUATION FAILED ❌");
        System.out.println("=".repeat(70) + "\n");

        return result;
    }

    private static String readAll(InputStream input) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] data = new byte[8192];
        int nRead;
        while ((nRead = input.read(data, 0, data.length)) != -1) {
            buffer.write(data, 0, nRead);
        }
        return buffer.toString(StandardCharsets.UTF_8);
    }

    private static String toJson(Object obj) {
        if (obj == null) return "null";
        if (obj instanceof String) return "\"" + escapeJson((String) obj) + "\"";
        if (obj instanceof Number || obj instanceof Boolean) return obj.toString();
        if (obj instanceof Map<?, ?> map) {
            StringBuilder sb = new StringBuilder();
            sb.append("{");
            boolean first = true;
            for (Map.Entry<?, ?> e : map.entrySet()) {
                if (!first) sb.append(",");
                first = false;
                sb.append(toJson(String.valueOf(e.getKey())));
                sb.append(":");
                sb.append(toJson(e.getValue()));
            }
            sb.append("}");
            return sb.toString();
        }
        if (obj instanceof Iterable<?> it) {
            StringBuilder sb = new StringBuilder();
            sb.append("[");
            boolean first = true;
            for (Object item : it) {
                if (!first) sb.append(",");
                first = false;
                sb.append(toJson(item));
            }
            sb.append("]");
            return sb.toString();
        }
        return "\"" + escapeJson(String.valueOf(obj)) + "\"";
    }

    private static String escapeJson(String s) {
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    public static void main(String[] args) {
        try {
            runEvaluation();
            System.exit(0);
        } catch (Exception e) {
            System.err.println("\n❌ Evaluation failed: " + e.getMessage());
            System.exit(1);
        }
    }
}
