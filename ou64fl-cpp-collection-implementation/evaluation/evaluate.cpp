#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <map>
#include <cstdlib>
#include <algorithm>
#include <cstring>
#include <sys/stat.h>
#include <array>

#ifdef _WIN32
    #include <direct.h>
    #define mkdir(dir, mode) _mkdir(dir)
#endif

class Evaluator {
private:
    std::string reportPath;
    std::string repoRoot;
    std::string repoPathForChecks;
    
    struct EvaluationResult {
        bool success;
        std::string message;
    };
    
public:
    Evaluator() {
        // Resolve repo root by locating CMakeLists.txt
        struct stat buffer;
        repoRoot = ".";
        if (stat("CMakeLists.txt", &buffer) != 0) {
            if (stat("../CMakeLists.txt", &buffer) == 0) {
                repoRoot = "..";
            } else if (stat("../../CMakeLists.txt", &buffer) == 0) {
                repoRoot = "../..";
            } else if (stat("../../../CMakeLists.txt", &buffer) == 0) {
                repoRoot = "../../..";
            }
        }

        const char* envRepo = std::getenv("REPO_PATH");
        if (envRepo != nullptr && *envRepo != '\0') {
            if (envRepo[0] == '/') {
                repoPathForChecks = envRepo;
            } else {
                std::string candidate = repoRoot + "/" + envRepo;
                if (stat(candidate.c_str(), &buffer) == 0) {
                    repoPathForChecks = candidate;
                }
            }
        }
        if (repoPathForChecks.empty()) {
            repoPathForChecks = repoRoot + "/repository_after";
        }

        reportPath = repoRoot + "/evaluation/reports/report.json";
        // Create reports directory if it doesn't exist
        createDirectory(repoRoot + "/evaluation/reports");
    }
    
    bool createDirectory(const std::string& path) {
        #ifdef _WIN32
            return _mkdir(path.c_str()) == 0 || errno == EEXIST;
        #else
            return mkdir(path.c_str(), 0755) == 0 || errno == EEXIST;
        #endif
    }
    
    int executeCommand(const std::string& cmd, std::string& output) {
        std::array<char, 128> buffer;
        output.clear();
        
        #ifdef _WIN32
            FILE* pipe = _popen(cmd.c_str(), "r");
        #else
            FILE* pipe = popen(cmd.c_str(), "r");
        #endif
        
        if (!pipe) return -1;
        
        while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
            output += buffer.data();
        }
        
