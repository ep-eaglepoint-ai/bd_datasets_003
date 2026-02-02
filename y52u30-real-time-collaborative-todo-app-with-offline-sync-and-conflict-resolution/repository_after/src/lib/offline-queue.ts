/**
 * Offline Operation Queue
 *
 * Requirement 4: Use monotonically increasing sequence numbers for ordering
 * Requirement 12: Use crypto.randomUUID() for client-generated IDs
 */

import { OfflineOperation, OperationType, Todo, ReorderPayload } from '../types';

/**
 * Generate a cryptographically random UUID
 * Requirement 12: Must use crypto.randomUUID() to avoid collisions
 */
export function generateUUID(): string {
  // Use crypto.randomUUID() as required
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for Node.js environments without global crypto
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID } = require('crypto');
  return randomUUID();
}

/**
 * Offline Queue Manager
 *
 * Manages operations performed while offline and ensures correct replay order
 * using sequence numbers instead of timestamps (Requirement 4)
 */
export class OfflineQueue {
  private operations: OfflineOperation[] = [];
  private nextSequenceNumber: number = 1;
  private lastSyncedSequenceNumber: number = 0;

  /**
   * Add an operation to the queue with a monotonically increasing sequence number
   * Requirement 4: Sequence numbers guarantee replay order matches creation order
   */
  enqueue(
    operationType: OperationType,
    todoId: string,
    payload: Partial<Todo> | ReorderPayload | null,
    userId: string
  ): OfflineOperation {
    const operation: OfflineOperation = {
      sequenceNumber: this.nextSequenceNumber++,
      operationType,
      todoId,
      payload,
      timestamp: new Date(),
      userId
    };

    this.operations.push(operation);
    return operation;
  }

  /**
   * Get all pending operations that haven't been synced yet
   * Returns operations ordered by sequence number (Requirement 4)
   */
  getPendingOperations(): OfflineOperation[] {
    return this.operations
      .filter(op => op.sequenceNumber > this.lastSyncedSequenceNumber)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  /**
   * Get all operations in the queue
   */
  getAllOperations(): OfflineOperation[] {
    return [...this.operations].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  /**
   * Mark operations up to a sequence number as synced
   * This prevents replaying already-synced changes on reconnection
   */
  markSynced(upToSequenceNumber: number): void {
    this.lastSyncedSequenceNumber = Math.max(this.lastSyncedSequenceNumber, upToSequenceNumber);
  }

  /**
   * Remove synced operations from the queue to free memory
   */
  pruneSyncedOperations(): void {
    this.operations = this.operations.filter(
      op => op.sequenceNumber > this.lastSyncedSequenceNumber
    );
  }

  /**
   * Clear all operations (used after full sync)
   */
  clear(): void {
    this.operations = [];
    this.lastSyncedSequenceNumber = this.nextSequenceNumber - 1;
  }

  /**
   * Get the number of pending (unsynced) operations
   */
  getPendingCount(): number {
    return this.getPendingOperations().length;
  }

  /**
   * Check if there are pending operations
   */
  hasPendingOperations(): boolean {
    return this.getPendingCount() > 0;
  }

  /**
   * Get the last synced sequence number
   */
  getLastSyncedSequenceNumber(): number {
    return this.lastSyncedSequenceNumber;
  }

  /**
   * Get the next sequence number (for testing)
   */
  getNextSequenceNumber(): number {
    return this.nextSequenceNumber;
  }

  /**
   * Remove a specific operation by sequence number
   * Used when an operation is rejected by the server
   */
  removeOperation(sequenceNumber: number): boolean {
    const index = this.operations.findIndex(op => op.sequenceNumber === sequenceNumber);
    if (index !== -1) {
      this.operations.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get operation by sequence number
   */
  getOperation(sequenceNumber: number): OfflineOperation | undefined {
    return this.operations.find(op => op.sequenceNumber === sequenceNumber);
  }

  /**
   * Replay pending operations in order
   * Returns operations sorted by sequence number for correct replay order
   */
  replay(): OfflineOperation[] {
    return this.getPendingOperations();
  }
}

/**
 * Create a new offline queue instance
 */
export function createOfflineQueue(): OfflineQueue {
  return new OfflineQueue();
}

/**
 * Validate that an operation has a valid sequence number
 */
export function isValidOperation(operation: OfflineOperation): boolean {
  return (
    typeof operation.sequenceNumber === 'number' &&
    operation.sequenceNumber > 0 &&
    Number.isInteger(operation.sequenceNumber) &&
    typeof operation.operationType === 'string' &&
    ['create', 'update', 'delete', 'reorder'].includes(operation.operationType) &&
    typeof operation.todoId === 'string' &&
    operation.todoId.length > 0
  );
}

/**
 * Compare operations by sequence number for sorting
 * Requirement 4: Sequence numbers determine replay order
 */
export function compareOperations(a: OfflineOperation, b: OfflineOperation): number {
  return a.sequenceNumber - b.sequenceNumber;
}
