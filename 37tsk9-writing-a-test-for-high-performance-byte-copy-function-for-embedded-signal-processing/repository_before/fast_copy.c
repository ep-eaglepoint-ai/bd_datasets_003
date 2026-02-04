#include <stdint.h>
#include <stddef.h>

/**
 * High-performance byte copy for embedded signal processing.
 * Optimized to copy data in 32-bit chunks where possible.
 */
void fast_copy(uint32_t* dest, uint32_t* src, size_t count) {
    // Optimization: Copying 4 bytes at a time
    for (size_t i = 0; i < count; i++) {
        dest[i] = src[i];
    }
}
