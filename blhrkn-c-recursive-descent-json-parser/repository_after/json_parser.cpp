#include "json_parser.h"
#include <cstdlib>
#include <cstring>
#include <charconv>
#include <limits>
#include <cmath>

namespace json {

// Helper for UTF-8 encoding
static void encode_utf8(uint32_t codepoint, std::string& out) {
    if (codepoint <= 0x7F) {
        out += static_cast<char>(codepoint);
    } else if (codepoint <= 0x7FF) {
        out += static_cast<char>(0xC0 | ((codepoint >> 6) & 0x1F));
        out += static_cast<char>(0x80 | (codepoint & 0x3F));
    } else if (codepoint <= 0xFFFF) {
        out += static_cast<char>(0xE0 | ((codepoint >> 12) & 0x0F));
        out += static_cast<char>(0x80 | ((codepoint >> 6) & 0x3F));
        out += static_cast<char>(0x80 | (codepoint & 0x3F));
    } else if (codepoint <= 0x10FFFF) {
        out += static_cast<char>(0xF0 | ((codepoint >> 18) & 0x07));
        out += static_cast<char>(0x80 | ((codepoint >> 12) & 0x3F));
        out += static_cast<char>(0x80 | ((codepoint >> 6) & 0x3F));
        out += static_cast<char>(0x80 | (codepoint & 0x3F));
    } else {
        out += "\xEF\xBF\xBD"; // Replacement
    }
}

JsonValue JsonParser::parse(std::string_view input) {
    lexer_ = std::make_unique<Lexer>(input);
    depth_ = 0;
    
    // Prime the lexer
    advance();
    
    if (current_token_.type == TokenType::EndOfFile) {
        return JsonValue(); 
    }
    
    JsonValue result = parseValue();
    
    if (current_token_.type != TokenType::EndOfFile) {
        throw ParseError("Unexpected token after JSON value", current_token_.line, current_token_.column);
    }
    
    return result;
}

void JsonParser::advance() {
    current_token_ = lexer_->nextToken();
}

void JsonParser::expect(TokenType type) {
    if (current_token_.type != type) {
        throw ParseError("Unexpected token", current_token_.line, current_token_.column);
    }
    advance();
}

JsonValue JsonParser::parseValue() {
    if (depth_ >= max_depth_) {
         throw ParseError("Maximum nesting depth exceeded", current_token_.line, current_token_.column);
    }
    
    depth_++;
    JsonValue val;
    
    switch (current_token_.type) {
        case TokenType::LeftBrace: val = parseObject(); break;
        case TokenType::LeftBracket: val = parseArray(); break;
        case TokenType::String: 
            val = JsonValue(processStringToken(current_token_)); 
            advance(); 
            break;
        case TokenType::Number: {
            // std::from_chars on token value
            double num;
            std::string_view v = current_token_.value;
            auto res = std::from_chars(v.data(), v.data() + v.size(), num);
            if (res.ec != std::errc()) {
                 // Should ideally not happen if Lexer validated digit format,
                 // but let's handle safety.
                 throw ParseError("Failed to parse number", current_token_.line, current_token_.column);
            }
            val = JsonValue(num);
            advance();
            break;
        }
        case TokenType::True: val = JsonValue(true); advance(); break;
        case TokenType::False: val = JsonValue(false); advance(); break;
        case TokenType::Null: val = JsonValue(nullptr); advance(); break;
        default:
            depth_--;
            throw ParseError("Unexpected token in value", current_token_.line, current_token_.column);
    }
    
    depth_--;
    return val;
}

JsonValue JsonParser::parseObject() {
    JsonObject obj;
    // Consume '{'
    // expect(TokenType::LeftBrace) was likely called by switch or we are sitting on it.
    // parseValue switch didn't consume it.
    advance(); // skip {
    
    if (current_token_.type == TokenType::RightBrace) {
        advance();
        return JsonValue(std::move(obj));
    }
    
    while (true) {
        if (current_token_.type != TokenType::String) {
             throw ParseError("Expected string key in object", current_token_.line, current_token_.column);
        }
        
        std::string key = processStringToken(current_token_);
        advance();
        
        expect(TokenType::Colon);
        
        JsonValue value = parseValue();
        obj.emplace(std::move(key), std::move(value));
        
        if (current_token_.type == TokenType::RightBrace) {
            advance();
            break;
        } else if (current_token_.type == TokenType::Comma) {
            advance();
        } else {
             throw ParseError("Expected ',' or '}'", current_token_.line, current_token_.column);
        }
    }
    return JsonValue(std::move(obj));
}

JsonValue JsonParser::parseArray() {
    JsonArray arr;
    
    // Heuristic: Scan ahead for size using fast comma counting
    size_t estimated_count = lexer_->scanArrayElementCount();
    if (estimated_count > 0) {
        arr.reserve(estimated_count + 1);
    } else {
        arr.reserve(16); // Fallback
    }
    
    // Consume '['
    advance();
    
    if (current_token_.type == TokenType::RightBracket) {
        advance();
        return JsonValue(std::move(arr));
    }
    
    while (true) {
        JsonValue value = parseValue();
        arr.push_back(std::move(value));
        
        if (current_token_.type == TokenType::RightBracket) {
            advance();
            break;
        } else if (current_token_.type == TokenType::Comma) {
            advance();
        } else {
             throw ParseError("Expected ',' or ']'", current_token_.line, current_token_.column);
        }
    }
    return JsonValue(std::move(arr));
}

std::string JsonParser::processStringToken(const Token& token) {
    if (token.value_storage.empty() && token.value != "needs_processing") {
         // Zero copy path
         return std::string(token.value);
    }
    
    // Process escapes
    std::string out;
    out.reserve(token.value.size());
    size_t pos = 0;
    std::string_view input = token.value;
    
    // If value_storage is used?
    // Lexer says: if escaped, return stripped view but mark needs_processing.
    // So logic below is correct.
    
    while (pos < input.size()) {
        char c = input[pos];
        if (c == '\\') {
            pos++; // skip backslash
            // parseEscape needs to read from input at pos
            parseEscapeSequence(input, pos, out, token.line, token.column);
        } else {
            out += c;
            pos++;
        }
    }
    return out;
}

void JsonParser::parseEscapeSequence(std::string_view input, size_t& pos, std::string& out, size_t line, size_t col) {
    if (pos >= input.size()) return; 
    
    char escaped = input[pos];
    pos++;
    
    switch (escaped) {
        case '"':  out += '"'; break;
        case '\\': out += '\\'; break;
        case '/':  out += '/'; break;
        case 'b':  out += '\b'; break;
        case 'f':  out += '\f'; break;
        case 'n':  out += '\n'; break;
        case 'r':  out += '\r'; break;
        case 't':  out += '\t'; break;
        case 'u': {
            if (pos + 4 > input.size()) throw ParseError("Incomplete unicode escape", line, col);
            
            uint32_t codepoint = 0;
            bool valid_hex = true;
            for(int i=0; i<4; ++i) {
                char h = input[pos + i];
                int val = 0;
                if(h >= '0' && h <= '9') val = h - '0';
                else if(h >= 'a' && h <= 'f') val = h - 'a' + 10;
                else if(h >= 'A' && h <= 'F') val = h - 'A' + 10;
                else valid_hex = false;
                codepoint = (codepoint << 4) | val;
            }
            if (!valid_hex) throw ParseError("Invalid hex digit", line, col);
            
            pos += 4;
            
            if (codepoint >= 0xD800 && codepoint <= 0xDBFF) {
                // High surrogate. Must be followed by low surrogate.
                bool found_low = false;
                if (pos + 6 <= input.size() && input[pos] == '\\' && input[pos+1] == 'u') {
                     uint32_t low = 0;
                     valid_hex = true;
                     for(int i=0; i<4; ++i) {
                        char h = input[pos + 2 + i];
                        int val = 0;
                        if(h >= '0' && h <= '9') val = h - '0';
                        else if(h >= 'a' && h <= 'f') val = h - 'a' + 10;
                        else if(h >= 'A' && h <= 'F') val = h - 'A' + 10;
                        else valid_hex = false;
                        low = (low << 4) | val;
                     }
                     
                     if (valid_hex && low >= 0xDC00 && low <= 0xDFFF) {
                         pos += 6;
                         uint32_t final_cp = 0x10000 + ((codepoint - 0xD800) << 10) + (low - 0xDC00);
                         encode_utf8(final_cp, out);
                         found_low = true;
                     }
                }
                
                if (!found_low) {
                    // Critical Fix: Lone high surrogate must be replaced or error.
                    // Replacing with U+FFFD (Replacement Character) per best practice.
                    encode_utf8(0xFFFD, out);
                }
            } else if (codepoint >= 0xDC00 && codepoint <= 0xDFFF) {
                // Critical Fix: Lone low surrogate
                encode_utf8(0xFFFD, out);
            } else {
                encode_utf8(codepoint, out);
            }
            break;
        }
        default: throw ParseError("Invalid escape", line, col);
    }
}

} 
