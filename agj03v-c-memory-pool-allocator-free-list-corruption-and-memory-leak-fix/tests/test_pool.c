#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "pool.h"

// freelist helpers are implemented in freelist.c (not part of public API here)
extern int freelist_count(memory_pool_t *pool);
extern size_t freelist_total_free(memory_pool_t *pool);

// Fragmentation metrics are only available in the fixed (repository_after) implementation.
#ifdef POOL_NULL_OFFSET
extern size_t pool_largest_free(memory_pool_t *pool);
extern size_t pool_free_block_count(memory_pool_t *pool);
#endif

#define ASSERT_TRUE(expr) do { \
    if (!(expr)) { \
        fprintf(stderr, "ASSERT_TRUE failed: %s (%s:%d)\n", #expr, __FILE__, __LINE__); \
        return 1; \
    } \
} while (0)

#define ASSERT_EQ_U64(a, b) do { \
    uint64_t _a = (uint64_t)(a); \
    uint64_t _b = (uint64_t)(b); \
    if (_a != _b) { \
        fprintf(stderr, "ASSERT_EQ failed: %s=%llu %s=%llu (%s:%d)\n", #a, (unsigned long long)_a, #b, (unsigned long long)_b, __FILE__, __LINE__); \
        return 1; \
    } \
} while (0)

static int is_aligned_8(const void *p) {
    return (((uintptr_t)p) & 7u) == 0u;
}

static void stats(memory_pool_t *pool, size_t *total, size_t *used, size_t *free_space) {
    size_t t = 0, u = 0, f = 0;
    pool_stats(pool, &t, &u, &f);
    if (total) *total = t;
    if (used) *used = u;
    if (free_space) *free_space = f;
}

static int test_init_alignment_and_size(void) {
    memory_pool_t pool;

    static uint8_t mem[128] __attribute__((aligned(8)));

    // Unaligned init must fail.
    ASSERT_TRUE(pool_init(&pool, mem + 1, sizeof(mem) - 1) != 0);

    // Too small must fail.
    ASSERT_TRUE(pool_init(&pool, mem, sizeof(block_header_t) + MIN_ALLOC_SIZE - 1) != 0);

    // Valid init must succeed.
    ASSERT_TRUE(pool_init(&pool, mem, sizeof(mem)) == 0);

    size_t total, used, free_space;
    stats(&pool, &total, &used, &free_space);
    ASSERT_TRUE(total <= sizeof(mem));
    ASSERT_EQ_U64(used, 0);
    ASSERT_TRUE(free_space >= MIN_ALLOC_SIZE);

    pool_destroy(&pool);
    return 0;
}

static int test_min_alloc_and_alignment(void) {
    memory_pool_t pool;
    static uint8_t mem[256] __attribute__((aligned(8)));

    ASSERT_TRUE(pool_init(&pool, mem, sizeof(mem)) == 0);

    void *p1 = pool_alloc(&pool, 1);
    ASSERT_TRUE(p1 != NULL);
    ASSERT_TRUE(is_aligned_8(p1));

    size_t used, free_space;
    stats(&pool, NULL, &used, &free_space);
    // Must round up to at least MIN_ALLOC_SIZE.
    ASSERT_EQ_U64(used, MIN_ALLOC_SIZE);

    void *p2 = pool_alloc(&pool, 17);
    ASSERT_TRUE(p2 != NULL);
    ASSERT_TRUE(is_aligned_8(p2));

    size_t used2;
    stats(&pool, NULL, &used2, NULL);
    // 17 bytes must align to 24 (8-byte alignment)
    ASSERT_EQ_U64(used2, (size_t)MIN_ALLOC_SIZE + 24u);

    pool_free(&pool, p1);
    pool_free(&pool, p2);

    size_t used3, free3;
    stats(&pool, NULL, &used3, &free3);
    ASSERT_EQ_U64(used3, 0);

    // After freeing all, free_space should match freelist_total_free
    ASSERT_EQ_U64(free3, freelist_total_free(&pool));

    pool_destroy(&pool);
    return 0;
}

