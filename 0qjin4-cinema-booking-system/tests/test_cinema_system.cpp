#include <gtest/gtest.h>
#include <fstream>
#include <cstdio>
#include "CinemaSystem.h"

// Helper: write a JSON string to a temp file and return the path
static std::string writeTempJson(const std::string& content, const std::string& name) {
    std::string path = "/tmp/cinema_test_" + name + ".json";
    std::ofstream ofs(path);
    ofs << content;
    ofs.close();
    return path;
}

// Helper: create a standard test JSON with 2 screens, 3 movies, 1 booking
static std::string createStandardTestFile(const std::string& name) {
    std::string json = R"({
  "screens": [
    {"number": 1, "rows": 5, "seatsPerRow": 8},
    {"number": 2, "rows": 10, "seatsPerRow": 12}
  ],
  "movies": [
    {"id": "MOV001", "title": "The Matrix", "durationMinutes": 136, "screenNumber": 1, "showtime": "2026-02-06 19:00"},
    {"id": "MOV002", "title": "Inception", "durationMinutes": 148, "screenNumber": 2, "showtime": "2026-02-06 20:30"},
    {"id": "MOV003", "title": "Interstellar", "durationMinutes": 169, "screenNumber": 1, "showtime": "2026-02-06 22:00"}
  ],
  "bookings": [
    {
      "confirmationNumber": "CNF001",
      "movieId": "MOV001",
      "screenNumber": 1,
      "showtime": "2026-02-06 19:00",
      "seats": [{"row": "A", "seatNumber": 1}, {"row": "A", "seatNumber": 2}]
    }
  ]
})";
    return writeTempJson(json, name);
}

// =========================================================
// Loading Tests
// =========================================================

class CinemaSystemLoadTest : public ::testing::Test {
protected:
    void TearDown() override {
        // Clean up temp files
        std::remove(filePath_.c_str());
    }
    std::string filePath_;
};

TEST_F(CinemaSystemLoadTest, LoadFromExistingFile) {
    filePath_ = createStandardTestFile("load_existing");
    CinemaSystem system(filePath_);

    EXPECT_EQ(system.getScreens().size(), 2u);
    EXPECT_EQ(system.getMovies().size(), 3u);
    EXPECT_EQ(system.getBookings().size(), 1u);
}

TEST_F(CinemaSystemLoadTest, LoadScreenData) {
    filePath_ = createStandardTestFile("load_screens");
    CinemaSystem system(filePath_);

    const auto& screens = system.getScreens();
    ASSERT_EQ(screens.size(), 2u);

    EXPECT_EQ(screens[0].getScreenNumber(), 1);
    EXPECT_EQ(screens[0].getRows(), 5);
    EXPECT_EQ(screens[0].getSeatsPerRow(), 8);

    EXPECT_EQ(screens[1].getScreenNumber(), 2);
    EXPECT_EQ(screens[1].getRows(), 10);
    EXPECT_EQ(screens[1].getSeatsPerRow(), 12);
}

TEST_F(CinemaSystemLoadTest, LoadMovieData) {
    filePath_ = createStandardTestFile("load_movies");
    CinemaSystem system(filePath_);

    const auto& movies = system.getMovies();
    ASSERT_EQ(movies.size(), 3u);

    EXPECT_EQ(movies[0].getId(), "MOV001");
    EXPECT_EQ(movies[0].getTitle(), "The Matrix");
    EXPECT_EQ(movies[0].getDurationMinutes(), 136);
    EXPECT_EQ(movies[0].getScreenNumber(), 1);

    EXPECT_EQ(movies[1].getId(), "MOV002");
    EXPECT_EQ(movies[1].getTitle(), "Inception");

    EXPECT_EQ(movies[2].getId(), "MOV003");
    EXPECT_EQ(movies[2].getTitle(), "Interstellar");
}

TEST_F(CinemaSystemLoadTest, LoadBookingData) {
    filePath_ = createStandardTestFile("load_bookings");
    CinemaSystem system(filePath_);

    const auto& bookings = system.getBookings();
    ASSERT_EQ(bookings.size(), 1u);

    EXPECT_EQ(bookings[0].getConfirmationNumber(), "CNF001");
    EXPECT_EQ(bookings[0].getMovieId(), "MOV001");
    EXPECT_EQ(bookings[0].getSeats().size(), 2u);
}

