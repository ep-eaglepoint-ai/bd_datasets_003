CXX = g++
REPO_DIR ?= repository_after
CXXFLAGS = -std=c++17 -Wall -Wextra -pedantic -I../$(REPO_DIR)/src
LDFLAGS = -lgtest -lgtest_main -pthread

SRC_DIR = ../$(REPO_DIR)/src
BUILD_DIR = build

# Source files (excluding main.cpp)
LIB_SRCS = $(SRC_DIR)/Movie.cpp \
            $(SRC_DIR)/Screen.cpp \
            $(SRC_DIR)/Booking.cpp \
            $(SRC_DIR)/CinemaSystem.cpp

LIB_OBJS = $(patsubst $(SRC_DIR)/%.cpp, $(BUILD_DIR)/lib_%.o, $(LIB_SRCS))

# Test source files
TEST_SRCS = test_movie.cpp \
            test_screen.cpp \
            test_booking.cpp \
            test_cinema_system.cpp

TEST_OBJS = $(patsubst %.cpp, $(BUILD_DIR)/%.o, $(TEST_SRCS))

TARGET = run_tests

.PHONY: all clean test

all: $(TARGET)

$(TARGET): $(LIB_OBJS) $(TEST_OBJS)
	$(CXX) $(CXXFLAGS) -o $@ $^ $(LDFLAGS)

$(BUILD_DIR)/lib_%.o: $(SRC_DIR)/%.cpp | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -c -o $@ $<

$(BUILD_DIR)/%.o: %.cpp | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -c -o $@ $<

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

test: $(TARGET)
	./$(TARGET)

clean:
	rm -rf $(BUILD_DIR) $(TARGET)
