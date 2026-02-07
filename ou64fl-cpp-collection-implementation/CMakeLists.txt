cmake_minimum_required(VERSION 3.10)
project(CppRecordProcessor VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Set output directories
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# Compiler warnings
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(-Wall -Wextra -Wpedantic)
elseif(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
    add_compile_options(/W4)
endif()

# ============================================================================
# Main Executable (from repository_after)
# ============================================================================

add_executable(record_processor
    repository_after/main.cpp
    repository_after/record_processor.cpp
)

target_include_directories(record_processor
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/repository_after
)

# ============================================================================
# Tests (from tests folder)
# ============================================================================

option(BUILD_TESTS "Build tests" ON)

if(BUILD_TESTS)
    # Check for Catch2
    find_package(Catch2 3.0 QUIET)
    
    if(Catch2_FOUND)
        message(STATUS "Catch2 found, building tests")
        
        add_executable(record_processor_tests
            tests/test_record_processor.cpp
            repository_after/record_processor.cpp
        )
        
        target_include_directories(record_processor_tests
            PRIVATE
                ${CMAKE_CURRENT_SOURCE_DIR}/repository_after
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
        message(STATUS "To enable tests, install Catch2: sudo apt-get install libcatch2-dev")
    endif()
endif()

# ============================================================================
# Evaluation Tool
# ============================================================================

option(BUILD_EVALUATION "Build evaluation tool" ON)

if(BUILD_EVALUATION)
    # Check for filesystem library (C++17)
    if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
        # Check if we need -lstdc++fs for older compilers
        if(CMAKE_CXX_COMPILER_VERSION VERSION_LESS 9.0)
            set(FILESYSTEM_LIB stdc++fs)
        endif()
    endif()
    
    add_executable(evaluate
        evaluation/evaluate.cpp
    )
    
    target_include_directories(evaluate
        PRIVATE
            ${CMAKE_CURRENT_SOURCE_DIR}
    )
    
    if(FILESYSTEM_LIB)
        target_link_libraries(evaluate ${FILESYSTEM_LIB})
    endif()
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