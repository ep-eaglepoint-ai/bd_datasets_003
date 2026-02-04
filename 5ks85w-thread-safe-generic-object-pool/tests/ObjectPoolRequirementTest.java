
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import static org.junit.jupiter.api.Assertions.*;

public class ObjectPoolRequirementTest {

    static class TestObject implements Poolable {
        private static final AtomicInteger ID_GEN = new AtomicInteger();
        private final int id = ID_GEN.incrementAndGet();
        private boolean valid = true;
        private boolean resetCalled = false;

        @Override
        public void reset() {
            resetCalled = true;
        }

        @Override
        public boolean isValid() {
            return valid;
        }

        public void invalidate() {
            valid = false;
        }

        @Override
        public String toString() {
            return "TestObject-" + id;
        }
    }

    @Test
    void testBasicBorrowAndRelease() throws InterruptedException {
        PoolConfig<TestObject> config = PoolConfig.builder(TestObject::new, 2).build();
        try (ObjectPool<TestObject> pool = new ObjectPool<>(config)) {
            TestObject obj;
            try (PooledObject<TestObject> wrapper = pool.borrow()) {
                obj = wrapper.getObject();
                assertNotNull(obj);
                assertEquals(1, pool.getBorrowedCount());
                assertEquals(1, pool.getTotalCreatedCount());
            }
            assertEquals(0, pool.getBorrowedCount());
            assertEquals(1, pool.getAvailableCount());
            assertTrue(obj.resetCalled, "Reset should be called on release if Poolable");
        }
    }

    @Test
    void testPoolCapacityAndBlocking() throws InterruptedException {
        PoolConfig<TestObject> config = PoolConfig.builder(TestObject::new, 1).build();
        try (ObjectPool<TestObject> pool = new ObjectPool<>(config)) {
            PooledObject<TestObject> first = pool.borrow();
            
            assertThrows(RuntimeException.class, () -> pool.borrow(100, TimeUnit.MILLISECONDS));
            
            first.close();
            
            try (PooledObject<TestObject> second = pool.borrow()) {
                assertNotNull(second.getObject());
            }
        }
    }

    @Test
    void testValidationOnRelease() throws InterruptedException {
        PoolConfig<TestObject> config = PoolConfig.builder(TestObject::new, 1).build();
        try (ObjectPool<TestObject> pool = new ObjectPool<>(config)) {
            TestObject obj;
            try (PooledObject<TestObject> wrapper = pool.borrow()) {
                obj = wrapper.getObject();
                obj.invalidate();
            }
            // Pool should have discarded the invalid object
            assertEquals(0, pool.getAvailableCount());
            assertEquals(1, pool.getValidationFailuresCount());
            
            // Should create a new one next time
            try (PooledObject<TestObject> wrapper = pool.borrow()) {
                assertNotSame(obj, wrapper.getObject());
            }
        }
    }

    @Test
    void testIdleTimeout() throws InterruptedException {
        PoolConfig<TestObject> config = PoolConfig.builder(TestObject::new, 5)
                .idleTimeoutMillis(100)
                .build();
        try (ObjectPool<TestObject> pool = new ObjectPool<>(config)) {
            TestObject obj;
            try (PooledObject<TestObject> wrapper = pool.borrow()) {
                obj = wrapper.getObject();
            }
            
            assertEquals(1, pool.getAvailableCount());
            Thread.sleep(200); // Wait for timeout
            
            try (PooledObject<TestObject> wrapper = pool.borrow()) {
                assertNotSame(obj, wrapper.getObject());
            }
        }
    }

    @Test
    void testFactoryExceptionHandling() {
        Supplier<TestObject> failingFactory = () -> {
            throw new RuntimeException("Factory fail");
        };
        PoolConfig<TestObject> config = PoolConfig.builder(failingFactory, 1).build();
        
        try (ObjectPool<TestObject> pool = new ObjectPool<>(config)) {
            assertThrows(RuntimeException.class, pool::borrow);
            
            assertThrows(RuntimeException.class, () -> pool.borrow(10, TimeUnit.MILLISECONDS));
        }
    }

    @Test
    void testPoolShutdown() throws InterruptedException {
        AtomicInteger destroyedCount = new AtomicInteger();
        PoolConfig<TestObject> config = PoolConfig.builder(TestObject::new, 5)
                .destroyer(obj -> destroyedCount.incrementAndGet())
                .build();
        
        ObjectPool<TestObject> pool = new ObjectPool<>(config);
        PooledObject<TestObject> o1 = pool.borrow();
        PooledObject<TestObject> o2 = pool.borrow();
        o1.close();
        o2.close();
        
        assertEquals(2, pool.getAvailableCount());
        pool.close();
        
        assertEquals(2, destroyedCount.get(), "Destroyer should be called on all available objects during shutdown");
        assertThrows(IllegalStateException.class, pool::borrow);
    }

    @Test
    @Timeout(value = 10, unit = TimeUnit.SECONDS)
    void testConcurrentAccess() throws InterruptedException {
        int threads = 20;
        int iterations = 100;
        PoolConfig<TestObject> config = PoolConfig.builder(TestObject::new, 5).build();
        
        try (ObjectPool<TestObject> pool = new ObjectPool<>(config)) {
            ExecutorService executor = Executors.newFixedThreadPool(threads);
            CountDownLatch latch = new CountDownLatch(threads);
            
            for (int i = 0; i < threads; i++) {
                executor.submit(() -> {
                    try {
                        for (int j = 0; j < iterations; j++) {
                            try (PooledObject<TestObject> wrapper = pool.borrow()) {
                                wrapper.getObject().toString();
                                Thread.sleep(1);
                            }
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                    } finally {
                        latch.countDown();
                    }
                });
            }
            
            latch.await();
            executor.shutdown();
            
            assertEquals(0, pool.getBorrowedCount());
            assertTrue(pool.getTotalCreatedCount() <= 5);
        }
    }
}
