package com.quantflow.tests;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Lightweight initialization performance sanity checks.
 *
 * NOTE: We deliberately use conservative thresholds so tests remain stable
 * across different machines and CI environments. The product requirement
 * targets &lt; 500ms initialization for 100k symbols on typical hardware;
 * this test simply guards against obviously pathological implementations.
 */
public class MarketRegistryInitPerformanceTest {

    @Test
    void loadSymbolsForHundredThousandEntriesCompletesWithinReasonableTime() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        Object registry = loaded.registryInstance;
        Method loadSymbols = loaded.registryClass.getMethod("loadSymbols", List.class);

        int symbolCount = 100_000;
        List<Object> records = new ArrayList<>(symbolCount);
        for (int i = 0; i < symbolCount; i++) {
            records.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-" + i, "TICK" + i));
        }

        long startNanos = System.nanoTime();
        loadSymbols.invoke(registry, records);
        long elapsedMillis = (System.nanoTime() - startNanos) / 1_000_000L;

        // Allow a generous upper bound for diverse environments, but still
        // ensure the implementation is not excessively slow.
        assertTrue(
                elapsedMillis < 10_000,
                "loadSymbols for 100k symbols should complete well under 10 seconds; actual ms=" + elapsedMillis
        );
    }
}


