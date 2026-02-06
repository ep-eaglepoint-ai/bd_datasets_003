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
#include <sstream>
#include <unistd.h>
#include <sys/utsname.h>

namespace fs = std::filesystem;

// --- JSON Utils ---

std::string escape_json(const std::string& s) {
    std::ostringstream o;
    for (char c : s) {
        switch (c) {
            case '"': o << "\\\""; break;
            case '\\': o << "\\\\"; break;
            case '\b': o << "\\b"; break;
            case '\f': o << "\\f"; break;
            case '\n': o << "\\n"; break;
            case '\r': o << "\\r"; break;
            case '\t': o << "\\t"; break;
            default:
                if ('\x00' <= c && c <= '\x1f') {
                    o << "\\u"
                      << std::hex << std::setw(4) << std::setfill('0') << (int)c;
                } else {
                    o << c;
                }
        }
    }
    return o.str();
}

struct JsonObject {
    std::vector<std::string> members;
    
    void add_str(const std::string& key, const std::string& val) {
        members.push_back("\"" + key + "\": \"" + escape_json(val) + "\"");
    }
    void add_num(const std::string& key, double val) {
        members.push_back("\"" + key + "\": " + std::to_string(val));
    }
    void add_int(const std::string& key, int val) {
        members.push_back("\"" + key + "\": " + std::to_string(val));
    }
    void add_bool(const std::string& key, bool val) {
        members.push_back("\"" + key + "\": " + (val ? "true" : "false"));
    }
    void add_null(const std::string& key) {
        members.push_back("\"" + key + "\": null");
    }
    void add_raw(const std::string& key, const std::string& raw) {
        members.push_back("\"" + key + "\": " + raw);
    }
    
    std::string to_string() const {
        std::string s = "{";
        for (size_t i = 0; i < members.size(); ++i) {
            s += "\n  " + members[i];
            if (i < members.size() - 1) s += ",";
        }
        s += "\n}";
        return s;
    }
};

struct JsonArray {
    std::vector<std::string> items;
    
    void add_obj(const JsonObject& obj) {
        items.push_back(obj.to_string());
    }
    
    std::string to_string() const {
        std::string s = "[";
        for (size_t i = 0; i < items.size(); ++i) {
            s += items[i];
            if (i < items.size() - 1) s += ", ";
        }
        s += "]";
        return s;
    }
};

// --- System Utils ---

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
    // Add timezone offset if possible, but keep simple ISO8601 for now
    return ss.str();
}

std::string get_hostname() {
    char hostname[1024];
    hostname[1023] = '\0';
    gethostname(hostname, 1023);
    return std::string(hostname);
}

// --- Logic ---

struct TestInfo {
    std::string nodeid;
    std::string name;
    std::string outcome;
};

struct EnvInfo {
    std::string node_ver; // Requested "node_version"
    std::string platform_str;
    std::string os;
    std::string release;
    std::string arch;
    std::string hostname;
};

EnvInfo get_env() {
    EnvInfo env;
    env.hostname = get_hostname();
    
    struct utsname buffer;
    if (uname(&buffer) == 0) {
        env.os = buffer.sysname;
        env.release = buffer.release;
        env.arch = buffer.machine;
        env.platform_str = std::string(buffer.sysname) + "-" + buffer.release + "-" + buffer.machine;
    }
    
    int ret;
    std::string node = exec("node --version", ret);
    if (ret == 0) {
        // output like "v18.0.0\n"
        if (!node.empty() && node.back() == '\n') node.pop_back();
        env.node_ver = node;
    } else {
        env.node_ver = "unknown";
    }
    
    return env;
}

bool build_repo(const std::string& repo_path) {
    fs::path build_dir = fs::path(repo_path) / "build";
    fs::create_directories(build_dir);
    
    if (!fs::exists(fs::path(repo_path) / "CMakeLists.txt")) return true;
    
    int ret;
    exec("cd " + build_dir.string() + " && cmake .. && make", ret);
    return ret == 0;
}

