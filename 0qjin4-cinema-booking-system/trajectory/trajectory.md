# Trajectory: Building a Cinema Booking System with JSON Persistence

## The Problem: Preventing Double-Booking in a Paper-Based System
A small cinema was using a paper-based booking system that led to overbooking issues. Staff couldn't easily track which seats were available for each movie showing, and customers could accidentally book seats that were already taken. The cinema needed a digital system that:
- Prevents double-booking of seats
- Shows real-time seat availability for each movie showing
- Persists all data between program runs (no database required)
- Works as a simple console application

The challenge was ensuring that when multiple bookings happen, the system correctly tracks which seats are taken for each specific movie showing, even if different movies use the same screen at different times.

## The Solution: Object-Oriented Design with JSON Persistence
We built a C++ console application using an object-oriented architecture:
1. **Core Classes**: `Movie`, `Screen`, `Booking`, and `CinemaSystem` coordinate all operations
2. **JSON Storage**: All data (screens, movies, bookings) is stored in a single JSON file using nlohmann/json library
3. **Seat Validation**: Each booking validates that seats exist within screen bounds and aren't already booked for that specific movie/showtime
4. **Visual Seat Map**: The system displays a grid showing available seats (O) and booked seats (X) for any movie

## Implementation Steps
1. **Class Structure**: Created four main classes:
   - `Movie`: Stores movie ID, title, duration, screen number, and showtime
   - `Screen`: Stores screen number, rows, and seats per row with `isValidSeat()` validation
   - `Booking`: Stores confirmation number, movie ID, screen number, showtime, and collection of seat positions
   - `CinemaSystem`: Coordinates all operations and manages the collections
2. **JSON Serialization**: Used nlohmann/json's friend functions (`to_json`/`from_json`) for each class, allowing automatic conversion between C++ objects and JSON
3. **Double-Booking Prevention**: The `bookSeats()` method:
   - Validates all requested seats are within screen bounds
   - Checks each seat against existing bookings for the same movie ID
   - Only creates the booking if all seats are available
   - Saves to JSON immediately after booking
4. **ID Generation**: Implemented counters for movie IDs (MOV001, MOV002...) and confirmation numbers (CNF001, CNF002...). On startup, the system scans existing data to resume counters from the highest existing ID, ensuring uniqueness even after program restarts.
5. **Seat Map Display**: The `displaySeatMap()` method:
   - Finds the movie and its screen
   - Builds a grid with row letters (A-Z) on the left and seat numbers (1-N) across the top
   - Marks booked seats with 'X' and available seats with 'O'
   - Returns the map as a string for easy testing and display
6. **Persistence Strategy**: Every operation that modifies data (addMovie, bookSeats, cancelBooking) immediately calls `saveToJson()` to ensure data is never lost, even if the program crashes.

## Why I did it this way (Refinement)
**Counter Resumption**: Initially, I considered starting counters at 1 every time the program runs. However, this would cause ID collisions if the JSON file already had data. The `updateCountersFromData()` method scans all existing movies and bookings on startup to find the maximum ID, then resumes from there. This ensures unique IDs across program restarts.

**Immediate Persistence**: I save to JSON after every operation rather than only on exit. This way, if the program crashes or is forcefully terminated, no data is lost. The trade-off is slightly more file I/O, but for a small cinema's usage, this is negligible.

**Seat Map as String**: Instead of printing directly to console in `displaySeatMap()`, I return a string. This makes the method testable (we can verify the output) and allows the main program to format it however needed.

**Separate Movie/Showtime Tracking**: Bookings store both `movieId` and `showtime`. This allows the same seat to be booked for different movies on the same screen, or even the same movie at different showtimes. The `isSeatBooked()` method only checks bookings for the specific movie ID, not just the screen.

## Testing
We created a comprehensive Google Test suite with 87 tests covering:
- **Unit Tests**: Each class (Movie, Screen, Booking) tested independently for construction, getters, and JSON serialization
- **Integration Tests**: Full workflows like adding a movie, booking seats, viewing seat map, canceling booking
- **Edge Cases**: Empty JSON files, malformed JSON, out-of-bounds seats, double-booking attempts, boundary conditions
- **Persistence Tests**: Verifying data survives program restarts, counter resumption works correctly

Tests use temporary JSON files created per test to avoid side effects. The test suite runs in Docker to ensure consistent environments and can test both `repository_before/` and `repository_after/` implementations using environment variables.

---

### Recommended Resources

**1. Read: nlohmann/json Documentation**
Understanding how to serialize C++ objects to JSON and back, including custom types.
*   [nlohmann/json: Basic Usage](https://json.nlohmann.me/api/basic_json/)

**2. Watch: C++ Object-Oriented Design Principles**
Learning how to structure classes and their relationships for maintainable code.
*   [YouTube: C++ OOP Tutorial](https://www.youtube.com/watch?v=wN0x9eZLix4)

**3. Read: Google Test Framework Guide**
Understanding how to write effective unit tests and integration tests in C++.
*   [Google Test Primer](https://google.github.io/googletest/primer.html)

**4. Read: File I/O and Persistence Patterns**
Understanding when to save data and how to handle file operations safely.
*   [Article: C++ File I/O Best Practices](https://en.cppreference.com/w/cpp/io)
