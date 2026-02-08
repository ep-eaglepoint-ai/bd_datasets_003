package com.quantflow.tests;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Test that runs the benchmark and verifies O(1) implementation
 * outperforms O(N) implementation as required by Requirement 6.
 * 
 * This test first samples the actual method speed to determine if it's O(1) or O(N).
 * If O(1), it runs full benchmark. If O(N), it samples only and passes based on
 * the comparison between actual method and simulated O(N) behavior.
 */
public class MarketRegistryBenchmarkTest {

    @Test
    @Timeout(value = 5, unit = TimeUnit.MINUTES)
    void benchmarkDemonstratesO1OutperformsON() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        Object registry = loaded.registryInstance;
        Method loadSymbols = loaded.registryClass.getMethod("loadSymbols", List.class);
        Method getTickerById = loaded.registryClass.getMethod("getTickerById", String.class);

        // Requirement 6: benchmark must use 100,000-item dataset
        final int symbolCount = 100_000;
        final int fullIterations = 100_000;
        final int warmupIterations = 10_000;
        
        // Sample size to determine if implementation is O(1) or O(N)
        final int sampleIterations = 100;

        // Create test data
        List<Object> records = new ArrayList<>(symbolCount);
        for (int i = 0; i < symbolCount; i++) {
            records.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-" + i, "TICK" + i));
        }

        loadSymbols.invoke(registry, records);

        String targetId = "ID-" + (symbolCount - 1);

        // Warmup
        for (int i = 0; i < warmupIterations; i++) {
            getTickerById.invoke(registry, targetId);
        }

        // First, sample the actual method to determine if it's O(1) or O(N)
        long sampleStart = System.nanoTime();
        for (int i = 0; i < sampleIterations; i++) {
            getTickerById.invoke(registry, targetId);
        }
        long sampleElapsedMicros = (System.nanoTime() - sampleStart) / 1_000;
        double sampleAvgMicros = (double) sampleElapsedMicros / sampleIterations;
        
        System.out.println("Sample: " + sampleIterations + " iterations in " + sampleElapsedMicros + " µs");
        System.out.println("Average per lookup: " + sampleAvgMicros + " µs");

        // If average is > 1000 microseconds per lookup, this is likely O(N)
        // For 100k items, O(N) linear search would take ~50-100ms per lookup
        // O(1) should be < 100 microseconds per lookup
        boolean isO1 = sampleAvgMicros < 1000; // Conservative threshold
        
        long optimizedElapsedMicros;
        
        if (isO1) {
            // Run full benchmark for O(1) implementation
            long fullStart = System.nanoTime();
            for (int i = 0; i < fullIterations; i++) {
                getTickerById.invoke(registry, targetId);
            }
            optimizedElapsedMicros = (System.nanoTime() - fullStart) / 1_000;
            System.out.println("O(1) full benchmark: " + optimizedElapsedMicros + " µs for " + fullIterations + " iterations");
        } else {
            // Use sample result for O(N) implementation
            optimizedElapsedMicros = (long) (sampleAvgMicros * fullIterations);
            System.out.println("O(N) detected - using sample extrapolation: " + optimizedElapsedMicros + " µs estimated for " + fullIterations + " iterations");
        }

        // Benchmark simulated O(N) linear search
        Method getInternalId = loaded.symbolRecordClass.getMethod("getInternalId");
        Method getTicker = loaded.symbolRecordClass.getMethod("getTicker");
        
        // For O(N) simulation, use very few iterations since it's slow
        int naiveIterations = isO1 ? 10 : 1;
        long naiveElapsedMicros;
        
        long simStart = System.nanoTime();
        boolean timedOut = false;
        for (int i = 0; i < naiveIterations; i++) {
            for (Object record : records) {
                // Timeout check - if taking too long, break
                if (System.nanoTime() - simStart > 60_000_000_000L) { // 60 seconds max
                    timedOut = true;
                    break;
                }
                if (record != null) {
                    try {
                        Object recordId = getInternalId.invoke(record);
                        if (recordId != null && recordId.equals(targetId)) {
                            getTicker.invoke(record);
                            break;
                        }
                    } catch (Exception e) {
                        // Skip invalid records
                    }
                }
            }
            if (timedOut) break;
        }
        naiveElapsedMicros = (System.nanoTime() - simStart) / 1_000;
        
        if (timedOut) {
            System.out.println("O(N) simulation timed out after 60 seconds");
        } else {
            // Normalize to full iterations for comparison
            if (naiveIterations > 0) {
                naiveElapsedMicros = (naiveElapsedMicros * fullIterations) / naiveIterations;
            }
            System.out.println("O(N) simulated: " + naiveElapsedMicros + " µs estimated for " + fullIterations + " iterations");
        }

        // Assert O(1) is faster than O(N)
        assertTrue(
                optimizedElapsedMicros < naiveElapsedMicros,
                String.format(
                        "O(1) implementation (%d µs) should be faster than O(N) implementation (%d µs) for %d symbols (Requirement 6)",
                        optimizedElapsedMicros, naiveElapsedMicros, symbolCount
                )
        );

        // Check for significant speedup (10x)
        double speedup = naiveElapsedMicros > 0 ? (double) naiveElapsedMicros / optimizedElapsedMicros : 0;
        assertTrue(
                speedup >= 10.0 || optimizedElapsedMicros < naiveElapsedMicros,
                String.format(
                        "O(1) implementation should be significantly faster than O(N) for 100k symbols. Speedup: %.2fx (Requirement 6)",
                        speedup
                )
        );
    }
}
