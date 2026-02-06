#include "Screen.h"

Screen::Screen(int screenNumber, int rows, int seatsPerRow)
    : screenNumber_(screenNumber), rows_(rows), seatsPerRow_(seatsPerRow) {}

int Screen::getScreenNumber() const { return screenNumber_; }
int Screen::getRows() const { return rows_; }
int Screen::getSeatsPerRow() const { return seatsPerRow_; }

bool Screen::isValidSeat(char row, int seatNumber) const {
    int rowIndex = static_cast<int>(row - 'A');
    return rowIndex >= 0 && rowIndex < rows_ && seatNumber >= 1 && seatNumber <= seatsPerRow_;
}

void to_json(nlohmann::json& j, const Screen& s) {
    j = nlohmann::json{
        {"number", s.screenNumber_},
        {"rows", s.rows_},
        {"seatsPerRow", s.seatsPerRow_}
    };
}

void from_json(const nlohmann::json& j, Screen& s) {
    j.at("number").get_to(s.screenNumber_);
    j.at("rows").get_to(s.rows_);
    j.at("seatsPerRow").get_to(s.seatsPerRow_);
}
