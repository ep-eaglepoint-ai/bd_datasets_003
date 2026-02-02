package com.porthorizon.crane;

import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.Consumer;

/**
 * Monitors liveness of crane telemetry streams.
 * Triggers emergency shutdown if a crane fails to report within timeout.
 */
public class LivenessWatchdog {
    
    private static final long DEFAULT_TIMEOUT_NS = 150_000_000L; // 150ms
    private static final long CHECK_INTERVAL_MS = 10; // Check every 10ms
    
    private final long timeoutNs;
    private final AtomicLong lastUpdateCraneA = new AtomicLong(0);
    private final AtomicLong lastUpdateCraneB = new AtomicLong(0);
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicBoolean craneATimedOut = new AtomicBoolean(false);
    private final AtomicBoolean craneBTimedOut = new AtomicBoolean(false);
    
    private final ScheduledExecutorService executor;
    private ScheduledFuture<?> watchdogTask;
    private Consumer<String> timeoutCallback;
    
    public LivenessWatchdog() {
        this(DEFAULT_TIMEOUT_NS);
    }
    
    public LivenessWatchdog(long timeoutNs) {
        this.timeoutNs = timeoutNs;
        this.executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "liveness-watchdog");
            t.setDaemon(true);
            t.setPriority(Thread.MAX_PRIORITY);
            return t;
        });
    }
    
    /**
     * Starts the watchdog monitoring.
     */
    public void start() {
        if (running.compareAndSet(false, true)) {
            long now = System.nanoTime();
            lastUpdateCraneA.set(now);
            lastUpdateCraneB.set(now);
            craneATimedOut.set(false);
            craneBTimedOut.set(false);
            
            watchdogTask = executor.scheduleAtFixedRate(
                this::checkLiveness, 
                CHECK_INTERVAL_MS, 
                CHECK_INTERVAL_MS, 
                TimeUnit.MILLISECONDS
            );
        }
    }
    
    /**
     * Stops the watchdog monitoring.
     */
    public void stop() {
        if (running.compareAndSet(true, false)) {
            if (watchdogTask != null) {
                watchdogTask.cancel(false);
                watchdogTask = null;
            }
        }
    }
    
    /**
     * Records a telemetry update from a crane.
     */
    public void recordUpdate(String craneId) {
        recordUpdate(craneId, System.nanoTime());
    }
    
    /**
     * Records a telemetry update with specific timestamp.
     */
    public void recordUpdate(String craneId, long timestampNs) {
        if (TelemetryPulse.CRANE_A.equals(craneId)) {
            lastUpdateCraneA.set(timestampNs);
            craneATimedOut.set(false);
        } else if (TelemetryPulse.CRANE_B.equals(craneId)) {
            lastUpdateCraneB.set(timestampNs);
            craneBTimedOut.set(false);
        }
    }
    
    private void checkLiveness() {
        if (!running.get()) return;
        
        long now = System.nanoTime();
        long lastA = lastUpdateCraneA.get();
        long lastB = lastUpdateCraneB.get();
        
        if (lastA > 0 && (now - lastA) > timeoutNs && !craneATimedOut.get()) {
            craneATimedOut.set(true);
            notifyTimeout(TelemetryPulse.CRANE_A);
        }
        
        if (lastB > 0 && (now - lastB) > timeoutNs && !craneBTimedOut.get()) {
            craneBTimedOut.set(true);
            notifyTimeout(TelemetryPulse.CRANE_B);
        }
    }
    
    private void notifyTimeout(String craneId) {
        if (timeoutCallback != null) {
            timeoutCallback.accept(craneId);
        }
    }
    
    /**
     * Sets the callback for timeout notifications.
     */
    public void setTimeoutCallback(Consumer<String> callback) {
        this.timeoutCallback = callback;
    }
    
    /**
     * Checks if a specific crane has timed out.
     */
    public boolean hasTimedOut(String craneId) {
        if (TelemetryPulse.CRANE_A.equals(craneId)) {
            return craneATimedOut.get();
        } else if (TelemetryPulse.CRANE_B.equals(craneId)) {
            return craneBTimedOut.get();
        }
        return false;
    }
    
    /**
     * Checks if any crane has timed out.
     */
    public boolean hasAnyTimeout() {
        return craneATimedOut.get() || craneBTimedOut.get();
    }
    
    /**
     * Gets the time since last update for a crane.
     */
    public long getTimeSinceLastUpdate(String craneId) {
        long now = System.nanoTime();
        if (TelemetryPulse.CRANE_A.equals(craneId)) {
            return now - lastUpdateCraneA.get();
        } else if (TelemetryPulse.CRANE_B.equals(craneId)) {
            return now - lastUpdateCraneB.get();
        }
        return Long.MAX_VALUE;
    }
    
    /**
     * Resets the watchdog state.
     */
    public void reset() {
        long now = System.nanoTime();
        lastUpdateCraneA.set(now);
        lastUpdateCraneB.set(now);
        craneATimedOut.set(false);
        craneBTimedOut.set(false);
    }
    
    public boolean isRunning() {
        return running.get();
    }
    
    public long getTimeoutNs() {
        return timeoutNs;
    }
    
    /**
     * Shuts down the watchdog executor.
     */
    public void shutdown() {
        stop();
        executor.shutdown();
        try {
            if (!executor.awaitTermination(100, TimeUnit.MILLISECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}