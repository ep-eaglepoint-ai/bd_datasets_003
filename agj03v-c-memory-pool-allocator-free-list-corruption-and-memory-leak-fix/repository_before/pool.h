#ifndef POOL_H
#define POOL_H

#include <stddef.h>
#include <stdint.h>
#include <pthread.h>

#define POOL_ALIGNMENT 8
#define MIN_ALLOC_SIZE 16

typedef struct block_header {
    size_t size;
    int is_free;
    struct block_header *next;
} block_header_t;

typedef struct memory_pool {
    void *pool_start;
    size_t pool_size;
    block_header_t *free_list;
    pthread_mutex_t lock;
    size_t allocated;
    size_t free_space;
} memory_pool_t;

int pool_init(memory_pool_t *pool, void *memory, size_t size);
void *pool_alloc(memory_pool_t *pool, size_t size);
void pool_free(memory_pool_t *pool, void *ptr);
void pool_stats(memory_pool_t *pool, size_t *total, size_t *used, size_t *free_space);
void pool_destroy(memory_pool_t *pool);

#endif
