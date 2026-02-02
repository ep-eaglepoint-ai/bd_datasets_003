#include "json_parser.h"
#include <iostream>
#include <fstream>
#include <sstream>

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
    
    std::stringstream buffer;
    buffer << file.rdbuf();
    std::string content = buffer.str();
    
    try {
        json::JsonParser parser;
        json::JsonValue value = parser.parse(content);
        
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
