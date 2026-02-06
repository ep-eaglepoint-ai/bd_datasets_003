CXX = g++
CXXFLAGS = -Wall -Wextra -std=c++17
LDFLAGS_TEST = -lgtest -lgtest_main -pthread

SRC_DIR ?= repository_after
TEST_DIR = tests
BUILD_DIR = build

SRCS = $(SRC_DIR)/Book.cpp $(SRC_DIR)/Patron.cpp $(SRC_DIR)/Library.cpp $(SRC_DIR)/DateUtils.cpp
OBJS = $(patsubst $(SRC_DIR)/%.cpp,$(BUILD_DIR)/%.o,$(SRCS))

MAIN_SRC = $(SRC_DIR)/main.cpp
MAIN_OBJ = $(BUILD_DIR)/main.o

TEST_SRC = $(TEST_DIR)/test_library.cpp
TEST_OBJ = $(BUILD_DIR)/test_library.o

TARGET = library_catalog
TEST_TARGET = library_catalog_tests
EVAL_TARGET = evaluation/evaluate

.PHONY: all clean test eval

all: $(TARGET) $(TEST_TARGET)

eval: $(EVAL_TARGET)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.cpp | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/test_library.o: $(TEST_DIR)/test_library.cpp | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -I$(SRC_DIR) -c $< -o $@

$(TARGET): $(OBJS) $(MAIN_OBJ)
	$(CXX) $(CXXFLAGS) $^ -o $@

$(TEST_TARGET): $(OBJS) $(TEST_OBJ)
	$(CXX) $(CXXFLAGS) $^ -o $@ $(LDFLAGS_TEST)

$(EVAL_TARGET): evaluation/evaluate.cpp
	$(CXX) $(CXXFLAGS) $< -o $@

test: $(TEST_TARGET)
	./$(TEST_TARGET)

clean:
	rm -rf $(BUILD_DIR) $(TARGET) $(TEST_TARGET) $(EVAL_TARGET)
