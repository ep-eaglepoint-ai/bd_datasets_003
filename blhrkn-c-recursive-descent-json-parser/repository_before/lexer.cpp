#include "json_parser.h"
#include <cctype>

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
    std::string value;
    size_t position;
};

class Lexer {
public:
    Lexer(const std::string& input) : input_(input), pos_(0) {}
    
    Token nextToken() {
        skipWhitespace();
        
        if (pos_ >= input_.size()) {
            return {TokenType::EndOfFile, "", pos_};
        }
        
        char c = input_[pos_];
        size_t startPos = pos_;
        
        switch (c) {
            case '{': advance(); return {TokenType::LeftBrace, "{", startPos};
            case '}': advance(); return {TokenType::RightBrace, "}", startPos};
            case '[': advance(); return {TokenType::LeftBracket, "[", startPos};
            case ']': advance(); return {TokenType::RightBracket, "]", startPos};
            case ':': advance(); return {TokenType::Colon, ":", startPos};
            case ',': advance(); return {TokenType::Comma, ",", startPos};
            case '"': return scanString();
            default:
                if (c == '-' || std::isdigit(c)) {
                    return scanNumber();
                }
                if (std::isalpha(c)) {
                    return scanKeyword();
                }
                advance();
                return {TokenType::Error, std::string(1, c), startPos};
        }
    }

private:
    std::string input_;
    size_t pos_;
    
    void advance() {
        if (pos_ < input_.size()) {
            pos_++;
        }
    }
    
    void skipWhitespace() {
        while (pos_ < input_.size() && std::isspace(input_[pos_])) {
            advance();
        }
    }
    
    Token scanString() {
        size_t startPos = pos_;
        advance();
        
        std::string value;
        while (pos_ < input_.size() && input_[pos_] != '"') {
            if (input_[pos_] == '\\') {
                advance();
                if (pos_ < input_.size()) {
                    value += input_[pos_];
                    advance();
                }
            } else {
                value += input_[pos_];
                advance();
            }
        }
        
        if (pos_ < input_.size()) {
            advance();
        } else {
            return {TokenType::Error, "Unterminated string", startPos};
        }
        
        return {TokenType::String, value, startPos};
    }
    
    Token scanNumber() {
        size_t startPos = pos_;
        std::string value;
        
        if (input_[pos_] == '-') {
            value += input_[pos_];
            advance();
        }
        
        while (pos_ < input_.size() && std::isdigit(input_[pos_])) {
            value += input_[pos_];
            advance();
        }
        
        if (pos_ < input_.size() && input_[pos_] == '.') {
            value += input_[pos_];
            advance();
            while (pos_ < input_.size() && std::isdigit(input_[pos_])) {
                value += input_[pos_];
                advance();
            }
        }
        
        if (pos_ < input_.size() && (input_[pos_] == 'e' || input_[pos_] == 'E')) {
            value += input_[pos_];
            advance();
            if (pos_ < input_.size() && (input_[pos_] == '+' || input_[pos_] == '-')) {
                value += input_[pos_];
                advance();
            }
            while (pos_ < input_.size() && std::isdigit(input_[pos_])) {
                value += input_[pos_];
                advance();
            }
        }
        
        return {TokenType::Number, value, startPos};
    }
    
    Token scanKeyword() {
        size_t startPos = pos_;
        std::string value;
        
        while (pos_ < input_.size() && std::isalpha(input_[pos_])) {
            value += input_[pos_];
            advance();
        }
        
        if (value == "true") {
            return {TokenType::True, value, startPos};
        } else if (value == "false") {
            return {TokenType::False, value, startPos};
        } else if (value == "null") {
            return {TokenType::Null, value, startPos};
        } else {
            return {TokenType::Error, value, startPos};
        }
    }
};

}