static int test_split_remainder_usable_rule(void) {
    // Construct a tiny pool where splitting would create an unusable remainder.
    // With header=16 and MIN_ALLOC=16, payload=40 makes leftover=8 (no split), so whole block is allocated.
    memory_pool_t pool;
    static uint8_t mem[56] __attribute__((aligned(8)));

    ASSERT_TRUE(pool_init(&pool, mem, sizeof(mem)) == 0);

    size_t initial_free;
    stats(&pool, NULL, NULL, &initial_free);
    ASSERT_EQ_U64(initial_free, 40u);

    void *p = pool_alloc(&pool, 16);
    ASSERT_TRUE(p != NULL);

    size_t used, free_space;
    stats(&pool, NULL, &used, &free_space);
    // Entire block is consumed due to unsplittable remainder.
    ASSERT_EQ_U64(used, 40u);
    ASSERT_EQ_U64(free_space, 0u);

    // No space left.
    ASSERT_TRUE(pool_alloc(&pool, 16) == NULL);

    pool_free(&pool, p);

    size_t used2, free2;
    stats(&pool, NULL, &used2, &free2);
    ASSERT_EQ_U64(used2, 0u);
    ASSERT_EQ_U64(free2, 40u);

    pool_destroy(&pool);
    return 0;
}

static int test_coalescing_reclaims_header_space(void) {
    // Payload 64; allocating 16 will split leaving a free block (header carved out).
    // Freeing should coalesce and reclaim the absorbed header so free_space returns to 64.
    memory_pool_t pool;
    static uint8_t mem[80] __attribute__((aligned(8)));

    ASSERT_TRUE(pool_init(&pool, mem, sizeof(mem)) == 0);

    size_t initial_free;
    stats(&pool, NULL, NULL, &initial_free);
    ASSERT_EQ_U64(initial_free, 64u);

    void *p = pool_alloc(&pool, 16);
    ASSERT_TRUE(p != NULL);

    size_t used1, free1;
    stats(&pool, NULL, &used1, &free1);
    ASSERT_EQ_U64(used1, 16u);
    // After split, free_space should be 64 - 16 - header(16) = 32
    ASSERT_EQ_U64(free1, 32u);
    ASSERT_EQ_U64(free1, freelist_total_free(&pool));
    ASSERT_EQ_U64(freelist_count(&pool), 1);

    pool_free(&pool, p);

    size_t used2, free2;
    stats(&pool, NULL, &used2, &free2);
    ASSERT_EQ_U64(used2, 0u);
    // Coalescing must reclaim header: 32 + 16 + 16 = 64
    ASSERT_EQ_U64(free2, 64u);
    ASSERT_EQ_U64(free2, freelist_total_free(&pool));
    ASSERT_EQ_U64(freelist_count(&pool), 1);

    pool_destroy(&pool);
    return 0;
}

static int test_coalescing_prev_and_next(void) {
    memory_pool_t pool;
    static uint8_t mem[512] __attribute__((aligned(8)));

    ASSERT_TRUE(pool_init(&pool, mem, sizeof(mem)) == 0);

    size_t initial_free;
    stats(&pool, NULL, NULL, &initial_free);

    void *a = pool_alloc(&pool, 32);
    void *b = pool_alloc(&pool, 32);
    void *c = pool_alloc(&pool, 32);
    ASSERT_TRUE(a && b && c);

    // Free middle first, then neighbors to force merge with both sides.
    pool_free(&pool, b);
    pool_free(&pool, a);
    pool_free(&pool, c);

    size_t used, free_space;
    stats(&pool, NULL, &used, &free_space);
    ASSERT_EQ_U64(used, 0u);
    ASSERT_EQ_U64(free_space, initial_free);
    ASSERT_EQ_U64(free_space, freelist_total_free(&pool));
    ASSERT_EQ_U64(freelist_count(&pool), 1);

    pool_destroy(&pool);
    return 0;
}

