package com.porthorizon.crane;

import java.util.Objects;

/**
 * Represents a command to be sent to crane motor controllers.
 */
public final class Command {
    
    public static final String MOVE = "MOVE";
    public static final String HALT = "HALT";
    public static final String HALT_ALL = "HALT_ALL";
    public static final String CALIBRATE = "CALIBRATE";
    public static final String EMERGENCY_STOP = "EMERGENCY_STOP";
    
    private final String type;
    private final String targetCraneId;
    private final double targetVelocity;
    private final long timestampNs;
    
    public Command(String type, String targetCraneId, double targetVelocity) {
        this(type, targetCraneId, targetVelocity, System.nanoTime());
    }
    
    public Command(String type, String targetCraneId, double targetVelocity, long timestampNs) {
        this.type = Objects.requireNonNull(type, "type cannot be null");
        this.targetCraneId = targetCraneId;
        this.targetVelocity = targetVelocity;
        this.timestampNs = timestampNs;
    }
    
    public static Command halt(String craneId) {
        return new Command(HALT, craneId, 0.0);
    }
    
    public static Command haltAll() {
        return new Command(HALT_ALL, null, 0.0);
    }
    
    public static Command emergencyStop() {
        return new Command(EMERGENCY_STOP, null, 0.0);
    }
    
    public static Command move(String craneId, double velocity) {
        return new Command(MOVE, craneId, velocity);
    }
    
    public static Command calibrate(String craneId) {
        return new Command(CALIBRATE, craneId, 0.0);
    }
    
    public String type() {
        return type;
    }
    
    public String targetCraneId() {
        return targetCraneId;
    }
    
    public double targetVelocity() {
        return targetVelocity;
    }
    
    public long timestampNs() {
        return timestampNs;
    }
    
    public boolean isHaltCommand() {
        return HALT.equals(type) || HALT_ALL.equals(type) || EMERGENCY_STOP.equals(type);
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Command command = (Command) o;
        return Double.compare(command.targetVelocity, targetVelocity) == 0 &&
               Objects.equals(type, command.type) &&
               Objects.equals(targetCraneId, command.targetCraneId);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(type, targetCraneId, targetVelocity);
    }
    
    @Override
    public String toString() {
        return String.format("Command{type='%s', targetCraneId='%s', targetVelocity=%.2f}", 
                           type, targetCraneId, targetVelocity);
    }
}