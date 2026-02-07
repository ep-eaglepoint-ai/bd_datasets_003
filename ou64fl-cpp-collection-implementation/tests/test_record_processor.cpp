#include <gtest/gtest.h>
#include <sstream>
#include <vector>
#include <algorithm>
#include "../repository_after/record_processor.h"

// Test fixture for RecordProcessor
class RecordProcessorTest : public ::testing::Test {
protected:
    RecordProcessor processor;
    
    void SetUp() override {
        processor.clear();
    }
    
    void TearDown() override {
        processor.clear();
    }
};

// Validation tests
TEST_F(RecordProcessorTest, ValidRecord) {
    Record valid{1, "Electronics", 100};
    EXPECT_NO_THROW(processor.processRecord(valid));
}

TEST_F(RecordProcessorTest, NegativeValueThrows) {
    Record invalid{2, "Test", -50};
    EXPECT_THROW(processor.processRecord(invalid), InvalidDataException);
}

TEST_F(RecordProcessorTest, ZeroValueValid) {
    Record zero{3, "Test", 0};
    EXPECT_NO_THROW(processor.processRecord(zero));
}

TEST_F(RecordProcessorTest, EmptyCategoryThrows) {
    Record emptyCat{4, "", 100};
    EXPECT_THROW(processor.processRecord(emptyCat), InvalidDataException);
}

// Aggregation tests
TEST_F(RecordProcessorTest, SingleRecordAggregation) {
    processor.processRecord({1, "Electronics", 150});
    
    const auto& summaries = processor.getCategorySummaries();
    ASSERT_EQ(summaries.size(), 1);
    
    const auto& summary = summaries.at("Electronics");
    EXPECT_EQ(summary.name, "Electronics");
    EXPECT_EQ(summary.count, 1);
    EXPECT_EQ(summary.total, 150);
}

TEST_F(RecordProcessorTest, MultipleRecordsSameCategory) {
    processor.processRecord({1, "Electronics", 150});
    processor.processRecord({2, "Electronics", 200});
    processor.processRecord({3, "Electronics", 100});
    
    const auto& summaries = processor.getCategorySummaries();
    ASSERT_EQ(summaries.size(), 1);
    
    const auto& summary = summaries.at("Electronics");
    EXPECT_EQ(summary.count, 3);
    EXPECT_EQ(summary.total, 450);
}

TEST_F(RecordProcessorTest, MultipleCategoriesAggregation) {
    processor.processRecord({1, "Electronics", 150});
    processor.processRecord({2, "Books", 25});
    processor.processRecord({3, "Electronics", 200});
    processor.processRecord({4, "Books", 15});
    
    const auto& summaries = processor.getCategorySummaries();
    ASSERT_EQ(summaries.size(), 2);
    
    EXPECT_EQ(summaries.at("Electronics").count, 2);
    EXPECT_EQ(summaries.at("Electronics").total, 350);
    EXPECT_EQ(summaries.at("Books").count, 2);
    EXPECT_EQ(summaries.at("Books").total, 40);
}

// Output formatting tests
TEST_F(RecordProcessorTest, OutputFormatCorrect) {
    processor.processRecord({1, "Electronics", 150});
    processor.processRecord({2, "Books", 25});
    processor.processRecord({3, "Clothing", 75});
    
    std::ostringstream output;
    processor.generateReport(output);
    std::string result = output.str();
    
    // Check for exact format
    EXPECT_TRUE(result.find("Books | COUNT=1 | TOTAL=25") != std::string::npos ||
                result.find("Books | COUNT=1 | TOTAL=25\n") != std::string::npos);
    EXPECT_TRUE(result.find("Clothing | COUNT=1 | TOTAL=75") != std::string::npos ||
                result.find("Clothing | COUNT=1 | TOTAL=75\n") != std::string::npos);
    EXPECT_TRUE(result.find("Electronics | COUNT=1 | TOTAL=150") != std::string::npos ||
                result.find("Electronics | COUNT=1 | TOTAL=150\n") != std::string::npos);
}

TEST_F(RecordProcessorTest, LexicographicalOrdering) {
    // Add in non-alphabetical order
    processor.processRecord({1, "Zebra", 10});
    processor.processRecord({2, "Apple", 20});
    processor.processRecord({3, "Banana", 30});
    
    std::ostringstream output;
    processor.generateReport(output);
    std::string result = output.str();
    
    // Find positions
    size_t apple_pos = result.find("Apple");
    size_t banana_pos = result.find("Banana");
    size_t zebra_pos = result.find("Zebra");
    
    // Check they all exist
    EXPECT_NE(apple_pos, std::string::npos);
    EXPECT_NE(banana_pos, std::string::npos);
    EXPECT_NE(zebra_pos, std::string::npos);
    
    // Check order
    EXPECT_LT(apple_pos, banana_pos);
    EXPECT_LT(banana_pos, zebra_pos);
}

// Batch processing tests
TEST_F(RecordProcessorTest, ProcessRecordsBatch) {
    std::vector<Record> records = {
        {1, "A", 10},
        {2, "B", 20},
        {3, "A", 30}
    };
    
    processor.processRecords(records);
    
    const auto& summaries = processor.getCategorySummaries();
    EXPECT_EQ(summaries.size(), 2);
    EXPECT_EQ(summaries.at("A").total, 40);
    EXPECT_EQ(summaries.at("B").total, 20);
}

TEST_F(RecordProcessorTest, BatchProcessingStopsOnError) {
    std::vector<Record> records = {
        {1, "Valid", 100},
        {2, "Invalid", -50},  // This should throw
        {3, "Valid", 200}
    };
    
    EXPECT_THROW(processor.processRecords(records), InvalidDataException);
    
    // Only first record should be processed
    const auto& summaries = processor.getCategorySummaries();
    EXPECT_EQ(summaries.size(), 1);
    EXPECT_EQ(summaries.at("Valid").count, 1);
    EXPECT_EQ(summaries.at("Valid").total, 100);
}

// Edge cases
TEST_F(RecordProcessorTest, EmptyInput) {
    std::vector<Record> empty;
    EXPECT_NO_THROW(processor.processRecords(empty));
    
    std::ostringstream output;
    processor.generateReport(output);
    EXPECT_TRUE(output.str().empty());
}

TEST_F(RecordProcessorTest, ClearFunctionality) {
    processor.processRecord({1, "Test", 100});
    ASSERT_EQ(processor.getCategorySummaries().size(), 1);
    
    processor.clear();
    EXPECT_TRUE(processor.getCategorySummaries().empty());
}

// Test with special characters in category names
TEST_F(RecordProcessorTest, SpecialCategoryNames) {
    processor.processRecord({1, "Category-Name_123", 100});
    processor.processRecord({2, "Another_Category", 200});
    
    std::ostringstream output;
    processor.generateReport(output);
    std::string result = output.str();
    
    EXPECT_NE(result.find("Another_Category"), std::string::npos);
    EXPECT_NE(result.find("Category-Name_123"), std::string::npos);
}

// Test exact output format
TEST_F(RecordProcessorTest, ExactOutputFormat) {
    processor.processRecord({1, "TestCategory", 123});
    
    std::ostringstream output;
    processor.generateReport(output);
    std::string result = output.str();
    
    // Remove trailing newline if present
    if (!result.empty() && result.back() == '\n') {
        result.pop_back();
    }
    
    EXPECT_EQ(result, "TestCategory | COUNT=1 | TOTAL=123");
}

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}