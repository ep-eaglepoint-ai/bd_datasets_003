#include "Movie.h"

Movie::Movie(const std::string& id, const std::string& title, int durationMinutes,
             int screenNumber, const std::string& showtime)
    : id_(id), title_(title), durationMinutes_(durationMinutes),
      screenNumber_(screenNumber), showtime_(showtime) {}

std::string Movie::getId() const { return id_; }
std::string Movie::getTitle() const { return title_; }
int Movie::getDurationMinutes() const { return durationMinutes_; }
int Movie::getScreenNumber() const { return screenNumber_; }
std::string Movie::getShowtime() const { return showtime_; }

void to_json(nlohmann::json& j, const Movie& m) {
    j = nlohmann::json{
        {"id", m.id_},
        {"title", m.title_},
        {"durationMinutes", m.durationMinutes_},
        {"screenNumber", m.screenNumber_},
        {"showtime", m.showtime_}
    };
}

void from_json(const nlohmann::json& j, Movie& m) {
    j.at("id").get_to(m.id_);
    j.at("title").get_to(m.title_);
    j.at("durationMinutes").get_to(m.durationMinutes_);
    j.at("screenNumber").get_to(m.screenNumber_);
    j.at("showtime").get_to(m.showtime_);
}
