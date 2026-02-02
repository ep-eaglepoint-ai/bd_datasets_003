package com.porthorizon.crane;

/**
 * Represents the operational state of the tandem lift system.
 */
public enum LiftState {
    /**
     * System is idle, no active lift operation.
     */
    IDLE,
    
    /**
     * Active lift operation in progress.
     */
    LIFTING,
    
    /**
     * Safety fault detected, all operations halted.
     * Requires manual reset to exit this state.
     */
    FAULT;
    
    /**
     * Checks if the state allows movement operations.
     */
    public boolean allowsMovement() {
        return this == LIFTING;
    }
    
    /**
     * Checks if the state requires manual intervention.
     */
    public boolean requiresManualReset() {
        return this == FAULT;
    }
}