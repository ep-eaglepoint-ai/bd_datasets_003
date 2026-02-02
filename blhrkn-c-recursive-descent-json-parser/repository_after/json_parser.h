#ifndef JSON_PARSER_H
#define JSON_PARSER_H

#include <string>
#include <string_view>
#include <vector>
#include <unordered_map>
#include <map>
#include <variant>
#include <memory>
#include <stdexcept>

namespace json {

class JsonValue;

using JsonNull = std::nullptr_t;
using JsonBool = bool;
using JsonNumber = double;
using JsonString = std::string;
using JsonArray = std::vector<JsonValue>;
using JsonObject = std::unordered_map<std::string, JsonValue>;

class JsonValue {
public:
    using Value = std::variant<JsonNull, JsonBool, JsonNumber, JsonString, JsonArray, JsonObject>;
    
    JsonValue() : value_(nullptr) {}
    JsonValue(std::nullptr_t) : value_(nullptr) {}
    JsonValue(bool b) : value_(b) {}
    JsonValue(double n) : value_(n) {}
    JsonValue(int n) : value_(static_cast<double>(n)) {}
    JsonValue(const std::string& s) : value_(s) {}
    JsonValue(std::string&& s) : value_(std::move(s)) {}
    JsonValue(const char* s) : value_(std::string(s)) {}
    JsonValue(std::string_view s) : value_(std::string(s)) {}
    JsonValue(const JsonArray& arr) : value_(arr) {}
    JsonValue(JsonArray&& arr) : value_(std::move(arr)) {}
    JsonValue(const JsonObject& obj) : value_(obj) {}
    JsonValue(JsonObject&& obj) : value_(std::move(obj)) {}
    
    bool isNull() const { return std::holds_alternative<JsonNull>(value_); }
    bool isBool() const { return std::holds_alternative<JsonBool>(value_); }
    bool isNumber() const { return std::holds_alternative<JsonNumber>(value_); }
    bool isString() const { return std::holds_alternative<JsonString>(value_); }
    bool isArray() const { return std::holds_alternative<JsonArray>(value_); }
    bool isObject() const { return std::holds_alternative<JsonObject>(value_); }
    
    bool asBool() const { return std::get<JsonBool>(value_); }
    double asNumber() const { return std::get<JsonNumber>(value_); }
    const std::string& asString() const { return std::get<JsonString>(value_); }
    const JsonArray& asArray() const { return std::get<JsonArray>(value_); }
    const JsonObject& asObject() const { return std::get<JsonObject>(value_); }
    
    JsonArray& asArray() { return std::get<JsonArray>(value_); }
    JsonObject& asObject() { return std::get<JsonObject>(value_); }
    
private:
    Value value_;
};

class ParseError : public std::runtime_error {
public:
    ParseError(const std::string& msg, size_t line, size_t col)
        : std::runtime_error(msg + " at line " + std::to_string(line) + ", column " + std::to_string(col)),
          line_(line), col_(col) {}
    
    size_t line() const { return line_; }
    size_t column() const { return col_; }
    
private:
    size_t line_;
    size_t col_;
};

class JsonParser {
public:
    JsonParser() : pos_(0), line_(1), col_(1), depth_(0), max_depth_(1000) {}
    
    JsonValue parse(std::string_view input);
    void setMaxDepth(size_t depth) { max_depth_ = depth; }
    
private:
    std::string_view input_;
    size_t pos_;
    size_t line_;
    size_t col_;
    size_t depth_;
    size_t max_depth_;
    
    JsonValue parseValue();
    JsonValue parseObject();
    JsonValue parseArray();
    JsonValue parseString();
    JsonValue parseNumber();
    JsonValue parseLiteral();
    
    char current() const;
    void advance();
    void skipWhitespace();
    void expect(char c);
    
    std::string parseStringContent();
    void parseEscapeSequence(std::string& out);
};

}

#endif 
