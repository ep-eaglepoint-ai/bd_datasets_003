// filename: storage/SSTableEntry.java
package storage;

public class SSTableEntry {
    public final String key;
    public final byte[] value;
    public final long timestamp;

    public SSTableEntry(String key, byte[] value, long timestamp) {
        this.key = key;
        this.value = value;
        this.timestamp = timestamp;
    }
}
