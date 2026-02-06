#include "json_parser.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <chrono>
#include <string>

int main(int argc, char* argv[]) {
    // Parse args
    std::string filename;
    bool dump = false;
    size_t max_depth = 1000;
    
    // Simple arg parser
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--dump") {
            dump = true;
        } else if (arg == "--depth") {
            if (i + 1 < argc) {
                try {
                    max_depth = std::stoul(argv[++i]);
                } catch (...) {
                    std::cerr << "Error: Invalid depth value" << std::endl;
                    return 1;
                }
            } else {
                std::cerr << "Error: --depth requires an argument" << std::endl;
                return 1;
            }
        } else {
            filename = arg;
        }
    }
    
    if (filename.empty()) {
        std::cerr << "Usage: " << argv[0] << " <json_file> [--dump] [--depth <N>]" << std::endl;
        return 1;
    }
    
    std::ifstream file(filename);
    if (!file.is_open()) {
        std::cerr << "Error: Could not open file " << filename << std::endl;
        return 1;
    }
    
    // Optimized file reading to avoid double allocation
    file.seekg(0, std::ios::end);
    size_t size = file.tellg();
    std::string content(size, ' ');
    file.seekg(0);
    file.read(&content[0], size);
    
    try {
        json::JsonParser parser;
        parser.setMaxDepth(max_depth);
        
        auto start = std::chrono::high_resolution_clock::now();
        json::JsonValue value = parser.parse(content);
        auto end = std::chrono::high_resolution_clock::now();
        std::chrono::duration<double, std::milli> elapsed = end - start;
        std::cout << "Parse time: " << elapsed.count() << " ms" << std::endl;
        
        if (dump) {
             value.print(std::cout);
             std::cout << std::endl;
             return 0;
        }
        
        if (value.isObject()) {
            std::cout << "Parsed JSON object with " 
                      << value.asObject().size() << " keys" << std::endl;
        } else if (value.isArray()) {
            std::cout << "Parsed JSON array with " 
                      << value.asArray().size() << " elements" << std::endl;
        } else {
            std::cout << "Parsed JSON value" << std::endl;
        }
        
        return 0;
    } catch (const json::ParseError& e) {
        std::cerr << "Parse error: " << e.what() << std::endl;
        return 1;
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
}
