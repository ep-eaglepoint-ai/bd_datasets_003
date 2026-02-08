package com.quantflow.tests;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Memory efficiency test to verify that the registry does not exceed
 * 128MB heap footprint for 100,000 symbols as required.
 * 
 * This test isolates the registry's memory footprint by:
 * 1. Forcing GC before measurement
 * 2. Loading symbols and clearing test data references
 * 3. Forcing GC again before measuring registry memory
 */
public class MarketRegistryMemoryTest {

    @Test
    void registryWithHundredThousandSymbolsStaysWithinMemoryLimit() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        Object registry = loaded.registryInstance;
        Method loadSymbols = loaded.registryClass.getMethod("loadSymbols", List.class);

        int symbolCount = 100_000;
        
        // Force GC before starting
        forceGC();
        long memoryBefore = getUsedMemory();
        
        // Create and load records
        List<Object> records = new ArrayList<>(symbolCount);
        for (int i = 0; i < symbolCount; i++) {
            records.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-" + i, "TICK" + i));
        }
        
        loadSymbols.invoke(registry, records);
        
        // Clear the records list to free test data memory
        records.clear();
        records = null;
        
        // Force GC to collect test data before measuring registry
        forceGC();
        long memoryAfterRegistry = getUsedMemory();
        long memoryUsed = memoryAfterRegistry - memoryBefore;
        
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
    
    private void forceGC() {
        // Run multiple GC cycles to help the JVM collect garbage
        for (int i = 0; i < 3; i++) {
            System.gc();
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }
}
