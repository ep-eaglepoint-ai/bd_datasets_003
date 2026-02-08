package com.quantflow.tests;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Correctness tests that are applied identically to both the legacy
 * (repository_before) and optimized (repository_after) implementations.
 *
 * The implementation under test is selected via the -Drepo system property.
 */
public class MarketRegistryCorrectnessTest {

    @Test
    void returnsTickerForExistingId() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        Object registry = loaded.registryInstance;

        List<Object> records = new ArrayList<>();
        int symbolCount = 10_000; // Reduced for test speed
        for (int i = 0; i < symbolCount; i++) {
            String id = "ID-" + i;
            String ticker = "TICK" + i;
            records.add(RegistryTestSupport.newSymbolRecord(loaded, id, ticker));
        }

        Method loadSymbols = loaded.registryClass.getMethod("loadSymbols", List.class);
        loadSymbols.invoke(registry, records);

        int randomIndex = ThreadLocalRandom.current().nextInt(symbolCount);
        String targetId = "ID-" + randomIndex;
        String expectedTicker = "TICK" + randomIndex;

        Method getTickerById = loaded.registryClass.getMethod("getTickerById", String.class);
        Object tickerValue = getTickerById.invoke(registry, targetId);

        assertEquals(expectedTicker, tickerValue);
    }

    @Test
    void returnsNullForMissingId() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        Object registry = loaded.registryInstance;

        List<Object> records = new ArrayList<>();
        records.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-1", "AAPL"));
        records.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-2", "MSFT"));

        Method loadSymbols = loaded.registryClass.getMethod("loadSymbols", List.class);
        loadSymbols.invoke(registry, records);

        Method getTickerById = loaded.registryClass.getMethod("getTickerById", String.class);
        Object tickerValue = getTickerById.invoke(registry, "UNKNOWN-ID");

        assertNull(tickerValue);
    }

    @Test
    void supportsMultipleInternalIdsMappingToSameTicker() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();

        Object registry = loaded.registryInstance;

        List<Object> records = new ArrayList<>();
        records.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-100", "AAPL"));
        records.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-101", "AAPL"));
        records.add(RegistryTestSupport.newSymbolRecord(loaded, "ID-102", "AAPL"));

        Method loadSymbols = loaded.registryClass.getMethod("loadSymbols", List.class);
        loadSymbols.invoke(registry, records);

        Method getTickerById = loaded.registryClass.getMethod("getTickerById", String.class);

        assertEquals("AAPL", getTickerById.invoke(registry, "ID-100"));
        assertEquals("AAPL", getTickerById.invoke(registry, "ID-101"));
        assertEquals("AAPL", getTickerById.invoke(registry, "ID-102"));
    }
}


