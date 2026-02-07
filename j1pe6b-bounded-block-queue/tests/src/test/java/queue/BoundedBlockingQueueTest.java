package queue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class BoundedBlockingQueueTest {

    @Test
    void constructor_invalidCapacity_throwsException() {
        assertThrows(IllegalArgumentException.class, () -> new BoundedBlockingQueue<>(0));
        assertThrows(IllegalArgumentException.class, () -> new BoundedBlockingQueue<>(-1));
    }

    @Test
    void initialState_isEmptyAndSizeZero() {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(5);
        assertThat(queue.isEmpty()).isTrue();
        assertThat(queue.isFull()).isFalse();
        assertThat(queue.size()).isEqualTo(0);
    }

    @Test
    void basicPutAndTake_singleElement() throws InterruptedException {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(5);
        queue.put(10);
        assertThat(queue.isEmpty()).isFalse();
        assertThat(queue.size()).isEqualTo(1);
        assertThat(queue.take()).isEqualTo(10);
        assertThat(queue.isEmpty()).isTrue();
    }

    @Test
    void fifoOrder_multipleElements() throws InterruptedException {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(3);
        queue.put(1);
        queue.put(2);
        queue.put(3);
        assertThat(queue.isFull()).isTrue();
        assertThat(queue.take()).isEqualTo(1);
        assertThat(queue.take()).isEqualTo(2);
        assertThat(queue.take()).isEqualTo(3);
        assertThat(queue.isEmpty()).isTrue();
    }

    @Test
    void circularBuffer_wraparound() throws InterruptedException {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(2);
        queue.put(1);
        queue.put(2);
        assertThat(queue.take()).isEqualTo(1);
        queue.put(3); // Should wrap around to index 0
        assertThat(queue.take()).isEqualTo(2);
        assertThat(queue.take()).isEqualTo(3);
        assertThat(queue.isEmpty()).isTrue();
    }

    @Test
    @Timeout(value = 5, unit = TimeUnit.SECONDS)
    void put_blocksWhenFull() throws InterruptedException {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(1);
        queue.put(1);
        
        CountDownLatch latch = new CountDownLatch(1);
        AtomicBoolean putFinished = new AtomicBoolean(false);
        
        Thread producer = new Thread(() -> {
            try {
                latch.countDown();
                queue.put(2);
                putFinished.set(true);
            } catch (InterruptedException ignored) {}
        });
        
        producer.start();
        latch.await();
        Thread.sleep(100); // Give producer time to block
        
        assertThat(putFinished.get()).isFalse();
        assertThat(queue.take()).isEqualTo(1);
        
        producer.join();
        assertThat(putFinished.get()).isTrue();
        assertThat(queue.take()).isEqualTo(2);
    }

    @Test
    @Timeout(value = 5, unit = TimeUnit.SECONDS)
    void take_blocksWhenEmpty() throws InterruptedException {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(1);
        
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<Integer> result = new AtomicReference<>();
        
        Thread consumer = new Thread(() -> {
            try {
                latch.countDown();
                result.set(queue.take());
            } catch (InterruptedException ignored) {}
        });
        
        consumer.start();
        latch.await();
        Thread.sleep(100); // Give consumer time to block
        
        assertThat(result.get()).isNull();
        queue.put(42);
        
        consumer.join();
        assertThat(result.get()).isEqualTo(42);
    }

    @Test
    void offer_timeoutReturnsFalse() throws InterruptedException {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(1);
        queue.put(1);
        long start = System.currentTimeMillis();
        boolean result = queue.offer(2, 200, TimeUnit.MILLISECONDS);
        long duration = System.currentTimeMillis() - start;
        
        assertThat(result).isFalse();
        assertThat(duration).isGreaterThanOrEqualTo(200);
    }

    @Test
    void offer_timeoutReturnsTrue() throws InterruptedException {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(1);
        boolean result = queue.offer(1, 1, TimeUnit.SECONDS);
        assertThat(result).isTrue();
        assertThat(queue.take()).isEqualTo(1);
    }

    @Test
    void poll_timeoutReturnsNull() throws InterruptedException {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(1);
        long start = System.currentTimeMillis();
        Integer result = queue.poll(200, TimeUnit.MILLISECONDS);
        long duration = System.currentTimeMillis() - start;
        
        assertThat(result).isNull();
        assertThat(duration).isGreaterThanOrEqualTo(200);
    }

    @Test
    void poll_timeoutReturnsValue() throws InterruptedException {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(1);
        queue.put(42);
        Integer result = queue.poll(1, TimeUnit.SECONDS);
        assertThat(result).isEqualTo(42);
    }

    @Test
    void shutdown_cancelsBlockedThreads() throws InterruptedException {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(1);
        queue.put(1);
        
        AtomicReference<Exception> exceptionRef = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        
        Thread producer = new Thread(() -> {
            try {
                latch.countDown();
                queue.put(2);
            } catch (Exception e) {
                exceptionRef.set(e);
            }
        });
        
        producer.start();
        latch.await();
        Thread.sleep(100);
        
        queue.shutdown();
        producer.join();
        
        assertThat(exceptionRef.get()).isInstanceOf(IllegalStateException.class)
                .hasMessage("Queue has been shut down");
    }

    @Test
    void operations_afterShutdown_throwException() {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(5);
        queue.shutdown();
        
        assertThrows(IllegalStateException.class, () -> queue.put(1));
        assertThrows(IllegalStateException.class, () -> queue.take());
        assertThrows(IllegalStateException.class, () -> queue.offer(1, 1, TimeUnit.SECONDS));
        assertThrows(IllegalStateException.class, () -> queue.poll(1, TimeUnit.SECONDS));
    }

    @Test
    @Timeout(value = 10, unit = TimeUnit.SECONDS)
    void concurrentProducersAndConsumers() throws InterruptedException {
        int capacity = 10;
        int numProducers = 5;
        int numConsumers = 5;
        int itemsPerProducer = 1000;
        int totalItems = numProducers * itemsPerProducer;
        
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(capacity);
        List<Integer> consumedItems = Collections.synchronizedList(new ArrayList<>());
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(numProducers + numConsumers);
        
        for (int i = 0; i < numProducers; i++) {
            final int producerId = i;
            new Thread(() -> {
                try {
                    startLatch.await();
                    for (int j = 0; j < itemsPerProducer; j++) {
                        queue.put(producerId * itemsPerProducer + j);
                    }
                } catch (InterruptedException ignored) {
                } finally {
                    doneLatch.countDown();
                }
            }).start();
        }
        
        for (int i = 0; i < numConsumers; i++) {
            new Thread(() -> {
                try {
                    startLatch.await();
                    for (int j = 0; j < itemsPerProducer; j++) {
                        consumedItems.add(queue.take());
                    }
                } catch (InterruptedException ignored) {
                } finally {
                    doneLatch.countDown();
                }
            }).start();
        }
        
        startLatch.countDown();
        doneLatch.await();
        
        assertThat(consumedItems).hasSize(totalItems);
        assertThat(queue.isEmpty()).isTrue();
        assertThat(queue.size()).isEqualTo(0);
        
        // Ensure all items were consumed exactly once
        Collections.sort(consumedItems);
        for (int i = 0; i < totalItems; i++) {
            assertThat(consumedItems.get(i)).isEqualTo(i);
        }
    }

    @Test
    void interrupt_wakesUpWait() throws InterruptedException {
        BoundedBlockingQueue<Integer> queue = new BoundedBlockingQueue<>(1);
        queue.put(1);
        
        AtomicBoolean interrupted = new AtomicBoolean(false);
        CountDownLatch latch = new CountDownLatch(1);
        
        Thread producer = new Thread(() -> {
            try {
                latch.countDown();
                queue.put(2);
            } catch (InterruptedException e) {
                interrupted.set(true);
            }
        });
        
        producer.start();
        latch.await();
        Thread.sleep(100);
        
        producer.interrupt();
        producer.join();
        
        assertThat(interrupted.get()).isTrue();
        assertThat(queue.size()).isEqualTo(1);
        assertThat(queue.take()).isEqualTo(1);
    }
}
