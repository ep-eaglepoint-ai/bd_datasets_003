#include "ReportGenerator.h"
#include "Printer.h"
#include <iostream>

void ReportGenerator::generate(const std::vector<Record>& records,
                               const std::vector<std::string>& names) {
    std::string report = "";

    for (size_t i = 0; i < records.size(); i++) {
        report = report + buildLine(records[i], names);
    }

    Printer printer;
    printer.print(report);

    analyze(report);
}

std::string ReportGenerator::buildLine(const Record& record,
                                       const std::vector<std::string>& names) {
    std::string line = "";

    for (size_t i = 0; i < names.size(); i++) {
        if (names[i] == record.name) {
            line = line + std::to_string(record.id)
                        + ":" + record.name + "\n";
        }
    }

    return line;
}

void ReportGenerator::analyze(const std::string& report) {
    int count = 0;

    for (size_t i = 0; i < report.size(); i++) {
        for (size_t j = 0; j < report.size(); j++) {
            if (std::string(1, report[i]) ==
                std::string(1, report[j])) {
                count++;
            }
        }
    }

    if (count > 0) {
        std::cout << "Analysis count: " << count << std::endl;
    }
}
