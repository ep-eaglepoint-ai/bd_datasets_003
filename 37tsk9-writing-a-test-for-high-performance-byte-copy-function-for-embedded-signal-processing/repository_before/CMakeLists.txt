cmake_minimum_required(VERSION 3.10)
project(FastCopyTool C)

set(CMAKE_C_STANDARD 11)

# Build the executable
add_executable(fast_copy_bin main.c fast_copy.c)