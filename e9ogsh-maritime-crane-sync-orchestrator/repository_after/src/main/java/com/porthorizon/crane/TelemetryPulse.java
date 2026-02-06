package com.porthorizon.crane;

import java.util.Objects;

/**
 * Represents a telemetry pulse from a gantry crane.
 */
public final class TelemetryPulse {
    
    public static final String CRANE_A = "CRANE-A";
    public static final String CRANE_B = "CRANE-B";
    
    private final String craneId;
    private final double zAxisMm;
    private final long timestampNs;
    private final long arrivalTimeNs;
    
    public TelemetryPulse(String craneId, double zAxisMm, long timestampNs) {
        this(craneId, zAxisMm, timestampNs, System.nanoTime());
    }
    
    public TelemetryPulse(String craneId, double zAxisMm, long timestampNs, long arrivalTimeNs) {
        this.craneId = Objects.requireNonNull(craneId, "craneId cannot be null");
        this.zAxisMm = zAxisMm;
        this.timestampNs = timestampNs;
        this.arrivalTimeNs = arrivalTimeNs;
    }
    
    public String craneId() { return craneId; }
    public double zAxisMm() { return zAxisMm; }
    public long timestampNs() { return timestampNs; }
    public long arrivalTimeNs() { return arrivalTimeNs; }
    
    /**
     * Checks if this pulse is newer than another based on internal timestamp.
     */
    public boolean isNewerThan(TelemetryPulse other) {
        if (other == null) return true;
        return this.timestampNs > other.timestampNs;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        TelemetryPulse that = (TelemetryPulse) o;
        return Double.compare(that.zAxisMm, zAxisMm) == 0 &&
               timestampNs == that.timestampNs &&
               Objects.equals(craneId, that.craneId);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(craneId, zAxisMm, timestampNs);
    }
    
    @Override
    public String toString() {
        return String.format("TelemetryPulse{craneId='%s', zAxisMm=%.2f, timestampNs=%d}", 
                           craneId, zAxisMm, timestampNs);
    }
}