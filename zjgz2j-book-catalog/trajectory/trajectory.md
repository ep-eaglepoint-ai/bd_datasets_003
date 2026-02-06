# Trajectory

## The Problem

A small library with around 500 books and 100 active patrons needs a system to manage its catalog, track borrowing, and identify overdue books. The system must persist data to files so records survive restarts, and the interface must be simple enough for volunteer staff.

## The Solution

A C++ library catalog system with three core classes (`Book`, `Patron`, `Library`) that handles adding books/patrons, checkout/return operations, search by title/author, overdue detection, and automatic file persistence. A console menu provides the user interface.

## Implementation Steps

1. Created `Book` class (`repository_after/Book.h`, `repository_after/Book.cpp`) with fields for ISBN, title, author, availability status, borrower ID, and due date. Includes pipe-delimited serialization for file storage.

2. Created `Patron` class (`repository_after/Patron.h`, `repository_after/Patron.cpp`) with patron ID, name, and a vector of borrowed book ISBNs. Tracks borrowing count and supports add/remove operations on the borrowed list.

3. Created `DateUtils` module (`repository_after/DateUtils.h`, `repository_after/DateUtils.cpp`) with helper functions for date validation, adding days to a date, and comparing dates. Handles leap years and month boundaries using YYYY-MM-DD string format.

4. Created `Library` class (`repository_after/Library.h`, `repository_after/Library.cpp`) as the central manager. Uses `std::map` for O(log n) lookups by ISBN and patron ID. Implements all required operations: addBook, addPatron, checkoutBook (14-day loan), returnBook, searchByTitle, searchByAuthor (both case-insensitive partial match), getPatronBooks, getOverdueBooks, displayBookInfo, saveData, and loadData. Auto-saves after every mutation.

5. Created console menu (`repository_after/main.cpp`) with 8 options covering all operations. Prompts for current date at startup and validates the input.

6. Created comprehensive test suite (`tests/test_library.cpp`) using Google Test with 70+ test cases covering all classes, edge cases, file persistence, and a large dataset simulation (500 books, 100 patrons).

## Why I Did It This Way (Refinement)

- **`std::map` over `std::unordered_map`**: Chosen for deterministic iteration order when saving to files, making output reproducible. The dataset size (500 books, 100 patrons) makes the O(log n) vs O(1) difference negligible.

- **Pipe-delimited text files**: Chosen over CSV or JSON for simplicity. Pipes are unlikely to appear in book titles or author names, avoiding quoting issues. The format is human-readable for debugging.

- **Auto-save on every mutation**: Rather than relying on the user to save, every addBook, addPatron, checkoutBook, and returnBook call triggers saveData(). This ensures no data loss if the program exits unexpectedly.

- **String-based date comparison**: YYYY-MM-DD strings are lexicographically comparable, so date comparisons use simple string comparison without parsing. Date arithmetic (adding 14 days) handles month/year boundaries and leap years manually.

- **Make over CMake**: Used a simple Makefile for the build system. The project structure is straightforward enough that CMake would be overkill. The Makefile provides clear targets for building, testing, and cleaning.

## Testing

The test suite (`tests/test_library.cpp`) uses Google Test and covers:
- DateUtils: leap year detection, days-in-month, date validation, date arithmetic across months/years/leap years, date comparison
- Book: construction, serialization/deserialization round-trips, edge cases
- Patron: construction, borrow/return tracking, serialization round-trips
- Library: all public methods including addBook, addPatron, checkout, return, search, overdue detection
- File persistence: save/load cycles, auto-save verification, loading from empty/missing directories
- Edge cases: duplicate prevention, empty inputs, checkout-return cycles, large datasets (500 books, 100 patrons)

## Recommended Resources

- [Google Test Primer](https://google.github.io/googletest/primer.html) - Getting started with the Google Test framework
- [C++ Reference - std::map](https://en.cppreference.com/w/cpp/container/map) - Map container documentation
- [C++ Reference - File I/O](https://en.cppreference.com/w/cpp/io/basic_fstream) - File stream operations
- [GNU Make Manual](https://www.gnu.org/software/make/manual/) - Makefile syntax and usage