        #ifdef _WIN32
            return _pclose(pipe);
        #else
            return pclose(pipe);
        #endif
    }
    
    EvaluationResult compileAndTest() {
        std::cout << "Building project..." << std::endl;
        
        std::string output;
        
        // Create build directory
        std::string buildDir = repoRoot + "/build";
        if (system(("mkdir -p " + buildDir + " 2>/dev/null").c_str()) != 0) {
            return {false, "Failed to create build directory"};
        }
        
        // Run CMake
        int result = executeCommand("cmake -S " + repoRoot + " -B " + buildDir, output);
        if (result != 0) {
            return {false, "CMake failed: " + output};
        }
        
        // Build
        result = executeCommand("cmake --build " + buildDir, output);
        if (result != 0) {
            return {false, "Build failed: " + output};
        }
        
        // Check if program exists
        struct stat buffer;
        if (stat((buildDir + "/bin/record_processor").c_str(), &buffer) != 0) {
            return {false, "Main program not built"};
        }
        
        return {true, "Build completed successfully"};
    }
    
    EvaluationResult runSample() {
        std::cout << "Running sample program..." << std::endl;
        
        std::string output;
        std::string execPath = repoRoot + "/build/bin/record_processor";
        int result = executeCommand(execPath, output);
        if (result != 0) {
            return {false, "Program failed with exit code: " + std::to_string(result)};
        }
        
        std::cout << "Program output:" << std::endl;
        std::cout << output << std::endl;
        
        // Parse output
        std::istringstream iss(output);
        std::string line;
        std::vector<std::string> categories;
        
        while (std::getline(iss, line)) {
            if (line.empty()) continue;
            
            // Find category name (before first '|')
            size_t pos = line.find('|');
            if (pos == std::string::npos) {
                return {false, "Invalid format: " + line};
            }
            
            std::string category = line.substr(0, pos);
            // Trim whitespace
            category.erase(0, category.find_first_not_of(" \t"));
            category.erase(category.find_last_not_of(" \t") + 1);
            
            categories.push_back(category);
            
            // Check for COUNT= and TOTAL=
            if (line.find("COUNT=") == std::string::npos || 
                line.find("TOTAL=") == std::string::npos) {
                return {false, "Missing COUNT or TOTAL in: " + line};
            }
        }
        
        if (categories.empty()) {
            return {false, "No output generated"};
        }
        
        // Check lexicographical order
        std::vector<std::string> sortedCategories = categories;
        std::sort(sortedCategories.begin(), sortedCategories.end());
        
        if (categories != sortedCategories) {
            return {false, "Categories not in lexicographical order"};
        }
        
        return {true, "Program ran successfully. Output lines: " + std::to_string(categories.size())};
    }
    
    EvaluationResult checkCodeQuality() {
        std::cout << "Checking code quality..." << std::endl;
        
        std::vector<std::string> issues;
        
        // Check required files exist
        std::vector<std::string> requiredFiles = {
            repoPathForChecks + "/main.cpp",
            repoPathForChecks + "/record_processor.h",
            repoPathForChecks + "/record_processor.cpp",
            repoRoot + "/tests/test_record_processor.cpp"
        };
        
        for (const auto& file : requiredFiles) {
            struct stat buffer;
            if (stat(file.c_str(), &buffer) != 0) {
                issues.push_back("Missing required file: " + file);
            }
        }
        
        // Check for C++17 features in source files
        std::vector<std::string> sourceFiles = {
            repoPathForChecks + "/record_processor.h",
            repoPathForChecks + "/record_processor.cpp"
        };
        
        for (const auto& file : sourceFiles) {
            std::ifstream inFile(file);
            if (!inFile.is_open()) continue;
            
            std::string line;
            bool hasStdMap = false;
            bool hasStdVector = false;
            
            while (std::getline(inFile, line)) {
                if (line.find("std::map") != std::string::npos) hasStdMap = true;
                if (line.find("std::vector") != std::string::npos) hasStdVector = true;
            }
            
            if (!hasStdMap || !hasStdVector) {
                issues.push_back("Source files should use standard containers (std::map, std::vector)");
                break;
            }
        }
        
        return {issues.empty(), issues.empty() ? "Code quality OK" : "Code quality issues found"};
    }
    
    void generateReport(const EvaluationResult& buildResult,
                       const EvaluationResult& runResult,
                       const EvaluationResult& qualityResult) {
        
        std::ofstream reportFile(reportPath);
        if (!reportFile.is_open()) {
            std::cerr << "Failed to open report file: " << reportPath << std::endl;
            return;
        }
        
        int score = 0;
        if (buildResult.success) score += 40;
        if (runResult.success) score += 40;
        if (qualityResult.success) score += 20;
        
        reportFile << "{\n";
        reportFile << "  \"build\": {\n";
        reportFile << "    \"success\": " << (buildResult.success ? "true" : "false") << ",\n";
        reportFile << "    \"message\": \"" << escapeJson(buildResult.message) << "\"\n";
        reportFile << "  },\n";
        reportFile << "  \"execution\": {\n";
        reportFile << "    \"success\": " << (runResult.success ? "true" : "false") << ",\n";
        reportFile << "    \"message\": \"" << escapeJson(runResult.message) << "\"\n";
        reportFile << "  },\n";
        reportFile << "  \"code_quality\": {\n";
        reportFile << "    \"success\": " << (qualityResult.success ? "true" : "false") << ",\n";
        reportFile << "    \"issues\": []\n";
        reportFile << "  },\n";
        reportFile << "  \"overall_score\": " << score << "\n";
        reportFile << "}\n";
        
        reportFile.close();
        std::cout << "\nEvaluation report saved to: " << reportPath << std::endl;
    }
    
    std::string escapeJson(const std::string& str) {
        std::ostringstream oss;
        for (char c : str) {
            switch (c) {
                case '"': oss << "\\\""; break;
                case '\\': oss << "\\\\"; break;
                case '\b': oss << "\\b"; break;
                case '\f': oss << "\\f"; break;
                case '\n': oss << "\\n"; break;
                case '\r': oss << "\\r"; break;
                case '\t': oss << "\\t"; break;
                default:
                    if (c >= 0 && c <= 0x1f) {
                        char buf[7];
                        snprintf(buf, sizeof(buf), "\\u%04x", (int)c);
                        oss << buf;
                    } else {
                        oss << c;
                    }
            }
        }
        return oss.str();
    }
    
    int runEvaluation() {
        std::cout << "============================================================" << std::endl;
        std::cout << "C++ Record Processor Evaluation" << std::endl;
        std::cout << "============================================================" << std::endl;
        
        // Step 1: Build and test
        EvaluationResult buildResult = compileAndTest();
        std::cout << "\nBuild result: " << (buildResult.success ? "PASS" : "FAIL") << std::endl;
        std::cout << "Message: " << buildResult.message << std::endl;
        
        // Step 2: Run sample
        EvaluationResult runResult = {true, "Skipped"};
        if (buildResult.success) {
            runResult = runSample();
            std::cout << "\nExecution result: " << (runResult.success ? "PASS" : "FAIL") << std::endl;
            std::cout << "Message: " << runResult.message << std::endl;
        }
        
        // Step 3: Code quality
        EvaluationResult qualityResult = checkCodeQuality();
        std::cout << "\nCode quality: " << (qualityResult.success ? "PASS" : "FAIL") << std::endl;
        if (!qualityResult.success) {
            std::cout << "Message: " << qualityResult.message << std::endl;
        }
        
        // Generate final report
        generateReport(buildResult, runResult, qualityResult);
        
        int score = 0;
        if (buildResult.success) score += 40;
        if (runResult.success) score += 40;
        if (qualityResult.success) score += 20;
        
        std::cout << "\nOverall Score: " << score << "/100" << std::endl;
        std::cout << "============================================================" << std::endl;
        
        return score >= 80 ? 0 : 1;
    }
};

int main() {
    Evaluator evaluator;
    return evaluator.runEvaluation();
}