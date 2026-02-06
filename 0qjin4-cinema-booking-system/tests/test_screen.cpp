#include <gtest/gtest.h>
#include "Screen.h"

TEST(ScreenTest, ConstructorAndGetters) {
    Screen s(1, 8, 10);
    EXPECT_EQ(s.getScreenNumber(), 1);
    EXPECT_EQ(s.getRows(), 8);
    EXPECT_EQ(s.getSeatsPerRow(), 10);
}

TEST(ScreenTest, DefaultConstructor) {
    Screen s;
    EXPECT_EQ(s.getScreenNumber(), 0);
    EXPECT_EQ(s.getRows(), 0);
    EXPECT_EQ(s.getSeatsPerRow(), 0);
}

TEST(ScreenTest, IsValidSeatValidPositions) {
    Screen s(1, 5, 10); // Rows A-E, seats 1-10

    EXPECT_TRUE(s.isValidSeat('A', 1));
    EXPECT_TRUE(s.isValidSeat('A', 10));
    EXPECT_TRUE(s.isValidSeat('E', 1));
    EXPECT_TRUE(s.isValidSeat('E', 10));
    EXPECT_TRUE(s.isValidSeat('C', 5));
}

TEST(ScreenTest, IsValidSeatInvalidRow) {
    Screen s(1, 5, 10); // Rows A-E

    EXPECT_FALSE(s.isValidSeat('F', 1));  // Row too high
    EXPECT_FALSE(s.isValidSeat('Z', 5));  // Row way too high
}

TEST(ScreenTest, IsValidSeatInvalidSeatNumber) {
    Screen s(1, 5, 10); // Seats 1-10

    EXPECT_FALSE(s.isValidSeat('A', 0));   // Seat too low
    EXPECT_FALSE(s.isValidSeat('A', 11));  // Seat too high
    EXPECT_FALSE(s.isValidSeat('A', -1));  // Negative seat
}

TEST(ScreenTest, IsValidSeatBoundaryConditions) {
    Screen s(1, 1, 1); // Minimal screen: 1 row, 1 seat

    EXPECT_TRUE(s.isValidSeat('A', 1));
    EXPECT_FALSE(s.isValidSeat('B', 1));
    EXPECT_FALSE(s.isValidSeat('A', 2));
    EXPECT_FALSE(s.isValidSeat('A', 0));
}

TEST(ScreenTest, IsValidSeatLargeScreen) {
    Screen s(1, 26, 50); // Max rows A-Z, 50 seats

    EXPECT_TRUE(s.isValidSeat('A', 1));
    EXPECT_TRUE(s.isValidSeat('Z', 50));
    EXPECT_TRUE(s.isValidSeat('M', 25));
}

TEST(ScreenTest, JsonSerialization) {
    Screen s(2, 12, 15);
    nlohmann::json j = s;

    EXPECT_EQ(j["number"], 2);
    EXPECT_EQ(j["rows"], 12);
    EXPECT_EQ(j["seatsPerRow"], 15);
}

TEST(ScreenTest, JsonDeserialization) {
    nlohmann::json j = {
        {"number", 3},
        {"rows", 6},
        {"seatsPerRow", 8}
    };

    Screen s = j.get<Screen>();
    EXPECT_EQ(s.getScreenNumber(), 3);
    EXPECT_EQ(s.getRows(), 6);
    EXPECT_EQ(s.getSeatsPerRow(), 8);
}

TEST(ScreenTest, JsonRoundTrip) {
    Screen original(4, 10, 20);
    nlohmann::json j = original;
    Screen restored = j.get<Screen>();

    EXPECT_EQ(original.getScreenNumber(), restored.getScreenNumber());
    EXPECT_EQ(original.getRows(), restored.getRows());
    EXPECT_EQ(original.getSeatsPerRow(), restored.getSeatsPerRow());
}

TEST(ScreenTest, JsonDeserializationMissingField) {
    nlohmann::json j = {
        {"number", 1}
        // Missing rows and seatsPerRow
    };

    EXPECT_THROW(j.get<Screen>(), nlohmann::json::out_of_range);
}
