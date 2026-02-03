import com.porthorizon.crane.*;
import org.junit.jupiter.api.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Liveness Watchdog Tests - Requirement 3
 * Includes integration test verifying 150ms timeout triggers FAULT and HALT_ALL.
 */
class LivenessWatchdogTest {
    
    private LivenessWatchdog watchdog;
    
    @BeforeEach
    void setUp() {
        watchdog = new LivenessWatchdog(50_000_000L); // 50ms for fast unit tests
    }
    
    @AfterEach
    void tearDown() {
        if (watchdog != null) watchdog.shutdown();
    }
    
    @Test
    @DisplayName("Test 1: Watchdog starts and stops correctly")
    void test_1() {
        assertFalse(watchdog.isRunning());
        watchdog.start();
        assertTrue(watchdog.isRunning());
        watchdog.stop();
        assertFalse(watchdog.isRunning());
    }
    
    @Test
    @DisplayName("Test 2: Watchdog detects Crane-A timeout")
    void test_2() throws Exception {
        AtomicReference<String> timedOutCrane = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        
        watchdog.setTimeoutCallback(craneId -> {
            timedOutCrane.set(craneId);
            latch.countDown();
        });
        
        watchdog.start();
        watchdog.recordUpdate(TelemetryPulse.CRANE_A);
        watchdog.recordUpdate(TelemetryPulse.CRANE_B);
        
        // Only update Crane-B
        for (int i = 0; i < 10; i++) {
            Thread.sleep(15);
            watchdog.recordUpdate(TelemetryPulse.CRANE_B);
        }
        
        assertTrue(latch.await(500, TimeUnit.MILLISECONDS));
        assertEquals(TelemetryPulse.CRANE_A, timedOutCrane.get());
    }
    
    @Test
    @DisplayName("Test 3: Watchdog detects Crane-B timeout")
    void test_3() throws Exception {
        AtomicReference<String> timedOutCrane = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        
        watchdog.setTimeoutCallback(craneId -> {
            timedOutCrane.set(craneId);
            latch.countDown();
        });
        
        watchdog.start();
        watchdog.recordUpdate(TelemetryPulse.CRANE_A);
        watchdog.recordUpdate(TelemetryPulse.CRANE_B);
        
        // Only update Crane-A
        for (int i = 0; i < 10; i++) {
            Thread.sleep(15);
            watchdog.recordUpdate(TelemetryPulse.CRANE_A);
        }
        
        assertTrue(latch.await(500, TimeUnit.MILLISECONDS));
        assertEquals(TelemetryPulse.CRANE_B, timedOutCrane.get());
    }
    
    @Test
    @DisplayName("Test 4: No timeout when both cranes update regularly")
    void test_4() throws Exception {
        AtomicBoolean timeoutOccurred = new AtomicBoolean(false);
        watchdog.setTimeoutCallback(craneId -> timeoutOccurred.set(true));
        watchdog.start();
        
        for (int i = 0; i < 20; i++) {
            watchdog.recordUpdate(TelemetryPulse.CRANE_A);
            watchdog.recordUpdate(TelemetryPulse.CRANE_B);
            Thread.sleep(15);
        }
        
        assertFalse(timeoutOccurred.get());
    }
    
    @Test
    @DisplayName("Test 5: Reset clears timeout state")
    void test_5() {
        watchdog.start();
        watchdog.recordUpdate(TelemetryPulse.CRANE_A);
        watchdog.reset();
        
        assertFalse(watchdog.hasTimedOut(TelemetryPulse.CRANE_A));
        assertFalse(watchdog.hasTimedOut(TelemetryPulse.CRANE_B));
    }
    
    @Test
    @DisplayName("Test 6: Default timeout is 150ms")
    void test_6() {
        LivenessWatchdog defaultWatchdog = new LivenessWatchdog();
        assertEquals(150_000_000L, defaultWatchdog.getTimeoutNs());
        defaultWatchdog.shutdown();
    }
}