#ifndef JSON_PARSER_H
#define JSON_PARSER_H

#include <string>
#include <vector>
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
using JsonObject = std::map<std::string, JsonValue>;

class JsonValue {
public:
    using Value = std::variant<JsonNull, JsonBool, JsonNumber, JsonString, JsonArray, JsonObject>;
    
    JsonValue() : value_(nullptr) {}
    JsonValue(std::nullptr_t) : value_(nullptr) {}
    JsonValue(bool b) : value_(b) {}
    JsonValue(double n) : value_(n) {}
    JsonValue(int n) : value_(static_cast<double>(n)) {}
    JsonValue(const std::string& s) : value_(s) {}
    JsonValue(const char* s) : value_(std::string(s)) {}
    JsonValue(const JsonArray& arr) : value_(arr) {}
    JsonValue(const JsonObject& obj) : value_(obj) {}
    
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
    ParseError(const std::string& msg, size_t pos)
        : std::runtime_error(msg + " at position " + std::to_string(pos)),
          pos_(pos) {}
    
    size_t position() const { return pos_; }
    
private:
    size_t pos_;
};

class JsonParser {
public:
    JsonParser() {}
    
    JsonValue parse(const std::string& input);
    
private:
    std::string input_;
    size_t pos_;
    
    JsonValue parseValue();
    JsonValue parseObject();
    JsonValue parseArray();
    JsonValue parseString();
    JsonValue parseNumber();
    JsonValue parseLiteral();
    
    char current() const;
    char peek(size_t offset = 1) const;
    void advance();
    void skipWhitespace();
    void expect(char c);
    
    std::string parseStringContent();
};

}

#endif
