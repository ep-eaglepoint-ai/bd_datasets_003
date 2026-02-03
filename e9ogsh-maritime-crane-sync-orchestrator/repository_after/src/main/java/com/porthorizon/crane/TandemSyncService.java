package com.porthorizon.crane;

import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.Consumer;
import java.util.List;
import java.util.ArrayList;

public class TandemSyncService {
    
    public static final double TILT_THRESHOLD_MM = 100.0;
    public static final long LIVENESS_TIMEOUT_NS = 150_000_000L;
    public static final long MAX_ALIGNMENT_DELTA_NS = 100_000_000L;
    public static final long MAX_PROCESSING_WINDOW_NS = 10_000_000L;
    private static final int BUFFER_SIZE = 8;
    
    private final AtomicReference<LiftState> state = new AtomicReference<>(LiftState.IDLE);
    private final AtomicBoolean staleDataDetected = new AtomicBoolean(false);
    private final AtomicLong thresholdCrossedTimestampNs = new AtomicLong(0);
    private final AtomicLong haltIssuedTimestampNs = new AtomicLong(0);
    
    private final AtomicReferenceArray<TelemetryPulse> bufferA = new AtomicReferenceArray<>(BUFFER_SIZE);
    private final AtomicReferenceArray<TelemetryPulse> bufferB = new AtomicReferenceArray<>(BUFFER_SIZE);
    private final AtomicInteger indexA = new AtomicInteger(0);
    private final AtomicInteger indexB = new AtomicInteger(0);
    
    private final AtomicReference<TelemetryPulse> latestCraneA = new AtomicReference<>();
    private final AtomicReference<TelemetryPulse> latestCraneB = new AtomicReference<>();
    
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
        