static int test_double_free_and_pointer_validation(void) {
    memory_pool_t pool;
    static uint8_t mem[256] __attribute__((aligned(8)));

    ASSERT_TRUE(pool_init(&pool, mem, sizeof(mem)) == 0);

    size_t initial_free;
    stats(&pool, NULL, NULL, &initial_free);

    void *p = pool_alloc(&pool, 32);
    ASSERT_TRUE(p != NULL);

    size_t used1, free1;
    stats(&pool, NULL, &used1, &free1);

    // Invalid free: out-of-bounds pointer
    int dummy = 0;
    pool_free(&pool, &dummy);
    size_t used2, free2;
    stats(&pool, NULL, &used2, &free2);
    ASSERT_EQ_U64(used2, used1);
    ASSERT_EQ_U64(free2, free1);

    // Invalid free: interior pointer
    pool_free(&pool, (uint8_t *)p + 8);
    stats(&pool, NULL, &used2, &free2);
    ASSERT_EQ_U64(used2, used1);
    ASSERT_EQ_U64(free2, free1);

    // Valid free
    pool_free(&pool, p);

    size_t used3, free3;
    stats(&pool, NULL, &used3, &free3);
    ASSERT_EQ_U64(used3, 0u);

    // Double free must be ignored and not corrupt accounting/list.
    size_t free_before = free3;
    pool_free(&pool, p);
    size_t used4, free4;
    stats(&pool, NULL, &used4, &free4);
    ASSERT_EQ_U64(used4, 0u);
    ASSERT_EQ_U64(free4, free_before);

    // Ensure no duplicate entry causing same address returned twice.
    void *x = pool_alloc(&pool, 32);
    void *y = pool_alloc(&pool, 32);
    ASSERT_TRUE(x != NULL);
    ASSERT_TRUE(y != NULL);
    ASSERT_TRUE(x != y);

    pool_free(&pool, x);
    pool_free(&pool, y);

    size_t used5, free5;
    stats(&pool, NULL, &used5, &free5);
    ASSERT_EQ_U64(used5, 0u);
    ASSERT_EQ_U64(free5, initial_free);

    pool_destroy(&pool);
    return 0;
}

typedef struct {
    memory_pool_t *pool;
    struct simple_barrier *barrier;
    void **out_ptr;
} thread_arg_t;

typedef struct simple_barrier {
    pthread_mutex_t mutex;
    pthread_cond_t cond;
    int count;
    int trip;
} simple_barrier_t;

static int simple_barrier_init(simple_barrier_t *b, int trip) {
    if (!b || trip <= 0) return -1;
    b->count = 0;
    b->trip = trip;
    if (pthread_mutex_init(&b->mutex, NULL) != 0) return -1;
    if (pthread_cond_init(&b->cond, NULL) != 0) return -1;
    return 0;
}

static void simple_barrier_destroy(simple_barrier_t *b) {
    if (!b) return;
    pthread_cond_destroy(&b->cond);
    pthread_mutex_destroy(&b->mutex);
}

static void simple_barrier_wait(simple_barrier_t *b) {
    pthread_mutex_lock(&b->mutex);
    b->count++;
    if (b->count >= b->trip) {
        b->count = 0;
        pthread_cond_broadcast(&b->cond);
        pthread_mutex_unlock(&b->mutex);
        return;
    }
    pthread_cond_wait(&b->cond, &b->mutex);
    pthread_mutex_unlock(&b->mutex);
}

static void *alloc_once_thread(void *arg) {
    thread_arg_t *a = (thread_arg_t *)arg;
    simple_barrier_wait((simple_barrier_t *)a->barrier);
    void *p = pool_alloc(a->pool, 32);
    *a->out_ptr = p;
    return NULL;
}

static int test_concurrent_alloc_unique_addresses(void) {
    memory_pool_t pool;
    static uint8_t mem[2048] __attribute__((aligned(8)));

    ASSERT_TRUE(pool_init(&pool, mem, sizeof(mem)) == 0);

    enum { N = 8 };
    pthread_t threads[N];
    void *ptrs[N];
    memset(ptrs, 0, sizeof(ptrs));

    simple_barrier_t barrier;
    ASSERT_TRUE(simple_barrier_init(&barrier, N) == 0);

    thread_arg_t args[N];
    for (int i = 0; i < N; i++) {
        args[i].pool = &pool;
        args[i].barrier = &barrier;
        args[i].out_ptr = &ptrs[i];
        ASSERT_TRUE(pthread_create(&threads[i], NULL, alloc_once_thread, &args[i]) == 0);
    }
    for (int i = 0; i < N; i++) {
        ASSERT_TRUE(pthread_join(threads[i], NULL) == 0);
    }
    simple_barrier_destroy(&barrier);

    for (int i = 0; i < N; i++) {
        ASSERT_TRUE(ptrs[i] != NULL);
        ASSERT_TRUE(is_aligned_8(ptrs[i]));
        for (int j = i + 1; j < N; j++) {
            ASSERT_TRUE(ptrs[i] != ptrs[j]);
        }
    }

    for (int i = 0; i < N; i++) {
        pool_free(&pool, ptrs[i]);
    }

    size_t used, free_space;
    stats(&pool, NULL, &used, &free_space);
    ASSERT_EQ_U64(used, 0u);
    ASSERT_EQ_U64(free_space, freelist_total_free(&pool));

    pool_destroy(&pool);
    return 0;
}

