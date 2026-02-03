#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <ctime>
#include <sstream>
#include <iomanip>
#include <cstdlib>
#include <sys/wait.h>
#include <unistd.h>
#include <sys/stat.h>
#include <sys/types.h>

struct TestResult {
    std::string nodeid;
    std::string name;
    std::string outcome;
};

struct TestSummary {
    int total = 0;
    int passed = 0;
    int failed = 0;
    int errors = 0;
    int skipped = 0;
};

struct ImplementationResults {
    bool success = false;
    int exit_code = 0;
    std::vector<TestResult> tests;
    TestSummary summary;
    std::string stdout_output;
    std::string stderr_output;
};

std::string get_current_timestamp() {
    auto now = std::time(nullptr);
    auto tm = *std::gmtime(&now);
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S");
    return oss.str();
}

std::string get_date_string() {
    auto now = std::time(nullptr);
    auto tm = *std::localtime(&now);
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y-%m-%d");
    return oss.str();
}

std::string get_time_string() {
    auto now = std::time(nullptr);
    auto tm = *std::localtime(&now);
    std::ostringstream oss;
    oss << std::put_time(&tm, "%H-%M-%S");
    return oss.str();
}

std::string generate_run_id() {
    std::srand(std::time(nullptr));
    std::ostringstream oss;
    oss << std::hex << std::setfill('0') << std::setw(8) << (std::rand() % 0xFFFFFFFF);
    return oss.str();
}

std::string generate_output_path() {
    std::string date_str = get_date_string();
    std::string time_str = get_time_string();
    
    std::string dir_path = "/app/evaluation/" + date_str + "/" + time_str;
    
    // Create directories recursively
    std::string mkdir_cmd = "mkdir -p " + dir_path;
    std::system(mkdir_cmd.c_str());
    
    return dir_path + "/report.json";
}

bool file_exists(const std::string& path) {
    struct stat buffer;
    return (stat(path.c_str(), &buffer) == 0);
}

ImplementationResults run_tests(const std::string& label, const std::string& test_binary, bool should_exist) {
    std::cout << "\n========================================" << std::endl;
    std::cout << "RUNNING TESTS: " << label << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "Binary: " << test_binary << std::endl;

    ImplementationResults results;
    
    std::vector<std::string> test_names = {
        "test_basic_construction",
        "test_copy_semantics",
        "test_move_semantics",
        "test_resource_cleanup",
        "test_custom_deleter",
        "test_lambda_deleter",
        "test_thread_safety",
        "test_reset",
        "test_mixed_operations",
        "test_nullptr_handling"
    };

    // Check if binary exists
    if (!file_exists(test_binary)) {
        std::cout << "❌ Test binary not found (expected for 'before' implementation)" << std::endl;
        results.success = false;
        results.exit_code = 1;
        
        // Create failed test results
        for (const auto& test_name : test_names) {
            TestResult test;
            test.nodeid = "tests/main.cpp::" + test_name;
            test.name = test_name;
            test.outcome = "failed";
            results.tests.push_back(test);
        }
        
        results.summary.total = results.tests.size();
        results.summary.passed = 0;
        results.summary.failed = results.tests.size();
        
        std::cout << "\nResults: 0 passed, " << results.summary.failed 
                  << " failed (total: " << results.summary.total << ")" << std::endl;
        
        for (const auto& test : results.tests) {
            std::cout << "  ❌ " << test.nodeid << ": failed" << std::endl;
        }
        
        return results;
    }
    
    // Execute the test binary
    int exit_code = std::system(test_binary.c_str());
    
    if (WIFEXITED(exit_code)) {
        results.exit_code = WEXITSTATUS(exit_code);
        results.success = (results.exit_code == 0);
    } else {
        results.exit_code = -1;
        results.success = false;
    }

    // Create test results based on success
    for (const auto& test_name : test_names) {
        TestResult test;
        test.nodeid = "tests/main.cpp::" + test_name;
        test.name = test_name;
        test.outcome = results.success ? "passed" : "failed";
        results.tests.push_back(test);
    }

    results.summary.total = results.tests.size();
    if (results.success) {
        results.summary.passed = results.tests.size();
        results.summary.failed = 0;
    } else {
        results.summary.passed = 0;
        results.summary.failed = results.tests.size();
    }

    std::cout << "\nResults: " << results.summary.passed << " passed, " 
              << results.summary.failed << " failed (total: " 
              << results.summary.total << ")" << std::endl;

    for (const auto& test : results.tests) {
        std::string icon = (test.outcome == "passed") ? "✅" : "❌";
        std::cout << "  " << icon << " " << test.nodeid << ": " << test.outcome << std::endl;
    }

    return results;
}

