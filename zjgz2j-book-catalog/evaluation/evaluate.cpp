#include <iostream>
#include <fstream>
#include <string>
#include <sstream>
#include <cstdlib>
#include <ctime>
#include <iomanip>
#include <sys/stat.h>
#include <unistd.h>
#include <cstring>
#include <sys/wait.h>
#include <limits.h>

// JSON string escape function
std::string json_escape(const std::string& str) {
    std::ostringstream o;
    for (size_t i = 0; i < str.length(); ++i) {
        switch (str[i]) {
            case '"': o << "\\\""; break;
            case '\\': o << "\\\\"; break;
            case '\b': o << "\\b"; break;
            case '\f': o << "\\f"; break;
            case '\n': o << "\\n"; break;
            case '\r': o << "\\r"; break;
            case '\t': o << "\\t"; break;
            default:
                if ('\x00' <= str[i] && str[i] <= '\x1f') {
                    o << "\\u" << std::hex << std::setw(4) << std::setfill('0') << (int)str[i];
                } else {
                    o << str[i];
                }
        }
    }
    return o.str();
}

// Get current time as ISO 8601 string
std::string get_iso_time() {
    std::time_t now = std::time(nullptr);
    std::tm* utc = std::gmtime(&now);
    std::ostringstream oss;
    oss << std::put_time(utc, "%Y-%m-%dT%H:%M:%SZ");
    return oss.str();
}

// Generate UUID-like string
std::string generate_run_id() {
    std::ostringstream oss;
    oss << std::time(nullptr) << "-" << getpid();
    return oss.str();
}

// Get C++ compiler version
std::string get_cpp_version() {
    FILE* pipe = popen("g++ --version 2>&1 | head -n1", "r");
    if (!pipe) return "unknown";
    
    char buffer[128];
    std::string result;
    while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
        result += buffer;
    }
    pclose(pipe);
    
    if (!result.empty() && result.back() == '\n') {
        result.pop_back();
    }
    return result.empty() ? "unknown" : result;
}

// Get environment metadata
std::string get_environment_metadata() {
    std::ostringstream oss;
    
    char hostname[256];
    gethostname(hostname, sizeof(hostname));
    
    long cpu_count = sysconf(_SC_NPROCESSORS_ONLN);
    if (cpu_count < 1) cpu_count = 1;
    
    char os_name[256] = "Linux";
    #ifdef __APPLE__
    strcpy(os_name, "Darwin");
    #endif
    
    char arch[256] = "x86_64";
    #ifdef __aarch64__
    strcpy(arch, "aarch64");
    #endif
    
    oss << "{"
        << "\"language\":\"C++\","
        << "\"language_version\":\"" << json_escape(get_cpp_version()) << "\","
        << "\"os\":\"" << os_name << "\","
        << "\"architecture\":\"" << arch << "\","
        << "\"cpu_count\":" << cpu_count << ","
        << "\"platform\":\"" << json_escape(std::string(hostname)) << "\""
        << "}";
    
    return oss.str();
}

// Check if directory exists and has .cpp files
bool implementation_exists(const std::string& dir) {
    struct stat info;
    if (stat(dir.c_str(), &info) != 0) return false;
    if (!(info.st_mode & S_IFDIR)) return false;
    
    std::string find_cmd = "find " + dir + " -name \"*.cpp\" 2>/dev/null | head -n1";
    FILE* pipe = popen(find_cmd.c_str(), "r");
    if (!pipe) return false;
    
    char buffer[128];
    bool found = fgets(buffer, sizeof(buffer), pipe) != nullptr;
    pclose(pipe);
    
    return found;
}

// Run command and capture output
struct CommandResult {
    int exit_code;
    std::string stdout_output;
    double duration;
};

CommandResult run_command(const std::string& command, const std::string& working_dir = "") {
    CommandResult result;
    std::clock_t start = std::clock();
    
    std::string full_command = command;
    if (!working_dir.empty()) {
        full_command = "cd " + working_dir + " && " + command;
    }
    
    FILE* pipe = popen((full_command + " 2>&1").c_str(), "r");
    if (!pipe) {
        result.exit_code = -1;
        result.stdout_output = "Failed to execute command";
        result.duration = 0.0;
        return result;
    }
    
    char buffer[4096];
    while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
        result.stdout_output += buffer;
    }
    
    int status = pclose(pipe);
    if (status == -1) {
        result.exit_code = -1;
    } else {
        result.exit_code = WEXITSTATUS(status);
    }
    
    std::clock_t end = std::clock();
    result.duration = double(end - start) / CLOCKS_PER_SEC;
    
    return result;
}

