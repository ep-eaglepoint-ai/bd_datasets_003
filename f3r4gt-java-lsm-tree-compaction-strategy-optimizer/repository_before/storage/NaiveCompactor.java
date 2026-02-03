
// filename: storage/NaiveCompactor.java
package storage;

import java.util.*;
import java.io.*;
import java.nio.file.*;

public class NaiveCompactor {
    /**
     * This legacy implementation is functional but fails under load.
     * It consumes memory proportional to the total size of all input files.
     */
    public void performCompaction(List<File> filesToMerge, File outputFile) throws IOException {
        List<SSTableEntry> allEntries = new ArrayList<>();

        for (File file : filesToMerge) {
            // Naive approach: Loading all bytes into memory
            List<String> lines = Files.readAllLines(file.toPath());
            for (String line : lines) {
                allEntries.add(parseEntry(line));
            }
        }

        // Sort everything in memory - High O(N log N) space and time impact
        allEntries.sort((a, b) -> {
            int res = a.key.compareTo(b.key);
            if (res == 0) return Long.compare(b.timestamp, a.timestamp);
            return res;
        });

        // Write to new file while removing duplicates
        try (BufferedWriter writer = Files.newBufferedWriter(outputFile.toPath())) {
            String lastKey = null;
            for (SSTableEntry entry : allEntries) {
                if (lastKey != null && lastKey.equals(entry.key)) continue;
                writer.write(serializeEntry(entry));
                writer.newLine();
                lastKey = entry.key;
            }
        }
    }

    private SSTableEntry parseEntry(String line) { 
        // Simplified for illustration: key:timestamp:value_base64
        String[] parts = line.split(":");
        return new SSTableEntry(parts[0], Base64.getDecoder().decode(parts[2]), Long.parseLong(parts[1]));
    }

    private String serializeEntry(SSTableEntry entry) {
        return entry.key + ":" + entry.timestamp + ":" + (entry.value == null ? "" : Base64.getEncoder().encodeToString(entry.value));
    }
}