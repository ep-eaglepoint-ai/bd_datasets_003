cmake_minimum_required(VERSION 3.10)
project(CppRecordProcessor VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Set output directories
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# Get repository path from environment or use default
if(DEFINED ENV{REPO_PATH})
    set(REPOSITORY_PATH $ENV{REPO_PATH})
    message(STATUS "Building from repository: ${REPOSITORY_PATH}")
else()
    set(REPOSITORY_PATH "repository_after")
    message(STATUS "Using default repository: ${REPOSITORY_PATH}")
endif()

# Compiler warnings
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# ============================================================================
# Main Executable (from selected repository)
# ============================================================================

add_executable(record_processor
    ${REPOSITORY_PATH}/main.cpp
    ${REPOSITORY_PATH}/record_processor.cpp
)

target_include_directories(record_processor
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/${REPOSITORY_PATH}
)

# ============================================================================
# Tests (from tests folder - only if building from repository_after)
# ============================================================================

option(BUILD_TESTS "Build tests" ON)

if(BUILD_TESTS AND REPOSITORY_PATH STREQUAL "repository_after")
    # Check for Catch2
    find_package(Catch2 3.0 QUIET)

    if(NOT Catch2_FOUND)
        include(FetchContent)
        FetchContent_Declare(
            Catch2
            URL https://github.com/catchorg/Catch2/archive/refs/tags/v3.5.2.tar.gz
            DOWNLOAD_EXTRACT_TIMESTAMP TRUE
        )
        FetchContent_MakeAvailable(Catch2)
        set(Catch2_FOUND ON)
    endif()

    if(Catch2_FOUND)
        message(STATUS "Catch2 found, building tests")
        
        add_executable(record_processor_tests
            tests/test_record_processor.cpp
            ${REPOSITORY_PATH}/record_processor.cpp
        )
        
        target_include_directories(record_processor_tests
            PRIVATE
                ${CMAKE_CURRENT_SOURCE_DIR}/${REPOSITORY_PATH}
        )
        
        target_link_libraries(record_processor_tests
            PRIVATE
                Catch2::Catch2WithMain
        )
        
        # Add test discovery
        include(CTest)
        include(Catch)
        catch_discover_tests(record_processor_tests)
        
    else()
        message(STATUS "Catch2 not found, tests will not be built")
    endif()
endif()

# ============================================================================
# Evaluation Tool
# ============================================================================

option(BUILD_EVALUATION "Build evaluation tool" ON)

if(BUILD_EVALUATION)
    add_executable(evaluate
        evaluation/evaluate.cpp
    )
    
    target_include_directories(evaluate
        PRIVATE
            ${CMAKE_CURRENT_SOURCE_DIR}
    )
endif()

# ============================================================================
# Install targets (optional)
# ============================================================================

install(TARGETS record_processor
    RUNTIME DESTINATION bin
)

if(TARGET record_processor_tests)
    install(TARGETS record_processor_tests
        RUNTIME DESTINATION bin
    )
endif()

if(TARGET evaluate)
    install(TARGETS evaluate
        RUNTIME DESTINATION bin
    )
endif()