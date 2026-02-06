package com.porthorizon.crane;

/**
 * Interface for motor controller communication.
 */
public interface MotorController {
    
    /**
     * Sends a command to the motor controller.
     * @param command The command to send
     */
    void sendCommand(Command command);
    
    /**
     * Checks if the controller is connected and responsive.
     * @return true if connected
     */
    boolean isConnected();
    
    /**
     * Gets the crane ID this controller manages.
     * @return crane identifier
     */
    String getCraneId();
}