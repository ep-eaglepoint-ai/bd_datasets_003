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
    // Optimized manual loop is faster for typical single-space/newline cases 
    // than overhead of find_first_not_of + scanning for newlines.
    while (pos_ < input_.size()) {
        char c = input_[pos_];
        if (c == ' ' || c == '\t' || c == '\r') {
             col_++;
             pos_++;
        } else if (c == '\n') {
             line_++;
             col_ = 1;
             pos_++;
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
    
    // Fast path: find next " or \ 
    // If we find " first, it's a simple string (zero copy possible)
    
    size_t endQuote = input_.find_first_of("\"\\", pos_);
    if (endQuote == std::string_view::npos) {
         return {TokenType::Error, "Unterminated string", "", startLine, startCol};
    }
    
    char found = input_[endQuote];
    
    // Calculate new position/lines/cols approximately or correctly?
    // Lexer needs `line_` and `col_` to be correct.
    // `find` skips explicit accounting.
    // If we skip, we must scan for newlines to update line/col.
    // For performance, maybe we only update line/col lazily? 
    // Or we scan for newlines in the skipped chunk.
    // Since JSON strings shouldn't contain unescaped newlines (invalid JSON), 
    // we can assume no newlines in valid strings!
    // But we must support `\n` which is escaped.
    // A raw newline in a string is invalid.
    // So we can assume `line_` doesn't change inside a valid string scan, 
    // unless we error out.
    // Let's assume valid string content has no newlines.
    
    size_t len = endQuote - pos_;
    pos_ = endQuote;
    col_ += len;
    
    if (found == '"') {
        // Simple case: no escapes
        advance(); // consume closing quote
        return {TokenType::String, input_.substr(start + 1, len), "", startLine, startCol};
    } else {
        // Found backslash - fallback to slow path or handle escapes
        // Reset to start of string (after quote) and scan normally to handle escapes correctly
        // Or continue from here.
        // Let's fall back to manual loop from current pos for correctness with escapes
        bool hasEscape = true;
        
        while (pos_ < input_.size() && input_[pos_] != '"') {
            if (input_[pos_] == '\\') {
                advance();
                if (pos_ < input_.size()) advance();
            } else {
                advance();
            }
        }
        
        if (pos_ < input_.size()) {
            advance(); // consume closing quote
        } else {
             return {TokenType::Error, "Unterminated string", "", startLine, startCol};
        }
        
        // Return raw content (excluding quotes) but marked for processing
        return {TokenType::String, input_.substr(start + 1, pos_ - start - 2), "needs_processing", startLine, startCol};
    }
}


Token Lexer::scanNumber() {
    size_t startLine = line_;
    size_t startCol = col_;
    size_t start = pos_;
    
    if (input_[pos_] == '-') advance();
    
    if (pos_ < input_.size() && input_[pos_] == '0') {
         advance();
         if (pos_ < input_.size() && std::isdigit(input_[pos_])) {
             return {TokenType::Error, "Leading zero not allowed in number", "", startLine, startCol}; 
         }
    } else {
         // Optimization: unchecked increment for digits (can't be newline)
         while (pos_ < input_.size() && std::isdigit(input_[pos_])) {
             pos_++;
             col_++; 
         }
    }
    
    if (pos_ < input_.size() && input_[pos_] == '.') {
        advance();
        if (pos_ >= input_.size() || !std::isdigit(input_[pos_])) {
            return {TokenType::Error, "Decimal point must be followed by digit", "", startLine, startCol};
        }
        while (pos_ < input_.size() && std::isdigit(input_[pos_])) {
            pos_++;
            col_++; 
        }
    }
    
    if (pos_ < input_.size() && (input_[pos_] == 'e' || input_[pos_] == 'E')) {
        advance();
        if (pos_ < input_.size() && (input_[pos_] == '+' || input_[pos_] == '-')) {
            advance();
        }
        if (pos_ >= input_.size() || !std::isdigit(input_[pos_])) {
             return {TokenType::Error, "Exponent must be followed by digit", "", startLine, startCol};
        }
        while (pos_ < input_.size() && std::isdigit(input_[pos_])) {
            pos_++;
            col_++;
        }
    }
    
    return {TokenType::Number, input_.substr(start, pos_ - start), "", startLine, startCol};
}

// New helper for Array pre-allocation heuristic
// Scans ahead to count elements at the current nesting level.
// Returns 0 if calculation is too complex or fails.
// Scans ahead to count elements. O(N) but faster than reallocs if implemented efficiently.
// Using find_first_of to skip irrelevant chars.
size_t Lexer::scanArrayElementCount() {
    size_t count = 0;
    size_t bracket_nesting = 1; 
    size_t brace_nesting = 0;
    size_t cur = pos_;
    
    // Interesting chars: " [ ] { } ,
    constexpr std::string_view kControls = "\"[]{},";
    
    while (cur < input_.size()) {
        size_t next = input_.find_first_of(kControls, cur);
        if (next == std::string_view::npos) break;
        
        char c = input_[next];
        cur = next + 1;
        
        if (c == '"') {
            // Skip string
            while (cur < input_.size()) {
                size_t quote = input_.find('"', cur);
                if (quote == std::string_view::npos) return count; // Fail
                
                // Check escapes
                size_t backslashes = 0;
                size_t check = quote;
                while (check > cur && input_[--check] == '\\') {
                    backslashes++;
                }
                
                cur = quote + 1;
                if (backslashes % 2 == 0) {
                    // Even number of backslashes means the quote is NOT escaped
                    break;
                }
                // Else quote is escaped, continue
            }
        } else if (c == '[') {
            bracket_nesting++;
        } else if (c == ']') {
            bracket_nesting--;
            if (bracket_nesting == 0) return count;
        } else if (c == '{') {
            brace_nesting++;
        } else if (c == '}') {
            if (brace_nesting > 0) brace_nesting--;
        } else if (c == ',') {
            if (bracket_nesting == 1 && brace_nesting == 0) count++;
        }
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
