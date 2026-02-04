#include "pool.h"

#include <stdio.h>

#define HEADER_SIZE ((uint32_t)sizeof(block_header_t))
#define FLAG_FREE 0x1u

static inline block_header_t *hdr_from_offset(memory_pool_t *pool, uint32_t offset) {
    if (!pool || offset == POOL_NULL_OFFSET) return NULL;
    if (offset + HEADER_SIZE > pool->pool_size) return NULL;
    return (block_header_t *)((uint8_t *)pool->pool_start + offset);
}

void freelist_dump(memory_pool_t *pool) {
    if (!pool) return;

    pthread_mutex_lock(&pool->lock);

    printf("Free list dump:\n");
    uint32_t cur_off = pool->free_list;
    int count = 0;

    while (cur_off != POOL_NULL_OFFSET && count < 1000) {
        block_header_t *cur = hdr_from_offset(pool, cur_off);
        if (!cur) {
            printf("  Block %d: <invalid offset %u>\n", count, cur_off);
            break;
        }
        printf("  Block %d: off=%u, addr=%p, size=%u, is_free=%u, next_off=%u\n",
               count,
               cur_off,
               (void *)cur,
               cur->size,
               (unsigned)((cur->flags & FLAG_FREE) != 0u),
               cur->next);

        cur_off = cur->next;
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
    uint32_t cur_off = pool->free_list;

    while (cur_off != POOL_NULL_OFFSET && count < 100000) {
        block_header_t *cur = hdr_from_offset(pool, cur_off);
        if (!cur) break;
        if (cur->flags & FLAG_FREE) count++;
        cur_off = cur->next;
    }

    pthread_mutex_unlock(&pool->lock);
    return count;
}

size_t freelist_total_free(memory_pool_t *pool) {
    if (!pool) return 0;

    pthread_mutex_lock(&pool->lock);

    size_t total = 0;
    uint32_t cur_off = pool->free_list;
    int count = 0;

    while (cur_off != POOL_NULL_OFFSET && count < 100000) {
        block_header_t *cur = hdr_from_offset(pool, cur_off);
        if (!cur) break;
        if (cur->flags & FLAG_FREE) total += (size_t)cur->size;
        cur_off = cur->next;
        count++;
    }

    pthread_mutex_unlock(&pool->lock);
    return total;
}
