#include <iostream>
#include <string>
#include <vector>
#include <filesystem>
#include <fstream>
#include <chrono>
#include <cstdlib>
#include <array>
#include <iomanip>
#include <ctime>
#include <thread>
#include <regex>

namespace fs = std::filesystem;

// Minimal JSON builder helper (since we don't have nlohmann/json)
struct JsonBuilder {
    std::string content = "{";
    bool first = true;
    
    void addKey(const std::string& key) {
        if (!first) content += ",";
        content += "\"" + key + "\":";
        first = false;
    }
    
    void addString(const std::string& key, const std::string& val) {
        addKey(key);
        content += "\"" + val + "\""; // Very basic escaping assumption
    }
    
    void addNumber(const std::string& key, double val) {
        addKey(key);
        content += std::to_string(val);
    }
    
    void addBool(const std::string& key, bool val) {
        addKey(key);
        content += (val ? "true" : "false");
    }
    
    void addRaw(const std::string& key, const std::string& raw_val) {
        addKey(key);
        content += raw_val;
    }
    
    std::string build() {
        return content + "}";
    }
};

std::string exec(const std::string& cmd, int& return_code) {
    std::array<char, 128> buffer;
    std::string result;
    std::string full_cmd = cmd + " 2>&1";
    FILE* pipe = popen(full_cmd.c_str(), "r");
    if (!pipe) return "";
    while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
        result += buffer.data();
    }
    return_code = pclose(pipe);
    if (return_code != -1) return_code = WEXITSTATUS(return_code);
    return result;
}

std::string current_iso_time() {
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << std::put_time(std::localtime(&time), "%Y-%m-%dT%H:%M:%S");
    return ss.str();
}

bool build_repo(const std::string& repo_path) {
    std::cout << "Building " << repo_path << "..." << std::endl;
    fs::path build_dir = fs::path(repo_path) / "build";
    fs::create_directories(build_dir);
    
    if (!fs::exists(fs::path(repo_path) / "CMakeLists.txt")) {
        std::cout << "No CMakeLists.txt, skipping." << std::endl;
        return true; 
    }
    
    int ret;
    std::string cmd_cmake = "cd " + build_dir.string() + " && cmake ..";
    exec(cmd_cmake, ret);
    if (ret != 0) {
        std::cout << "CMake failed for " << repo_path << std::endl;
        return false;
    }
    
    std::string cmd_make = "cd " + build_dir.string() + " && make";
    exec(cmd_make, ret);
    if (ret != 0) {
        std::cout << "Make failed for " << repo_path << std::endl;
        return false;
    }
    return true;
}

struct TestResult {
    bool success;
    int passed;
    int failed;
    std::string output;
};

TestResult run_cpp_tests(const std::string& test_exec, const std::string& target_repo) {
    // Need to set TARGET_REPO env var
    std::string cmd = "TARGET_REPO=" + target_repo + " " + test_exec;
    
    std::cout << "\n============================================================" << std::endl;
    std::cout << "RUNNING TESTS: " << target_repo << std::endl;
    std::cout << "============================================================" << std::endl;
    
    if (!build_repo(target_repo)) {
        return {false, 0, 0, "Build Failed"};
    }
    
    int ret;
    std::string output = exec(cmd, ret);
    std::cout << output << std::endl;
    
    // Parse summary "Summary: X Passed, Y Failed"
    int passed = 0;
    int failed = 0;
    std::regex re("Summary: ([0-9]+) Passed, ([0-9]+) Failed");
    std::smatch match;
    if(std::regex_search(output, match, re)) {
        passed = std::stoi(match[1]);
        failed = std::stoi(match[2]);
    }
    
    return {ret == 0, passed, failed, output};
}

int main(int argc, char** argv) {
    (void)argc; (void)argv;
    
    std::string start_time = current_iso_time();
    std::cout << "Starting functionality evaluation..." << std::endl;
    
    // 1. Compile the test runner (test_parser.cpp)
    std::cout << "Compiling test runner..." << std::endl;
    int ret;
    // We assume we are in root or evaluation dir. Correct paths.
    // Project root check
    fs::path root = fs::current_path();
    while(!fs::exists(root / "tests" / "test_parser.cpp") && root.has_parent_path()) {
        root = root.parent_path();
    }
    
    fs::path test_src = root / "tests" / "test_parser.cpp";
    fs::path test_bin = root / "tests" / "test_runner";
    
    std::string compile_cmd = "g++ -std=c++17 " + test_src.string() + " -o " + test_bin.string();
    std::string comp_out = exec(compile_cmd, ret);
    if (ret != 0) {
        std::cerr << "Failed to compile tests: " << comp_out << std::endl;
        return 1;
    }
    
    // 2. Run Before
    auto before_res = run_cpp_tests(test_bin.string(), "repository_before");
    
    // 3. Run After
    auto after_res = run_cpp_tests(test_bin.string(), "repository_after");
    
    std::string end_time = current_iso_time();
    
    // Report Generation
    JsonBuilder report;
    report.addString("run_id", "cpp_run");
    report.addString("started_at", start_time);
    report.addString("finished_at", end_time);
    report.addBool("success", after_res.success);
    
    // Comparison
    JsonBuilder comp;
    comp.addBool("before_tests_passed", before_res.success);
    comp.addBool("after_tests_passed", after_res.success);
    comp.addNumber("before_passed", before_res.passed);
    comp.addNumber("before_failed", before_res.failed);
    comp.addNumber("after_passed", after_res.passed);
    comp.addNumber("after_failed", after_res.failed);
    
    report.addRaw("results", "{ \"comparison\": " + comp.build() + "}");
    
    // Generate timestamped path: evaluation/YYYY-MM-DD/HH-MM-SS/report.json
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    std::tm tm = *std::localtime(&time);
    
    std::stringstream ss_date, ss_time;
    ss_date << std::put_time(&tm, "%Y-%m-%d");
    ss_time << std::put_time(&tm, "%H-%M-%S");
    
    fs::path report_dir = root / "evaluation" / ss_date.str() / ss_time.str();
    fs::create_directories(report_dir);
    fs::path report_path = report_dir / "report.json";
    
    std::ofstream ofs(report_path);
    ofs << report.build();
    ofs.close();
    
    std::cout << "Report saved to " << report_path << std::endl;
    
    return after_res.success ? 0 : 1;
}
