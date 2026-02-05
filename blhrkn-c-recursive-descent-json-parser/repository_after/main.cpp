#include "json_parser.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <chrono>
#include <string>

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <json_file>" << std::endl;
        return 1;
    }
    
    std::ifstream file(argv[1]);
    if (!file.is_open()) {
        std::cerr << "Error: Could not open file " << argv[1] << std::endl;
        return 1;
    }
    
    // Optimized file reading to avoid double allocation (stringstream + string)
    file.seekg(0, std::ios::end);
    size_t size = file.tellg();
    std::string content(size, ' ');
    file.seekg(0);
    file.read(&content[0], size);
    
    try {
        json::JsonParser parser;
        
        auto start = std::chrono::high_resolution_clock::now();
        json::JsonValue value = parser.parse(content);
        auto end = std::chrono::high_resolution_clock::now();
        std::chrono::duration<double, std::milli> elapsed = end - start;
        std::cout << "Parse time: " << elapsed.count() << " ms" << std::endl;
        
        // Output dump if requested for verification
        if (argc > 2 && std::string(argv[2]) == "--dump") {
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
