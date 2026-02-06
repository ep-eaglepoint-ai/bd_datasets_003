#ifndef MOVIE_H
#define MOVIE_H

#include <string>
#include "json.hpp"

class Movie {
public:
    Movie() = default;
    Movie(const std::string& id, const std::string& title, int durationMinutes,
          int screenNumber, const std::string& showtime);

    std::string getId() const;
    std::string getTitle() const;
    int getDurationMinutes() const;
    int getScreenNumber() const;
    std::string getShowtime() const;

    friend void to_json(nlohmann::json& j, const Movie& m);
    friend void from_json(const nlohmann::json& j, Movie& m);

private:
    std::string id_;
    std::string title_;
    int durationMinutes_ = 0;
    int screenNumber_ = 0;
    std::string showtime_;
};

#endif // MOVIE_H
