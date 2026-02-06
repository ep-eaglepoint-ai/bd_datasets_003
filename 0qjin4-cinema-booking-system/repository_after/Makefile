CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -pedantic -I src
LDFLAGS =

SRC_DIR = src
BUILD_DIR = build
TARGET = cinema_booking

SRCS = $(SRC_DIR)/Movie.cpp \
       $(SRC_DIR)/Screen.cpp \
       $(SRC_DIR)/Booking.cpp \
       $(SRC_DIR)/CinemaSystem.cpp \
       $(SRC_DIR)/main.cpp

OBJS = $(patsubst $(SRC_DIR)/%.cpp, $(BUILD_DIR)/%.o, $(SRCS))

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(CXXFLAGS) -o $@ $^ $(LDFLAGS)

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.cpp | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -c -o $@ $<

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

clean:
	rm -rf $(BUILD_DIR) $(TARGET)
