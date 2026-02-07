#include "record_processor.h"
#include <iostream>
#include <sstream>
#include <algorithm>

void RecordProcessor::validateRecord(const Record& record) const {
    if (record.value < 0) {
        std::ostringstream oss;
        oss << "Record with ID " << record.id 
            << " in category '" << record.category 
            << "' has negative value: " << record.value;
        throw InvalidDataException(oss.str());
    }
    
    if (record.category.empty()) {
        std::ostringstream oss;
        oss << "Record with ID " << record.id 
            << " has empty category";
        throw InvalidDataException(oss.str());
    }
}

void RecordProcessor::processRecord(const Record& record) {
    validateRecord(record);
    
    auto it = categories.find(record.category);
    if (it == categories.end()) {
        // Create new category summary
        it = categories.emplace(record.category, CategorySummary(record.category)).first;
    }
    
    // Update the summary
    it->second.count += 1;
    it->second.total += record.value;
}

void RecordProcessor::processRecords(const std::vector<Record>& records) {
    for (const auto& record : records) {
        processRecord(record);
    }
}

void RecordProcessor::generateReport(std::ostream& os) const {
    // Categories are already stored in lexicographical order in std::map
    for (const auto& [category_name, summary] : categories) {
        os << category_name 
           << " | COUNT=" << summary.count 
           << " | TOTAL=" << summary.total 
           << "\n";
    }
}

void RecordProcessor::clear() {
    categories.clear();
}

std::vector<Record> createSampleData() {
    return {
        {1, "Electronics", 150},
        {2, "Books", 25},
        {3, "Electronics", 200},
        {4, "Clothing", 75},
        {5, "Books", 15},
        {6, "Clothing", 125},
        {7, "Electronics", 100},
        {8, "Books", 30},
        {9, "Home", 250},
        {10, "Clothing", 50}
    };
}