struct RunReport {
    bool success;
    int exit_code;
    std::string stdout_str;
    std::string stderr_str;
    std::vector<TestInfo> tests;
    int passed;
    int failed;
    int errors;
    int skipped;
};

RunReport run_repo_tests(const std::string& repo_path, const std::string& runner_path, const std::string& label) {
    std::cout << "\n============================================================" << std::endl;
    std::cout << "RUNNING TESTS: " << label << std::endl;
    std::cout << "============================================================" << std::endl;
    
    if (!build_repo(repo_path)) {
        return {false, -1, "", "Build failed", {}, 0, 0, 0, 0};
    }
    
    std::string cmd = "TARGET_REPO=" + repo_path + " " + runner_path;
    int ret;
    std::string out = exec(cmd, ret);
    
    RunReport r;
    r.exit_code = ret;
    r.success = (ret == 0);
    r.stdout_str = out;
    r.errors = 0;
    r.skipped = 0;
    
    // Parse
    std::istringstream iss(out);
    std::string line;
    std::string current_test_name;
    
    while (std::getline(iss, line)) {
        // Check for new test start
        if (line.rfind("Running ", 0) == 0) {
            size_t dots = line.find("... ");
            if (dots != std::string::npos) {
                // If we were parsing a previous test that didn't finish (unlikely with this runner but good safety)
                if (!current_test_name.empty()) {
                     // Could mark as error/unknown, but let's just push what we have or ignore
                }
                
                current_test_name = line.substr(8, dots - 8);
                // Check if outcome is on the same line
                std::string rest = line.substr(dots + 4);
                if (rest.find("PASSED") != std::string::npos) {
                    std::cout << "✅ " << current_test_name << std::endl;
                    r.tests.push_back({current_test_name, current_test_name, "passed"});
                    current_test_name = "";
                } else if (rest.find("FAILED") != std::string::npos) {
                    std::cout << "❌ " << current_test_name << std::endl;
                    r.tests.push_back({current_test_name, current_test_name, "failed"});
                    current_test_name = "";
                }
                // Else wait for next lines
                continue;
            }
        }
        
        // If we are waiting for an outcome
        if (!current_test_name.empty()) {
            if (line.find("PASSED") != std::string::npos) {
                std::cout << "✅ " << current_test_name << std::endl;
                r.tests.push_back({current_test_name, current_test_name, "passed"});
                current_test_name = "";
            } else if (line.find("FAILED") != std::string::npos) {
                std::cout << "❌ " << current_test_name << std::endl;
                r.tests.push_back({current_test_name, current_test_name, "failed"});
                current_test_name = "";
            }
        }
    }
    
    // Recalculate counts properly
    r.passed = 0; 
    r.failed = 0;
    for(const auto& t : r.tests) {
        if (t.outcome == "passed") r.passed++;
        else if (t.outcome == "failed") r.failed++;
        else if (t.outcome == "skipped") r.skipped++;
        else r.errors++;
    }
    
    return r;
}

