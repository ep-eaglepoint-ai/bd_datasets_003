

/**
 * Optional interface for objects that can be pooled.
 * Allows objects to reset their state before being returned to the pool
 * or to validate themselves.
 */
public interface Poolable {
    /**
     * Resets the object state to a clean state for the next user.
     */
    void reset();

    /**
     * Checks if the object is still valid and usable.
     * @return true if valid, false otherwise.
     */
    boolean isValid();
}
