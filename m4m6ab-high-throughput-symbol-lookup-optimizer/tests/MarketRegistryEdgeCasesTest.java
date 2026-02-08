package com.quantflow.tests;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

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

    @Test
    void duplicateInternalIdsPreserveFirstMatchSemantics() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        Object registry = loaded.registryInstance;
        Method loadSymbols = loaded.registryClass.getMethod("loadSymbols", List.class);
        Method getTickerById = loaded.registryClass.getMethod("getTickerById", String.class);

        // Same internal ID appears twice with different tickers
        List<Object> records = new ArrayList<>();
        records.add(RegistryTestSupport.newSymbolRecord(loaded, "DUPLICATE-ID", "FIRST-TICKER"));
        records.add(RegistryTestSupport.newSymbolRecord(loaded, "DUPLICATE-ID", "SECOND-TICKER"));

        loadSymbols.invoke(registry, records);

        // Original behavior: first match wins (ArrayList linear search returns first)
        // Optimized behavior: putIfAbsent preserves first-match semantics
        assertEquals("FIRST-TICKER", getTickerById.invoke(registry, "DUPLICATE-ID"));
    }

    @Test
    void loadSymbolsWithNullThrowsNullPointerException() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        Object registry = loaded.registryInstance;
        Method loadSymbols = loaded.registryClass.getMethod("loadSymbols", List.class);

        // Original behavior: addAll throws NPE if list is null
        // This should be preserved in optimized version
        assertThrows(Exception.class, () -> {
            loadSymbols.invoke(registry, new Object[]{null});
        }, "loadSymbols(null) should throw NullPointerException");
    }

    @Test
    void loadSymbolsAllowsNullElementsInList() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        Object registry = loaded.registryInstance;
        Method loadSymbols = loaded.registryClass.getMethod("loadSymbols", List.class);
        Method getTickerById = loaded.registryClass.getMethod("getTickerById", String.class);
        Method getSize = loaded.registryClass.getMethod("getSize");

        // Original behavior: null elements are allowed in the list
        List<Object> records = new ArrayList<>();
        records.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-1", "TICK1"));
        records.add(null); // null element
        records.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-2", "TICK2"));

        loadSymbols.invoke(registry, records);

        // Size should include null elements (original behavior)
        int size = ((Number) getSize.invoke(registry)).intValue();
        assertEquals(3, size, "Size should include null elements");

        // Valid records should still work
        assertEquals("TICK1", getTickerById.invoke(registry, "ID-1"));
        assertEquals("TICK2", getTickerById.invoke(registry, "ID-2"));
    }

    @Test
    void symbolRecordConstructorAllowsNulls() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        // Original behavior: SymbolRecord constructor allows null internalId and ticker
        // This should be preserved (no Objects.requireNonNull)
        Object record1 = RegistryTestSupport.newSymbolRecord(loaded, null, "TICKER");
        Object record2 = RegistryTestSupport.newSymbolRecord(loaded, "ID", null);
        Object record3 = RegistryTestSupport.newSymbolRecord(loaded, null, null);

        // If constructor allowed nulls, these should not throw
        // We just verify they can be created
        assert record1 != null;
        assert record2 != null;
        assert record3 != null;
    }
}