static int test_stress_no_leak_over_loops(void) {
    memory_pool_t pool;
    static uint8_t mem[4096] __attribute__((aligned(8)));

    ASSERT_TRUE(pool_init(&pool, mem, sizeof(mem)) == 0);

    size_t initial_free;
    stats(&pool, NULL, NULL, &initial_free);

    for (int i = 0; i < 2000; i++) {
        size_t sz = (i % 3 == 0) ? 1u : (i % 3 == 1) ? 17u : 64u;
        void *p = pool_alloc(&pool, sz);
        ASSERT_TRUE(p != NULL);
        ASSERT_TRUE(is_aligned_8(p));
        pool_free(&pool, p);
    }

    size_t used, free_space;
    stats(&pool, NULL, &used, &free_space);
    ASSERT_EQ_U64(used, 0u);
    ASSERT_EQ_U64(free_space, initial_free);
    ASSERT_EQ_U64(free_space, freelist_total_free(&pool));
    ASSERT_EQ_U64(freelist_count(&pool), 1);

    pool_destroy(&pool);
    return 0;
}

static int test_free_last_block_end_bounds(void) {
    // Freeing a block at the end of the pool must not read beyond pool_end during coalescing.
    // This test is designed so the second allocation consumes the last block in the pool.
    memory_pool_t pool;
    static uint8_t mem[80] __attribute__((aligned(8)));

    ASSERT_TRUE(pool_init(&pool, mem, sizeof(mem)) == 0);

    size_t initial_free;
    stats(&pool, NULL, NULL, &initial_free);
    ASSERT_EQ_U64(initial_free, 64u);

    void *p1 = pool_alloc(&pool, 32);
    ASSERT_TRUE(p1 != NULL);
    void *p2 = pool_alloc(&pool, 16);
    ASSERT_TRUE(p2 != NULL);

    // Free the last block first; should not crash and should update bookkeeping sanely.
    pool_free(&pool, p2);
    ASSERT_EQ_U64(freelist_total_free(&pool), 16u);
    ASSERT_EQ_U64((size_t)freelist_count(&pool), 1u);

    // Free the first block; should coalesce everything back to one free block.
    pool_free(&pool, p1);

    size_t used, free_space;
    stats(&pool, NULL, &used, &free_space);
    ASSERT_EQ_U64(used, 0u);
    ASSERT_EQ_U64(free_space, initial_free);
    ASSERT_EQ_U64(free_space, freelist_total_free(&pool));
    ASSERT_EQ_U64((size_t)freelist_count(&pool), 1u);

    pool_destroy(&pool);
    return 0;
}

static int test_freelist_helpers_only_count_free_blocks(void) {
    // This test catches the legacy bug where allocated blocks remain linked
    // and freelist_count/total_free end up counting non-free blocks.
    memory_pool_t pool;
    static uint8_t mem[128] __attribute__((aligned(8)));

    ASSERT_TRUE(pool_init(&pool, mem, sizeof(mem)) == 0);

    // Start with exactly one free block.
    ASSERT_EQ_U64((size_t)freelist_count(&pool), 1u);
    size_t total, used, free_space;
    stats(&pool, &total, &used, &free_space);
    ASSERT_EQ_U64(freelist_total_free(&pool), free_space);

    // After a small allocation that causes a split, there should still be exactly one free block.
    void *p = pool_alloc(&pool, 16);
    ASSERT_TRUE(p != NULL);
    ASSERT_EQ_U64((size_t)freelist_count(&pool), 1u);
    stats(&pool, NULL, NULL, &free_space);
    ASSERT_EQ_U64(freelist_total_free(&pool), free_space);

    pool_free(&pool, p);
    ASSERT_EQ_U64((size_t)freelist_count(&pool), 1u);
    stats(&pool, NULL, NULL, &free_space);
    ASSERT_EQ_U64(freelist_total_free(&pool), free_space);

    pool_destroy(&pool);
    return 0;
}

