#ifndef SCREEN_H
#define SCREEN_H

#include "json.hpp"

class Screen {
public:
    Screen() = default;
    Screen(int screenNumber, int rows, int seatsPerRow);

    int getScreenNumber() const;
    int getRows() const;
    int getSeatsPerRow() const;

    bool isValidSeat(char row, int seatNumber) const;

    friend void to_json(nlohmann::json& j, const Screen& s);
    friend void from_json(const nlohmann::json& j, Screen& s);

private:
    int screenNumber_ = 0;
    int rows_ = 0;
    int seatsPerRow_ = 0;
};

#endif // SCREEN_H
