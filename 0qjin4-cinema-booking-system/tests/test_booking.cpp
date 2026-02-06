#include <gtest/gtest.h>
#include "Booking.h"

// --- SeatPosition Tests ---

TEST(SeatPositionTest, Equality) {
    SeatPosition a{'A', 1};
    SeatPosition b{'A', 1};
    SeatPosition c{'A', 2};
    SeatPosition d{'B', 1};

    EXPECT_TRUE(a == b);
    EXPECT_FALSE(a == c);
    EXPECT_FALSE(a == d);
}

TEST(SeatPositionTest, LessThan) {
    SeatPosition a{'A', 1};
    SeatPosition b{'A', 2};
    SeatPosition c{'B', 1};

    EXPECT_TRUE(a < b);
    EXPECT_TRUE(a < c);
    EXPECT_FALSE(b < a);
    EXPECT_TRUE(b < c);  // A < B by row
}

TEST(SeatPositionTest, JsonSerialization) {
    SeatPosition sp{'C', 5};
    nlohmann::json j = sp;

    EXPECT_EQ(j["row"], "C");
    EXPECT_EQ(j["seatNumber"], 5);
}

TEST(SeatPositionTest, JsonDeserialization) {
    nlohmann::json j = {{"row", "D"}, {"seatNumber", 7}};
    SeatPosition sp = j.get<SeatPosition>();

    EXPECT_EQ(sp.row, 'D');
    EXPECT_EQ(sp.seatNumber, 7);
}

TEST(SeatPositionTest, JsonRoundTrip) {
    SeatPosition original{'E', 10};
    nlohmann::json j = original;
    SeatPosition restored = j.get<SeatPosition>();

    EXPECT_EQ(original.row, restored.row);
    EXPECT_EQ(original.seatNumber, restored.seatNumber);
}

// --- Booking Tests ---

TEST(BookingTest, ConstructorAndGetters) {
    std::vector<SeatPosition> seats = {{'A', 1}, {'A', 2}, {'B', 3}};
    Booking b("CNF001", "MOV001", 1, "2026-02-06 19:00", seats);

    EXPECT_EQ(b.getConfirmationNumber(), "CNF001");
    EXPECT_EQ(b.getMovieId(), "MOV001");
    EXPECT_EQ(b.getScreenNumber(), 1);
    EXPECT_EQ(b.getShowtime(), "2026-02-06 19:00");
    EXPECT_EQ(b.getSeats().size(), 3u);
    EXPECT_EQ(b.getSeats()[0].row, 'A');
    EXPECT_EQ(b.getSeats()[0].seatNumber, 1);
}

TEST(BookingTest, DefaultConstructor) {
    Booking b;
    EXPECT_EQ(b.getConfirmationNumber(), "");
    EXPECT_EQ(b.getMovieId(), "");
    EXPECT_EQ(b.getScreenNumber(), 0);
    EXPECT_EQ(b.getShowtime(), "");
    EXPECT_TRUE(b.getSeats().empty());
}

TEST(BookingTest, SingleSeatBooking) {
    std::vector<SeatPosition> seats = {{'C', 5}};
    Booking b("CNF010", "MOV003", 2, "2026-02-06 22:00", seats);

    EXPECT_EQ(b.getSeats().size(), 1u);
    EXPECT_EQ(b.getSeats()[0].row, 'C');
    EXPECT_EQ(b.getSeats()[0].seatNumber, 5);
}

TEST(BookingTest, JsonSerialization) {
    std::vector<SeatPosition> seats = {{'A', 1}, {'B', 2}};
    Booking b("CNF042", "MOV007", 3, "2026-03-01 18:00", seats);

    nlohmann::json j = b;

    EXPECT_EQ(j["confirmationNumber"], "CNF042");
    EXPECT_EQ(j["movieId"], "MOV007");
    EXPECT_EQ(j["screenNumber"], 3);
    EXPECT_EQ(j["showtime"], "2026-03-01 18:00");
    EXPECT_EQ(j["seats"].size(), 2u);
    EXPECT_EQ(j["seats"][0]["row"], "A");
    EXPECT_EQ(j["seats"][0]["seatNumber"], 1);
}

TEST(BookingTest, JsonDeserialization) {
    nlohmann::json j = {
        {"confirmationNumber", "CNF099"},
        {"movieId", "MOV005"},
        {"screenNumber", 2},
        {"showtime", "2026-04-15 21:00"},
        {"seats", {{{"row", "D"}, {"seatNumber", 8}}, {{"row", "D"}, {"seatNumber", 9}}}}
    };

    Booking b = j.get<Booking>();

    EXPECT_EQ(b.getConfirmationNumber(), "CNF099");
    EXPECT_EQ(b.getMovieId(), "MOV005");
    EXPECT_EQ(b.getScreenNumber(), 2);
    EXPECT_EQ(b.getShowtime(), "2026-04-15 21:00");
    EXPECT_EQ(b.getSeats().size(), 2u);
    EXPECT_EQ(b.getSeats()[0].row, 'D');
    EXPECT_EQ(b.getSeats()[1].seatNumber, 9);
}

TEST(BookingTest, JsonRoundTrip) {
    std::vector<SeatPosition> seats = {{'F', 3}, {'F', 4}, {'G', 3}};
    Booking original("CNF200", "MOV010", 1, "2026-05-20 14:00", seats);

    nlohmann::json j = original;
    Booking restored = j.get<Booking>();

    EXPECT_EQ(original.getConfirmationNumber(), restored.getConfirmationNumber());
    EXPECT_EQ(original.getMovieId(), restored.getMovieId());
    EXPECT_EQ(original.getScreenNumber(), restored.getScreenNumber());
    EXPECT_EQ(original.getShowtime(), restored.getShowtime());
    ASSERT_EQ(original.getSeats().size(), restored.getSeats().size());
    for (size_t i = 0; i < original.getSeats().size(); ++i) {
        EXPECT_EQ(original.getSeats()[i], restored.getSeats()[i]);
    }
}
