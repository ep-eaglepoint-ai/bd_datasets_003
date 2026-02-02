package com.porthorizon.crane;

import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.Consumer;
import java.util.List;
import java.util.ArrayList;

/**
 * Real-time safety synchronization service for tandem crane operations.
 * Coordinates two independent gantry cranes performing a tandem lift,
 * ensuring vertical height difference never exceeds safety threshold.
 */
public class TandemSyncService {
    
    // Safety thresholds
    public static final double TILT_THRESHOLD_MM = 100.0; // 10cm = 100mm
    public static final long LIVENESS_TIMEOUT_NS = 150_000_000L; // 150ms
    public static final long MAX_ALIGNMENT_DELTA_NS = 100_000_000L; // 100ms for alignment
    public static final long MAX_PROCESSING_WINDOW_NS = 10_000_000L; // 10ms processing window
    
    // Atomic state management
    private final AtomicReference<LiftState> state = new AtomicReference<>(LiftState.IDLE);
    private final AtomicReference<TelemetryPulse> latestCraneA = new AtomicReference<>();
    private final AtomicReference<TelemetryPulse> latestCraneB = new AtomicReference<>();
    private final AtomicLong lastArrivalCraneA = new AtomicLong(0);
    private final AtomicLong lastArrivalCraneB = new AtomicLong(0);
    private final AtomicBoolean staleDataDetected = new AtomicBoolean(false);
    private final AtomicLong faultTimestampNs = new AtomicLong(0);
    private final AtomicLong thresholdCrossedTimestampNs = new AtomicLong(0);
    
    // Motor controllers
    private final MotorController motorControllerA;
    private final MotorController motorControllerB;
    
    // Liveness watchdog
    private final LivenessWatchdog watchdog;
    
    // Non-blocking processing
    private final ExecutorService processingExecutor;
    private final ConcurrentLinkedQueue<Runnable> commandQueue = new ConcurrentLinkedQueue<>();
    
    // Event listeners
    private Consumer<Command> commandListener;
    private Consumer<String> faultListener;
    private Consumer<AlignedTelemetryPair> alignmentListener;
    
    // Command history for testing/auditing
    private final ConcurrentLinkedQueue<Command> commandHistory = new ConcurrentLinkedQueue<>();
    
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
        
