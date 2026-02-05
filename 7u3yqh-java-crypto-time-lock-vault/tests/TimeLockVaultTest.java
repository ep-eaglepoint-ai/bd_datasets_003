import com.fortress.vault.TimeLockVault;
import com.fortress.vault.VaultState;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class TimeLockVaultTest {
    
    // Mutable Clock for testing time travel
    static class MutableClock extends Clock {
        private Instant instant;
        private final ZoneId zone;

        public MutableClock(Instant instant, ZoneId zone) {
            this.instant = instant;
            this.zone = zone;
        }

        @Override
        public ZoneId getZone() {
            return zone;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return new MutableClock(instant, zone);
        }

        @Override
        public Instant instant() {
            return instant;
        }

        public void advance(Duration duration) {
            instant = instant.plus(duration);
        }
    }

    private void assertEquals(Object expected, Object actual) {
        if (!expected.equals(actual)) {
            throw new AssertionError("Expected " + expected + " but got " + actual);
        }
    }

    private void assertTrue(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    public void testHappyPath() {
        MutableClock clock = new MutableClock(Instant.now(), ZoneId.systemDefault());
        Duration coolDown = Duration.ofHours(48);
        Duration window = Duration.ofHours(1);
        
        TimeLockVault vault = new TimeLockVault(coolDown, window, clock);
        
        // Initial State
        assertEquals(VaultState.LOCKED, vault.getState());
        
        // Initiate
        vault.initiateWithdrawal();
        assertEquals(VaultState.PENDING_WITHDRAWAL, vault.getState());
        
        // Wait 47 hours (still PENDING)
        clock.advance(Duration.ofHours(47));
        assertEquals(VaultState.PENDING_WITHDRAWAL, vault.getState());
        
        // Wait 1 more hour (48 total) -> Ready
        clock.advance(Duration.ofHours(1));
        assertEquals(VaultState.READY_FOR_RELEASE, vault.getState());
        
        // Confirm
        vault.confirmWithdrawal();
        assertEquals(VaultState.RELEASED, vault.getState());
    }

    public void testExpiration() {
        MutableClock clock = new MutableClock(Instant.now(), ZoneId.systemDefault());
        Duration coolDown = Duration.ofHours(48);
        Duration window = Duration.ofHours(1);
        
        TimeLockVault vault = new TimeLockVault(coolDown, window, clock);
        
        vault.initiateWithdrawal();
        clock.advance(Duration.ofHours(48));
        assertEquals(VaultState.READY_FOR_RELEASE, vault.getState());
        
        // Advance past window (1 hour + 1 second)
        clock.advance(Duration.ofHours(1).plusSeconds(1));
        assertEquals(VaultState.LOCKED, vault.getState());
    }

    public void testCancellation() {
        MutableClock clock = new MutableClock(Instant.now(), ZoneId.systemDefault());
        Duration coolDown = Duration.ofHours(48);
        Duration window = Duration.ofHours(1);
        
        TimeLockVault vault = new TimeLockVault(coolDown, window, clock);
        
        vault.initiateWithdrawal();
        assertEquals(VaultState.PENDING_WITHDRAWAL, vault.getState());
        
        vault.cancelWithdrawal();
        assertEquals(VaultState.CANCELLED, vault.getState());
        
        // Ensure cannot confirm
        try {
            vault.confirmWithdrawal();
            throw new AssertionError("Should not be able to confirm cancelled withdrawal");
        } catch (IllegalStateException e) {
            // Expected
        }
    }

    public void testIdempotencyAndStateRules() {
        MutableClock clock = new MutableClock(Instant.now(), ZoneId.systemDefault());
        TimeLockVault vault = new TimeLockVault(Duration.ofHours(48), Duration.ofHours(1), clock);
        
        // Cannot confirm from LOCKED
        try {
            vault.confirmWithdrawal();
            throw new AssertionError("Should validation failed");
        } catch (IllegalStateException e) {}
        
        // Cannot cancel from LOCKED, assume we can only cancel pending transactions?
        // Requirement 4 says "cancel action must only succeed if state is PENDING_WITHDRAWAL"
         try {
            vault.cancelWithdrawal();
            throw new AssertionError("Should validation failed");
        } catch (IllegalStateException e) {}

        vault.initiateWithdrawal();
        assertEquals(VaultState.PENDING_WITHDRAWAL, vault.getState());
        
        // Cannot confirm yet
        try {
            vault.confirmWithdrawal();
            throw new AssertionError("Should validation failed");
        } catch (IllegalStateException e) {}
    }

    public void testThreadSafety() throws InterruptedException {
         MutableClock clock = new MutableClock(Instant.now(), ZoneId.systemDefault());
         TimeLockVault vault = new TimeLockVault(Duration.ofHours(48), Duration.ofHours(1), clock);
         
         int threads = 100;
         ExecutorService executor = Executors.newFixedThreadPool(threads);
         CountDownLatch latch = new CountDownLatch(1);
         AtomicInteger successfulInitiations = new AtomicInteger(0);

         // Try to initiate from many threads simultaneously
         for (int i = 0; i < threads; i++) {
             executor.submit(() -> {
                 try {
                     latch.await();
                     vault.initiateWithdrawal();
                     successfulInitiations.incrementAndGet();
                 } catch (Exception e) {
                     // Expected for subsequent calls if state check fails inside lock?
                     // Actually initiateWithdrawal throws if state is not allowed. 
                     // But initiate is allowed from LOCKED, CANCELLED, RELEASED.
                     // If one thread succeeds, state becomes PENDING.
                     // Next threads will see PENDING and throw IllegalStateException 
                     // (since PENDING is not in allowed start states in my impl: LOCKED/CANCELLED/RELEASED).
                 }
             });
         }
         
         latch.countDown();
         executor.shutdown();
         executor.awaitTermination(5, TimeUnit.SECONDS);
         
         // Only one should have succeeded effectively changing it from LOCKED -> PENDING
         // The others should have failed or just reset it (if I allowed PENDING -> PENDING, which I didn't)
         // In my impl: 
         // if (state == LOCKED || CANCELLED || RELEASED) -> OK
         // else -> Throw
         // So only the first one passes, others see PENDING and throw.
         
         assertEquals(1, successfulInitiations.get());
         assertEquals(VaultState.PENDING_WITHDRAWAL, vault.getState());
    }

    public void testReinitiation() {
        MutableClock clock = new MutableClock(Instant.now(), ZoneId.systemDefault());
        TimeLockVault vault = new TimeLockVault(Duration.ofHours(48), Duration.ofHours(1), clock);

        // 1. Cancelled -> Pending
        vault.initiateWithdrawal();
        vault.cancelWithdrawal();
        assertEquals(VaultState.CANCELLED, vault.getState());
        
        vault.initiateWithdrawal(); // Should succeed
        assertEquals(VaultState.PENDING_WITHDRAWAL, vault.getState());
        
        // Reset for next part
        vault.cancelWithdrawal(); 
        
        // 2. Released -> Pending
        // Helper to fast forward to release
        clock.advance(Duration.ofHours(48)); // Ready
        
        // Need to be in PENDING to go to READY. Wait, we are in CANCELLED.
        // Let's re-initiate again properly
        vault.initiateWithdrawal();
        clock.advance(Duration.ofHours(48));
        assertEquals(VaultState.READY_FOR_RELEASE, vault.getState());
        
        vault.confirmWithdrawal();
        assertEquals(VaultState.RELEASED, vault.getState());
        
        vault.initiateWithdrawal(); // Should succeed
        assertEquals(VaultState.PENDING_WITHDRAWAL, vault.getState());
    }

    public void testDefaultConstructor() {
        // Just verify it doesn't crash and starts in LOCKED
        TimeLockVault vault = new TimeLockVault(Duration.ofHours(48), Duration.ofHours(1));
        assertEquals(VaultState.LOCKED, vault.getState());
    }
}
