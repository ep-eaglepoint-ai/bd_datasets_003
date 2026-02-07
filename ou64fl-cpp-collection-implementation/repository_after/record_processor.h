#ifndef RECORD_PROCESSOR_H
#define RECORD_PROCESSOR_H

#include <string>
#include <vector>
#include <map>
#include <stdexcept>
#include <ostream>
#include <sstream>

struct Record {
    int id;
    std::string category;
    int value;
};

struct CategorySummary {
    std::string name;
    int count;
    int total;
    
    CategorySummary(const std::string& category_name);
};

class InvalidDataException : public std::runtime_error {
public:
    explicit InvalidDataException(const std::string& message);
};

class RecordProcessor {
private:
    std::map<std::string, CategorySummary> categories;
    
    void validateRecord(const Record& record) const;
    
public:
    RecordProcessor();
    ~RecordProcessor() = default;
    
    void processRecord(const Record& record);
    void processRecords(const std::vector<Record>& records);
    void generateReport(std::ostream& os) const;
    
    const std::map<std::string, CategorySummary>& getCategorySummaries() const;
    
    void clear();
};

#endif // RECORD_PROCESSOR_H