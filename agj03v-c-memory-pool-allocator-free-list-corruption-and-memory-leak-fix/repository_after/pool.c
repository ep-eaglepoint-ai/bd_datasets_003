#include "pool.h"

#include <string.h>

#define POOL_MAGIC 0x504F4F4Cu // 'POOL'
#define FLAG_FREE 0x1u

#define HEADER_SIZE ((uint32_t)sizeof(block_header_t))

#if defined(__STDC_VERSION__) && (__STDC_VERSION__ >= 201112L)
_Static_assert(sizeof(block_header_t) == 16, "block_header_t must be 16 bytes");
_Static_assert((sizeof(block_header_t) % POOL_ALIGNMENT) == 0, "header must be 8-byte aligned size");
#endif

static inline uint32_t align_up_u32(uint32_t value, uint32_t alignment) {
    return (value + alignment - 1u) & ~(alignment - 1u);
}

static inline int is_aligned_ptr(const void *ptr, size_t alignment) {
    return (((uintptr_t)ptr) & (alignment - 1u)) == 0u;
}

static inline block_header_t *hdr_from_offset(memory_pool_t *pool, uint32_t offset) {
    if (!pool || offset == POOL_NULL_OFFSET) return NULL;
    if (offset + HEADER_SIZE > pool->pool_size) return NULL;
    return (block_header_t *)((uint8_t *)pool->pool_start + offset);
}

static inline uint32_t offset_from_hdr(memory_pool_t *pool, const block_header_t *hdr) {
    return (uint32_t)((const uint8_t *)hdr - (const uint8_t *)pool->pool_start);
}

static inline uint32_t block_end_offset_u32(uint32_t block_offset, uint32_t payload_size) {
    return block_offset + HEADER_SIZE + payload_size;
}

static int header_is_sane(memory_pool_t *pool, const block_header_t *hdr, uint32_t hdr_offset) {
    if (!pool || !hdr) return 0;
    if (hdr->magic != POOL_MAGIC) return 0;
    if ((hdr_offset % POOL_ALIGNMENT) != 0u) return 0;
    if (hdr->size < MIN_ALLOC_SIZE) return 0; // allocations are always at least MIN_ALLOC_SIZE

    uint64_t end = (uint64_t)hdr_offset + (uint64_t)HEADER_SIZE + (uint64_t)hdr->size;
    if (end > pool->pool_size) return 0;

    // next offset, if present, must be within pool and aligned.
    if (hdr->next != POOL_NULL_OFFSET) {
        if ((hdr->next % POOL_ALIGNMENT) != 0u) return 0;
        if (hdr->next + HEADER_SIZE > pool->pool_size) return 0;
    }

    return 1;
}

int pool_init(memory_pool_t *pool, void *memory, size_t size) {
    if (!pool || !memory) {
        return -1;
    }

    if (!is_aligned_ptr(memory, POOL_ALIGNMENT)) {
        return -1;
    }

    // Round pool size down to alignment.
    size_t usable_size = size & ~(size_t)(POOL_ALIGNMENT - 1u);
    if (usable_size < (size_t)HEADER_SIZE + (size_t)MIN_ALLOC_SIZE) {
        return -1;
    }

    pool->pool_start = memory;
    pool->pool_size = usable_size;

    block_header_t *first = (block_header_t *)memory;
    first->magic = POOL_MAGIC;
    first->size = (uint32_t)(usable_size - (size_t)HEADER_SIZE);
    first->next = POOL_NULL_OFFSET;
    first->flags = FLAG_FREE;

    pool->free_list = 0u;
    pool->allocated = 0u;
    pool->free_space = first->size;

    pthread_mutex_init(&pool->lock, NULL);
    return 0;
}

void *pool_alloc(memory_pool_t *pool, size_t size) {
    if (!pool || size == 0u) {
        return NULL;
    }

    uint32_t request = (uint32_t)size;
    if (request < MIN_ALLOC_SIZE) request = MIN_ALLOC_SIZE;
    request = align_up_u32(request, POOL_ALIGNMENT);

    pthread_mutex_lock(&pool->lock);

    uint32_t prev_off = POOL_NULL_OFFSET;
    uint32_t cur_off = pool->free_list;

    while (cur_off != POOL_NULL_OFFSET) {
        block_header_t *cur = hdr_from_offset(pool, cur_off);
        if (!cur || !header_is_sane(pool, cur, cur_off)) {
            // Corrupted list; fail safe.
            pthread_mutex_unlock(&pool->lock);
            return NULL;
        }

        if ((cur->flags & FLAG_FREE) && cur->size >= request) {
            uint32_t cur_payload = cur->size;
            uint32_t cur_next = cur->next;

            // Decide whether to split.
            uint32_t replacement_off = cur_next;
            int do_split = (cur_payload >= request + HEADER_SIZE + MIN_ALLOC_SIZE);
            if (do_split) {
                uint32_t new_off = cur_off + HEADER_SIZE + request;
                block_header_t *new_hdr = hdr_from_offset(pool, new_off);
                if (!new_hdr) {
                    pthread_mutex_unlock(&pool->lock);
                    return NULL;
                }

                new_hdr->magic = POOL_MAGIC;
                new_hdr->size = cur_payload - request - HEADER_SIZE;
                new_hdr->next = cur_next;
                new_hdr->flags = FLAG_FREE;

                replacement_off = new_off;

                cur->size = request;

                // free_space loses payload allocated + header carved out for remainder.
                pool->free_space -= (size_t)request;
                pool->free_space -= (size_t)HEADER_SIZE;
            } else {
                // Allocate entire block.
                pool->free_space -= (size_t)cur_payload;
            }

            cur->flags &= ~FLAG_FREE;
            cur->next = POOL_NULL_OFFSET;

            // Remove allocated block from free list (replace with remainder or next).
            if (prev_off == POOL_NULL_OFFSET) {
                pool->free_list = replacement_off;
            } else {
                block_header_t *prev = hdr_from_offset(pool, prev_off);
                if (!prev || !header_is_sane(pool, prev, prev_off)) {
                    pthread_mutex_unlock(&pool->lock);
                    return NULL;
                }
                prev->next = replacement_off;
            }

            pool->allocated += (size_t)cur->size;

            void *payload = (void *)((uint8_t *)cur + HEADER_SIZE);
            pthread_mutex_unlock(&pool->lock);
            return payload;
        }

        prev_off = cur_off;
        cur_off = cur->next;
    }

    pthread_mutex_unlock(&pool->lock);
    return NULL;
}

