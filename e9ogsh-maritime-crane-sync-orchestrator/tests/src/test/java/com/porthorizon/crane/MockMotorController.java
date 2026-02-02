package com.porthorizon.crane;

import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.List;
import java.util.ArrayList;

/**
 * Mock motor controller for testing.
 */
public class MockMotorController implements MotorController {
    
    private final String craneId;
    private volatile boolean connected = true;
    private final ConcurrentLinkedQueue<Command> receivedCommands = new ConcurrentLinkedQueue<>();
    
    public MockMotorController(String craneId) {
        this.craneId = craneId;
    }
    
    @Override
    public void sendCommand(Command command) {
        receivedCommands.add(command);
    }
    
    @Override
    public boolean isConnected() {
        return connected;
    }
    
    @Override
    public String getCraneId() {
        return craneId;
    }
    
    public void setConnected(boolean connected) {
        this.connected = connected;
    }
    
    public List<Command> getReceivedCommands() {
        return new ArrayList<>(receivedCommands);
    }
    
    public void clearCommands() {
        receivedCommands.clear();
    }
    
    public boolean hasReceivedHalt() {
        return receivedCommands.stream().anyMatch(Command::isHaltCommand);
    }
    
    public int getCommandCount() {
        return receivedCommands.size();
    }
}