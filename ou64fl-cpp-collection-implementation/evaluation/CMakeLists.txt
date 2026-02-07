cmake_minimum_required(VERSION 3.10)
project(Evaluator VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(evaluate
    evaluate.cpp
)

target_include_directories(evaluate PRIVATE .)

# For filesystem library (C++17)
target_link_libraries(evaluate stdc++fs)

install(TARGETS evaluate DESTINATION evaluation)
