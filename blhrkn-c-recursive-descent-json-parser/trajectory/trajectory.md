# Trajectory: Recursive Descent JSON Parser

## 1. Code Audit & Bottleneck Analysis
The initial phase involved a thorough audit of the `repository_before` codebase to identify performance bottlenecks and stability issues. The primary findings were excessive memory allocation due to `std::string` copying during tokenization and parsing, and a lack of recursion depth limits causing stack overflows on deep nesting.
- [Profiling C++ Applications](https://en.wikipedia.org/wiki/Profiling_(computer_programming))
- [String Copying Overhead](https://stackoverflow.com/questions/34218040/how-expensive-is-stdstring-copy-construction)

## 2. Data Model Optimization (Zero-Copy Architecture)
To address the memory overhead, the data model was refactored to use `std::string_view` for string handling. This allows the parser to reference the input buffer directly without allocating new memory for each token, significantly reducing heap usage and improving cache locality.
- [std::string_view Documentation](https://en.cppreference.com/w/cpp/string/basic_string_view)
- [Zero-Copy Parsing Techniques](https://lemire.me/blog/2012/06/26/which-is-fastest-read-fread-ifstream-or-mmap/)

## 3. Container & Algorithm efficacy
The `JsonObject` implementation was switched from `std::map` (red-black tree, O(log n)) to `std::unordered_map` (hash table, O(1) average) to improve lookup performance. Additionally, `std::vector::reserve` was implemented for array parsing to minimize reallocation costs during element insertion.
- [std::unordered_map vs std::map](https://thispointer.com/map-vs-unordered_map-in-c/)
- [Vector Reallocation Strategies](https://en.cppreference.com/w/cpp/vector/reserve)

## 4. Stability & Correctness Enhancements
To prevent stack overflow crashes, a strict recursion depth limit (default 1000) was enforced. Complete Unicode support was added, ensuring correct parsing of UTF-16 surrogate pairs and conversion to UTF-8, addressing the data corruption issues with international characters.
- [Recursion Depth Limits](https://stackoverflow.com/questions/166687/recursion-depth-limit-in-c)
- [UTF-16 Surrogate Pairs](https://en.wikipedia.org/wiki/UTF-16#Code_points_U.2B010000_to_U.2B10FFFF)

## 5. Verification & Observability
A comprehensive test suite was developed using `pytest` to validate both correctness and performance. The suite includes tests for deep nesting, large files, and unicode handling, run within a Dockerized environment to ensure consistency. Metrics such as parse time are captured to verify performance improvements.
- [Pytest Documentation](https://docs.pytest.org/en/7.1.x/)
- [Dockerized Testing Patterns](https://docs.docker.com/language/python/run-tests/)