// Parse test results from output
void parse_test_results(const std::string& output, int& passed, int& failed, int& total) {
    passed = 0;
    failed = 0;
    total = 0;
    
    // Look for "[  PASSED  ] X tests"
    size_t pos = output.find("[  PASSED  ]");
    if (pos != std::string::npos) {
        std::string line = output.substr(pos);
        size_t num_start = line.find_first_of("0123456789");
        if (num_start != std::string::npos) {
            std::istringstream iss(line.substr(num_start));
            iss >> passed;
        }
    }
    
    // Look for "[  FAILED  ] X tests"
    pos = output.find("[  FAILED  ]");
    if (pos != std::string::npos) {
        std::string line = output.substr(pos);
        size_t num_start = line.find_first_of("0123456789");
        if (num_start != std::string::npos) {
            std::istringstream iss(line.substr(num_start));
            iss >> failed;
        }
    }
    
    // Look for "Running X tests"
    pos = output.find("Running");
    if (pos != std::string::npos) {
        size_t tests_pos = output.find("tests", pos);
        if (tests_pos != std::string::npos) {
            std::string num_str;
            for (size_t i = tests_pos - 1; i > pos && i < output.length(); --i) {
                if (std::isdigit(output[i])) {
                    num_str = output[i] + num_str;
                } else if (!num_str.empty()) {
                    break;
                }
            }
            if (!num_str.empty()) {
                total = std::stoi(num_str);
            }
        }
    }
    
    if (total == 0 && (passed > 0 || failed > 0)) {
        total = passed + failed;
    }
}

// Run tests for an implementation
std::string run_tests(const std::string& impl_dir, const std::string& project_root) {
    std::clock_t test_start = std::clock();
    
    std::string impl_path = project_root + "/" + impl_dir;
    if (!implementation_exists(impl_path)) {
        std::clock_t test_end = std::clock();
        double duration = double(test_end - test_start) / CLOCKS_PER_SEC;
        
        std::ostringstream oss;
        oss << "{"
            << "\"success\":false,"
            << "\"exit_code\":-1,"
            << "\"duration\":" << std::fixed << std::setprecision(3) << duration << ","
            << "\"stdout\":\"\","
            << "\"stderr\":\"" << json_escape("Implementation directory " + impl_dir + " is empty or does not exist") << "\","
            << "\"tests_passed\":0,"
            << "\"tests_failed\":0,"
            << "\"tests_total\":0"
            << "}";
        return oss.str();
    }
    
    // Build Docker image - try both docker compose and docker-compose
    std::string build_cmd = "(docker compose build 2>&1) || (docker-compose build 2>&1)";
    CommandResult build_result = run_command(build_cmd, project_root);
    
    if (build_result.exit_code != 0) {
        std::clock_t test_end = std::clock();
        double duration = double(test_end - test_start) / CLOCKS_PER_SEC;
        
        std::ostringstream oss;
        oss << "{"
            << "\"success\":false,"
            << "\"exit_code\":" << build_result.exit_code << ","
            << "\"duration\":" << std::fixed << std::setprecision(3) << duration << ","
            << "\"stdout\":\"\","
            << "\"stderr\":" << "\"" << json_escape(build_result.stdout_output) << "\","
            << "\"tests_passed\":0,"
            << "\"tests_failed\":0,"
            << "\"tests_total\":0"
            << "}";
        return oss.str();
    }
    
    // Run tests - try both docker compose and docker-compose
    std::string test_cmd = "(docker compose run --rm -e SRC_DIR=" + impl_dir + " app sh -c \"make clean && make all && make test\" 2>&1) || (docker-compose run --rm -e SRC_DIR=" + impl_dir + " app sh -c \"make clean && make all && make test\" 2>&1)";
    CommandResult test_result = run_command(test_cmd, project_root);
    
    std::clock_t test_end = std::clock();
    double duration = double(test_end - test_start) / CLOCKS_PER_SEC;
    
    int tests_passed = 0, tests_failed = 0, tests_total = 0;
    parse_test_results(test_result.stdout_output, tests_passed, tests_failed, tests_total);
    
    bool success = (test_result.exit_code == 0 && tests_failed == 0);
    
    std::ostringstream oss;
    oss << "{"
        << "\"success\":" << (success ? "true" : "false") << ","
        << "\"exit_code\":" << test_result.exit_code << ","
        << "\"duration\":" << std::fixed << std::setprecision(3) << duration << ","
        << "\"stdout\":" << "\"" << json_escape(test_result.stdout_output) << "\","
        << "\"stderr\":\"\","
        << "\"tests_passed\":" << tests_passed << ","
        << "\"tests_failed\":" << tests_failed << ","
        << "\"tests_total\":" << tests_total
        << "}";
    
    return oss.str();
}

