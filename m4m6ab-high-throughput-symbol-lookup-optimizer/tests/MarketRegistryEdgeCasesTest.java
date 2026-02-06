package com.quantflow.tests;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Additional edge-case coverage that is applied identically to both the
 * legacy (repository_before) and optimized (repository_after)
 * implementations. All scenarios remain within the original API contract.
 */
public class MarketRegistryEdgeCasesTest {

    @Test
    void emptyRegistryReturnsNullForAnyId() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();
        Object registry = loaded.registryInstance;

        Method getTickerById = loaded.registryClass.getMethod("getTickerById", String.class);

        assertNull(getTickerById.invoke(registry, "NON_EXISTENT_ID"));
    }

    @Test
    void getTickerByIdWithNullIdReturnsNull() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();
        Object registry = loaded.registryInstance;

        Method getTickerById = loaded.registryClass.getMethod("getTickerById", String.class);
        Object result = getTickerById.invoke(registry, new Object[]{null});

        assertNull(result);
    }

    @Test
    void multipleLoadsAccumulateSymbolsWithNonOverlappingIds() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        Object registry = loaded.registryInstance;
        Method loadSymbols = loaded.registryClass.getMethod("loadSymbols", List.class);
        Method getTickerById = loaded.registryClass.getMethod("getTickerById", String.class);
        Method getSize = loaded.registryClass.getMethod("getSize");

        // First batch: IDs 0..9_999
        List<Object> batch1 = new ArrayList<>();
        for (int i = 0; i < 10_000; i++) {
            batch1.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-" + i, "TICK" + i));
        }
        loadSymbols.invoke(registry, batch1);

        // Second batch: IDs 10_000..19_999 (non-overlapping)
        List<Object> batch2 = new ArrayList<>();
        for (int i = 10_000; i < 20_000; i++) {
            batch2.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-" + i, "TICK" + i));
        }
        loadSymbols.invoke(registry, batch2);

        int size = ((Number) getSize.invoke(registry)).intValue();
        assertEquals(20_000, size);

        // Spot-check a few IDs from both batches.
        assertEquals("TICK0", getTickerById.invoke(registry, "ID-0"));
        assertEquals("TICK9999", getTickerById.invoke(registry, "ID-9999"));
        assertEquals("TICK10000", getTickerById.invoke(registry, "ID-10000"));
        assertEquals("TICK19999", getTickerById.invoke(registry, "ID-19999"));
    }
}


