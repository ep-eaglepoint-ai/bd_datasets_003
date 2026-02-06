#ifndef CINEMA_SYSTEM_H
#define CINEMA_SYSTEM_H

#include <string>
#include <vector>
#include <optional>
#include "Movie.h"
#include "Screen.h"
#include "Booking.h"

class CinemaSystem {
public:
    explicit CinemaSystem(const std::string& jsonFilePath);

    // Movie operations
    std::string addMovie(const std::string& title, int durationMinutes,
                         int screenNumber, const std::string& showtime);

    // Seat map display - returns the seat map as a string
    std::string displaySeatMap(const std::string& movieId) const;

    // Booking operations
    std::string bookSeats(const std::string& movieId,
                          const std::vector<SeatPosition>& seats);
    bool cancelBooking(const std::string& confirmationNumber);

    // Persistence
    void saveToJson() const;
    void loadFromJson();

    // Accessors for testing
    const std::vector<Screen>& getScreens() const;
    const std::vector<Movie>& getMovies() const;
    const std::vector<Booking>& getBookings() const;

private:
    std::string jsonFilePath_;
    std::vector<Screen> screens_;
    std::vector<Movie> movies_;
    std::vector<Booking> bookings_;
    int nextMovieIdCounter_ = 1;
    int nextConfirmationCounter_ = 1;

    // Helper methods
    const Movie* findMovieById(const std::string& movieId) const;
    const Screen* findScreenByNumber(int screenNumber) const;
    bool isSeatBooked(const std::string& movieId, const SeatPosition& seat) const;
    std::string generateMovieId();
    std::string generateConfirmationNumber();
    void updateCountersFromData();
};

#endif // CINEMA_SYSTEM_H
