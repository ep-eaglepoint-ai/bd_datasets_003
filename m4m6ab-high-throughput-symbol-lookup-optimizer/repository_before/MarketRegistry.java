
// filename: src/main/java/com/quantflow/MarketRegistry.java

package com.quantflow;

import java.util.ArrayList;
import java.util.List;

// /
//  * Represents a single financial symbol mapping.
//  */
class SymbolRecord {
    private final String internalId;
    private final String ticker;

    public SymbolRecord(String internalId, String ticker) {
    this.internalId = internalId;
    this.ticker = ticker;
 }

    public String getInternalId() { return internalId; }
    public String getTicker() { return ticker; }
}

// /
//  * MarketRegistry handles the mapping of internal IDs to market tickers.
//  * PROBLEM: Current implementation uses a linear search (O(N)).
//  */
public class MarketRegistry {
 private final List<SymbolRecord> records = new ArrayList<>();

//  /
//  * Loads a batch of symbols into the registry.
//  */
 public void loadSymbols(List<SymbolRecord> newRecords) {
    this.records.addAll(newRecords);
 }

//  /
//  * Retrieves the market ticker for a given internal ID.
//  * @param internalId the ID to look up.
//  * @return the ticker string or null if not found.
//  */
 public String getTickerById(String internalId) {
 // PROBLEM: O(N) Search is too slow for high-frequency trading.
    for (SymbolRecord record : records) {
        if (record.getInternalId().equals(internalId)) {
        return record.getTicker();
        }
    }
    return null;
 }

 public int getSize() {
    return records.size();
 }
}