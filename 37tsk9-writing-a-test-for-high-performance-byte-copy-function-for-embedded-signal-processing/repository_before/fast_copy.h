#ifndef FAST_COPY_H
#define FAST_COPY_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * High-performance byte copy for embedded signal processing.
 * Optimized to copy data in 32-bit chunks where possible.
 */
void fast_copy(uint32_t* dest, uint32_t* src, size_t count);

#ifdef __cplusplus
}
#endif

#endif // FAST_COPY_H
