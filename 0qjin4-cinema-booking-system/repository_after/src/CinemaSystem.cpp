#include "CinemaSystem.h"
#include <fstream>
#include <sstream>
#include <iomanip>
#include <iostream>
#include <algorithm>
#include <stdexcept>

CinemaSystem::CinemaSystem(const std::string& jsonFilePath)
    : jsonFilePath_(jsonFilePath) {
    loadFromJson();
}

// --- Movie Operations ---

std::string CinemaSystem::addMovie(const std::string& title, int durationMinutes,
                                   int screenNumber, const std::string& showtime) {
    const Screen* screen = findScreenByNumber(screenNumber);
    if (!screen) {
        throw std::invalid_argument("Screen " + std::to_string(screenNumber) + " does not exist.");
    }

    std::string movieId = generateMovieId();
    movies_.emplace_back(movieId, title, durationMinutes, screenNumber, showtime);
    saveToJson();
    return movieId;
}

// --- Seat Map ---

std::string CinemaSystem::displaySeatMap(const std::string& movieId) const {
    const Movie* movie = findMovieById(movieId);
    if (!movie) {
        throw std::invalid_argument("Movie with ID " + movieId + " not found.");
    }

    const Screen* screen = findScreenByNumber(movie->getScreenNumber());
    if (!screen) {
        throw std::runtime_error("Screen " + std::to_string(movie->getScreenNumber()) +
                                 " not found for movie " + movieId + ".");
    }

    std::ostringstream oss;

    // Header: seat numbers
    oss << "   ";
    for (int s = 1; s <= screen->getSeatsPerRow(); ++s) {
        oss << std::setw(3) << s;
    }
    oss << "\n";

    // Rows
    for (int r = 0; r < screen->getRows(); ++r) {
        char rowLetter = static_cast<char>('A' + r);
        oss << " " << rowLetter << " ";
        for (int s = 1; s <= screen->getSeatsPerRow(); ++s) {
            SeatPosition sp{rowLetter, s};
            if (isSeatBooked(movieId, sp)) {
                oss << "  X";
            } else {
                oss << "  O";
            }
        }
        oss << "\n";
    }

    return oss.str();
}

// --- Booking Operations ---

std::string CinemaSystem::bookSeats(const std::string& movieId,
                                    const std::vector<SeatPosition>& seats) {
    if (seats.empty()) {
        throw std::invalid_argument("No seats specified for booking.");
    }

    const Movie* movie = findMovieById(movieId);
    if (!movie) {
        throw std::invalid_argument("Movie with ID " + movieId + " not found.");
    }

    const Screen* screen = findScreenByNumber(movie->getScreenNumber());
    if (!screen) {
        throw std::runtime_error("Screen not found for movie " + movieId + ".");
    }

    // Validate all seats are within screen bounds
    for (const auto& seat : seats) {
        if (!screen->isValidSeat(seat.row, seat.seatNumber)) {
            throw std::invalid_argument(
                "Seat " + std::string(1, seat.row) + std::to_string(seat.seatNumber) +
                " is out of bounds for screen " + std::to_string(screen->getScreenNumber()) + ".");
        }
    }

    // Check none are already booked
    for (const auto& seat : seats) {
        if (isSeatBooked(movieId, seat)) {
            throw std::invalid_argument(
                "Seat " + std::string(1, seat.row) + std::to_string(seat.seatNumber) +
                " is already booked for movie " + movieId + ".");
        }
    }

    std::string confirmationNumber = generateConfirmationNumber();
    bookings_.emplace_back(confirmationNumber, movieId, movie->getScreenNumber(),
                           movie->getShowtime(), seats);
    saveToJson();
    return confirmationNumber;
}

bool CinemaSystem::cancelBooking(const std::string& confirmationNumber) {
    auto it = std::find_if(bookings_.begin(), bookings_.end(),
                           [&](const Booking& b) {
                               return b.getConfirmationNumber() == confirmationNumber;
                           });
    if (it == bookings_.end()) {
        return false;
    }
    bookings_.erase(it);
    saveToJson();
    return true;
}