TEST_F(CinemaSystemLoadTest, LoadNonExistentFile) {
    filePath_ = "/tmp/cinema_test_nonexistent_99999.json";
    std::remove(filePath_.c_str()); // ensure it doesn't exist
    CinemaSystem system(filePath_);

    EXPECT_TRUE(system.getScreens().empty());
    EXPECT_TRUE(system.getMovies().empty());
    EXPECT_TRUE(system.getBookings().empty());
}

TEST_F(CinemaSystemLoadTest, LoadEmptyJsonObject) {
    filePath_ = writeTempJson("{}", "empty_object");
    CinemaSystem system(filePath_);

    EXPECT_TRUE(system.getScreens().empty());
    EXPECT_TRUE(system.getMovies().empty());
    EXPECT_TRUE(system.getBookings().empty());
}

TEST_F(CinemaSystemLoadTest, LoadMalformedJsonThrows) {
    filePath_ = writeTempJson("{ this is not valid json }", "malformed");
    EXPECT_THROW(CinemaSystem system(filePath_), std::runtime_error);
}

TEST_F(CinemaSystemLoadTest, LoadPartialJson) {
    // Only screens, no movies or bookings
    std::string json = R"({
        "screens": [{"number": 1, "rows": 3, "seatsPerRow": 4}]
    })";
    filePath_ = writeTempJson(json, "partial");
    CinemaSystem system(filePath_);

    EXPECT_EQ(system.getScreens().size(), 1u);
    EXPECT_TRUE(system.getMovies().empty());
    EXPECT_TRUE(system.getBookings().empty());
}

// =========================================================
// Save / Persistence Tests
// =========================================================

class CinemaSystemPersistenceTest : public ::testing::Test {
protected:
    void TearDown() override {
        std::remove(filePath_.c_str());
    }
    std::string filePath_;
};

TEST_F(CinemaSystemPersistenceTest, SaveAndReload) {
    filePath_ = createStandardTestFile("save_reload");
    {
        CinemaSystem system(filePath_);
        // Book a seat so the file gets updated
        system.bookSeats("MOV002", {{'A', 1}});
    }

    // Reload from same file
    CinemaSystem system2(filePath_);
    EXPECT_EQ(system2.getBookings().size(), 2u);
}

TEST_F(CinemaSystemPersistenceTest, SaveCreatesFile) {
    filePath_ = "/tmp/cinema_test_new_file.json";
    std::remove(filePath_.c_str());

    {
        CinemaSystem system(filePath_);
        // No data, but we can trigger a save via addMovie by first providing screens
    }

    // The file won't be created if no write operation happens on empty system.
    // Let's create with some data, then save.
    std::string json = R"({"screens": [{"number": 1, "rows": 3, "seatsPerRow": 5}]})";
    filePath_ = writeTempJson(json, "create_file");

    CinemaSystem system(filePath_);
    system.addMovie("Test", 90, 1, "2026-01-01 10:00");

    // Verify file was written by reloading
    CinemaSystem system2(filePath_);
    EXPECT_EQ(system2.getMovies().size(), 1u);
    EXPECT_EQ(system2.getMovies()[0].getTitle(), "Test");
}

TEST_F(CinemaSystemPersistenceTest, SavePreservesAllData) {
    filePath_ = createStandardTestFile("save_preserves");
    CinemaSystem system(filePath_);

    // Add a movie
    system.addMovie("New Movie", 120, 2, "2026-03-01 18:00");

    // Reload
    CinemaSystem system2(filePath_);
    EXPECT_EQ(system2.getScreens().size(), 2u);
    EXPECT_EQ(system2.getMovies().size(), 4u);
    EXPECT_EQ(system2.getBookings().size(), 1u);
}

// =========================================================
// Add Movie Tests
// =========================================================

class CinemaSystemAddMovieTest : public ::testing::Test {
protected:
    void SetUp() override {
        filePath_ = createStandardTestFile("addmovie");
    }
    void TearDown() override {
        std::remove(filePath_.c_str());
    }
    std::string filePath_;
};

