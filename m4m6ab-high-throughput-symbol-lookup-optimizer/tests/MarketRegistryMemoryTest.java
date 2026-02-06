package com.quantflow.tests;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Memory efficiency test to verify that the registry does not exceed
 * 128MB heap footprint for 100,000 symbols as required.
 */
public class MarketRegistryMemoryTest {

    @Test
    void registryWithHundredThousandSymbolsStaysWithinMemoryLimit() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        Object registry = loaded.registryInstance;
        Method loadSymbols = loaded.registryClass.getMethod("loadSymbols", List.class);

        int symbolCount = 100_000;
        
        long memoryBefore = getUsedMemory();
        
        List<Object> records = new ArrayList<>(symbolCount);
        for (int i = 0; i < symbolCount; i++) {
            records.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-" + i, "TICK" + i));
        }
        
        loadSymbols.invoke(registry, records);
        
        long memoryAfter = getUsedMemory();
        long memoryUsed = memoryAfter - memoryBefore;
        
        // 128MB = 128 * 1024 * 1024 bytes = 134,217,728 bytes
        long maxMemoryBytes = 128L * 1024 * 1024;
        
        assertTrue(
                memoryUsed <= maxMemoryBytes,
                String.format(
                        "Registry with %d symbols used %d bytes (%.2f MB), exceeding 128MB limit",
                        symbolCount, memoryUsed, memoryUsed / (1024.0 * 1024.0)
                )
        );
    }
    
    private long getUsedMemory() {
        Runtime runtime = Runtime.getRuntime();
        return runtime.totalMemory() - runtime.freeMemory();
    }
}

