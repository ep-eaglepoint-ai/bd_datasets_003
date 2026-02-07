package queue;

import java.util.concurrent.TimeUnit;

/**
 * A generic thread-safe bounded blocking queue implementation using the wait-notify pattern.
 *
 * @param <E> the type of elements held in this queue
 */
public class BoundedBlockingQueue<E> {
    private final Object[] buffer;
    private final int capacity;
    private int head;
    private int tail;
    private int count;
    private boolean shutdown;

    /**
     * Constructs a BoundedBlockingQueue with the specified capacity.
     *
     * @param capacity the maximum number of elements the queue can hold
     * @throws IllegalArgumentException if capacity is less than 1
     */
    public BoundedBlockingQueue(int capacity) {
        if (capacity < 1) {
            throw new IllegalArgumentException("Capacity must be at least 1");
        }
        this.capacity = capacity;
        this.buffer = new Object[capacity];
        this.head = 0;
        this.tail = 0;
        this.count = 0;
        this.shutdown = false;
    }

    /**
     * Adds an element to the tail of the queue, blocking if the queue is full.
     *
     * @param element the element to add
     * @throws InterruptedException if the thread is interrupted while waiting
     * @throws IllegalStateException if the queue has been shut down
     */
    public synchronized void put(E element) throws InterruptedException {
        checkShutdown();
        while (count == capacity) {
            wait();
            checkShutdown();
        }
        
        buffer[tail] = element;
        tail = (tail + 1) % capacity;
        count++;
        notifyAll();
    }

    /**
     * Retrieves and removes the element from the head of the queue, blocking if the queue is empty.
     *
     * @return the removed element
     * @throws InterruptedException if the thread is interrupted while waiting
     * @throws IllegalStateException if the queue has been shut down
     */
    @SuppressWarnings("unchecked")
    public synchronized E take() throws InterruptedException {
        checkShutdown();
        while (count == 0) {
            wait();
            checkShutdown();
        }

        E element = (E) buffer[head];
        buffer[head] = null; // Prevent memory leak
        head = (head + 1) % capacity;
        count--;
        notifyAll();
        return element;
    }

    /**
     * Attempts to add an element to the queue within the specified timeout.
     *
     * @param element the element to add
     * @param timeout the maximum time to wait
     * @param unit the time unit of the timeout argument
     * @return true if successful, false if the timeout elapsed
     * @throws InterruptedException if the thread is interrupted while waiting
     * @throws IllegalStateException if the queue has been shut down
     */
    public synchronized boolean offer(E element, long timeout, TimeUnit unit) throws InterruptedException {
        checkShutdown();
        long remainingNanos = unit.toNanos(timeout);
        long deadline = System.nanoTime() + remainingNanos;

        while (count == capacity) {
            if (remainingNanos <= 0) {
                return false;
            }
            long startWait = System.nanoTime();
            wait(remainingNanos / 1_000_000, (int) (remainingNanos % 1_000_000));
            checkShutdown();
            remainingNanos = deadline - System.nanoTime();
        }

        buffer[tail] = element;
        tail = (tail + 1) % capacity;
        count++;
        notifyAll();
        return true;
    }

    /**
     * Attempts to retrieve and remove an element from the queue within the specified timeout.
     *
     * @param timeout the maximum time to wait
     * @param unit the time unit of the timeout argument
     * @return the element, or null if the timeout elapsed
     * @throws InterruptedException if the thread is interrupted while waiting
     * @throws IllegalStateException if the queue has been shut down
     */
    @SuppressWarnings("unchecked")
    public synchronized E poll(long timeout, TimeUnit unit) throws InterruptedException {
        checkShutdown();
        long remainingNanos = unit.toNanos(timeout);
        long deadline = System.nanoTime() + remainingNanos;

        while (count == 0) {
            if (remainingNanos <= 0) {
                return null;
            }
            wait(remainingNanos / 1_000_000, (int) (remainingNanos % 1_000_000));
            checkShutdown();
            remainingNanos = deadline - System.nanoTime();
        }

        E element = (E) buffer[head];
        buffer[head] = null;
        head = (head + 1) % capacity;
        count--;
        notifyAll();
        return element;
    }

    /**
     * Returns the number of elements in the queue.
     *
     * @return the number of elements in the queue
     */
    public synchronized int size() {
        return count;
    }

    /**
     * Returns true if the queue is empty.
     *
     * @return true if the queue is empty
     */
    public synchronized boolean isEmpty() {
        return count == 0;
    }

    /**
     * Returns true if the queue is full.
     *
     * @return true if the queue is full
     */
    public synchronized boolean isFull() {
        return count == capacity;
    }

    /**
     * Shuts down the queue, waking all blocked threads and preventing new operations.
     */
    public synchronized void shutdown() {
        this.shutdown = true;
        notifyAll();
    }

    private void checkShutdown() {
        if (shutdown) {
            throw new IllegalStateException("Queue has been shut down");
        }
    }
}
