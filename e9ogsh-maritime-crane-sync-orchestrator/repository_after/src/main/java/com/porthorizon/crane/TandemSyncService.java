package com.porthorizon.crane;

import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.Consumer;
import java.util.List;
import java.util.ArrayList;

/**
 * Real-time safety synchronization service for tandem crane operations.
 */
public class TandemSyncService {
    
    // Safety thresholds
    public static final double TILT_THRESHOLD_MM = 100.0;
    public static final long LIVENESS_TIMEOUT_NS = 150_000_000L;
    public static final long MAX_ALIGNMENT_DELTA_NS = 100_000_000L;
    public static final long MAX_PROCESSING_WINDOW_NS = 10_000_000L;
    
    // Atomic state management
    private final AtomicReference<LiftState> state = new AtomicReference<>(LiftState.IDLE);
    private final AtomicReference<TelemetryPulse> latestCraneA = new AtomicReference<>();
    private final AtomicReference<TelemetryPulse> latestCraneB = new AtomicReference<>();
    private final AtomicBoolean staleDataDetected = new AtomicBoolean(false);
    private final AtomicLong thresholdCrossedTimestampNs = new AtomicLong(0);
    private final AtomicLong haltIssuedTimestampNs = new AtomicLong(0);
    
    private final MotorController motorControllerA;
    private final MotorController motorControllerB;
    private final LivenessWatchdog watchdog;
    private final ExecutorService processingExecutor;
    private final ConcurrentLinkedQueue<Command> commandHistory = new ConcurrentLinkedQueue<>();
    
    private Consumer<Command> commandListener;
    private Consumer<String> faultListener;
    private Consumer<AlignedTelemetryPair> alignmentListener;
    
    public TandemSyncService(MotorController motorControllerA, MotorController motorControllerB) {
        this.motorControllerA = motorControllerA;
        this.motorControllerB = motorControllerB;
        this.watchdog = new LivenessWatchdog(LIVENESS_TIMEOUT_NS);
        
        this.processingExecutor = Executors.newFixedThreadPool(2, r -> {
            Thread t = new Thread(r, "telemetry-processor");
            t.setDaemon(true);
            t.setPriority(Thread.MAX_PRIORITY - 1);
            return t;
        });
        
        watchdog.setTimeoutCallback(craneId -> triggerFault("Communication timeout: " + craneId));
    }
    
    public void start() {
        LiftState current = state.get();
        if (current == LiftState.FAULT) {
            throw new IllegalStateException("Cannot start: System is in FAULT state. Manual reset required.");
        }
        if (state.compareAndSet(LiftState.IDLE, LiftState.LIFTING)) {
            watchdog.start();
        }
    }
    
    public void stop() {
        watchdog.stop();
        state.set(LiftState.IDLE);
    }
    
    public void reset() {
        watchdog.stop();
        watchdog.reset();
        state.set(LiftState.IDLE);
        staleDataDetected.set(false);
        thresholdCrossedTimestampNs.set(0);
        haltIssuedTimestampNs.set(0);
        latestCraneA.set(null);
        latestCraneB.set(null);
        commandHistory.clear();
    }
    
    public void ingestTelemetry(TelemetryPulse pulse) {
        long arrivalTime = System.nanoTime();
        CompletableFuture.runAsync(() -> processTelemetry(pulse, arrivalTime), processingExecutor);
    }
    
    public void ingestTelemetrySync(TelemetryPulse pulse) {
        processTelemetry(pulse, System.nanoTime());
    }
    
    private void processTelemetry(TelemetryPulse pulse, long arrivalTime) {
        if (state.get() == LiftState.FAULT) {
            return;
        }
        
        // Update latest pulse ONLY if newer by internal timestamp (handles out-of-order)
        if (TelemetryPulse.CRANE_A.equals(pulse.craneId())) {
            updateIfNewer(latestCraneA, pulse);
            watchdog.recordUpdate(TelemetryPulse.CRANE_A, arrivalTime);
        } else if (TelemetryPulse.CRANE_B.equals(pulse.craneId())) {
            updateIfNewer(latestCraneB, pulse);
            watchdog.recordUpdate(TelemetryPulse.CRANE_B, arrivalTime);
        }
        
        evaluateSafety();
    }
    
    private void updateIfNewer(AtomicReference<TelemetryPulse> ref, TelemetryPulse newPulse) {
        ref.updateAndGet(current -> {
            if (current == null || newPulse.timestampNs() > current.timestampNs()) {
                return newPulse;
            }
            return current;
        });
    }
    
