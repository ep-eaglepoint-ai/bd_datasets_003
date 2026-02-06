#include "DateUtils.h"
#include <sstream>
#include <iomanip>

bool isLeapYear(int year) {
    return (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
}

int daysInMonth(int month, int year) {
    static const int days[] = {0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    if (month == 2 && isLeapYear(year)) return 29;
    if (month < 1 || month > 12) return 0;
    return days[month];
}

bool parseDate(const std::string& date, int& year, int& month, int& day) {
    if (date.size() != 10 || date[4] != '-' || date[7] != '-') return false;
    try {
        year = std::stoi(date.substr(0, 4));
        month = std::stoi(date.substr(5, 2));
        day = std::stoi(date.substr(8, 2));
    } catch (...) {
        return false;
    }
    if (year < 1) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > daysInMonth(month, year)) return false;
    return true;
}

std::string formatDate(int year, int month, int day) {
    std::ostringstream oss;
    oss << std::setfill('0') << std::setw(4) << year << "-"
        << std::setw(2) << month << "-"
        << std::setw(2) << day;
    return oss.str();
}

std::string addDays(const std::string& date, int days) {
    int year, month, day;
    if (!parseDate(date, year, month, day)) return "";

    day += days;
    while (day > daysInMonth(month, year)) {
        day -= daysInMonth(month, year);
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
    }

    return formatDate(year, month, day);
}

bool isValidDate(const std::string& date) {
    int y, m, d;
    return parseDate(date, y, m, d);
}

bool isDateBefore(const std::string& date1, const std::string& date2) {
    return date1 < date2;
}
