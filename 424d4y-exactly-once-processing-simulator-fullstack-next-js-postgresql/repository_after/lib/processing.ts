import { prisma } from "./db";
import { TaskStatus, Task } from "@prisma/client";

export async function processTask(taskId: string) {
  // Simulate distributed lock or queue ownership
  // We use optimistic concurrency or raw locking.
  // Here we try to update status from PENDING to PROCESSING.

  const now = new Date();

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      // Find task
      const task = await tx.task.findUnique({
        where: { id: taskId },
      });

      if (!task) return null;

      if (
        task.status !== TaskStatus.PENDING &&
        task.status !== TaskStatus.FAILED
      ) {
        // Already processed or processing
        return null;
      }

      // If failed, check retries
      if (task.status === TaskStatus.FAILED) {
        const MAX_RETRIES = 3;
        if (task.attempts >= MAX_RETRIES) {
          return null; // Stop processing
        }
      }

      // Lock task by setting status to PROCESSING
      // We rely on optimistic locking via version or just conditional update.
      // Update where status is still what we saw.
      const result = await tx.task.updateMany({
        where: {
          id: taskId,
          status: task.status, // Ensure it hasn't changed
          version: task.version,
        },
        data: {
          status: TaskStatus.PROCESSING,
          attempts: { increment: 1 },
          lastAttemptAt: now,
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        // Failed to lock (race condition)
        return null; // Another worker took it
      }

      // Log start
      await tx.taskLog.create({
        data: {
          taskId: taskId,
          status: TaskStatus.PROCESSING,
          message: `Attempt ${task.attempts + 1} started`,
        },
      });

      return await tx.task.findUnique({ where: { id: taskId } });
    });

    if (!updated)
      return { processed: false, reason: "Locked or invalid state" };

    // SIMULATE PROCESSING (Outside transaction to allow concurrency)
    // Delay
    const delay = Math.floor(Math.random() * 500) + 100; // 100-600ms
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Simulate Failure
    // 20% chance of failure
    if (Math.random() < 0.2) {
      throw new Error("Simulated processing failure");
    }

    // Success
    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.COMPLETED,
          result: { success: true, processedAt: new Date().toISOString() },
          logs: {
            create: {
              status: TaskStatus.COMPLETED,
              message: "Processing completed successfully",
            },
          },
        },
      });
    });

    return { processed: true, status: "COMPLETED" };
  } catch (error: any) {
    if (updated?.status === TaskStatus.PROCESSING) {
      // TS Error: updated might be undefined
      // Actually 'updated' is local scope in try block? No, it's const updated defined before error.
      // Wait, I need to handle failure status update.
      // Since I can't easily access 'updated' here if it failed inside transaction (unlikely) or delay..
    }

    // Mark as FAILED if we hold the lock (PROCESSING)
    // We need to re-fetch or assume we own it.
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.FAILED,
        errorMessage: error.message,
        logs: {
          create: {
            status: TaskStatus.FAILED,
            message: `Error: ${error.message}`,
          },
        },
      },
    });

    return { processed: false, error: error.message };
  }
}
