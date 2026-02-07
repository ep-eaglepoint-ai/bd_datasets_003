#include "record_processor.h"
#include <iostream>
#include <cstdlib>

/**
 * @brief Entry point of the program
 * 
 * Demonstrates the record processing functionality with sample data.
 * In a real system, records would come from a database or API.
 */
int main() {
    try {
        RecordProcessor processor;
        
        // Load records from in-memory source
        std::vector<Record> records = createSampleData();
        
        // Process all records
        processor.processRecords(records);
        
        // Generate and output the report
        processor.generateReport(std::cout);
        
        return EXIT_SUCCESS;
        
    } catch (const InvalidDataException& e) {
        std::cerr << "ERROR: " << e.what() << std::endl;
        return EXIT_FAILURE;
        
    } catch (const std::exception& e) {
        std::cerr << "Unexpected error: " << e.what() << std::endl;
        return EXIT_FAILURE;
    }
}