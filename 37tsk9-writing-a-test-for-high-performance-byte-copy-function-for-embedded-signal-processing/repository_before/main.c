#include <stdio.h>
#include <stdint.h>
#include "fast_copy.h"

int main() {
    uint32_t src[4] = {0xDEADBEEF, 0xCAFEBABE, 0xAAAA5555, 0x12345678};
    uint32_t dest[4] = {0};

    printf("Starting fast_copy of 4 words...\n");
    fast_copy(dest, src, 4);

    for(int i = 0; i < 4; i++) {
        if (dest[i] != src[i]) {
            printf("Mismatch at index %d: Expected %X, Got %X\n", i, src[i], dest[i]);
            return 1;
        }
    }

    printf("Success: fast_copy integrity verified.\n");
    return 0;
}