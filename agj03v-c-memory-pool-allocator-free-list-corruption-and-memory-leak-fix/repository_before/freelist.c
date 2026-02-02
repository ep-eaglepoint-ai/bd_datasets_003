#include "pool.h"
#include <stdio.h>

void freelist_dump(memory_pool_t *pool) {
    if (!pool) return;
    
    pthread_mutex_lock(&pool->lock);
    
    printf("Free list dump:\n");
    block_header_t *current = pool->free_list;
    int count = 0;
    
    while (current != NULL && count < 1000) {
        printf("  Block %d: addr=%p, size=%zu, is_free=%d, next=%p\n",
               count, (void *)current, current->size, current->is_free, (void *)current->next);
        current = current->next;
        count++;
    }
    
    if (count >= 1000) {
        printf("  WARNING: Free list may be corrupted (>1000 entries)\n");
    }
    
    pthread_mutex_unlock(&pool->lock);
}

int freelist_count(memory_pool_t *pool) {
    if (!pool) return 0;
    
    pthread_mutex_lock(&pool->lock);
    
    int count = 0;
    block_header_t *current = pool->free_list;
    
    while (current != NULL) {
        count++;
        current = current->next;
    }
    
    pthread_mutex_unlock(&pool->lock);
    return count;
}

size_t freelist_total_free(memory_pool_t *pool) {
    if (!pool) return 0;
    
    pthread_mutex_lock(&pool->lock);
    
    size_t total = 0;
    block_header_t *current = pool->free_list;
    
    while (current != NULL) {
        total += current->size;
        current = current->next;
    }
    
    pthread_mutex_unlock(&pool->lock);
    return total;
}