static int test_use_after_free_not_duplicated(void) {
    // We can't detect arbitrary use-after-free reads/writes, but we can ensure the allocator
    // never returns the same block twice without an intervening free.
    memory_pool_t pool;
    static uint8_t mem[256] __attribute__((aligned(8)));

    ASSERT_TRUE(pool_init(&pool, mem, sizeof(mem)) == 0);

    void *a = pool_alloc(&pool, 32);
    ASSERT_TRUE(a != NULL);
    void *b = pool_alloc(&pool, 32);
    ASSERT_TRUE(b != NULL);
    ASSERT_TRUE(a != b);

    pool_free(&pool, a);

    // Reallocate same size; should typically reuse the freed block.
    void *a2 = pool_alloc(&pool, 32);
    ASSERT_TRUE(a2 != NULL);
    ASSERT_TRUE(a2 == a);

    // And it must not be returned again while still allocated.
    void *c = pool_alloc(&pool, 32);
    ASSERT_TRUE(c != NULL);
    ASSERT_TRUE(c != a2);
    ASSERT_TRUE(c != b);

    pool_free(&pool, b);
    pool_free(&pool, a2);
    pool_free(&pool, c);

    size_t used, free_space;
    stats(&pool, NULL, &used, &free_space);
    ASSERT_EQ_U64(used, 0u);
    ASSERT_EQ_U64(free_space, freelist_total_free(&pool));
    ASSERT_EQ_U64((size_t)freelist_count(&pool), 1u);
    pool_destroy(&pool);
    return 0;
}

#ifdef POOL_NULL_OFFSET
static int test_fragmentation_metrics(void) {
    // Create fragmentation by freeing alternating blocks. Largest contiguous free should drop
    // below total free space when fragmented.
    memory_pool_t pool;
    static uint8_t mem[512] __attribute__((aligned(8)));
    ASSERT_TRUE(pool_init(&pool, mem, sizeof(mem)) == 0);

    void *p[8];
    for (int i = 0; i < 8; i++) {
        p[i] = pool_alloc(&pool, 32);
        ASSERT_TRUE(p[i] != NULL);
    }

    for (int i = 0; i < 8; i += 2) {
        pool_free(&pool, p[i]);
    }

    size_t used, free_space;
    stats(&pool, NULL, &used, &free_space);

    size_t largest = pool_largest_free(&pool);
    ASSERT_TRUE(largest <= free_space);
    ASSERT_TRUE(pool_free_block_count(&pool) >= (size_t)2u);
    // With alternating frees, fragmentation should exist: largest should be strictly smaller than total free.
    ASSERT_TRUE(largest < free_space);

    for (int i = 1; i < 8; i += 2) {
        pool_free(&pool, p[i]);
    }

    stats(&pool, NULL, &used, &free_space);
    ASSERT_EQ_U64(used, 0u);
    ASSERT_EQ_U64(pool_free_block_count(&pool), 1u);
    ASSERT_EQ_U64(pool_largest_free(&pool), free_space);

    pool_destroy(&pool);
    return 0;
}
#endif

int main(void) {
    struct {
        const char *name;
        int (*fn)(void);
    } tests[] = {
        {"init_alignment_and_size", test_init_alignment_and_size},
        {"min_alloc_and_alignment", test_min_alloc_and_alignment},
        {"split_remainder_usable_rule", test_split_remainder_usable_rule},
        {"coalescing_reclaims_header_space", test_coalescing_reclaims_header_space},
        {"coalescing_prev_and_next", test_coalescing_prev_and_next},
        {"double_free_and_pointer_validation", test_double_free_and_pointer_validation},
        {"concurrent_alloc_unique_addresses", test_concurrent_alloc_unique_addresses},
        {"stress_no_leak_over_loops", test_stress_no_leak_over_loops},
        {"free_last_block_end_bounds", test_free_last_block_end_bounds},
        {"freelist_helpers_only_count_free_blocks", test_freelist_helpers_only_count_free_blocks},
        {"use_after_free_not_duplicated", test_use_after_free_not_duplicated},
    #ifdef POOL_NULL_OFFSET
        {"fragmentation_metrics", test_fragmentation_metrics},
    #endif
    };

    int failures = 0;
    for (size_t i = 0; i < sizeof(tests) / sizeof(tests[0]); i++) {
        int rc = tests[i].fn();
        if (rc != 0) {
            fprintf(stderr, "FAILED: %s\n", tests[i].name);
            failures++;
            // Stop early: broken allocators can corrupt state and hang subsequent tests.
            break;
        } else {
            printf("PASS: %s\n", tests[i].name);
        }
    }

    if (failures == 0) {
        printf("ALL TESTS PASSED\n");
    } else {
        printf("TESTS FAILED: %d\n", failures);
    }

    // Always exit 0 (evaluation harness requirement).
    return 0;
}
