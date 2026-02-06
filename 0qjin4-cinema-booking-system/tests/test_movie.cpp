#include <gtest/gtest.h>
#include "Movie.h"

TEST(MovieTest, ConstructorAndGetters) {
    Movie m("MOV001", "The Matrix", 136, 1, "2026-02-06 19:00");

    EXPECT_EQ(m.getId(), "MOV001");
    EXPECT_EQ(m.getTitle(), "The Matrix");
    EXPECT_EQ(m.getDurationMinutes(), 136);
    EXPECT_EQ(m.getScreenNumber(), 1);
    EXPECT_EQ(m.getShowtime(), "2026-02-06 19:00");
}

TEST(MovieTest, DefaultConstructor) {
    Movie m;
    EXPECT_EQ(m.getId(), "");
    EXPECT_EQ(m.getTitle(), "");
    EXPECT_EQ(m.getDurationMinutes(), 0);
    EXPECT_EQ(m.getScreenNumber(), 0);
    EXPECT_EQ(m.getShowtime(), "");
}

TEST(MovieTest, JsonSerialization) {
    Movie original("MOV042", "Inception", 148, 2, "2026-02-06 20:30");

    nlohmann::json j = original;

    EXPECT_EQ(j["id"], "MOV042");
    EXPECT_EQ(j["title"], "Inception");
    EXPECT_EQ(j["durationMinutes"], 148);
    EXPECT_EQ(j["screenNumber"], 2);
    EXPECT_EQ(j["showtime"], "2026-02-06 20:30");
}

TEST(MovieTest, JsonDeserialization) {
    nlohmann::json j = {
        {"id", "MOV007"},
        {"title", "Interstellar"},
        {"durationMinutes", 169},
        {"screenNumber", 3},
        {"showtime", "2026-02-06 22:00"}
    };

    Movie m = j.get<Movie>();

    EXPECT_EQ(m.getId(), "MOV007");
    EXPECT_EQ(m.getTitle(), "Interstellar");
    EXPECT_EQ(m.getDurationMinutes(), 169);
    EXPECT_EQ(m.getScreenNumber(), 3);
    EXPECT_EQ(m.getShowtime(), "2026-02-06 22:00");
}

TEST(MovieTest, JsonRoundTrip) {
    Movie original("MOV100", "Dune", 155, 5, "2026-03-01 18:00");

    nlohmann::json j = original;
    Movie restored = j.get<Movie>();

    EXPECT_EQ(original.getId(), restored.getId());
    EXPECT_EQ(original.getTitle(), restored.getTitle());
    EXPECT_EQ(original.getDurationMinutes(), restored.getDurationMinutes());
    EXPECT_EQ(original.getScreenNumber(), restored.getScreenNumber());
    EXPECT_EQ(original.getShowtime(), restored.getShowtime());
}

TEST(MovieTest, JsonDeserializationMissingField) {
    nlohmann::json j = {
        {"id", "MOV001"},
        {"title", "Test"}
        // Missing durationMinutes, screenNumber, showtime
    };

    EXPECT_THROW(j.get<Movie>(), nlohmann::json::out_of_range);
}