static void coalesce_forward(memory_pool_t *pool, block_header_t *hdr, uint32_t hdr_off) {
    // Merge hdr with its next free neighbor while physically adjacent.
    while (hdr && (hdr->flags & FLAG_FREE) && hdr->next != POOL_NULL_OFFSET) {
        uint32_t next_off = hdr->next;
        block_header_t *next = hdr_from_offset(pool, next_off);
        if (!next || !header_is_sane(pool, next, next_off)) {
            return;
        }
        if (!(next->flags & FLAG_FREE)) {
            return;
        }

        uint32_t end_off = block_end_offset_u32(hdr_off, hdr->size);
        if (end_off != next_off) {
            return;
        }

        // Merge: hdr absorbs next header + payload.
        hdr->size = hdr->size + HEADER_SIZE + next->size;
        hdr->next = next->next;
        pool->free_space += (size_t)HEADER_SIZE;
    }
}

void pool_free(memory_pool_t *pool, void *ptr) {
    if (!pool || !ptr) {
        return;
    }

    pthread_mutex_lock(&pool->lock);

    uint8_t *start = (uint8_t *)pool->pool_start;
    uint8_t *end = start + pool->pool_size;
    uint8_t *p = (uint8_t *)ptr;

    // Basic bounds + alignment checks.
    if (p < start + HEADER_SIZE || p >= end) {
        pthread_mutex_unlock(&pool->lock);
        return;
    }
    if (!is_aligned_ptr(p, POOL_ALIGNMENT)) {
        pthread_mutex_unlock(&pool->lock);
        return;
    }

    uint32_t hdr_off = (uint32_t)(p - start - HEADER_SIZE);
    if ((hdr_off % POOL_ALIGNMENT) != 0u || hdr_off + HEADER_SIZE > pool->pool_size) {
        pthread_mutex_unlock(&pool->lock);
        return;
    }

    block_header_t *hdr = hdr_from_offset(pool, hdr_off);
    if (!hdr || !header_is_sane(pool, hdr, hdr_off)) {
        pthread_mutex_unlock(&pool->lock);
        return;
    }

    if (hdr->flags & FLAG_FREE) {
        // Double-free detected; ignore.
        pthread_mutex_unlock(&pool->lock);
        return;
    }

    hdr->flags |= FLAG_FREE;
    pool->allocated -= (size_t)hdr->size;
    pool->free_space += (size_t)hdr->size;

    // Insert into address-sorted free list.
    uint32_t prev_off = POOL_NULL_OFFSET;
    uint32_t cur_off = pool->free_list;

    while (cur_off != POOL_NULL_OFFSET && cur_off < hdr_off) {
        block_header_t *cur = hdr_from_offset(pool, cur_off);
        if (!cur || !header_is_sane(pool, cur, cur_off)) {
            pthread_mutex_unlock(&pool->lock);
            return;
        }
        prev_off = cur_off;
        cur_off = cur->next;
    }

    hdr->next = cur_off;
    if (prev_off == POOL_NULL_OFFSET) {
        pool->free_list = hdr_off;
    } else {
        block_header_t *prev = hdr_from_offset(pool, prev_off);
        if (!prev || !header_is_sane(pool, prev, prev_off)) {
            pthread_mutex_unlock(&pool->lock);
            return;
        }
        prev->next = hdr_off;
    }

    // Coalesce with next first, then with prev, then forward again.
    coalesce_forward(pool, hdr, hdr_off);

    if (prev_off != POOL_NULL_OFFSET) {
        block_header_t *prev = hdr_from_offset(pool, prev_off);
        if (prev && header_is_sane(pool, prev, prev_off) && (prev->flags & FLAG_FREE)) {
            uint32_t prev_end = block_end_offset_u32(prev_off, prev->size);
            if (prev_end == hdr_off) {
                prev->size = prev->size + HEADER_SIZE + hdr->size;
                prev->next = hdr->next;
                pool->free_space += (size_t)HEADER_SIZE;

                // After merging into prev, continue coalescing forward.
                coalesce_forward(pool, prev, prev_off);
            }
        }
    }

    pthread_mutex_unlock(&pool->lock);
}

void pool_stats(memory_pool_t *pool, size_t *total, size_t *used, size_t *free_space) {
    if (!pool) return;

    pthread_mutex_lock(&pool->lock);

    if (total) *total = pool->pool_size;
    if (used) *used = pool->allocated;
    if (free_space) *free_space = pool->free_space;

    pthread_mutex_unlock(&pool->lock);
}

void pool_destroy(memory_pool_t *pool) {
    if (!pool) return;

    pthread_mutex_destroy(&pool->lock);
    pool->pool_start = NULL;
    pool->pool_size = 0u;
    pool->free_list = POOL_NULL_OFFSET;
    pool->allocated = 0u;
    pool->free_space = 0u;
}
