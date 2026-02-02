#include "json_parser.h"
#include <cctype>
#include <string_view>

namespace json {

enum class TokenType {
    LeftBrace,
    RightBrace,
    LeftBracket,
    RightBracket,
    Colon,
    Comma,
    String,
    Number,
    True,
    False,
    Null,
    EndOfFile,
    Error
};

struct Token {
    TokenType type;
    std::string_view value; // Changed to string_view
    std::string value_storage; // Storage for escaped strings if needed
    size_t line;
    size_t column;
};

class Lexer {
public:
    Lexer(std::string_view input) : input_(input), pos_(0), line_(1), col_(1) {}
    
    Token nextToken() {
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
    
private:
    std::string_view input_;
    size_t pos_;
    size_t line_;
    size_t col_;
    
    void advance() {
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
    
    void skipWhitespace() {
        while (pos_ < input_.size()) {
            char c = input_[pos_];
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                advance();
            } else {
                break;
            }
        }
    }
    
    Token scanString() {
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
        }
        
        // Zero-copy if no escape
        if (!hasEscape) {
            // start+1 to skip opening quote, length - 2 to skip both quotes
            // pos_ is now after closing quote
            size_t len = pos_ - start - 2;
            return {TokenType::String, input_.substr(start + 1, len), "", startLine, startCol};
        }
        
        // If escaped, we technically need storage.
        // For this simple Lexer update, we can't return string_view pointing to processed string easily
        // because it needs a buffer.
        // Ideally we'd return string_view to original raw string and let parser handle escapes,
        // OR use the `value_storage` field.
        
        return {TokenType::String, input_.substr(start, pos_ - start), "needs_processing", startLine, startCol};
    }
    
    Token scanNumber() {
        size_t startLine = line_;
        size_t startCol = col_;
        size_t start = pos_;
        
        if (input_[pos_] == '-') advance();
        
        while (pos_ < input_.size() && std::isdigit(input_[pos_])) {
            advance();
        }
        
        if (pos_ < input_.size() && input_[pos_] == '.') {
            advance();
            while (pos_ < input_.size() && std::isdigit(input_[pos_])) {
                advance();
            }
        }
        
        if (pos_ < input_.size() && (input_[pos_] == 'e' || input_[pos_] == 'E')) {
            advance();
            if (pos_ < input_.size() && (input_[pos_] == '+' || input_[pos_] == '-')) {
                advance();
            }
            while (pos_ < input_.size() && std::isdigit(input_[pos_])) {
                advance();
            }
        }
        
        return {TokenType::Number, input_.substr(start, pos_ - start), "", startLine, startCol};
    }
    
    Token scanKeyword() {
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
};

}