// Extract JSON value
std::string extract_json_value(const std::string& json, const std::string& key) {
    std::string search_key = "\"" + key + "\"";
    size_t pos = json.find(search_key);
    if (pos == std::string::npos) return "";
    
    pos = json.find(":", pos);
    if (pos == std::string::npos) return "";
    
    pos++; // Skip ':'
    while (pos < json.length() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
    
    if (pos >= json.length()) return "";
    
    if (json[pos] == '"') {
        // String value
        pos++;
        size_t end = json.find('"', pos);
        if (end == std::string::npos) return "";
        return json.substr(pos, end - pos);
    } else {
        // Number or boolean
        size_t end = pos;
        while (end < json.length() && json[end] != ',' && json[end] != '}' && json[end] != ' ') {
            end++;
        }
        std::string value = json.substr(pos, end - pos);
        // Remove trailing spaces
        while (!value.empty() && value.back() == ' ') value.pop_back();
        return value;
    }
}

int main(int /* argc */, char* argv[]) {
    char resolved_path[PATH_MAX];
    std::string script_path = argv[0];
    
    // Get evaluation directory
    std::string evaluation_dir;
    if (realpath(script_path.c_str(), resolved_path)) {
        std::string full_path = resolved_path;
        size_t last_slash = full_path.find_last_of("/\\");
        evaluation_dir = full_path.substr(0, last_slash);
    } else {
        evaluation_dir = script_path.substr(0, script_path.find_last_of("/\\"));
    }
    
    std::string project_root = evaluation_dir + "/..";
    if (realpath(project_root.c_str(), resolved_path)) {
        project_root = resolved_path;
    } else {
        // Fallback: resolve manually
        char cwd[PATH_MAX];
        if (getcwd(cwd, sizeof(cwd))) {
            std::string cwd_str = cwd;
            size_t eval_pos = cwd_str.find("/evaluation");
            if (eval_pos != std::string::npos) {
                project_root = cwd_str.substr(0, eval_pos);
            }
        }
    }
    
    std::string report_file = evaluation_dir + "/report.json";
    
    std::string run_id = generate_run_id();
    std::string start_time_iso = get_iso_time();
    std::clock_t start_clock = std::clock();
    
    std::cout << "Running tests for repository_before..." << std::endl;
    std::string before_result = run_tests("repository_before", project_root);
    
    std::cout << "Running tests for repository_after..." << std::endl;
    std::string after_result = run_tests("repository_after", project_root);
    
    std::clock_t end_clock = std::clock();
    std::string end_time_iso = get_iso_time();
    double duration = double(end_clock - start_clock) / CLOCKS_PER_SEC;
    
    // Extract values
    std::string before_success = extract_json_value(before_result, "success");
    std::string after_success = extract_json_value(after_result, "success");
    std::string before_exit = extract_json_value(before_result, "exit_code");
    std::string before_duration = extract_json_value(before_result, "duration");
    std::string before_passed = extract_json_value(before_result, "tests_passed");
    std::string before_failed = extract_json_value(before_result, "tests_failed");
    std::string before_total = extract_json_value(before_result, "tests_total");
    
    std::string after_exit = extract_json_value(after_result, "exit_code");
    std::string after_duration = extract_json_value(after_result, "duration");
    std::string after_passed = extract_json_value(after_result, "tests_passed");
    std::string after_failed = extract_json_value(after_result, "tests_failed");
    std::string after_total = extract_json_value(after_result, "tests_total");
    
    // Determine comparison
    std::string comparison = "UNKNOWN";
    if (before_success == "false" && after_success == "true") {
        comparison = "FAIL_TO_PASS";
    } else if (before_success == "true" && after_success == "true") {
        comparison = "PASS_TO_PASS";
    } else if (before_success == "false" && after_success == "false") {
        comparison = "FAIL_TO_FAIL";
    } else if (before_success == "true" && after_success == "false") {
        comparison = "PASS_TO_FAIL";
    }
    
    // Generate report
    std::ostringstream report;
    report << "{"
           << "\"run_id\":\"" << run_id << "\","
           << "\"start_time\":\"" << start_time_iso << "\","
           << "\"end_time\":\"" << end_time_iso << "\","
           << "\"duration\":" << std::fixed << std::setprecision(3) << duration << ","
           << "\"environment\":" << get_environment_metadata() << ","
           << "\"before\":{"
           << "\"implementation\":\"repository_before\","
           << "\"success\":" << before_success << ","
           << "\"exit_code\":" << before_exit << ","
           << "\"duration\":" << before_duration << ","
           << "\"tests_passed\":" << before_passed << ","
           << "\"tests_failed\":" << before_failed << ","
           << "\"tests_total\":" << before_total
           << "},"
           << "\"after\":{"
           << "\"implementation\":\"repository_after\","
           << "\"success\":" << after_success << ","
           << "\"exit_code\":" << after_exit << ","
           << "\"duration\":" << after_duration << ","
           << "\"tests_passed\":" << after_passed << ","
           << "\"tests_failed\":" << after_failed << ","
           << "\"tests_total\":" << after_total
           << "},"
           << "\"comparison\":\"" << comparison << "\","
           << "\"success\":" << after_success << ","
           << "\"error\":null"
           << "}";
    
    // Write report
    std::ofstream out(report_file);
    if (out.is_open()) {
        out << report.str() << std::endl;
        out.close();
    }
    
    // Print summary
    std::cout << std::endl;
    std::cout << "Evaluation complete. Report written to " << report_file << std::endl;
    
    std::string before_status = (before_success == "true") ? "PASS" : "FAIL";
    std::string after_status = (after_success == "true") ? "PASS" : "FAIL";
    
    std::cout << "Before: " << before_status << " (" << before_passed << "/" << before_total << " tests)" << std::endl;
    std::cout << "After: " << after_status << " (" << after_passed << "/" << after_total << " tests)" << std::endl;
    std::cout << "Comparison: " << comparison << std::endl;
    
    return (after_success == "true") ? 0 : 1;
}
