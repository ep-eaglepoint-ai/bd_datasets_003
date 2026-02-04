#include "json_parser.h"
#include <iostream>

namespace json {

void JsonValue::print(std::ostream& os, int indent) const {
    if (isNull()) {
        os << "null";
    } else if (isBool()) {
        os << (asBool() ? "true" : "false");
    } else if (isNumber()) {
        os << asNumber();
    } else if (isString()) {
        os << "\"";
        // Simple escape for printing (for verification)
        for (char c : asString()) {
            if (c == '"') os << "\\\"";
            else if (c == '\\') os << "\\\\";
            else if (c == '\b') os << "\\b";
            else if (c == '\f') os << "\\f";
            else if (c == '\n') os << "\\n";
            else if (c == '\r') os << "\\r";
            else if (c == '\t') os << "\\t";
            else if (static_cast<unsigned char>(c) < 0x20) {
                // Not strictly implementing full hex escape for control chars here 
                // as testing focuses on UTF-8 passthrough which will be > 0x20 or multi-byte
                // but for completeness we should.
                char buf[7];
                snprintf(buf, sizeof(buf), "\\u%04x", c);
                os << buf;
            } else {
                os << c;
            }
        }
        os << "\"";
    } else if (isArray()) {
        os << "[\n";
        const auto& arr = asArray();
        for (size_t i = 0; i < arr.size(); ++i) {
            for (int k = 0; k < indent + 2; ++k) os << " ";
            arr[i].print(os, indent + 2);
            if (i < arr.size() - 1) os << ",";
            os << "\n";
        }
        for (int k = 0; k < indent; ++k) os << " ";
        os << "]";
    } else if (isObject()) {
        os << "{\n";
        const auto& obj = asObject();
        size_t i = 0;
        for (const auto& kv : obj) {
            for (int k = 0; k < indent + 2; ++k) os << " ";
            os << "\"" << kv.first << "\": ";
            kv.second.print(os, indent + 2);
            if (i < obj.size() - 1) os << ",";
            os << "\n";
            i++;
        }
        for (int k = 0; k < indent; ++k) os << " ";
        os << "}";
    }
}

}