        this.processingExecutor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "telemetry-processor");
            t.setDaemon(true);
            t.setPriority(Thread.MAX_PRIORITY);
            return t;
        });
        
        watchdog.setTimeoutCallback(this::handleLivenessTimeout);
    }
    
    private void handleLivenessTimeout(String craneId) {
        triggerFault("Communication timeout: " + craneId);
    }
    
    public void start() {
        if (state.get() == LiftState.FAULT) {
            throw new IllegalStateException("Cannot start: System in FAULT state.");
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
        clearBuffers();
        commandHistory.clear();
    }
    
    private void clearBuffers() {
        for (int i = 0; i < BUFFER_SIZE; i++) {
            bufferA.set(i, null);
            bufferB.set(i, null);
        }
        indexA.set(0);
        indexB.set(0);
    }
    
    public void ingestTelemetry(TelemetryPulse pulse) {
        updatePulseState(pulse, System.nanoTime());
        CompletableFuture.runAsync(this::evaluateSafety, processingExecutor);
    }
    
    public void ingestTelemetrySync(TelemetryPulse pulse) {
        updatePulseState(pulse, System.nanoTime());
        evaluateSafety();
    }
    
    private void updatePulseState(TelemetryPulse pulse, long arrivalTime) {
        if (state.get() == LiftState.FAULT) return;
        
        if (TelemetryPulse.CRANE_A.equals(pulse.craneId())) {
            int idx = indexA.getAndIncrement() % BUFFER_SIZE;
            bufferA.set(idx, pulse);
            updateIfNewer(latestCraneA, pulse);
            watchdog.recordUpdate(TelemetryPulse.CRANE_A, arrivalTime);
        } else if (TelemetryPulse.CRANE_B.equals(pulse.craneId())) {
            int idx = indexB.getAndIncrement() % BUFFER_SIZE;
            bufferB.set(idx, pulse);
            updateIfNewer(latestCraneB, pulse);
            watchdog.recordUpdate(TelemetryPulse.CRANE_B, arrivalTime);
        }
    }
    
    private void updateIfNewer(AtomicReference<TelemetryPulse> ref, TelemetryPulse newPulse) {
        ref.updateAndGet(current -> 
            (current == null || newPulse.timestampNs() > current.timestampNs()) ? newPulse : current
        );
    }
    
    public AlignedTelemetryPair findClosestAlignedPair() {
        TelemetryPulse bestA = null;
        TelemetryPulse bestB = null;
        long smallestGap = Long.MAX_VALUE;
        long newestTimestamp = -1; // Break ties with newest data
        
        for (int i = 0; i < BUFFER_SIZE; i++) {
            TelemetryPulse pulseA = bufferA.get(i);
            if (pulseA == null) continue;
            
            for (int j = 0; j < BUFFER_SIZE; j++) {
                TelemetryPulse pulseB = bufferB.get(j);
                if (pulseB == null) continue;
                
                long gap = Math.abs(pulseA.timestampNs() - pulseB.timestampNs());
                long pairTimestamp = Math.max(pulseA.timestampNs(), pulseB.timestampNs());
                
                // Prefer smaller gap. If gaps equal, prefer newer data.
                if (gap < smallestGap || (gap == smallestGap && pairTimestamp > newestTimestamp)) {
                    smallestGap = gap;
                    newestTimestamp = pairTimestamp;
                    bestA = pulseA;
                    bestB = pulseB;
                }
            }
        }
        
        return (bestA != null && bestB != null) ? new AlignedTelemetryPair(bestA, bestB) : null;
    }
    
    private void evaluateSafety() {
        if (state.get() == LiftState.FAULT) return;
        
        AlignedTelemetryPair pair = findClosestAlignedPair();
        if (pair == null) return;
        
        if (!pair.isWellAligned(MAX_ALIGNMENT_DELTA_NS)) {
            staleDataDetected.set(true);
            if (alignmentListener != null) alignmentListener.accept(pair);
            return;
        }
        staleDataDetected.set(false);
        
        double tiltDelta = pair.calculateTiltDeltaMm();
        if (tiltDelta > TILT_THRESHOLD_MM) {
            long crossedTime = System.nanoTime();
            thresholdCrossedTimestampNs.set(crossedTime);
            triggerFaultWithTiming(
                String.format("Tilt threshold exceeded: %.2fmm > %.2fmm", tiltDelta, TILT_THRESHOLD_MM),
                crossedTime
            );
        }
        
        if (alignmentListener != null) alignmentListener.accept(pair);
    }
    
    private void triggerFaultWithTiming(String reason, long thresholdCrossedTime) {
        LiftState previous = state.getAndSet(LiftState.FAULT);
        
        if (previous != LiftState.FAULT) {
            Command haltAll = Command.haltAll();
            long haltTime = System.nanoTime();
            haltIssuedTimestampNs.set(haltTime);
            
            commandHistory.add(haltAll);
            motorControllerA.sendCommand(haltAll);
            motorControllerB.sendCommand(haltAll);
            
            watchdog.stop();
            
            if (commandListener != null) commandListener.accept(haltAll);
            if (faultListener != null) faultListener.accept(reason);
        }
    }
    
    private void triggerFault(String reason) {
        triggerFaultWithTiming(reason, System.nanoTime());
    }
    
    public boolean executeCommand(Command command) {
        if (state.get() == LiftState.FAULT && Command.MOVE.equals(command.type())) return false;
        if (staleDataDetected.get() && Command.MOVE.equals(command.type())) return false;
        
        commandHistory.add(command);
        if (command.isHaltAll() || command.targetCraneId() == null) {
            motorControllerA.sendCommand(command);
            motorControllerB.sendCommand(command);
        } else if (TelemetryPulse.CRANE_A.equals(command.targetCraneId())) {
            motorControllerA.sendCommand(command);
        } else if (TelemetryPulse.CRANE_B.equals(command.targetCraneId())) {
            motorControllerB.sendCommand(command);
        }
        if (commandListener != null) commandListener.accept(command);
        return true;
    }
    
    public LiftState getState() { return state.get(); }
    public boolean isStaleDataDetected() { return staleDataDetected.get(); }
    
    public TelemetryPulse getLatestPulse(String craneId) {
        return TelemetryPulse.CRANE_A.equals(craneId) ? latestCraneA.get() : latestCraneB.get();
    }
    
    public double calculateTiltDelta() {
        TelemetryPulse a = latestCraneA.get(), b = latestCraneB.get();
        return (a == null || b == null) ? 0.0 : Math.abs(a.zAxisMm() - b.zAxisMm());
    }
    
    public AlignedTelemetryPair getAlignedPair() {
        return findClosestAlignedPair();
    }
    
    public long getProcessingTimeNs() {
        long crossed = thresholdCrossedTimestampNs.get();
        long halt = haltIssuedTimestampNs.get();
        return (crossed > 0 && halt > 0) ? halt - crossed : 0;
    }
    
    public boolean wasProcessingWithinWindow() {
        long t = getProcessingTimeNs();
        return t > 0 && t <= MAX_PROCESSING_WINDOW_NS;
    }
    
    public List<Command> getCommandHistory() { return new ArrayList<>(commandHistory); }
    public LivenessWatchdog getWatchdog() { return watchdog; }
    
    public void setCommandListener(Consumer<Command> l) { this.commandListener = l; }
    public void setFaultListener(Consumer<String> l) { this.faultListener = l; }
    public void setAlignmentListener(Consumer<AlignedTelemetryPair> l) { this.alignmentListener = l; }
    
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