TEST_F(CinemaSystemAddMovieTest, AddMovieValidScreen) {
    CinemaSystem system(filePath_);
    std::string movieId = system.addMovie("Dune", 155, 1, "2026-03-01 18:00");

    EXPECT_FALSE(movieId.empty());
    EXPECT_EQ(movieId.substr(0, 3), "MOV");
    EXPECT_EQ(system.getMovies().size(), 4u);
}

TEST_F(CinemaSystemAddMovieTest, AddMovieReturnsUniqueId) {
    CinemaSystem system(filePath_);
    std::string id1 = system.addMovie("Movie A", 90, 1, "2026-03-01 10:00");
    std::string id2 = system.addMovie("Movie B", 100, 2, "2026-03-01 12:00");

    EXPECT_NE(id1, id2);
}

TEST_F(CinemaSystemAddMovieTest, AddMovieInvalidScreen) {
    CinemaSystem system(filePath_);
    EXPECT_THROW(system.addMovie("Bad Movie", 90, 99, "2026-03-01 10:00"),
                 std::invalid_argument);
}

TEST_F(CinemaSystemAddMovieTest, AddMovieScreen2) {
    CinemaSystem system(filePath_);
    std::string movieId = system.addMovie("Avatar", 162, 2, "2026-03-02 15:00");

    auto movies = system.getMovies();
    auto it = std::find_if(movies.begin(), movies.end(),
                           [&](const Movie& m) { return m.getId() == movieId; });
    ASSERT_NE(it, movies.end());
    EXPECT_EQ(it->getScreenNumber(), 2);
    EXPECT_EQ(it->getTitle(), "Avatar");
    EXPECT_EQ(it->getDurationMinutes(), 162);
}

TEST_F(CinemaSystemAddMovieTest, AddMovieGeneratesIncrementingIds) {
    CinemaSystem system(filePath_);
    // Existing movies go up to MOV003, so next should be MOV004
    std::string id = system.addMovie("Test", 90, 1, "2026-01-01 10:00");
    EXPECT_EQ(id, "MOV004");

    std::string id2 = system.addMovie("Test2", 90, 1, "2026-01-01 12:00");
    EXPECT_EQ(id2, "MOV005");
}

TEST_F(CinemaSystemAddMovieTest, AddMovieSavesToJson) {
    {
        CinemaSystem system(filePath_);
        system.addMovie("Saved Movie", 120, 1, "2026-04-01 20:00");
    }

    // Reload and verify
    CinemaSystem system2(filePath_);
    EXPECT_EQ(system2.getMovies().size(), 4u);
    bool found = false;
    for (const auto& m : system2.getMovies()) {
        if (m.getTitle() == "Saved Movie") {
            found = true;
            break;
        }
    }
    EXPECT_TRUE(found);
}

// =========================================================
// Display Seat Map Tests
// =========================================================

class CinemaSystemSeatMapTest : public ::testing::Test {
protected:
    void SetUp() override {
        filePath_ = createStandardTestFile("seatmap");
    }
    void TearDown() override {
        std::remove(filePath_.c_str());
    }
    std::string filePath_;
};

TEST_F(CinemaSystemSeatMapTest, DisplaySeatMapReturnsString) {
    CinemaSystem system(filePath_);
    std::string seatMap = system.displaySeatMap("MOV001");
    EXPECT_FALSE(seatMap.empty());
}

TEST_F(CinemaSystemSeatMapTest, SeatMapContainsRowLetters) {
    CinemaSystem system(filePath_);
    std::string seatMap = system.displaySeatMap("MOV001");

    // Screen 1 has 5 rows: A-E
    EXPECT_NE(seatMap.find('A'), std::string::npos);
    EXPECT_NE(seatMap.find('B'), std::string::npos);
    EXPECT_NE(seatMap.find('C'), std::string::npos);
    EXPECT_NE(seatMap.find('D'), std::string::npos);
    EXPECT_NE(seatMap.find('E'), std::string::npos);
}

TEST_F(CinemaSystemSeatMapTest, SeatMapShowsBookedSeats) {
    CinemaSystem system(filePath_);
    // MOV001 has A1 and A2 booked
    std::string seatMap = system.displaySeatMap("MOV001");

    // The map should contain 'X' for booked seats
    EXPECT_NE(seatMap.find('X'), std::string::npos);
}

