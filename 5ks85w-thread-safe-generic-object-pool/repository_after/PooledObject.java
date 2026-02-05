

import java.util.concurrent.atomic.AtomicBoolean;

public class PooledObject<T> implements AutoCloseable {
    private final T object;
    private final ObjectPool<T> pool;
    private final long lastUsedTime;
    private final AtomicBoolean released = new AtomicBoolean(false);

    public PooledObject(T object, ObjectPool<T> pool) {
        this.object = object;
        this.pool = pool;
        this.lastUsedTime = System.currentTimeMillis();
    }

    public T getObject() {
        if (released.get()) {
            throw new IllegalStateException("Object has already been released to the pool");
        }
        return object;
    }

    public long getLastUsedTime() {
        return lastUsedTime;
    }

    @Override
    public void close() {
        if (released.compareAndSet(false, true)) {
            pool.release(object);
        }
    }
}