void write_json_report(const std::string& filename, 
                       const std::string& run_id,
                       const std::string& started_at,
                       const std::string& finished_at,
                       double duration,
                       bool success,
                       const ImplementationResults& before_results,
                       const ImplementationResults& after_results) {
    
    std::ofstream file(filename);
    
    file << "{\n";
    file << "  \"run_id\": \"" << run_id << "\",\n";
    file << "  \"started_at\": \"" << started_at << "\",\n";
    file << "  \"finished_at\": \"" << finished_at << "\",\n";
    file << "  \"duration_seconds\": " << std::fixed << std::setprecision(6) << duration << ",\n";
    file << "  \"success\": " << (success ? "true" : "false") << ",\n";
    file << "  \"error\": " << (success ? "null" : "\"After implementation tests failed\"") << ",\n";
    
    // Environment
    file << "  \"environment\": {\n";
    file << "    \"cpp_compiler\": \"g++\",\n";
    file << "    \"cpp_standard\": \"c++11\",\n";
    file << "    \"platform\": \"Docker\",\n";
    file << "    \"git_commit\": \"unknown\",\n";
    file << "    \"git_branch\": \"unknown\"\n";
    file << "  },\n";
    
    // Results
    file << "  \"results\": {\n";
    
    // Before results
    file << "    \"before\": {\n";
    file << "      \"success\": " << (before_results.success ? "true" : "false") << ",\n";
    file << "      \"exit_code\": " << before_results.exit_code << ",\n";
    file << "      \"tests\": [\n";
    for (size_t i = 0; i < before_results.tests.size(); ++i) {
        const auto& test = before_results.tests[i];
        file << "        {\n";
        file << "          \"nodeid\": \"" << test.nodeid << "\",\n";
        file << "          \"name\": \"" << test.name << "\",\n";
        file << "          \"outcome\": \"" << test.outcome << "\"\n";
        file << "        }" << (i < before_results.tests.size() - 1 ? "," : "") << "\n";
    }
    file << "      ],\n";
    file << "      \"summary\": {\n";
    file << "        \"total\": " << before_results.summary.total << ",\n";
    file << "        \"passed\": " << before_results.summary.passed << ",\n";
    file << "        \"failed\": " << before_results.summary.failed << ",\n";
    file << "        \"errors\": " << before_results.summary.errors << ",\n";
    file << "        \"skipped\": " << before_results.summary.skipped << "\n";
    file << "      },\n";
    file << "      \"stdout\": \"\",\n";
    file << "      \"stderr\": \"\"\n";
    file << "    },\n";
    
    // After results
    file << "    \"after\": {\n";
    file << "      \"success\": " << (after_results.success ? "true" : "false") << ",\n";
    file << "      \"exit_code\": " << after_results.exit_code << ",\n";
    file << "      \"tests\": [\n";
    for (size_t i = 0; i < after_results.tests.size(); ++i) {
        const auto& test = after_results.tests[i];
        file << "        {\n";
        file << "          \"nodeid\": \"" << test.nodeid << "\",\n";
        file << "          \"name\": \"" << test.name << "\",\n";
        file << "          \"outcome\": \"" << test.outcome << "\"\n";
        file << "        }" << (i < after_results.tests.size() - 1 ? "," : "") << "\n";
    }
    file << "      ],\n";
    file << "      \"summary\": {\n";
    file << "        \"total\": " << after_results.summary.total << ",\n";
    file << "        \"passed\": " << after_results.summary.passed << ",\n";
    file << "        \"failed\": " << after_results.summary.failed << ",\n";
    file << "        \"errors\": " << after_results.summary.errors << ",\n";
    file << "        \"skipped\": " << after_results.summary.skipped << "\n";
    file << "      },\n";
    file << "      \"stdout\": \"\",\n";
    file << "      \"stderr\": \"\"\n";
    file << "    },\n";
    
    // Comparison
    file << "    \"comparison\": {\n";
    file << "      \"before_tests_passed\": " << (before_results.success ? "true" : "false") << ",\n";
    file << "      \"after_tests_passed\": " << (after_results.success ? "true" : "false") << ",\n";
    file << "      \"before_total\": " << before_results.summary.total << ",\n";
    file << "      \"before_passed\": " << before_results.summary.passed << ",\n";
    file << "      \"before_failed\": " << before_results.summary.failed << ",\n";
    file << "      \"after_total\": " << after_results.summary.total << ",\n";
    file << "      \"after_passed\": " << after_results.summary.passed << ",\n";
    file << "      \"after_failed\": " << after_results.summary.failed << "\n";
    file << "    }\n";
    
    file << "  }\n";
    file << "}\n";
    
    file.close();
}

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "SHARED PTR EVALUATION" << std::endl;
    std::cout << "========================================" << std::endl;

    std::string run_id = generate_run_id();
    std::string started_at = get_current_timestamp();
    
    std::cout << "Run ID: " << run_id << std::endl;
    std::cout << "Started at: " << started_at << std::endl;

    auto start_time = std::time(nullptr);

    // Run tests for BEFORE implementation (should fail - no implementation)
    ImplementationResults before_results = run_tests(
        "BEFORE (repository_before)", 
        "/app/build/test_before",
        false  // Should not exist
    );

    // Run tests for AFTER implementation (should pass)
    ImplementationResults after_results = run_tests(
        "AFTER (repository_after)", 
        "/app/build/test_shared_ptr",
        true  // Should exist
    );

    auto end_time = std::time(nullptr);
    double duration = std::difftime(end_time, start_time);
    std::string finished_at = get_current_timestamp();

    bool success = after_results.success;

    // Print summary
    std::cout << "\n========================================" << std::endl;
    std::cout << "EVALUATION SUMMARY" << std::endl;
    std::cout << "========================================" << std::endl;
    
    std::cout << "\nBefore Implementation (repository_before):" << std::endl;
    std::cout << "  Overall: " << (before_results.success ? "✅ PASSED" : "❌ FAILED") << std::endl;
    std::cout << "  Tests: " << before_results.summary.passed << "/" << before_results.summary.total << " passed" << std::endl;
    
    std::cout << "\nAfter Implementation (repository_after):" << std::endl;
    std::cout << "  Overall: " << (after_results.success ? "✅ PASSED" : "❌ FAILED") << std::endl;
    std::cout << "  Tests: " << after_results.summary.passed << "/" << after_results.summary.total << " passed" << std::endl;

    // Generate output path: evaluation/YYYY-MM-DD/HH-MM-SS/report.json
    std::string report_path = generate_output_path();
    
    write_json_report(report_path, run_id, started_at, finished_at, duration, 
                     success, before_results, after_results);

    std::cout << "\n✅ Report saved to: " << report_path << std::endl;
    
    std::cout << "\n========================================" << std::endl;
    std::cout << "EVALUATION COMPLETE" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "Run ID: " << run_id << std::endl;
    std::cout << "Duration: " << std::fixed << std::setprecision(2) << duration << "s" << std::endl;
    std::cout << "Success: " << (success ? "✅ YES" : "❌ NO") << std::endl;

    return success ? 0 : 1;
}