TEST_F(CinemaSystemSeatMapTest, SeatMapShowsAvailableSeats) {
    CinemaSystem system(filePath_);
    std::string seatMap = system.displaySeatMap("MOV001");

    // Should contain 'O' for available seats
    EXPECT_NE(seatMap.find('O'), std::string::npos);
}

TEST_F(CinemaSystemSeatMapTest, SeatMapEmptyScreenAllAvailable) {
    CinemaSystem system(filePath_);
    // MOV003 has no bookings
    std::string seatMap = system.displaySeatMap("MOV003");

    // Should have no X
    EXPECT_EQ(seatMap.find('X'), std::string::npos);
    // Should have O
    EXPECT_NE(seatMap.find('O'), std::string::npos);
}

TEST_F(CinemaSystemSeatMapTest, SeatMapInvalidMovieThrows) {
    CinemaSystem system(filePath_);
    EXPECT_THROW(system.displaySeatMap("MOV999"), std::invalid_argument);
}

TEST_F(CinemaSystemSeatMapTest, SeatMapDifferentScreenSizes) {
    CinemaSystem system(filePath_);

    // MOV001 is on screen 1 (5 rows, 8 seats)
    std::string map1 = system.displaySeatMap("MOV001");

    // MOV002 is on screen 2 (10 rows, 12 seats)
    std::string map2 = system.displaySeatMap("MOV002");

    // Screen 2 map should be larger (more rows and columns)
    EXPECT_GT(map2.size(), map1.size());
}

TEST_F(CinemaSystemSeatMapTest, SeatMapContainsSeatNumbers) {
    CinemaSystem system(filePath_);
    std::string seatMap = system.displaySeatMap("MOV001");

    // Screen 1 has 8 seats per row, should contain numbers 1-8
    EXPECT_NE(seatMap.find('1'), std::string::npos);
    EXPECT_NE(seatMap.find('8'), std::string::npos);
}

TEST_F(CinemaSystemSeatMapTest, SeatMapUpdatesAfterBooking) {
    CinemaSystem system(filePath_);

    // Count X's before booking
    std::string mapBefore = system.displaySeatMap("MOV001");
    size_t xCountBefore = std::count(mapBefore.begin(), mapBefore.end(), 'X');

    // Book more seats
    system.bookSeats("MOV001", {{'B', 1}, {'B', 2}});

    std::string mapAfter = system.displaySeatMap("MOV001");
    size_t xCountAfter = std::count(mapAfter.begin(), mapAfter.end(), 'X');

    EXPECT_EQ(xCountAfter, xCountBefore + 2);
}

// =========================================================
// Book Seats Tests
// =========================================================

class CinemaSystemBookTest : public ::testing::Test {
protected:
    void SetUp() override {
        filePath_ = createStandardTestFile("book");
    }
    void TearDown() override {
        std::remove(filePath_.c_str());
    }
    std::string filePath_;
};

TEST_F(CinemaSystemBookTest, BookValidSeats) {
    CinemaSystem system(filePath_);
    std::string cnf = system.bookSeats("MOV001", {{'B', 3}, {'B', 4}});

    EXPECT_FALSE(cnf.empty());
    EXPECT_EQ(cnf.substr(0, 3), "CNF");
    EXPECT_EQ(system.getBookings().size(), 2u);
}

TEST_F(CinemaSystemBookTest, BookSingleSeat) {
    CinemaSystem system(filePath_);
    std::string cnf = system.bookSeats("MOV002", {{'A', 1}});

    EXPECT_FALSE(cnf.empty());
    EXPECT_EQ(system.getBookings().size(), 2u);
}

TEST_F(CinemaSystemBookTest, BookMultipleSeats) {
    CinemaSystem system(filePath_);
    std::vector<SeatPosition> seats = {{'C', 1}, {'C', 2}, {'C', 3}, {'C', 4}, {'C', 5}};
    std::string cnf = system.bookSeats("MOV001", seats);

    EXPECT_FALSE(cnf.empty());

    // Find the booking and verify all seats
    const auto& bookings = system.getBookings();
    auto it = std::find_if(bookings.begin(), bookings.end(),
                           [&](const Booking& b) { return b.getConfirmationNumber() == cnf; });
    ASSERT_NE(it, bookings.end());
    EXPECT_EQ(it->getSeats().size(), 5u);
}

