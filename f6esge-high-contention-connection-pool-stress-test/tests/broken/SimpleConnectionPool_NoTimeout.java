package com.cloudscale;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.LinkedList;

/*
 * Mock connection interface provided for testing purposes.
 */
class DatabaseConnection {
    public boolean isOpen = true;
    public void close() { this.isOpen = false; }
}

/**
 * BROKEN IMPLEMENTATION: Ignores timeout.
 */
public class SimpleConnectionPool {
    private final int maxPoolSize;
    private final long acquisitionTimeout;
    private final LinkedList<DatabaseConnection> available = new LinkedList<>();
    private final Semaphore semaphore;
    private final AtomicInteger activeCount = new AtomicInteger(0);
    private boolean isShutdown = false;

    public SimpleConnectionPool(int size, long timeoutMs) {
        this.maxPoolSize = size;
        this.acquisitionTimeout = timeoutMs;
        this.semaphore = new Semaphore(size, true);
        for (int i = 0; i < size; i++) {
            available.add(new DatabaseConnection());
        }
    }

    public DatabaseConnection borrowConnection() throws InterruptedException, TimeoutException {
        if (isShutdown) throw new IllegalStateException("Pool is shutdown");

        // BUG: Acquire without timeout or wrong check
        semaphore.acquire(); // Blocks forever if exhausted
        
        synchronized (available) {
            DatabaseConnection conn = available.poll();
            activeCount.incrementAndGet();
            return conn;
        }
    }


    public void releaseConnection(DatabaseConnection conn) {
        if (conn == null) return;

        synchronized (available) {
            available.add(conn);
            activeCount.decrementAndGet();
        }
        semaphore.release();
    }

    public int getActiveCount() {
        return activeCount.get();
    }

    public void shutdown() {
        this.isShutdown = true;
        synchronized (available) {
            while (!available.isEmpty()) {
                available.poll().close();
            }
        }
    }
}
