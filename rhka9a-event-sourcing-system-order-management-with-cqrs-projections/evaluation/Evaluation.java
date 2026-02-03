package com.example.evaluation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Evaluation service that compares repository_before and repository_after.
 * Generates a standardized JSON report following the evaluation guide.
 */
public class Evaluation {

    private static final String REPORTS_DIR = "evaluation/reports";
    private static final String ROOT_DIR = ".";
    private static final int MAX_OUTPUT_LENGTH = 8000;
    private static final int TEST_TIMEOUT_SECONDS = 300;

    public static void main(String[] args) {
        try {
            int exitCode = runEvaluation();
            System.exit(exitCode);
        } catch (Exception e) {
            System.err.println("Evaluation failed: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    /**
     * Main entry point for evaluation.
     * @return exit code (0 for success, 1 for failure)
     */
    public static int runEvaluation() throws Exception {
        String runId = UUID.randomUUID().toString();
        String startedAt = Instant.now().toString();
        long startTime = System.currentTimeMillis();

        // Evaluate repository_before (static - no tests available)
        ObjectNode before = evaluateRepositoryBefore();

        // Evaluate repository_after (run actual tests)
        ObjectNode after = evaluateRepositoryAfter();

        // Calculate comparison
        boolean passedGate = after.get("tests").get("passed").asBoolean();
        String improvementSummary = passedGate 
            ? "After implementation passed correctness tests" 
            : "After implementation failed correctness tests";

        long duration = System.currentTimeMillis() - startTime;
        String finishedAt = Instant.now().toString();

        // Build final report
        ObjectMapper mapper = new ObjectMapper();
        mapper.enable(SerializationFeature.INDENT_OUTPUT);

        ObjectNode environment = mapper.createObjectNode();
        environment.put("java_version", System.getProperty("java.version"));
        environment.put("platform", System.getProperty("os.name") + " " + System.getProperty("os.arch"));

        ObjectNode comparison = mapper.createObjectNode();
        comparison.put("passed_gate", passedGate);
        comparison.put("improvement_summary", improvementSummary);

        ObjectNode report = mapper.createObjectNode();
        report.put("run_id", runId);
        report.put("started_at", startedAt);
        report.put("finished_at", finishedAt);
        report.put("duration_seconds", duration / 1000.0);
        report.set("environment", environment);
        report.set("before", before);
        report.set("after", after);
        report.set("comparison", comparison);
        report.put("success", passedGate);
        report.put("error", (String) null);

        // Ensure reports directory exists
        Files.createDirectories(Paths.get(REPORTS_DIR));

        // Write report
        Path reportPath = Paths.get(REPORTS_DIR, "latest.json");
        File reportFile = reportPath.toFile();
        mapper.writeValue(reportFile, report);

        System.out.println("Report written to " + reportPath);
        System.out.println("Success: " + passedGate);

        return passedGate ? 0 : 1;
    }

    /**
     * Evaluate repository_before with static results (no tests available).
     */
    private static ObjectNode evaluateRepositoryBefore() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode tests = mapper.createObjectNode();
        tests.put("passed", false);
        tests.put("return_code", 1);
        tests.put("output", "no test to run against repo before");

        ObjectNode metrics = mapper.createObjectNode();

        ObjectNode result = mapper.createObjectNode();
        result.set("tests", tests);
        result.set("metrics", metrics);

        return result;
    }

    /**
     * Evaluate repository_after by running Maven tests.
     */
    private static ObjectNode evaluateRepositoryAfter() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        
        // Run Maven tests for repository_after
        ProcessBuilder pb = new ProcessBuilder();
        pb.command("mvn", "test", "-f", "pom.xml", "-q");
        pb.directory(new File(ROOT_DIR));
        pb.redirectErrorStream(true);

        Process process = pb.start();
        
        // Read output with timeout
        StringBuilder output = new StringBuilder();
        BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
        
        // Read with timeout protection
        Thread outputReader = new Thread(() -> {
            try {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                }
            } catch (IOException e) {
                // Ignore
            }
        });
        outputReader.start();
        
        boolean finished = process.waitFor(TEST_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            output.append("\n[Timeout - tests took longer than ").append(TEST_TIMEOUT_SECONDS).append(" seconds]");
        }
        
        outputReader.join(1000);
        
        int returnCode = finished ? process.exitValue() : -1;
        
        // Truncate output if too long
        String truncatedOutput = output.length() > MAX_OUTPUT_LENGTH 
            ? output.substring(0, MAX_OUTPUT_LENGTH) + "\n[output truncated]"
            : output.toString();

        ObjectNode tests = mapper.createObjectNode();
        tests.put("passed", returnCode == 0);
        tests.put("return_code", returnCode);
        tests.put("output", truncatedOutput);

        ObjectNode metrics = mapper.createObjectNode();

        ObjectNode result = mapper.createObjectNode();
        result.set("tests", tests);
        result.set("metrics", metrics);

        return result;
    }
}