TEST_F(CinemaSystemBookTest, BookReturnsUniqueConfirmationNumbers) {
    CinemaSystem system(filePath_);
    std::string cnf1 = system.bookSeats("MOV001", {{'B', 1}});
    std::string cnf2 = system.bookSeats("MOV001", {{'B', 2}});
    std::string cnf3 = system.bookSeats("MOV002", {{'A', 1}});

    EXPECT_NE(cnf1, cnf2);
    EXPECT_NE(cnf2, cnf3);
    EXPECT_NE(cnf1, cnf3);
}

TEST_F(CinemaSystemBookTest, BookConfirmationNumbersIncrement) {
    CinemaSystem system(filePath_);
    // Existing booking is CNF001, so next should be CNF002
    std::string cnf = system.bookSeats("MOV001", {{'B', 1}});
    EXPECT_EQ(cnf, "CNF002");

    std::string cnf2 = system.bookSeats("MOV001", {{'B', 2}});
    EXPECT_EQ(cnf2, "CNF003");
}

TEST_F(CinemaSystemBookTest, BookInvalidMovieThrows) {
    CinemaSystem system(filePath_);
    EXPECT_THROW(system.bookSeats("MOV999", {{'A', 1}}), std::invalid_argument);
}

TEST_F(CinemaSystemBookTest, BookEmptySeatsThrows) {
    CinemaSystem system(filePath_);
    EXPECT_THROW(system.bookSeats("MOV001", {}), std::invalid_argument);
}

TEST_F(CinemaSystemBookTest, BookOutOfBoundsSeatRowThrows) {
    CinemaSystem system(filePath_);
    // Screen 1 has 5 rows (A-E), 'Z' is out of bounds
    EXPECT_THROW(system.bookSeats("MOV001", {{'Z', 1}}), std::invalid_argument);
}

TEST_F(CinemaSystemBookTest, BookOutOfBoundsSeatNumberThrows) {
    CinemaSystem system(filePath_);
    // Screen 1 has 8 seats per row, 99 is out of bounds
    EXPECT_THROW(system.bookSeats("MOV001", {{'A', 99}}), std::invalid_argument);
}

TEST_F(CinemaSystemBookTest, BookSeatZeroThrows) {
    CinemaSystem system(filePath_);
    EXPECT_THROW(system.bookSeats("MOV001", {{'A', 0}}), std::invalid_argument);
}

TEST_F(CinemaSystemBookTest, BookNegativeSeatThrows) {
    CinemaSystem system(filePath_);
    EXPECT_THROW(system.bookSeats("MOV001", {{'A', -1}}), std::invalid_argument);
}

TEST_F(CinemaSystemBookTest, BookAlreadyBookedSeatThrows) {
    CinemaSystem system(filePath_);
    // A1 and A2 are already booked for MOV001
    EXPECT_THROW(system.bookSeats("MOV001", {{'A', 1}}), std::invalid_argument);
}

TEST_F(CinemaSystemBookTest, BookMixedAlreadyBookedThrows) {
    CinemaSystem system(filePath_);
    // A1 is booked, B1 is not — should still throw because A1 is taken
    EXPECT_THROW(system.bookSeats("MOV001", {{'B', 1}, {'A', 1}}), std::invalid_argument);
}

TEST_F(CinemaSystemBookTest, DoubleBookingPrevention) {
    CinemaSystem system(filePath_);
    system.bookSeats("MOV001", {{'C', 1}});
    // Trying to book C1 again should fail
    EXPECT_THROW(system.bookSeats("MOV001", {{'C', 1}}), std::invalid_argument);
}

TEST_F(CinemaSystemBookTest, BookSameSeatDifferentMovies) {
    CinemaSystem system(filePath_);
    // Same seat A1 on different movies (different screens/showtimes) should be fine
    // MOV001 already has A1, but MOV002 is on screen 2
    std::string cnf = system.bookSeats("MOV002", {{'A', 1}});
    EXPECT_FALSE(cnf.empty());
}

TEST_F(CinemaSystemBookTest, BookSameSeatDifferentMoviesSameScreen) {
    CinemaSystem system(filePath_);
    // MOV001 and MOV003 are both on screen 1 but different showtimes
    // MOV001 has A1 booked, MOV003 should allow A1
    std::string cnf = system.bookSeats("MOV003", {{'A', 1}});
    EXPECT_FALSE(cnf.empty());
}

