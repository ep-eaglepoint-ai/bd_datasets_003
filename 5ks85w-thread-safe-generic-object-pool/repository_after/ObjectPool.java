

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class ObjectPool<T> implements AutoCloseable {
    private final PoolConfig<T> config;
    private final BlockingQueue<PoolEntry<T>> availableObjects;
    private final Semaphore semaphore; 
    private final PoolStats stats = new PoolStats();
    private final AtomicBoolean isClosed = new AtomicBoolean(false);

    private static class PoolEntry<T> {
        final T object;
        final long creationTime;
        long lastUsedTime;

        PoolEntry(T object) {
            this.object = object;
            this.creationTime = System.currentTimeMillis();
            this.lastUsedTime = creationTime;
        }

        void updateLastUsed() {
            this.lastUsedTime = System.currentTimeMillis();
        }
    }

    public ObjectPool(PoolConfig<T> config) {
        this.config = config;
        this.availableObjects = new LinkedBlockingQueue<>();
        this.semaphore = new Semaphore(config.getMaxSize());
    }

    public PooledObject<T> borrow() throws InterruptedException {
        return borrow(Long.MAX_VALUE, TimeUnit.MILLISECONDS);
    }

    public PooledObject<T> borrow(long timeout, TimeUnit unit) throws InterruptedException {
        checkClosed();
        long end = System.currentTimeMillis() + unit.toMillis(timeout);

        while (true) {
            // First, try to reuse an existing object
            PoolEntry<T> entry = availableObjects.poll();
            if (entry != null) {
                if (isValid(entry)) {
                    stats.incrementBorrowed();
                    return new PooledObject<>(entry.object, this);
                } else {
                    destroyObject(entry.object);
                    // Continue loop to get another or create new
                    continue;
                }
            }

            // If no existing object, try to create new if capacity permits
            if (semaphore.tryAcquire()) {
                try {
                    T object = config.getFactory().get();
                    stats.incrementCreated();
                    stats.incrementBorrowed();
                    return new PooledObject<>(object, this);
                } catch (Exception e) {
                    semaphore.release();
                    throw new RuntimeException("Failed to create object for pool", e);
                }
            }

            // Pool is at capacity, wait for an object to be returned
            long remaining = end - System.currentTimeMillis();
            if (remaining <= 0 && timeout != Long.MAX_VALUE) {
                throw new RuntimeException("Timeout waiting for available object in pool");
            }
            
            entry = availableObjects.poll(remaining > 0 ? remaining : 1, TimeUnit.MILLISECONDS);
            if (entry == null) {
                if (timeout != Long.MAX_VALUE && System.currentTimeMillis() >= end) {
                    throw new RuntimeException("Timeout waiting for available object in pool");
                }
                continue; // Try again
            }

            if (isValid(entry)) {
                stats.incrementBorrowed();
                return new PooledObject<>(entry.object, this);
            } else {
                destroyObject(entry.object);
                // Continue loop
            }
        }
    }

    protected void release(T object) {
        stats.decrementBorrowed();
        if (isClosed.get()) {
            destroyObject(object);
            return;
        }

        // Reset object if it's Poolable
        if (object instanceof Poolable) {
            try {
                ((Poolable) object).reset();
            } catch (Exception e) {
                // If reset fails, we should probably destroy it
                stats.incrementValidationFailures();
                destroyObject(object);
                return;
            }
        }

        boolean isValid = config.getValidator().test(object);
        if (isValid && object instanceof Poolable) {
            isValid = ((Poolable) object).isValid();
        }

        if (isValid) {
            availableObjects.offer(new PoolEntry<>(object));
        } else {
            stats.incrementValidationFailures();
            destroyObject(object);
        }
    }

    private boolean isValid(PoolEntry<T> entry) {
        // Check idle timeout
        if (System.currentTimeMillis() - entry.lastUsedTime > config.getIdleTimeoutMillis()) {
            return false;
        }
        
        // Check Poolable validation if applicable
        if (entry.object instanceof Poolable) {
            if (!((Poolable) entry.object).isValid()) {
                stats.incrementValidationFailures();
                return false;
            }
        }

        // Check custom validator
        return config.getValidator().test(entry.object);
    }

    private void destroyObject(T object) {
        try {
            config.getDestroyer().accept(object);
        } finally {
            semaphore.release();
        }
    }

    private void checkClosed() {
        if (isClosed.get()) {
            throw new IllegalStateException("Pool is closed");
        }
    }

    public int getAvailableCount() {
        return availableObjects.size();
    }

    public int getBorrowedCount() {
        return stats.getCurrentBorrowed();
    }

    public int getTotalCreatedCount() {
        return stats.getTotalCreated();
    }

    public int getValidationFailuresCount() {
        return stats.getValidationFailures();
    }

    @Override
    public void close() {
        if (isClosed.compareAndSet(false, true)) {
            try {
                boolean acquiredAll = semaphore.tryAcquire(config.getMaxSize(), 5, TimeUnit.SECONDS);
                if (!acquiredAll) {
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            List<PoolEntry<T>> entries = new ArrayList<>();
            availableObjects.drainTo(entries);
            for (PoolEntry<T> entry : entries) {
                config.getDestroyer().accept(entry.object);
            }
        }
    }
}
