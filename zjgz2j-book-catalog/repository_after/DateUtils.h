#ifndef DATEUTILS_H
#define DATEUTILS_H

#include <string>

bool isLeapYear(int year);
int daysInMonth(int month, int year);
bool parseDate(const std::string& date, int& year, int& month, int& day);
std::string formatDate(int year, int month, int day);
std::string addDays(const std::string& date, int days);
bool isValidDate(const std::string& date);
bool isDateBefore(const std::string& date1, const std::string& date2);

#endif