TEST_F(CinemaSystemBookTest, BookSavesToJson) {
    {
        CinemaSystem system(filePath_);
        system.bookSeats("MOV001", {{'D', 5}});
    }

    CinemaSystem system2(filePath_);
    EXPECT_EQ(system2.getBookings().size(), 2u);

    bool found = false;
    for (const auto& b : system2.getBookings()) {
        for (const auto& seat : b.getSeats()) {
            if (seat.row == 'D' && seat.seatNumber == 5) {
                found = true;
                break;
            }
        }
    }
    EXPECT_TRUE(found);
}

TEST_F(CinemaSystemBookTest, BookBoundarySeats) {
    CinemaSystem system(filePath_);
    // Screen 1: 5 rows (A-E), 8 seats
    // Book corner seats
    std::string cnf1 = system.bookSeats("MOV003", {{'A', 1}});
    std::string cnf2 = system.bookSeats("MOV003", {{'A', 8}});
    std::string cnf3 = system.bookSeats("MOV003", {{'E', 1}});
    std::string cnf4 = system.bookSeats("MOV003", {{'E', 8}});

    EXPECT_FALSE(cnf1.empty());
    EXPECT_FALSE(cnf2.empty());
    EXPECT_FALSE(cnf3.empty());
    EXPECT_FALSE(cnf4.empty());
}

TEST_F(CinemaSystemBookTest, BookRecordContainsCorrectMovieInfo) {
    CinemaSystem system(filePath_);
    std::string cnf = system.bookSeats("MOV002", {{'A', 5}});

    const auto& bookings = system.getBookings();
    auto it = std::find_if(bookings.begin(), bookings.end(),
                           [&](const Booking& b) { return b.getConfirmationNumber() == cnf; });
    ASSERT_NE(it, bookings.end());
    EXPECT_EQ(it->getMovieId(), "MOV002");
    EXPECT_EQ(it->getScreenNumber(), 2);
    EXPECT_EQ(it->getShowtime(), "2026-02-06 20:30");
}

// =========================================================
// Cancel Booking Tests
// =========================================================

class CinemaSystemCancelTest : public ::testing::Test {
protected:
    void SetUp() override {
        filePath_ = createStandardTestFile("cancel");
    }
    void TearDown() override {
        std::remove(filePath_.c_str());
    }
    std::string filePath_;
};

TEST_F(CinemaSystemCancelTest, CancelExistingBooking) {
    CinemaSystem system(filePath_);
    EXPECT_EQ(system.getBookings().size(), 1u);

    bool result = system.cancelBooking("CNF001");
    EXPECT_TRUE(result);
    EXPECT_EQ(system.getBookings().size(), 0u);
}

TEST_F(CinemaSystemCancelTest, CancelNonExistentBooking) {
    CinemaSystem system(filePath_);
    bool result = system.cancelBooking("CNF999");
    EXPECT_FALSE(result);
    EXPECT_EQ(system.getBookings().size(), 1u);
}

TEST_F(CinemaSystemCancelTest, CancelFreesSeats) {
    CinemaSystem system(filePath_);

    // A1 and A2 are booked for MOV001
    // After cancel, we should be able to book them again
    system.cancelBooking("CNF001");

    std::string cnf = system.bookSeats("MOV001", {{'A', 1}, {'A', 2}});
    EXPECT_FALSE(cnf.empty());
}

TEST_F(CinemaSystemCancelTest, CancelSavesToJson) {
    {
        CinemaSystem system(filePath_);
        system.cancelBooking("CNF001");
    }

    CinemaSystem system2(filePath_);
    EXPECT_EQ(system2.getBookings().size(), 0u);
}

TEST_F(CinemaSystemCancelTest, CancelOnlyTargetBooking) {
    CinemaSystem system(filePath_);
    // Add another booking
    std::string cnf2 = system.bookSeats("MOV002", {{'A', 1}});

    EXPECT_EQ(system.getBookings().size(), 2u);

    // Cancel original booking
    system.cancelBooking("CNF001");

    EXPECT_EQ(system.getBookings().size(), 1u);
    EXPECT_EQ(system.getBookings()[0].getConfirmationNumber(), cnf2);
}

