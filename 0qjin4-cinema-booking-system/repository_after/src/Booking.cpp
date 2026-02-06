#include "Booking.h"

void to_json(nlohmann::json& j, const SeatPosition& sp) {
    j = nlohmann::json{
        {"row", std::string(1, sp.row)},
        {"seatNumber", sp.seatNumber}
    };
}

void from_json(const nlohmann::json& j, SeatPosition& sp) {
    std::string rowStr = j.at("row").get<std::string>();
    sp.row = rowStr.empty() ? 'A' : rowStr[0];
    j.at("seatNumber").get_to(sp.seatNumber);
}

Booking::Booking(const std::string& confirmationNumber, const std::string& movieId,
                 int screenNumber, const std::string& showtime,
                 const std::vector<SeatPosition>& seats)
    : confirmationNumber_(confirmationNumber), movieId_(movieId),
      screenNumber_(screenNumber), showtime_(showtime), seats_(seats) {}

std::string Booking::getConfirmationNumber() const { return confirmationNumber_; }
std::string Booking::getMovieId() const { return movieId_; }
int Booking::getScreenNumber() const { return screenNumber_; }
std::string Booking::getShowtime() const { return showtime_; }
std::vector<SeatPosition> Booking::getSeats() const { return seats_; }

void to_json(nlohmann::json& j, const Booking& b) {
    j = nlohmann::json{
        {"confirmationNumber", b.confirmationNumber_},
        {"movieId", b.movieId_},
        {"screenNumber", b.screenNumber_},
        {"showtime", b.showtime_},
        {"seats", b.seats_}
    };
}

void from_json(const nlohmann::json& j, Booking& b) {
    j.at("confirmationNumber").get_to(b.confirmationNumber_);
    j.at("movieId").get_to(b.movieId_);
    j.at("screenNumber").get_to(b.screenNumber_);
    j.at("showtime").get_to(b.showtime_);
    j.at("seats").get_to(b.seats_);
}
