#include <iostream>
#include <string>
#include <vector>
#include <limits>
#include "CinemaSystem.h"

void clearInputLine() {
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
}

void addMovie(CinemaSystem& system) {
    std::string title, showtime;
    int duration, screenNumber;

    std::cout << "\n--- Add Movie ---\n";
    std::cout << "Title: ";
    clearInputLine();
    std::getline(std::cin, title);

    std::cout << "Duration (minutes): ";
    std::cin >> duration;

    std::cout << "Screen number: ";
    std::cin >> screenNumber;

    std::cout << "Showtime (e.g. 2026-02-06 19:00): ";
    clearInputLine();
    std::getline(std::cin, showtime);

    try {
        std::string movieId = system.addMovie(title, duration, screenNumber, showtime);
        std::cout << "Movie added successfully. Movie ID: " << movieId << "\n";
    } catch (const std::exception& e) {
        std::cout << "Error: " << e.what() << "\n";
    }
}

void viewSeatMap(CinemaSystem& system) {
    std::string movieId;
    std::cout << "\n--- View Seat Map ---\n";

    // List available movies
    const auto& movies = system.getMovies();
    if (movies.empty()) {
        std::cout << "No movies currently showing.\n";
        return;
    }

    std::cout << "Available movies:\n";
    for (const auto& m : movies) {
        std::cout << "  " << m.getId() << " - " << m.getTitle()
                  << " (Screen " << m.getScreenNumber()
                  << ", " << m.getShowtime() << ")\n";
    }

    std::cout << "Enter Movie ID: ";
    std::cin >> movieId;

    try {
        std::string seatMap = system.displaySeatMap(movieId);
        std::cout << "\nSeat Map for " << movieId << ":\n";
        std::cout << "(O = Available, X = Booked)\n\n";
        std::cout << seatMap;
    } catch (const std::exception& e) {
        std::cout << "Error: " << e.what() << "\n";
    }
}

void bookSeats(CinemaSystem& system) {
    std::string movieId;
    int numSeats;

    std::cout << "\n--- Book Seats ---\n";
    std::cout << "Enter Movie ID: ";
    std::cin >> movieId;

    std::cout << "Number of seats to book: ";
    std::cin >> numSeats;

    std::vector<SeatPosition> seats;
    for (int i = 0; i < numSeats; ++i) {
        char row;
        int seatNum;
        std::cout << "Seat " << (i + 1) << " - Row (A-Z): ";
        std::cin >> row;
        row = static_cast<char>(std::toupper(row));
        std::cout << "Seat " << (i + 1) << " - Seat number: ";
        std::cin >> seatNum;
        seats.push_back({row, seatNum});
    }

    try {
        std::string confirmation = system.bookSeats(movieId, seats);
        std::cout << "Booking successful! Confirmation number: " << confirmation << "\n";
    } catch (const std::exception& e) {
        std::cout << "Error: " << e.what() << "\n";
    }
}

void cancelBooking(CinemaSystem& system) {
    std::string confirmationNumber;
    std::cout << "\n--- Cancel Booking ---\n";
    std::cout << "Enter confirmation number: ";
    std::cin >> confirmationNumber;

    if (system.cancelBooking(confirmationNumber)) {
        std::cout << "Booking " << confirmationNumber << " has been cancelled.\n";
    } else {
        std::cout << "Booking with confirmation number " << confirmationNumber << " not found.\n";
    }
}

int main() {
    std::string dataPath = "data/cinema_data.json";

    std::cout << "=== Cinema Booking System ===\n";
    std::cout << "Loading data from: " << dataPath << "\n";

    CinemaSystem system(dataPath);

    bool running = true;
    while (running) {
        std::cout << "\n--- Main Menu ---\n";
        std::cout << "1. Add Movie\n";
        std::cout << "2. View Seat Map\n";
        std::cout << "3. Book Seats\n";
        std::cout << "4. Cancel Booking\n";
        std::cout << "5. Exit\n";
        std::cout << "Choice: ";

        int choice;
        if (!(std::cin >> choice)) {
            std::cin.clear();
            clearInputLine();
            std::cout << "Invalid input. Please enter a number.\n";
            continue;
        }

        switch (choice) {
            case 1: addMovie(system); break;
            case 2: viewSeatMap(system); break;
            case 3: bookSeats(system); break;
            case 4: cancelBooking(system); break;
            case 5:
                running = false;
                std::cout << "Goodbye!\n";
                break;
            default:
                std::cout << "Invalid option. Please choose 1-5.\n";
                break;
        }
    }

    return 0;
}