TEST_F(CinemaSystemCancelTest, CancelAndRebookShowsOnSeatMap) {
    CinemaSystem system(filePath_);

    // Verify A1 is booked (X on seat map)
    std::string mapBefore = system.displaySeatMap("MOV001");
    size_t xBefore = std::count(mapBefore.begin(), mapBefore.end(), 'X');
    EXPECT_EQ(xBefore, 2u); // A1 and A2

    // Cancel
    system.cancelBooking("CNF001");

    std::string mapAfter = system.displaySeatMap("MOV001");
    size_t xAfter = std::count(mapAfter.begin(), mapAfter.end(), 'X');
    EXPECT_EQ(xAfter, 0u);
}

TEST_F(CinemaSystemCancelTest, CancelEmptyConfirmationNumber) {
    CinemaSystem system(filePath_);
    bool result = system.cancelBooking("");
    EXPECT_FALSE(result);
}

// =========================================================
// Counter / ID Generation Tests
// =========================================================

class CinemaSystemCounterTest : public ::testing::Test {
protected:
    void TearDown() override {
        std::remove(filePath_.c_str());
    }
    std::string filePath_;
};

TEST_F(CinemaSystemCounterTest, CounterResumesAfterReload) {
    filePath_ = createStandardTestFile("counter_resume");

    std::string movieId;
    {
        CinemaSystem system(filePath_);
        movieId = system.addMovie("Test", 90, 1, "2026-01-01 10:00");
        EXPECT_EQ(movieId, "MOV004"); // After MOV001-003
    }

    // Reload and add another
    CinemaSystem system2(filePath_);
    std::string movieId2 = system2.addMovie("Test2", 90, 1, "2026-01-01 12:00");
    EXPECT_EQ(movieId2, "MOV005");
}

TEST_F(CinemaSystemCounterTest, ConfirmationCounterResumesAfterReload) {
    filePath_ = createStandardTestFile("cnf_counter_resume");

    std::string cnf;
    {
        CinemaSystem system(filePath_);
        cnf = system.bookSeats("MOV001", {{'B', 1}});
        EXPECT_EQ(cnf, "CNF002"); // After CNF001
    }

    CinemaSystem system2(filePath_);
    std::string cnf2 = system2.bookSeats("MOV001", {{'B', 2}});
    EXPECT_EQ(cnf2, "CNF003");
}

TEST_F(CinemaSystemCounterTest, CounterStartsAtOneForEmptyData) {
    filePath_ = writeTempJson(R"({"screens": [{"number": 1, "rows": 3, "seatsPerRow": 5}]})",
                              "empty_counter");
    CinemaSystem system(filePath_);
    std::string movieId = system.addMovie("First", 90, 1, "2026-01-01 10:00");
    EXPECT_EQ(movieId, "MOV001");
}

// =========================================================
// Edge Case / Integration Tests
// =========================================================

class CinemaSystemIntegrationTest : public ::testing::Test {
protected:
    void TearDown() override {
        std::remove(filePath_.c_str());
    }
    std::string filePath_;
};

TEST_F(CinemaSystemIntegrationTest, FullWorkflow) {
    filePath_ = writeTempJson(R"({
        "screens": [{"number": 1, "rows": 4, "seatsPerRow": 6}]
    })", "workflow");

    CinemaSystem system(filePath_);

    // 1. Add a movie
    std::string movieId = system.addMovie("Test Film", 120, 1, "2026-06-01 20:00");
    EXPECT_EQ(movieId, "MOV001");

    // 2. View seat map (all available)
    std::string map = system.displaySeatMap(movieId);
    EXPECT_EQ(std::count(map.begin(), map.end(), 'X'), 0);
    EXPECT_GT(std::count(map.begin(), map.end(), 'O'), 0);

    // 3. Book seats
    std::string cnf = system.bookSeats(movieId, {{'A', 1}, {'A', 2}, {'A', 3}});
    EXPECT_EQ(cnf, "CNF001");

    // 4. Verify seat map updated
    map = system.displaySeatMap(movieId);
    EXPECT_EQ(std::count(map.begin(), map.end(), 'X'), 3);

    // 5. Book more seats
    std::string cnf2 = system.bookSeats(movieId, {{'B', 1}});
    EXPECT_EQ(cnf2, "CNF002");

    // 6. Cancel first booking
    EXPECT_TRUE(system.cancelBooking(cnf));

    // 7. Verify seats freed
    map = system.displaySeatMap(movieId);
    EXPECT_EQ(std::count(map.begin(), map.end(), 'X'), 1); // Only B1 remains

    // 8. Rebook previously cancelled seats
    std::string cnf3 = system.bookSeats(movieId, {{'A', 1}, {'A', 2}});
    EXPECT_FALSE(cnf3.empty());

    map = system.displaySeatMap(movieId);
    EXPECT_EQ(std::count(map.begin(), map.end(), 'X'), 3); // A1, A2, B1
}

