#include "json_parser.h"
#include <cstdlib>
#include <cstring>
#include <sstream>

namespace json {

JsonValue JsonParser::parse(const std::string& input) {
    input_ = input;
    pos_ = 0;
    
    skipWhitespace();
    
    if (pos_ >= input_.size()) {
        throw ParseError("Empty input", pos_);
    }
    
    JsonValue result = parseValue();
    skipWhitespace();
    
    if (pos_ < input_.size()) {
        throw ParseError("Unexpected character after JSON value", pos_);
    }
    
    return result;
}

JsonValue JsonParser::parseValue() {
    skipWhitespace();
    
    if (pos_ >= input_.size()) {
        throw ParseError("Unexpected end of input", pos_);
    }
    
    char c = current();
    
    switch (c) {
        case '{':
            return parseObject();
        case '[':
            return parseArray();
        case '"':
            return parseString();
        case '-':
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
            return parseNumber();
        case 't':
        case 'f':
        case 'n':
            return parseLiteral();
        default:
            throw ParseError(std::string("Unexpected character: '") + c + "'", pos_);
    }
}

JsonValue JsonParser::parseObject() {
    JsonObject obj;
    
    expect('{');
    skipWhitespace();
    
    if (current() == '}') {
        advance();
        return JsonValue(obj);
    }
    
    while (true) {
        skipWhitespace();
        
        if (current() != '"') {
            throw ParseError("Expected string key in object", pos_);
        }
        
        std::string key = parseStringContent();
        
        skipWhitespace();
        expect(':');
        skipWhitespace();
        
        JsonValue value = parseValue();
        obj[key] = value;
        
        skipWhitespace();
        
        char c = current();
        if (c == '}') {
            advance();
            break;
        } else if (c == ',') {
            advance();
        } else {
            throw ParseError("Expected ',' or '}' in object", pos_);
        }
    }
    
    return JsonValue(obj);
}

JsonValue JsonParser::parseArray() {
    JsonArray arr;
    
    expect('[');
    skipWhitespace();
    
    if (current() == ']') {
        advance();
        return JsonValue(arr);
    }
    
    while (true) {
        skipWhitespace();
        
        JsonValue value = parseValue();
        arr.push_back(value);
        
        skipWhitespace();
        
        char c = current();
        if (c == ']') {
            advance();
            break;
        } else if (c == ',') {
            advance();
        } else {
            throw ParseError("Expected ',' or ']' in array", pos_);
        }
    }
    
    return JsonValue(arr);
}

JsonValue JsonParser::parseString() {
    return JsonValue(parseStringContent());
}

std::string JsonParser::parseStringContent() {
    expect('"');
    
    std::string result;
    
    while (pos_ < input_.size()) {
        char c = current();
        
        if (c == '"') {
            advance();
            return result;
        } else if (c == '\\') {
            advance();
            if (pos_ >= input_.size()) {
                throw ParseError("Unexpected end of escape sequence", pos_);
            }
            
            char escaped = current();
            advance();
            
            switch (escaped) {
                case '"':  result += '"'; break;
                case '\\': result += '\\'; break;
                case '/':  result += '/'; break;
                case 'b':  result += '\b'; break;
                case 'f':  result += '\f'; break;
                case 'n':  result += '\n'; break;
                case 'r':  result += '\r'; break;
                case 't':  result += '\t'; break;
                case 'u': {
                    if (pos_ + 4 > input_.size()) {
                        throw ParseError("Incomplete unicode escape", pos_);
                    }
                    std::string hex = input_.substr(pos_, 4);
                    pos_ += 4;
                    unsigned int codepoint = std::stoul(hex, nullptr, 16);
                    result += static_cast<char>(codepoint);
                    break;
                }
                default:
                    throw ParseError(std::string("Invalid escape character: \\") + escaped, pos_);
            }
        } else {
            result += c;
            advance();
        }
    }
    
    throw ParseError("Unterminated string", pos_);
}

JsonValue JsonParser::parseNumber() {
    size_t start = pos_;
    
    if (current() == '-') {
        advance();
    }
    
    if (current() == '0') {
        advance();
    } else if (current() >= '1' && current() <= '9') {
        while (pos_ < input_.size() && current() >= '0' && current() <= '9') {
            advance();
        }
    } else {
        throw ParseError("Invalid number", pos_);
    }
    
    if (pos_ < input_.size() && current() == '.') {
        advance();
        if (pos_ >= input_.size() || current() < '0' || current() > '9') {
            throw ParseError("Invalid number: expected digit after decimal point", pos_);
        }
        while (pos_ < input_.size() && current() >= '0' && current() <= '9') {
            advance();
        }
    }
    
    if (pos_ < input_.size() && (current() == 'e' || current() == 'E')) {
        advance();
        if (pos_ < input_.size() && (current() == '+' || current() == '-')) {
            advance();
        }
        if (pos_ >= input_.size() || current() < '0' || current() > '9') {
            throw ParseError("Invalid number: expected digit in exponent", pos_);
        }
        while (pos_ < input_.size() && current() >= '0' && current() <= '9') {
            advance();
        }
    }
    
    std::string numStr = input_.substr(start, pos_ - start);
    double value = std::stod(numStr);
    
    return JsonValue(value);
}

JsonValue JsonParser::parseLiteral() {
    if (input_.substr(pos_, 4) == "true") {
        pos_ += 4;
        return JsonValue(true);
    } else if (input_.substr(pos_, 5) == "false") {
        pos_ += 5;
        return JsonValue(false);
    } else if (input_.substr(pos_, 4) == "null") {
        pos_ += 4;
        return JsonValue(nullptr);
    } else {
        throw ParseError("Invalid literal", pos_);
    }
}

char JsonParser::current() const {
    if (pos_ >= input_.size()) {
        return '\0';
    }
    return input_[pos_];
}

char JsonParser::peek(size_t offset) const {
    if (pos_ + offset >= input_.size()) {
        return '\0';
    }
    return input_[pos_ + offset];
}

void JsonParser::advance() {
    if (pos_ < input_.size()) {
        pos_++;
    }
}

void JsonParser::skipWhitespace() {
    while (pos_ < input_.size()) {
        char c = current();
        if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
            advance();
        } else {
            break;
        }
    }
}

void JsonParser::expect(char c) {
    if (current() != c) {
        throw ParseError(std::string("Expected '") + c + "' but found '" + 
                        (current() == '\0' ? std::string("EOF") : std::string(1, current())) + "'", 
                        pos_);
    }
    advance();
}

}
