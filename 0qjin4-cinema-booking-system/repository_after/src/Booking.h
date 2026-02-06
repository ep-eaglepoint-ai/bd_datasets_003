#ifndef BOOKING_H
#define BOOKING_H

#include <string>
#include <vector>
#include "json.hpp"

struct SeatPosition {
    char row = 'A';
    int seatNumber = 0;

    bool operator==(const SeatPosition& other) const {
        return row == other.row && seatNumber == other.seatNumber;
    }

    bool operator<(const SeatPosition& other) const {
        if (row != other.row) return row < other.row;
        return seatNumber < other.seatNumber;
    }
};

void to_json(nlohmann::json& j, const SeatPosition& sp);
void from_json(const nlohmann::json& j, SeatPosition& sp);

class Booking {
public:
    Booking() = default;
    Booking(const std::string& confirmationNumber, const std::string& movieId,
            int screenNumber, const std::string& showtime,
            const std::vector<SeatPosition>& seats);

    std::string getConfirmationNumber() const;
    std::string getMovieId() const;
    int getScreenNumber() const;
    std::string getShowtime() const;
    std::vector<SeatPosition> getSeats() const;

    friend void to_json(nlohmann::json& j, const Booking& b);
    friend void from_json(const nlohmann::json& j, Booking& b);

private:
    std::string confirmationNumber_;
    std::string movieId_;
    int screenNumber_ = 0;
    std::string showtime_;
    std::vector<SeatPosition> seats_;
};

#endif // BOOKING_H
