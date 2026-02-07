#include <catch2/catch_test_macros.hpp>
#include "../repository_after/record_processor.h"
#include <sstream>
#include <vector>

TEST_CASE("Record validation", "[validation]") {
    RecordProcessor processor;
    
    SECTION("Valid record passes validation") {
        Record valid{1, "Test", 100};
        REQUIRE_NOTHROW(processor.processRecord(valid));
    }
    
    SECTION("Negative value throws exception") {
        Record invalid{2, "Test", -50};
        REQUIRE_THROWS_AS(processor.processRecord(invalid), InvalidDataException);
    }
    
    SECTION("Zero value is valid") {
        Record zero{3, "Test", 0};
        REQUIRE_NOTHROW(processor.processRecord(zero));
    }
    
    SECTION("Empty category throws exception") {
        Record empty_category{4, "", 100};
        REQUIRE_THROWS_AS(processor.processRecord(empty_category), InvalidDataException);
    }
}

TEST_CASE("Single category aggregation", "[aggregation]") {
    RecordProcessor processor;
    
    SECTION("Single record aggregation") {
        processor.processRecord({1, "Electronics", 150});
        
        const auto& summaries = processor.getCategorySummaries();
        REQUIRE(summaries.size() == 1);
        
        const auto& summary = summaries.at("Electronics");
        REQUIRE(summary.name == "Electronics");
        REQUIRE(summary.count == 1);
        REQUIRE(summary.total == 150);
    }
    
    SECTION("Multiple records in same category") {
        std::vector<Record> records = {
            {1, "Electronics", 150},
            {2, "Electronics", 200},
            {3, "Electronics", 100}
        };
        
        processor.processRecords(records);
        
        const auto& summaries = processor.getCategorySummaries();
        REQUIRE(summaries.size() == 1);
        
        const auto& summary = summaries.at("Electronics");
        REQUIRE(summary.count == 3);
        REQUIRE(summary.total == 450); // 150 + 200 + 100
    }
}

TEST_CASE("Multiple categories aggregation", "[aggregation]") {
    RecordProcessor processor;
    
    std::vector<Record> records = {
        {1, "Electronics", 150},
        {2, "Books", 25},
        {3, "Electronics", 200},
        {4, "Books", 15}
    };
    
    processor.processRecords(records);
    
    const auto& summaries = processor.getCategorySummaries();
    REQUIRE(summaries.size() == 2);
    
    SECTION("Electronics category") {
        const auto& summary = summaries.at("Electronics");
        REQUIRE(summary.count == 2);
        REQUIRE(summary.total == 350);
    }
    
    SECTION("Books category") {
        const auto& summary = summaries.at("Books");
        REQUIRE(summary.count == 2);
        REQUIRE(summary.total == 40);
    }
}

TEST_CASE("Report formatting", "[formatting]") {
    RecordProcessor processor;
    
    std::vector<Record> records = {
        {1, "Electronics", 150},
        {2, "Books", 25},
        {3, "Clothing", 75}
    };
    
    processor.processRecords(records);
    
    std::ostringstream output;
    processor.generateReport(output);
    
    std::string result = output.str();
    
    SECTION("Output contains all categories") {
        REQUIRE(result.find("Books") != std::string::npos);
        REQUIRE(result.find("Clothing") != std::string::npos);
        REQUIRE(result.find("Electronics") != std::string::npos);
    }
    
    SECTION("Categories in lexicographical order") {
        // Find positions of each category
        size_t books_pos = result.find("Books");
        size_t clothing_pos = result.find("Clothing");
        size_t electronics_pos = result.find("Electronics");
        
        // Books should come before Clothing, which should come before Electronics
        REQUIRE(books_pos < clothing_pos);
        REQUIRE(clothing_pos < electronics_pos);
    }
    
    SECTION("Correct formatting") {
        // Each line should match: CATEGORY_NAME | COUNT=<count> | TOTAL=<total>
        REQUIRE(result.find("Books | COUNT=1 | TOTAL=25") != std::string::npos);
        REQUIRE(result.find("Clothing | COUNT=1 | TOTAL=75") != std::string::npos);
        REQUIRE(result.find("Electronics | COUNT=1 | TOTAL=150") != std::string::npos);
    }
}

TEST_CASE("Error handling in batch processing", "[error]") {
    RecordProcessor processor;
    
    SECTION("Processing stops on first error") {
        std::vector<Record> records = {
            {1, "Valid", 100},
            {2, "Invalid", -50},  // This should throw
            {3, "Valid", 200}     // This should not be processed
        };
        
        REQUIRE_THROWS_AS(processor.processRecords(records), InvalidDataException);
        
        // Only first valid record should be processed
        const auto& summaries = processor.getCategorySummaries();
        REQUIRE(summaries.size() == 1);
        REQUIRE(summaries.count("Valid") == 1);
        REQUIRE(summaries.at("Valid").count == 1);
    }
}

TEST_CASE("Clear functionality", "[utility]") {
    RecordProcessor processor;
    
    processor.processRecord({1, "Test", 100});
    REQUIRE(processor.getCategorySummaries().size() == 1);
    
    processor.clear();
    REQUIRE(processor.getCategorySummaries().empty());
}

TEST_CASE("Edge cases", "[edge]") {
    RecordProcessor processor;
    
    SECTION("Empty input") {
        std::vector<Record> empty;
        REQUIRE_NOTHROW(processor.processRecords(empty));
        
        std::ostringstream output;
        processor.generateReport(output);
        REQUIRE(output.str().empty());
    }
    
    SECTION("Large values") {
        processor.processRecord({1, "Test", 1000000});
        processor.processRecord({2, "Test", 2000000});
        
        const auto& summary = processor.getCategorySummaries().at("Test");
        REQUIRE(summary.total == 3000000);
    }
    
    SECTION("Category with special characters") {
        processor.processRecord({1, "Category-Name_123", 100});
        
        std::ostringstream output;
        processor.generateReport(output);
        REQUIRE(output.str().find("Category-Name_123") != std::string::npos);
    }
}