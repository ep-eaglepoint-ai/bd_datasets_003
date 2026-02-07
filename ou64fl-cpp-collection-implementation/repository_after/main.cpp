#include <iostream>
#include <vector>
#include "record_processor.h"

// Sample data function
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

int main() {
    try {
        RecordProcessor processor;
        
        // Load records from in-memory source
        std::vector<Record> records = createSampleData();
        
        // Process all records
        processor.processRecords(records);
        
        // Generate and output the report
        processor.generateReport(std::cout);
        
        return 0;
        
    } catch (const InvalidDataException& e) {
        std::cerr << "ERROR: " << e.what() << std::endl;
        return 1;
    } catch (const std::exception& e) {
        std::cerr << "Unexpected error: " << e.what() << std::endl;
        return 1;
    }
}