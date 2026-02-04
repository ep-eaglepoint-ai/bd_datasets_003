/**
 * Evaluation runner for Shared Pointer C++ implementation.
 */
#include <iostream>
#include <fstream>
#include <string>
#include <ctime>
#include <sstream>
#include <iomanip>
#include <cstdlib>
#include <sys/wait.h>
#include <unistd.h>
#include <sys/stat.h>
#include <random>
#include <array>

struct TestResults {
    bool passed = false;
    int return_code = 0;
    std::string output;
};

struct EvaluationResults {
    TestResults tests;
};

std::string generate_uuid() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 15);
    std::uniform_int_distribution<> dis2(8, 11);

    std::stringstream ss;
    ss << std::hex;
    for (int i = 0; i < 8; i++) ss << dis(gen);
    ss << "-";
    for (int i = 0; i < 4; i++) ss << dis(gen);
    ss << "-4";  // Version 4
    for (int i = 0; i < 3; i++) ss << dis(gen);
    ss << "-";
    ss << dis2(gen);  // Variant
    for (int i = 0; i < 3; i++) ss << dis(gen);
    ss << "-";
    for (int i = 0; i < 12; i++) ss << dis(gen);
    return ss.str();
}

std::string get_current_timestamp() {
    auto now = std::time(nullptr);
    auto tm = *std::gmtime(&now);
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S") << "Z";
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

std::string generate_output_path() {
    std::string date_str = get_date_string();
    std::string time_str = get_time_string();

    std::string dir_path = "/app/evaluation/" + date_str + "/" + time_str;

    std::string mkdir_cmd = "mkdir -p " + dir_path;
    std::system(mkdir_cmd.c_str());

    return dir_path + "/report.json";
}

bool file_exists(const std::string& path) {
    struct stat buffer;
    return (stat(path.c_str(), &buffer) == 0);
}

std::string escape_json_string(const std::string& input) {
    std::ostringstream ss;
    for (char c : input) {
        switch (c) {
            case '\\': ss << "\\\\"; break;
            case '"': ss << "\\\""; break;
            case '\n': ss << "\\n"; break;
            case '\r': ss << "\\r"; break;
            case '\t': ss << "\\t"; break;
            default: ss << c; break;
        }
    }
    return ss.str();
}

EvaluationResults run_tests(const std::string& label, const std::string& test_binary) {
    std::cout << "\n========================================" << std::endl;
    std::cout << "RUNNING TESTS: " << label << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "Binary: " << test_binary << std::endl;

    EvaluationResults results;

    if (!file_exists(test_binary)) {
        std::cout << "Test binary not found" << std::endl;
        results.tests.passed = false;
        results.tests.return_code = 1;
        results.tests.output = "Test binary not found - repository is empty or not compiled";
        std::cout << "\nResults: FAILED" << std::endl;
        return results;
    }

    // Execute the test binary and capture output
    std::string cmd = test_binary + " 2>&1";
    std::array<char, 128> buffer;
    std::string output;

    FILE* pipe = popen(cmd.c_str(), "r");
    if (pipe) {
        while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
            output += buffer.data();
        }
        int status = pclose(pipe);
        if (WIFEXITED(status)) {
            results.tests.return_code = WEXITSTATUS(status);
            results.tests.passed = (results.tests.return_code == 0);
        } else {
            results.tests.return_code = -1;
            results.tests.passed = false;
        }
    } else {
        results.tests.return_code = -1;
        results.tests.passed = false;
        output = "Failed to execute test binary";
    }

    // Truncate output if too long
    if (output.length() > 8000) {
        output = output.substr(output.length() - 8000);
    }
    results.tests.output = output;

    std::cout << "\nResults: " << (results.tests.passed ? "PASSED" : "FAILED") << std::endl;

    return results;
}