TEST_F(CinemaSystemIntegrationTest, MultipleMoviesSameScreen) {
    filePath_ = writeTempJson(R"({
        "screens": [{"number": 1, "rows": 3, "seatsPerRow": 4}]
    })", "multi_movie");

    CinemaSystem system(filePath_);

    std::string m1 = system.addMovie("Movie A", 90, 1, "10:00");
    std::string m2 = system.addMovie("Movie B", 90, 1, "13:00");

    // Book A1 for movie A
    system.bookSeats(m1, {{'A', 1}});

    // Should be able to book A1 for movie B (different showing)
    std::string cnf = system.bookSeats(m2, {{'A', 1}});
    EXPECT_FALSE(cnf.empty());

    // Verify movie A still shows A1 as booked
    std::string mapA = system.displaySeatMap(m1);
    EXPECT_EQ(std::count(mapA.begin(), mapA.end(), 'X'), 1);

    // Verify movie B also shows A1 as booked
    std::string mapB = system.displaySeatMap(m2);
    EXPECT_EQ(std::count(mapB.begin(), mapB.end(), 'X'), 1);
}

TEST_F(CinemaSystemIntegrationTest, BookAllSeatsInScreen) {
    filePath_ = writeTempJson(R"({
        "screens": [{"number": 1, "rows": 2, "seatsPerRow": 3}]
    })", "all_seats");

    CinemaSystem system(filePath_);
    std::string movieId = system.addMovie("Full House", 90, 1, "20:00");

    // Book all 6 seats
    std::vector<SeatPosition> allSeats = {
        {'A', 1}, {'A', 2}, {'A', 3},
        {'B', 1}, {'B', 2}, {'B', 3}
    };

    std::string cnf = system.bookSeats(movieId, allSeats);
    EXPECT_FALSE(cnf.empty());

    // Verify all seats are booked
    std::string map = system.displaySeatMap(movieId);
    EXPECT_EQ(std::count(map.begin(), map.end(), 'O'), 0);
    EXPECT_EQ(std::count(map.begin(), map.end(), 'X'), 6);

    // Trying to book any seat should fail now
    EXPECT_THROW(system.bookSeats(movieId, {{'A', 1}}), std::invalid_argument);
}

TEST_F(CinemaSystemIntegrationTest, PersistenceAcrossMultipleReloads) {
    filePath_ = writeTempJson(R"({
        "screens": [{"number": 1, "rows": 3, "seatsPerRow": 5}]
    })", "multi_reload");

    // Session 1: add movie
    std::string movieId;
    {
        CinemaSystem system(filePath_);
        movieId = system.addMovie("Persistent", 120, 1, "18:00");
    }

    // Session 2: book seats
    std::string cnf;
    {
        CinemaSystem system(filePath_);
        cnf = system.bookSeats(movieId, {{'A', 1}, {'A', 2}});
    }

    // Session 3: verify everything persisted
    {
        CinemaSystem system(filePath_);
        EXPECT_EQ(system.getMovies().size(), 1u);
        EXPECT_EQ(system.getBookings().size(), 1u);
        EXPECT_EQ(system.getBookings()[0].getConfirmationNumber(), cnf);
        EXPECT_EQ(system.getBookings()[0].getSeats().size(), 2u);
    }

    // Session 4: cancel and verify
    {
        CinemaSystem system(filePath_);
        system.cancelBooking(cnf);
    }

    {
        CinemaSystem system(filePath_);
        EXPECT_EQ(system.getBookings().size(), 0u);
    }
}

// Google Test main
int main(int argc, char** argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
