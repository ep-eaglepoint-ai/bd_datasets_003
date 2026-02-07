#ifndef RECORD_PROCESSOR_H
#define RECORD_PROCESSOR_H

#include <string>
#include <vector>
#include <map>
#include <stdexcept>
#include <ostream>

/**
 * @brief Represents a single input record
 */
struct Record {
    int id;
    std::string category;
    int value;
};

/**
 * @brief Represents aggregated data for a category
 */
struct CategorySummary {
    std::string name;
    int count;
    int total;
    
    CategorySummary(const std::string& category_name) 
        : name(category_name), count(0), total(0) {}
};

/**
 * @brief Exception thrown when invalid data is encountered
 */
class InvalidDataException : public std::runtime_error {
public:
    explicit InvalidDataException(const std::string& message)
        : std::runtime_error(message) {}
};

/**
 * @brief Main processor for records - handles validation and aggregation
 */
class RecordProcessor {
private:
    std::map<std::string, CategorySummary> categories;
    
    void validateRecord(const Record& record) const;
    
public:
    RecordProcessor() = default;
    
    /**
     * @brief Process a single record
     * @param record The record to process
     * @throws InvalidDataException if record value is negative
     */
    void processRecord(const Record& record);
    
    /**
     * @brief Process multiple records
     * @param records Vector of records to process
     * @throws InvalidDataException if any record has invalid data
     */
    void processRecords(const std::vector<Record>& records);
    
    /**
     * @brief Generate formatted report to output stream
     * @param os Output stream to write to
     */
    void generateReport(std::ostream& os) const;
    
    /**
     * @brief Get all category summaries (for testing)
     * @return Map of category names to summaries
     */
    const std::map<std::string, CategorySummary>& getCategorySummaries() const {
        return categories;
    }
    
    /**
     * @brief Clear all processed data
     */
    void clear();
};

/**
 * @brief Utility function to create sample data for demonstration
 * @return Vector of sample records
 */
std::vector<Record> createSampleData();

#endif // RECORD_PROCESSOR_H