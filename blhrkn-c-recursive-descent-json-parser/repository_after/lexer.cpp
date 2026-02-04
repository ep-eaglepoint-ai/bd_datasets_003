#include "json_parser.h"
#include <cctype>

namespace json {

void Lexer::advance() {
    if (pos_ < input_.size()) {
        if (input_[pos_] == '\n') {
            line_++;
            col_ = 1;
        } else {
            col_++;
        }
        pos_++;
    }
}

void Lexer::skipWhitespace() {
    while (pos_ < input_.size()) {
        char c = input_[pos_];
        if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
            advance();
        } else {
            break;
        }
    }
}

Token Lexer::nextToken() {
    skipWhitespace();
    
    if (pos_ >= input_.size()) {
        return {TokenType::EndOfFile, "", "", line_, col_};
    }
    
    char c = input_[pos_];
    size_t startLine = line_;
    size_t startCol = col_;
    
    switch (c) {
        case '{': advance(); return {TokenType::LeftBrace, "{", "", startLine, startCol};
        case '}': advance(); return {TokenType::RightBrace, "}", "", startLine, startCol};
        case '[': advance(); return {TokenType::LeftBracket, "[", "", startLine, startCol};
        case ']': advance(); return {TokenType::RightBracket, "]", "", startLine, startCol};
        case ':': advance(); return {TokenType::Colon, ":", "", startLine, startCol};
        case ',': advance(); return {TokenType::Comma, ",", "", startLine, startCol};
        case '"': return scanString();
        default:
            if (c == '-' || std::isdigit(c)) {
                return scanNumber();
            } else if (std::isalpha(c)) {
                return scanKeyword();
            }
            advance();
            return {TokenType::Error, std::string(1, c), "", startLine, startCol};
    }
}

Token Lexer::scanString() {
    size_t startLine = line_;
    size_t startCol = col_;
    size_t start = pos_;
    
    advance(); // skip quote
    
    bool hasEscape = false;
    while (pos_ < input_.size() && input_[pos_] != '"') {
        if (input_[pos_] == '\\') {
            hasEscape = true;
            advance();
            if (pos_ < input_.size()) {
                advance();
            }
        } else {
            advance();
        }
    }
    
    if (pos_ < input_.size()) {
        advance(); // skip closing quote
    } else {
        return {TokenType::Error, "Unterminated string", "", startLine, startCol};
    }
    
    // Zero-copy if no escape
    if (!hasEscape) {
        size_t len = pos_ - start - 2; // -2 for quotes
        return {TokenType::String, input_.substr(start + 1, len), "", startLine, startCol};
    }
    
    // If escaped, return raw content (including quotes? No, better to strip them for processing consistency if possible? 
    // Wait, the parser logic `processStringToken` needs to handle escapes.
    // If we return raw content including quotes, the parser can just take substring(1, len-1) and process.
    // `start` points to opening quote. `pos_` is after closing quote.
    // The content is input_.substr(start, pos_ - start).
    // Let's return the simplified view (inner content) but mark it as needing processing?
    // Actually, `scanString` in `lexer.cpp` (previous) returnedinner content.
    // Let's stick to inner content view.
    
    size_t len = pos_ - start - 2;
    return {TokenType::String, input_.substr(start + 1, len), "needs_processing", startLine, startCol};
}

Token Lexer::scanNumber() {
    size_t startLine = line_;
    size_t startCol = col_;
    size_t start = pos_;
    
    if (input_[pos_] == '-') advance();
    
    if (pos_ < input_.size() && input_[pos_] == '0') {
         advance();
         // Critical Fix: Leading zeros not allowed if followed by digit
         if (pos_ < input_.size() && std::isdigit(input_[pos_])) {
             return {TokenType::Error, "Leading zero not allowed in number", "", startLine, startCol}; 
         }
    } else {
         while (pos_ < input_.size() && std::isdigit(input_[pos_])) {
             advance();
         }
    }
    
    if (pos_ < input_.size() && input_[pos_] == '.') {
        advance();
        // Critical Fix: Decimal point must be followed by at least one digit
        if (pos_ >= input_.size() || !std::isdigit(input_[pos_])) {
            return {TokenType::Error, "Decimal point must be followed by digit", "", startLine, startCol};
        }
        while (pos_ < input_.size() && std::isdigit(input_[pos_])) {
            advance();
        }
    }
    
    if (pos_ < input_.size() && (input_[pos_] == 'e' || input_[pos_] == 'E')) {
        advance();
        if (pos_ < input_.size() && (input_[pos_] == '+' || input_[pos_] == '-')) {
            advance();
        }
        // Critical Fix: Exponent must be followed by at least one digit
        if (pos_ >= input_.size() || !std::isdigit(input_[pos_])) {
             return {TokenType::Error, "Exponent must be followed by digit", "", startLine, startCol};
        }
        while (pos_ < input_.size() && std::isdigit(input_[pos_])) {
            advance();
        }
    }
    
    return {TokenType::Number, input_.substr(start, pos_ - start), "", startLine, startCol};
}

// New helper for Array pre-allocation heuristic
// Scans ahead to count elements at the current nesting level.
// Returns 0 if calculation is too complex or fails.
size_t Lexer::scanArrayElementCount() {
    // We are currently after '[' which was just consumed by parser/lexer advance.
    size_t count = 0;
    size_t bracket_nesting = 1; // [
    size_t brace_nesting = 0;   // {
    bool in_string = false;
    bool escape = false;
    
    size_t cur = pos_;
    
    while (cur < input_.size()) {
        char c = input_[cur];
        
        if (in_string) {
            if (escape) {
                escape = false;
            } else if (c == '\\') {
                escape = true;
            } else if (c == '"') {
                in_string = false;
            }
        } else {
            if (c == '"') {
                in_string = true;
            } else if (c == '[') {
                bracket_nesting++;
            } else if (c == ']') {
                bracket_nesting--;
                if (bracket_nesting == 0) {
                    // Found end of our array
                    break;
                }
            } else if (c == '{') {
                brace_nesting++;
            } else if (c == '}') {
                if (brace_nesting > 0) brace_nesting--;
            } else if (c == ',') {
                if (bracket_nesting == 1 && brace_nesting == 0) {
                    count++;
                }
            }
        }
        cur++;
    }
    
    return count; 
}


Token Lexer::scanKeyword() {
    size_t startLine = line_;
    size_t startCol = col_;
    size_t start = pos_;
    
    while (pos_ < input_.size() && std::isalpha(input_[pos_])) {
        advance();
    }
    
    std::string_view keyword = input_.substr(start, pos_ - start);
    
    if (keyword == "true") return {TokenType::True, keyword, "", startLine, startCol};
    if (keyword == "false") return {TokenType::False, keyword, "", startLine, startCol};
    if (keyword == "null") return {TokenType::Null, keyword, "", startLine, startCol};
    
    return {TokenType::Error, keyword, "", startLine, startCol};
}

}