        // Configure watchdog callback
        watchdog.setTimeoutCallback(craneId -> {
            triggerFault("Communication timeout: " + craneId);
        });
    }
    
    /**
     * Starts the tandem lift operation.
     * @throws IllegalStateException if system is in FAULT state
     */
    public void start() {
        LiftState current = state.get();
        if (current == LiftState.FAULT) {
            throw new IllegalStateException("Cannot start: System is in FAULT state. Manual reset required.");
        }
        
        if (state.compareAndSet(LiftState.IDLE, LiftState.LIFTING)) {
            watchdog.start();
        }
    }
    
    /**
     * Stops the tandem lift operation.
     */
    public void stop() {
        watchdog.stop();
        state.set(LiftState.IDLE);
    }
    
    /**
     * Resets the system from FAULT state.
     * This is the only way to exit FAULT state.
     */
    public void reset() {
        watchdog.stop();
        watchdog.reset();
        state.set(LiftState.IDLE);
        staleDataDetected.set(false);
        faultTimestampNs.set(0);
        thresholdCrossedTimestampNs.set(0);
        latestCraneA.set(null);
        latestCraneB.set(null);
        lastArrivalCraneA.set(0);
        lastArrivalCraneB.set(0);
        commandHistory.clear();
    }
    
    /**
     * Ingests a telemetry pulse from a crane.
     * This method is non-blocking and returns immediately.
     * @param pulse The telemetry pulse to process
     */
    public void ingestTelemetry(TelemetryPulse pulse) {
        long arrivalTime = System.nanoTime();
        
        // Non-blocking submission to processing executor
        CompletableFuture.runAsync(() -> processTelemetry(pulse, arrivalTime), processingExecutor);
    }
    
    /**
     * Ingests telemetry synchronously for testing purposes.
     */
    public void ingestTelemetrySync(TelemetryPulse pulse) {
        processTelemetry(pulse, System.nanoTime());
    }
    
    private void processTelemetry(TelemetryPulse pulse, long arrivalTime) {
        // Skip processing if in FAULT state
        if (state.get() == LiftState.FAULT) {
            return;
        }
        
        // Update crane-specific atomic storage
        if (TelemetryPulse.CRANE_A.equals(pulse.craneId())) {
            latestCraneA.set(pulse);
            lastArrivalCraneA.set(arrivalTime);
            watchdog.recordUpdate(TelemetryPulse.CRANE_A, arrivalTime);
        } else if (TelemetryPulse.CRANE_B.equals(pulse.craneId())) {
            latestCraneB.set(pulse);
            lastArrivalCraneB.set(arrivalTime);
            watchdog.recordUpdate(TelemetryPulse.CRANE_B, arrivalTime);
        }
        
        // Evaluate safety constraints
        evaluateSafety();
    }
    
    private void evaluateSafety() {
        TelemetryPulse pulseA = latestCraneA.get();
        TelemetryPulse pulseB = latestCraneB.get();
        
        // Need telemetry from both cranes
        if (pulseA == null || pulseB == null) {
            return;
        }
        
        // Create aligned pair
        AlignedTelemetryPair pair = new AlignedTelemetryPair(pulseA, pulseB);
        
        // Check temporal alignment
        if (!pair.isWellAligned(MAX_ALIGNMENT_DELTA_NS)) {
            staleDataDetected.set(true);
            if (alignmentListener != null) {
                alignmentListener.accept(pair);
            }
            return;
        }
        staleDataDetected.set(false);
        
        // Calculate and check tilt delta
        double tiltDelta = pair.calculateTiltDeltaMm();
        
        if (tiltDelta > TILT_THRESHOLD_MM) {
            long crossedTime = System.nanoTime();
            thresholdCrossedTimestampNs.set(crossedTime);
            triggerFault(String.format("Tilt threshold exceeded: %.2fmm > %.2fmm", 
                                      tiltDelta, TILT_THRESHOLD_MM));
        }
        
        if (alignmentListener != null) {
            alignmentListener.accept(pair);
        }
    }
    
    private void triggerFault(String reason) {
        LiftState previous = state.getAndSet(LiftState.FAULT);
        
        if (previous != LiftState.FAULT) {
            faultTimestampNs.set(System.nanoTime());
            
            // Issue immediate HALT commands to both cranes
            Command haltA = Command.halt(TelemetryPulse.CRANE_A);
            Command haltB = Command.halt(TelemetryPulse.CRANE_B);
            
            dispatchCommand(haltA);
            dispatchCommand(haltB);
            
            // Stop watchdog
            watchdog.stop();
            
            // Notify fault listener
            if (faultListener != null) {
                faultListener.accept(reason);
            }
        }
    }
    
    private void dispatchCommand(Command command) {
        commandHistory.add(command);
        
        if (TelemetryPulse.CRANE_A.equals(command.targetCraneId())) {
            motorControllerA.sendCommand(command);
        } else if (TelemetryPulse.CRANE_B.equals(command.targetCraneId())) {
            motorControllerB.sendCommand(command);
        } else {
            // Broadcast to both
            motorControllerA.sendCommand(command);
            motorControllerB.sendCommand(command);
        }
        
        if (commandListener != null) {
            commandListener.accept(command);
        }
    }
    
    /**
     * Executes a command if the system state allows it.
     * @param command The command to execute
     * @return true if command was executed, false if rejected
     */
    public boolean executeCommand(Command command) {
        // FAULT state blocks all MOVE commands
        if (state.get() == LiftState.FAULT && Command.MOVE.equals(command.type())) {
            return false;
        }
        
        // Stale data blocks MOVE commands
        if (staleDataDetected.get() && Command.MOVE.equals(command.type())) {
            return false;
        }
        
        dispatchCommand(command);
        return true;
    }
    
    /**
     * Gets the current lift state.
     */
    public LiftState getState() {
        return state.get();
    }
    
    /**
     * Checks if stale data has been detected.
     */
    public boolean isStaleDataDetected() {
        return staleDataDetected.get();
    }
    
    /**
     * Gets the latest telemetry pulse for a crane.
     */
    public TelemetryPulse getLatestPulse(String craneId) {
        if (TelemetryPulse.CRANE_A.equals(craneId)) {
            return latestCraneA.get();
        } else if (TelemetryPulse.CRANE_B.equals(craneId)) {
            return latestCraneB.get();
        }
        return null;
    }
    
    /**
     * Calculates the current tilt delta.
     */
    public double calculateTiltDelta() {
        TelemetryPulse pulseA = latestCraneA.get();
        TelemetryPulse pulseB = latestCraneB.get();
        
        if (pulseA == null || pulseB == null) {
            return 0.0;
        }
        
        return Math.abs(pulseA.zAxisMm() - pulseB.zAxisMm());
    }
    
    /**
     * Gets the aligned telemetry pair if available.
     */
    public AlignedTelemetryPair getAlignedPair() {
        TelemetryPulse pulseA = latestCraneA.get();
        TelemetryPulse pulseB = latestCraneB.get();
        
        if (pulseA == null || pulseB == null) {
            return null;
        }
        
        return new AlignedTelemetryPair(pulseA, pulseB);
    }
    
    /**
     * Gets the processing time from threshold crossed to fault.
     */
    public long getProcessingTimeNs() {
        long crossed = thresholdCrossedTimestampNs.get();
        long fault = faultTimestampNs.get();
        
        if (crossed > 0 && fault > 0) {
            return fault - crossed;
        }
        return 0;
    }
    
    /**
     * Gets command history.
     */
    public List<Command> getCommandHistory() {
        return new ArrayList<>(commandHistory);
    }
    
    /**
     * Gets the watchdog instance.
     */
    public LivenessWatchdog getWatchdog() {
        return watchdog;
    }
    
    // Event listener setters
    public void setCommandListener(Consumer<Command> listener) {
        this.commandListener = listener;
    }
    
    public void setFaultListener(Consumer<String> listener) {
        this.faultListener = listener;
    }
    
    public void setAlignmentListener(Consumer<AlignedTelemetryPair> listener) {
        this.alignmentListener = listener;
    }
    
    /**
     * Shuts down the service.
     */
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