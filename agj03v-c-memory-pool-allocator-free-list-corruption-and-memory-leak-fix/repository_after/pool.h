#ifndef POOL_H
#define POOL_H

#include <stddef.h>
#include <stdint.h>
#include <pthread.h>

#define POOL_ALIGNMENT 8u
#define MIN_ALLOC_SIZE 16u

// Offset sentinel for singly-linked free list.
#define POOL_NULL_OFFSET 0xFFFFFFFFu

// Block header is 16 bytes (exactly) to keep payload 8-byte aligned.
// Layout uses pool-relative offsets so size is stable across 32/64-bit hosts.
typedef struct block_header {
    uint32_t magic;
    uint32_t size;   // payload bytes
    uint32_t next;   // offset to next header, or POOL_NULL_OFFSET
    uint32_t flags;  // bit0: is_free
} block_header_t;

typedef struct memory_pool {
    void *pool_start;
    size_t pool_size;

    // Offset to first free block header within pool_start.
    uint32_t free_list;

    pthread_mutex_t lock;
    size_t allocated;   // payload bytes currently allocated
    size_t free_space;  // payload bytes currently free (includes reclaimed headers via coalescing)
} memory_pool_t;

int pool_init(memory_pool_t *pool, void *memory, size_t size);
void *pool_alloc(memory_pool_t *pool, size_t size);
void pool_free(memory_pool_t *pool, void *ptr);
void pool_stats(memory_pool_t *pool, size_t *total, size_t *used, size_t *free_space);
size_t pool_largest_free(memory_pool_t *pool);
size_t pool_free_block_count(memory_pool_t *pool);
void pool_destroy(memory_pool_t *pool);

#endif
