cmake_minimum_required(VERSION 3.14)
project(json_parser CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(json_parser
    json_parser.cpp
    json_value.cpp
    lexer.cpp
)

target_include_directories(json_parser PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(json_parser_demo main.cpp)
target_link_libraries(json_parser_demo json_parser)