void write_json_report(const std::string& filename,
                       const std::string& run_id,
                       const std::string& started_at,
                       const std::string& finished_at,
                       double duration,
                       const EvaluationResults& before_results,
                       const EvaluationResults& after_results) {

    std::ofstream file(filename);

    bool passed_gate = after_results.tests.passed;
    std::string improvement_summary;
    if (passed_gate && !before_results.tests.passed) {
        improvement_summary = "Repository after passes all correctness tests while repository before fails as expected.";
    } else if (passed_gate) {
        improvement_summary = "Repository after passes all correctness tests.";
    } else {
        improvement_summary = "Repository after failed correctness tests.";
    }

    file << "{\n";
    file << "  \"run_id\": \"" << run_id << "\",\n";
    file << "  \"started_at\": \"" << started_at << "\",\n";
    file << "  \"finished_at\": \"" << finished_at << "\",\n";
    file << "  \"duration_seconds\": " << std::fixed << std::setprecision(6) << duration << ",\n";

    // Environment
    file << "  \"environment\": {\n";
    file << "    \"cpp_standard\": \"c++11\",\n";
    file << "    \"platform\": \"Linux\"\n";
    file << "  },\n";

    // Before results
    file << "  \"before\": {\n";
    file << "    \"tests\": {\n";
    file << "      \"passed\": " << (before_results.tests.passed ? "true" : "false") << ",\n";
    file << "      \"return_code\": " << before_results.tests.return_code << ",\n";
    file << "      \"output\": \"" << escape_json_string(before_results.tests.output) << "\"\n";
    file << "    },\n";
    file << "    \"metrics\": {}\n";
    file << "  },\n";

    // After results
    file << "  \"after\": {\n";
    file << "    \"tests\": {\n";
    file << "      \"passed\": " << (after_results.tests.passed ? "true" : "false") << ",\n";
    file << "      \"return_code\": " << after_results.tests.return_code << ",\n";
    file << "      \"output\": \"" << escape_json_string(after_results.tests.output) << "\"\n";
    file << "    },\n";
    file << "    \"metrics\": {}\n";
    file << "  },\n";

    // Comparison
    file << "  \"comparison\": {\n";
    file << "    \"passed_gate\": " << (passed_gate ? "true" : "false") << ",\n";
    file << "    \"improvement_summary\": \"" << improvement_summary << "\"\n";
    file << "  },\n";

    // Success and error at the end
    file << "  \"success\": " << (passed_gate ? "true" : "false") << ",\n";
    file << "  \"error\": " << (passed_gate ? "null" : "\"After implementation tests failed\"") << "\n";

    file << "}\n";

    file.close();
}

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "SHARED PTR EVALUATION" << std::endl;
    std::cout << "========================================" << std::endl;

    std::string run_id = generate_uuid();
    std::string started_at = get_current_timestamp();

    std::cout << "Run ID: " << run_id << std::endl;
    std::cout << "Started at: " << started_at << std::endl;

    auto start_time = std::time(nullptr);

    // Run tests for BEFORE implementation (should fail - no implementation)
    EvaluationResults before_results = run_tests(
        "BEFORE (repository_before)",
        "/app/build/test_before"
    );

    // Run tests for AFTER implementation (should pass)
    EvaluationResults after_results = run_tests(
        "AFTER (repository_after)",
        "/app/build/test_shared_ptr"
    );

    auto end_time = std::time(nullptr);
    double duration = std::difftime(end_time, start_time);
    std::string finished_at = get_current_timestamp();

    bool success = after_results.tests.passed;

    // Print summary
    std::cout << "\n========================================" << std::endl;
    std::cout << "EVALUATION SUMMARY" << std::endl;
    std::cout << "========================================" << std::endl;

    std::cout << "\nBefore Implementation (repository_before):" << std::endl;
    std::cout << "  Overall: " << (before_results.tests.passed ? "PASSED" : "FAILED") << std::endl;

    std::cout << "\nAfter Implementation (repository_after):" << std::endl;
    std::cout << "  Overall: " << (after_results.tests.passed ? "PASSED" : "FAILED") << std::endl;

    // Generate output path: evaluation/reports/YYYY-MM-DD/HH-MM-SS/report.json
    std::string report_path = generate_output_path();

    write_json_report(report_path, run_id, started_at, finished_at, duration,
                     before_results, after_results);

    std::cout << "\nReport saved to: " << report_path << std::endl;

    std::cout << "\n========================================" << std::endl;
    std::cout << "EVALUATION COMPLETE" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "Run ID: " << run_id << std::endl;
    std::cout << "Duration: " << std::fixed << std::setprecision(2) << duration << "s" << std::endl;
    std::cout << "Success: " << (success ? "YES" : "NO") << std::endl;

    return success ? 0 : 1;
}
