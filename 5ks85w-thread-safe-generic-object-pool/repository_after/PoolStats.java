

import java.util.concurrent.atomic.AtomicInteger;

public class PoolStats {
    private final AtomicInteger totalCreated = new AtomicInteger(0);
    private final AtomicInteger currentBorrowed = new AtomicInteger(0);
    private final AtomicInteger validationFailures = new AtomicInteger(0);

    public void incrementCreated() {
        totalCreated.incrementAndGet();
    }

    public void incrementBorrowed() {
        currentBorrowed.incrementAndGet();
    }

    public void decrementBorrowed() {
        currentBorrowed.decrementAndGet();
    }

    public void incrementValidationFailures() {
        validationFailures.incrementAndGet();
    }

    public int getTotalCreated() {
        return totalCreated.get();
    }

    public int getCurrentBorrowed() {
        return currentBorrowed.get();
    }

    public int getValidationFailures() {
        return validationFailures.get();
    }
}
