# Trajectory: cpp-collection-implementation

## Overview

Implemented a C++ record processing utility that:

1. Loads records from in-memory source
2. Validates record data
3. Aggregates values by category
4. Generates formatted, sorted output

## Design Decisions

### 1. Data Structures

- Used `std::map<std::string, CategorySummary>` for automatic lexicographical ordering
- `Record` struct with `id`, `category`, `value` members
- `CategorySummary` struct to store aggregated data

### 2. Validation Strategy

- Implemented `validateRecord()` method checking:
  - Non-negative values (`value >= 0`)
  - Non-empty categories
- Throws `InvalidDataException` with descriptive message

### 3. Separation of Concerns

- **RecordProcessor**: Core business logic (validation, aggregation)
- **main.cpp**: Application entry point and error handling
- **Testing**: Independent test suite in `tests/` directory

### 4. Deterministic Behavior

- Uses `std::map` which guarantees sorted iteration
- No multithreading or platform-specific code
- Clear error messages for reproducible failures

## Implementation Steps

### Phase 1: Core Structure

- Defined `Record` and `CategorySummary` structs
- Created `RecordProcessor` class skeleton
- Implemented validation logic

### Phase 2: Aggregation Logic

- Implemented `processRecord()` method
- Added batch processing with `processRecords()`
- Used `std::map` for automatic category management

### Phase 3: Output Generation

- Implemented `generateReport()` with exact formatting
- Ensured lexicographical ordering via `std::map` iteration

### Phase 4: Testing

- Created comprehensive test suite with Catch2
- Covered validation, aggregation, formatting, and edge cases
- Ensured deterministic output ordering

### Phase 5: Integration

- Created `main.cpp` with sample data demonstration
- Added proper error handling and exit codes
- Configured CMake for building and testing

## Recommended Resources

- Read C++ Reference: https://en.cppreference.com/w/
- Read Learn C++: https://www.learncpp.com/
- Watch CMake by Example: https://www.youtube.com/watch?v=y9kSr5enrSk
- Watch Optimizing C++: https://www.youtube.com/watch?v=Qq_WaiwzOtI
