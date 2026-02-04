#include "pool.h"
#include <string.h>

#define HEADER_SIZE sizeof(block_header_t)

static size_t align_size(size_t size) {
    return (size + POOL_ALIGNMENT - 1) & ~(POOL_ALIGNMENT - 1);
}

int pool_init(memory_pool_t *pool, void *memory, size_t size) {
    if (!pool || !memory || size < HEADER_SIZE + MIN_ALLOC_SIZE) {
        return -1;
    }
    
    pool->pool_start = memory;
    pool->pool_size = size;
    
    block_header_t *first_block = (block_header_t *)memory;
    first_block->size = size - HEADER_SIZE;
    first_block->is_free = 1;
    first_block->next = NULL;
    
    pool->free_list = first_block;
    pool->allocated = 0;
    pool->free_space = first_block->size;
    
    pthread_mutex_init(&pool->lock, NULL);
    
    return 0;
}

void *pool_alloc(memory_pool_t *pool, size_t size) {
    if (!pool || size == 0) {
        return NULL;
    }
    
    size_t aligned_size = align_size(size);
    
    pthread_mutex_lock(&pool->lock);
    
    block_header_t *current = pool->free_list;
    block_header_t *prev = NULL;
    
    while (current != NULL) {
        if (current->is_free && current->size >= aligned_size) {
            if (current->size > aligned_size + HEADER_SIZE) {
                block_header_t *new_block = (block_header_t *)((char *)current + HEADER_SIZE + aligned_size);
                new_block->size = current->size - aligned_size - HEADER_SIZE;
                new_block->is_free = 1;
                new_block->next = current->next;
                
                current->size = aligned_size;
                current->next = new_block;
            }
            
            current->is_free = 0;
            
            pool->allocated += current->size;
            pool->free_space -= current->size;
            
            pthread_mutex_unlock(&pool->lock);
            
            return (void *)((char *)current + HEADER_SIZE);
        }
        
        prev = current;
        current = current->next;
    }
    
    pthread_mutex_unlock(&pool->lock);
    return NULL;
}

void pool_free(memory_pool_t *pool, void *ptr) {
    if (!pool || !ptr) {
        return;
    }
    
    pthread_mutex_lock(&pool->lock);
    
    block_header_t *block = (block_header_t *)((char *)ptr - HEADER_SIZE);
    
    block->is_free = 1;
    
    pool->allocated -= block->size;
    pool->free_space += block->size;
    
    block_header_t *next_block = (block_header_t *)((char *)block + HEADER_SIZE + block->size);
    
    if (next_block->is_free) {
        block->size += HEADER_SIZE + next_block->size;
        block->next = next_block->next;
    }
    
    block->next = pool->free_list;
    pool->free_list = block;
    
    pthread_mutex_unlock(&pool->lock);
}

void pool_stats(memory_pool_t *pool, size_t *total, size_t *used, size_t *free_space) {
    if (!pool) return;
    
    pthread_mutex_lock(&pool->lock);
    *total = pool->pool_size;
    *used = pool->allocated;
    *free_space = pool->free_space;
    pthread_mutex_unlock(&pool->lock);
}

void pool_destroy(memory_pool_t *pool) {
    if (!pool) return;
    pthread_mutex_destroy(&pool->lock);
    pool->pool_start = NULL;
    pool->free_list = NULL;
}
