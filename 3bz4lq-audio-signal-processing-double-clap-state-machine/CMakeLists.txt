cmake_minimum_required(VERSION 3.10)
project(ClapSwitch)

set(CMAKE_CXX_STANDARD 17)

find_package(GTest REQUIRED)
find_package(nlohmann_json 3.2.0 REQUIRED)

include_directories(repository_after)

# Actual Implementation and Tests
add_library(clap_switch_after repository_after/ClapSwitch.cpp)
add_executable(run_tests tests/test_clap_switch.cpp)
target_link_libraries(run_tests clap_switch_after GTest::GTest GTest::Main)

# Evaluation Tool
add_executable(evaluate evaluation/evaluate.cpp)
target_link_libraries(evaluate nlohmann_json::nlohmann_json)
