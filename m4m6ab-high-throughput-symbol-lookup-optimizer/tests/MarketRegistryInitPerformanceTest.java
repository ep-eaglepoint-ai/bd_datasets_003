package com.quantflow.tests;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Initialization performance test to verify that the registry loads
 * 100,000 symbols within the required 500ms time limit.
 */
public class MarketRegistryInitPerformanceTest {

    @Test
    void loadSymbolsForHundredThousandEntriesCompletesWithinRequiredTime() throws Exception {
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

        // Requirement 5: initialization should complete in under 500ms for 100k symbols
        assertTrue(
                elapsedMillis < 500,
                String.format(
                        "loadSymbols for 100k symbols should complete in under 500ms; actual ms=%d",
                        elapsedMillis
                )
        );
    }
}
