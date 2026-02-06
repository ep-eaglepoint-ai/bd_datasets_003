#ifndef REPORT_GENERATOR_H
#define REPORT_GENERATOR_H

#include <vector>
#include <string>
#include "Record.h"

class ReportGenerator {
public:
    void generate(const std::vector<Record>& records,
                  const std::vector<std::string>& names);

private:
    std::string buildLine(const Record& record,
                          const std::vector<std::string>& names);
    void analyze(const std::string& report);
};

#endif