int main() {
    auto start_tp = std::chrono::high_resolution_clock::now();
    std::string start_at = current_iso_time();
    // run_id can be random string
    std::string run_id = "cpp_" + std::to_string(std::time(nullptr)); 
    
    fs::path root = fs::current_path();
    while(!fs::exists(root / "tests" / "test_parser.cpp") && root.has_parent_path()) {
        root = root.parent_path();
    }
    
    fs::path test_src = root / "tests" / "test_parser.cpp";
    std::string runner = (root / "test_runner").string();
    int ret;
    
    // Silent compile
    exec("g++ -std=c++17 " + test_src.string() + " -o " + runner, ret);
    if (ret != 0) {
        std::cerr << "Error: Failed to compile test runner" << std::endl;
        return 1;
    }
    
    RunReport before = run_repo_tests("repository_before", runner, "BEFORE (repository_before)");
    RunReport after = run_repo_tests("repository_after", runner, "AFTER (repository_after)");
    
    auto end_tp = std::chrono::high_resolution_clock::now();
    double duration = std::chrono::duration<double>(end_tp - start_tp).count();
    std::string finished_at = current_iso_time();
    
    // Evaluation Summary
    std::cout << "\n============================================================" << std::endl;
    std::cout << "EVALUATION SUMMARY" << std::endl;
    std::cout << "============================================================" << std::endl;
    
    auto print_summary = [](const std::string& label, const RunReport& r) {
        std::cout << label << ": " << (r.success ? "PASSED" : "FAILED");
        std::cout << " (" << r.passed << "/" << (r.passed + r.failed) << " passed)" << std::endl;
    };
    
    print_summary("Before", before);
    print_summary("After", after);
    
    // JSON
    JsonObject root_obj;
    root_obj.add_str("run_id", run_id);
    root_obj.add_str("started_at", start_at);
    root_obj.add_str("finished_at", finished_at);
    root_obj.add_num("duration_seconds", duration);
    root_obj.add_bool("success", after.success);
    if (!after.success) root_obj.add_str("error", "After implementation tests failed");
    else root_obj.add_null("error");
    
    EnvInfo env = get_env();
    JsonObject env_obj;
    env_obj.add_str("node_version", env.node_ver); 
    env_obj.add_str("platform", env.platform_str);
    env_obj.add_str("os", env.os);
    env_obj.add_str("os_release", env.release);
    env_obj.add_str("architecture", env.arch);
    env_obj.add_str("hostname", env.hostname);
    env_obj.add_str("git_commit", "unknown");
    env_obj.add_str("git_branch", "unknown");
    root_obj.add_raw("environment", env_obj.to_string());
    
    JsonObject results_obj;
    
    auto add_run_res = [](JsonObject& parent, const std::string& key, const RunReport& r) {
        JsonObject res;
        res.add_bool("success", r.success);
        res.add_int("exit_code", r.exit_code);
        
        JsonArray tests_arr;
        for (const auto& t : r.tests) {
            JsonObject t_obj;
            t_obj.add_str("nodeid", t.nodeid);
            t_obj.add_str("name", t.name);
            t_obj.add_str("outcome", t.outcome);
            tests_arr.add_obj(t_obj);
        }
        res.add_raw("tests", tests_arr.to_string());
        
        JsonObject summary;
        summary.add_int("total", r.passed + r.failed + r.errors + r.skipped);
        summary.add_int("passed", r.passed);
        summary.add_int("failed", r.failed);
        summary.add_int("errors", r.errors);
        summary.add_int("skipped", r.skipped);
        res.add_raw("summary", summary.to_string());
        
        res.add_str("stdout", r.stdout_str.substr(0, 5000));
        res.add_str("stderr", "");
        
        parent.add_raw(key, res.to_string());
    };
    
    add_run_res(results_obj, "before", before);
    add_run_res(results_obj, "after", after);
    
    JsonObject comp;
    comp.add_bool("before_tests_passed", before.success);
    comp.add_bool("after_tests_passed", after.success);
    comp.add_int("before_total", before.passed + before.failed + before.errors + before.skipped);
    comp.add_int("before_passed", before.passed);
    comp.add_int("before_failed", before.failed);
    comp.add_int("after_total", after.passed + after.failed + after.errors + after.skipped);
    comp.add_int("after_passed", after.passed);
    comp.add_int("after_failed", after.failed);
    results_obj.add_raw("comparison", comp.to_string());
    
    root_obj.add_raw("results", results_obj.to_string());
    
    // Save
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
    ofs << root_obj.to_string();
    ofs.close();
    
    std::cout << "\nReport saved to: " << "evaluation/" << ss_date.str() << "/" << ss_time.str() << "/report.json" << std::endl;
    std::cout << "Success: " << (after.success ? "YES" : "NO") << std::endl;
    
    return after.success ? 0 : 1;
}