    private void evaluateSafety() {
        // Get the most recent pulse from each crane (by internal timestamp)
        TelemetryPulse pulseA = latestCraneA.get();
        TelemetryPulse pulseB = latestCraneB.get();
        
        if (pulseA == null || pulseB == null) {
            return;
        }
        
        // Create aligned pair from the most recent pulses
        AlignedTelemetryPair pair = new AlignedTelemetryPair(pulseA, pulseB);
        
        // Check if the most recent pulses are well-aligned (within 100ms)
        if (!pair.isWellAligned(MAX_ALIGNMENT_DELTA_NS)) {
            staleDataDetected.set(true);
            if (alignmentListener != null) {
                alignmentListener.accept(pair);
            }
            return;
        }
        staleDataDetected.set(false);
        
        // Calculate tilt delta on the most recent aligned data
        double tiltDelta = pair.calculateTiltDeltaMm();
        
        if (tiltDelta > TILT_THRESHOLD_MM) {
            long crossedTime = System.nanoTime();
            thresholdCrossedTimestampNs.set(crossedTime);
            triggerFaultWithTiming(
                String.format("Tilt threshold exceeded: %.2fmm > %.2fmm", tiltDelta, TILT_THRESHOLD_MM),
                crossedTime
            );
        }
        
        if (alignmentListener != null) {
            alignmentListener.accept(pair);
        }
    }
    
    private void triggerFaultWithTiming(String reason, long thresholdCrossedTime) {
        LiftState previous = state.getAndSet(LiftState.FAULT);
        
        if (previous != LiftState.FAULT) {
            // Issue HALT_ALL command to both controllers immediately
            Command haltAll = Command.haltAll();
            long haltTime = System.nanoTime();
            haltIssuedTimestampNs.set(haltTime);
            
            // Dispatch to both controllers
            commandHistory.add(haltAll);
            motorControllerA.sendCommand(haltAll);
            motorControllerB.sendCommand(haltAll);
            
            watchdog.stop();
            
            if (commandListener != null) {
                commandListener.accept(haltAll);
            }
            
            if (faultListener != null) {
                faultListener.accept(reason);
            }
        }
    }
    
    private void triggerFault(String reason) {
        triggerFaultWithTiming(reason, System.nanoTime());
    }
    
    public boolean executeCommand(Command command) {
        if (state.get() == LiftState.FAULT && Command.MOVE.equals(command.type())) {
            return false;
        }
        if (staleDataDetected.get() && Command.MOVE.equals(command.type())) {
            return false;
        }
        
        commandHistory.add(command);
        if (command.isHaltAll() || command.targetCraneId() == null) {
            motorControllerA.sendCommand(command);
            motorControllerB.sendCommand(command);
        } else if (TelemetryPulse.CRANE_A.equals(command.targetCraneId())) {
            motorControllerA.sendCommand(command);
        } else if (TelemetryPulse.CRANE_B.equals(command.targetCraneId())) {
            motorControllerB.sendCommand(command);
        }
        
        if (commandListener != null) {
            commandListener.accept(command);
        }
        return true;
    }
    
    public LiftState getState() { return state.get(); }
    public boolean isStaleDataDetected() { return staleDataDetected.get(); }
    
    public TelemetryPulse getLatestPulse(String craneId) {
        return TelemetryPulse.CRANE_A.equals(craneId) ? latestCraneA.get() : latestCraneB.get();
    }
    
    public double calculateTiltDelta() {
        TelemetryPulse pulseA = latestCraneA.get();
        TelemetryPulse pulseB = latestCraneB.get();
        if (pulseA == null || pulseB == null) return 0.0;
        return Math.abs(pulseA.zAxisMm() - pulseB.zAxisMm());
    }
    
    public AlignedTelemetryPair getAlignedPair() {
        TelemetryPulse pulseA = latestCraneA.get();
        TelemetryPulse pulseB = latestCraneB.get();
        if (pulseA == null || pulseB == null) return null;
        return new AlignedTelemetryPair(pulseA, pulseB);
    }
    
    public long getProcessingTimeNs() {
        long crossed = thresholdCrossedTimestampNs.get();
        long halt = haltIssuedTimestampNs.get();
        return (crossed > 0 && halt > 0) ? halt - crossed : 0;
    }
    
    public boolean wasProcessingWithinWindow() {
        long processingTime = getProcessingTimeNs();
        return processingTime > 0 && processingTime <= MAX_PROCESSING_WINDOW_NS;
    }
    
    public List<Command> getCommandHistory() { return new ArrayList<>(commandHistory); }
    public LivenessWatchdog getWatchdog() { return watchdog; }
    
    public void setCommandListener(Consumer<Command> listener) { this.commandListener = listener; }
    public void setFaultListener(Consumer<String> listener) { this.faultListener = listener; }
    public void setAlignmentListener(Consumer<AlignedTelemetryPair> listener) { this.alignmentListener = listener; }
    
    public void shutdown() {
        stop();
        watchdog.shutdown();
        processingExecutor.shutdown();
        try {
            if (!processingExecutor.awaitTermination(100, TimeUnit.MILLISECONDS)) {
                processingExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            processingExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}