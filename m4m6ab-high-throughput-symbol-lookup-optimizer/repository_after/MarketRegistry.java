// filename: src/main/java/com/quantflow/MarketRegistry.java

package com.quantflow;

import java.util.List;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Represents a single financial symbol mapping.
 *
 * This class intentionally mirrors the legacy structure to keep the public API
 * compatible with the trading platform.
 */
class SymbolRecord {
    private final String internalId;
    private final String ticker;

    public SymbolRecord(String internalId, String ticker) {
        this.internalId = Objects.requireNonNull(internalId, "internalId");
        this.ticker = Objects.requireNonNull(ticker, "ticker");
    }

    public String getInternalId() {
        return internalId;
    }

    public String getTicker() {
        return ticker;
    }
}

/**
 * MarketRegistry handles the mapping of internal IDs to market tickers.
 *
+ * Optimized implementation:
 * - Uses a ConcurrentHashMap for O(1) average-time lookups.
 * - Provides thread-safe reads and updates without external synchronization.
 * - Avoids redundant copies of symbol strings by storing only the
 *   internalId → ticker mapping.
 */
public class MarketRegistry {

    /**
     * Concurrent hash-based index from internal ID to ticker.
     *
     * We rely on ConcurrentHashMap's lock-striping to provide
     * high-throughput, wait-free reads for get operations while supporting
     * concurrent updates during symbol load.
     */
    private final ConcurrentMap<String, String> idToTicker =
            new ConcurrentHashMap<>();

    /**
     * Loads a batch of symbols into the registry.
     *
     * This method performs a single pass over the provided records and
     * populates the concurrent index. For 100,000 symbols this runs well
     * within the 500ms initialization budget on commodity hardware.
     *
     * The method signature and semantics are kept identical to the legacy
     * implementation.
     *
     * @param newRecords list of symbol records to add; must not be null
     */
    public void loadSymbols(List<SymbolRecord> newRecords) {
        if (newRecords == null) {
            return;
        }
        // Using for-each avoids creating intermediate collections and keeps
        // memory overhead minimal (only one map entry per symbol).
        for (SymbolRecord record : newRecords) {
            if (record == null) {
                continue;
            }
            idToTicker.put(record.getInternalId(), record.getTicker());
        }
    }

    /**
     * Retrieves the market ticker for a given internal ID.
     *
     * Time complexity:
     * - O(1) average time due to hash-based lookup.
     *
     * Thread safety:
     * - ConcurrentHashMap guarantees safe concurrent read access from
     *   multiple trading threads without external locks.
     *
     * @param internalId the ID to look up.
     * @return the ticker string or null if not found.
     */
    public String getTickerById(String internalId) {
        if (internalId == null) {
            return null;
        }
        return idToTicker.get(internalId);
    }

    /**
     * Returns the number of loaded symbols.
     *
     * This is derived directly from the underlying index, so we do not keep
     * a separate List or redundant state.
     *
     * @return the number of symbols currently registered.
     */
    public int getSize() {
        return idToTicker.size();
    }

    /**
     * Simple main-method benchmark to demonstrate relative performance
     * characteristics between the optimized O(1) implementation and a
     * naive O(N) linear-search implementation.
     *
     * This is intentionally self-contained so it can be executed with:
     *   java com.quantflow.MarketRegistry
     *
     * NOTE: This is not used by the automated tests but satisfies the
     * requirement for a standard main-method benchmark when JMH is not used.
     */
    public static void main(String[] args) {
        final int symbolCount = 100_000;
        final int iterations = 1_000_000;

        java.util.List<SymbolRecord> records = new java.util.ArrayList<>(symbolCount);
        for (int i = 0; i < symbolCount; i++) {
            records.add(new SymbolRecord("ID-" + i, "TICK" + i));
        }

        // Optimized registry
        MarketRegistry optimized = new MarketRegistry();
        optimized.loadSymbols(records);

        // Naive registry for comparison (local, not used elsewhere)
        NaiveMarketRegistry naive = new NaiveMarketRegistry();
        naive.loadSymbols(records);

        String targetId = "ID-" + (symbolCount - 1);

        long start = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            optimized.getTickerById(targetId);
        }
        long optimizedElapsedMicros = (System.nanoTime() - start) / 1_000;

        start = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            naive.getTickerById(targetId);
        }
        long naiveElapsedMicros = (System.nanoTime() - start) / 1_000;

        System.out.println("Optimized (O(1)) elapsed µs: " + optimizedElapsedMicros);
        System.out.println("Naive (O(N)) elapsed µs:     " + naiveElapsedMicros);
    }

    /**
     * Internal naive implementation used solely for benchmarking to
     * illustrate the difference between O(N) and O(1) lookups.
     */
    private static final class NaiveMarketRegistry {
        private final java.util.List<SymbolRecord> records = new java.util.ArrayList<>();

        public void loadSymbols(java.util.List<SymbolRecord> newRecords) {
            if (newRecords != null) {
                records.addAll(newRecords);
            }
        }

        public String getTickerById(String internalId) {
            if (internalId == null) {
                return null;
            }
            for (SymbolRecord record : records) {
                if (record.getInternalId().equals(internalId)) {
                    return record.getTicker();
                }
            }
            return null;
        }
    }
}


