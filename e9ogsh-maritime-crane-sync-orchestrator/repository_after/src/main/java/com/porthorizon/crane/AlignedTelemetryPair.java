package com.porthorizon.crane;

/**
 * Represents a temporally aligned pair of telemetry pulses from both cranes.
 */
public final class AlignedTelemetryPair {
    
    private final TelemetryPulse pulseA;
    private final TelemetryPulse pulseB;
    private final long alignmentDeltaNs;
    
    public AlignedTelemetryPair(TelemetryPulse pulseA, TelemetryPulse pulseB) {
        this.pulseA = pulseA;
        this.pulseB = pulseB;
        this.alignmentDeltaNs = Math.abs(pulseA.timestampNs() - pulseB.timestampNs());
    }
    
    public TelemetryPulse pulseA() {
        return pulseA;
    }
    
    public TelemetryPulse pulseB() {
        return pulseB;
    }
    
    public long alignmentDeltaNs() {
        return alignmentDeltaNs;
    }
    
    /**
     * Calculates the vertical tilt delta between the two cranes.
     * @return absolute difference in millimeters
     */
    public double calculateTiltDeltaMm() {
        return Math.abs(pulseA.zAxisMm() - pulseB.zAxisMm());
    }
    
    /**
     * Checks if the telemetry pair is within acceptable alignment threshold.
     * @param maxDeltaNs maximum allowed time difference in nanoseconds
     * @return true if well-aligned
     */
    public boolean isWellAligned(long maxDeltaNs) {
        return alignmentDeltaNs <= maxDeltaNs;
    }
    
    @Override
    public String toString() {
        return String.format("AlignedPair{A=%.2fmm, B=%.2fmm, delta=%.2fmm, alignNs=%d}",
                           pulseA.zAxisMm(), pulseB.zAxisMm(), 
                           calculateTiltDeltaMm(), alignmentDeltaNs);
    }
}