package com.fortress.vault;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.locks.ReentrantLock;

public class TimeLockVault {
    private VaultState state;
    private final Duration coolDownPeriod;
    private final Duration confirmationWindow;
    private Instant withdrawalStartTime;
    private final ReentrantLock lock;
    private final Clock clock; // Dependency injection for easier testing

    public TimeLockVault(Duration coolDownPeriod, Duration confirmationWindow) {
        this(coolDownPeriod, confirmationWindow, Clock.systemUTC());
    }

    // Constructor for testing with custom clock
    public TimeLockVault(Duration coolDownPeriod, Duration confirmationWindow, Clock clock) {
        this.coolDownPeriod = coolDownPeriod;
        this.confirmationWindow = confirmationWindow;
        this.state = VaultState.LOCKED;
        this.lock = new ReentrantLock();
        this.clock = clock;
    }

    public VaultState getState() {
        lock.lock();
        try {
            // Check for automatic expiration or transition availability before returning state
            // However, method should just return current state view or update if logic requires lazy update.
            // Requirement 2: System must automatically transition states when timers expire.
            // To ensure "automatic" transition perception, we check time on every state read/action.
            updateStateBasedOnTime();
            return state;
        } finally {
            lock.unlock();
        }
    }

    public void initiateWithdrawal() {
        lock.lock();
        try {
            updateStateBasedOnTime();
            if (state == VaultState.LOCKED) {
                state = VaultState.PENDING_WITHDRAWAL;
                withdrawalStartTime = Instant.now(clock);
            } else if (state == VaultState.CANCELLED || state == VaultState.RELEASED) {
                 // Allow re-initiation if it was previously cancelled or released?
                 // Requirement doesn't explicitly say, but usually yes for a reusable vault.
                 // Requirement 6 says: "Verify the state transitions back to LOCKED (or equivalent)."
                 // implies we might reset to LOCKED.
                 // Let's assume for this specific transaction flow we might be strict or allow reset.
                 // A "Vault" object usually manages assets. If we view this object as a *Single Transaction Manager*,
                 // then maybe not. But "TimeLockVault" sounds like a persistent service.
                 // Let's assume we can start over if currently clean.
                 state = VaultState.PENDING_WITHDRAWAL;
                 withdrawalStartTime = Instant.now(clock);
            } else {
                throw new IllegalStateException("Cannot initiate withdrawal from state: " + state);
            }
        } finally {
            lock.unlock();
        }
    }

    public void cancelWithdrawal() {
        lock.lock();
        try {
            updateStateBasedOnTime();
            // Requirement 4: cancel action must only succeed if state is PENDING_WITHDRAWAL
            if (state == VaultState.PENDING_WITHDRAWAL) {
                state = VaultState.CANCELLED;
                withdrawalStartTime = null;
            } else {
                throw new IllegalStateException("Cannot cancel withdrawal in state: " + state);
            }
        } finally {
            lock.unlock();
        }
    }

    public void confirmWithdrawal() {
        lock.lock();
        try {
            updateStateBasedOnTime();
            // Requirement 4: confirm action must only succeed if state is READY_FOR_RELEASE
            if (state == VaultState.READY_FOR_RELEASE) {
                state = VaultState.RELEASED;
                withdrawalStartTime = null; // Clean up
            } else {
                throw new IllegalStateException("Cannot confirm withdrawal in state: " + state);
            }
        } finally {
            lock.unlock();
        }
    }
    
    // Reset method for testing purposes or resetting the vault
    public void reset() {
        lock.lock();
        try {
            state = VaultState.LOCKED;
            withdrawalStartTime = null;
        } finally {
            lock.unlock();
        }
    }

    private void updateStateBasedOnTime() {
        if (state == VaultState.PENDING_WITHDRAWAL) {
            Instant now = Instant.now(clock);
            Instant readyTime = withdrawalStartTime.plus(coolDownPeriod);
            
            if (now.isAfter(readyTime) || now.equals(readyTime)) {
                // Cool-down over, check if window is still open
                Instant expiryTime = readyTime.plus(confirmationWindow);
                
                if (now.isAfter(expiryTime)) {
                    // Missed the window
                    state = VaultState.LOCKED; // Requirement 6: transitions back to LOCKED
                    withdrawalStartTime = null;
                } else {
                    // Inside the window
                    state = VaultState.READY_FOR_RELEASE;
                }
            }
        } else if (state == VaultState.READY_FOR_RELEASE) {
             // Check if we waited too long while in READY_FOR_RELEASE
             // Originally calculating from withdrawalStartTime to keep it consistent
             Instant now = Instant.now(clock);
             // We need to know when we *entered* PENDING to know when we entered READY?
             // Actually, the window is fixed: [Start + CoolDown, Start + CoolDown + Window]
             
             Instant readyTime = withdrawalStartTime.plus(coolDownPeriod);
             Instant expiryTime = readyTime.plus(confirmationWindow);
             
             if (now.isAfter(expiryTime)) {
                 state = VaultState.LOCKED;
                 withdrawalStartTime = null;
             }
        }
    }
}