// --- Persistence ---

void CinemaSystem::saveToJson() const {
    nlohmann::json j;
    j["screens"] = screens_;
    j["movies"] = movies_;
    j["bookings"] = bookings_;

    std::ofstream ofs(jsonFilePath_);
    if (!ofs.is_open()) {
        throw std::runtime_error("Cannot open file for writing: " + jsonFilePath_);
    }
    ofs << j.dump(2);
}

void CinemaSystem::loadFromJson() {
    std::ifstream ifs(jsonFilePath_);
    if (!ifs.is_open()) {
        // File doesn't exist — start with empty collections
        screens_.clear();
        movies_.clear();
        bookings_.clear();
        return;
    }

    nlohmann::json j;
    try {
        ifs >> j;
    } catch (const nlohmann::json::parse_error& e) {
        throw std::runtime_error("Failed to parse JSON file: " + std::string(e.what()));
    }

    if (j.contains("screens")) {
        screens_ = j["screens"].get<std::vector<Screen>>();
    }
    if (j.contains("movies")) {
        movies_ = j["movies"].get<std::vector<Movie>>();
    }
    if (j.contains("bookings")) {
        bookings_ = j["bookings"].get<std::vector<Booking>>();
    }

    updateCountersFromData();
}

// --- Accessors ---

const std::vector<Screen>& CinemaSystem::getScreens() const { return screens_; }
const std::vector<Movie>& CinemaSystem::getMovies() const { return movies_; }
const std::vector<Booking>& CinemaSystem::getBookings() const { return bookings_; }

// --- Helpers ---

const Movie* CinemaSystem::findMovieById(const std::string& movieId) const {
    auto it = std::find_if(movies_.begin(), movies_.end(),
                           [&](const Movie& m) { return m.getId() == movieId; });
    return (it != movies_.end()) ? &(*it) : nullptr;
}

const Screen* CinemaSystem::findScreenByNumber(int screenNumber) const {
    auto it = std::find_if(screens_.begin(), screens_.end(),
                           [&](const Screen& s) { return s.getScreenNumber() == screenNumber; });
    return (it != screens_.end()) ? &(*it) : nullptr;
}

bool CinemaSystem::isSeatBooked(const std::string& movieId, const SeatPosition& seat) const {
    for (const auto& booking : bookings_) {
        if (booking.getMovieId() != movieId) continue;
        for (const auto& bookedSeat : booking.getSeats()) {
            if (bookedSeat == seat) return true;
        }
    }
    return false;
}

std::string CinemaSystem::generateMovieId() {
    std::ostringstream oss;
    oss << "MOV" << std::setw(3) << std::setfill('0') << nextMovieIdCounter_++;
    return oss.str();
}

std::string CinemaSystem::generateConfirmationNumber() {
    std::ostringstream oss;
    oss << "CNF" << std::setw(3) << std::setfill('0') << nextConfirmationCounter_++;
    return oss.str();
}

void CinemaSystem::updateCountersFromData() {
    // Parse existing IDs to find max counters
    for (const auto& movie : movies_) {
        const std::string& id = movie.getId();
        if (id.size() > 3 && id.substr(0, 3) == "MOV") {
            try {
                int num = std::stoi(id.substr(3));
                if (num >= nextMovieIdCounter_) {
                    nextMovieIdCounter_ = num + 1;
                }
            } catch (...) {
                // Ignore malformed IDs
            }
        }
    }

    for (const auto& booking : bookings_) {
        const std::string& cn = booking.getConfirmationNumber();
        if (cn.size() > 3 && cn.substr(0, 3) == "CNF") {
            try {
                int num = std::stoi(cn.substr(3));
                if (num >= nextConfirmationCounter_) {
                    nextConfirmationCounter_ = num + 1;
                }
            } catch (...) {
                // Ignore malformed confirmation numbers
            }
        }
    }
}
