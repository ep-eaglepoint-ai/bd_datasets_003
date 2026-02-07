#include "record_processor.h"

// CategorySummary constructor
CategorySummary::CategorySummary(const std::string& category_name) 
    : name(category_name), count(0), total(0) {}

// InvalidDataException constructor
InvalidDataException::InvalidDataException(const std::string& message)
    : std::runtime_error(message) {}

// RecordProcessor implementation
RecordProcessor::RecordProcessor() {
    categories = std::map<std::string, CategorySummary>();
}

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
           << " | TOTAL=" << summary.total;
        
        // Add newline except for last line
        if (std::next(categories.find(category_name)) != categories.end()) {
            os << "\n";
        }
    }
}

const std::map<std::string, CategorySummary>& RecordProcessor::getCategorySummaries() const {
    return categories;
}

void RecordProcessor::clear() {
    categories.clear();
}