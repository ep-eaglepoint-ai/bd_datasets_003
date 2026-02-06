import { processTask } from "@/lib/processing";
import { prisma } from "@/lib/db";
import { TaskStatus } from "@prisma/client";

// Mock prisma
jest.mock("@/lib/db", () => ({
  prisma: {
    $transaction: jest.fn((callback) => callback(prisma)),
    task: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    taskLog: {
      create: jest.fn(),
    },
  },
}));

describe("processTask", () => {
  const taskId = "test-task-id";
  const mockTask = {
    id: taskId,
    status: TaskStatus.PENDING,
    attempts: 0,
    version: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementation
    (prisma.task.findUnique as jest.Mock).mockResolvedValue(mockTask);
    (prisma.task.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.taskLog.create as jest.Mock).mockResolvedValue({});
    (prisma.task.update as jest.Mock).mockResolvedValue({});
  });

  it("should process a pending task successfully", async () => {
    // Force Math.random to return something that doesn't trigger failure (> 0.2)
    jest.spyOn(Math, "random").mockReturnValue(0.5);

    const result = await processTask(taskId);

    expect(result).toEqual({ processed: true, status: "COMPLETED" });
    expect(prisma.task.findUnique).toHaveBeenCalledWith({
      where: { id: taskId },
    });
    expect(prisma.task.updateMany).toHaveBeenCalled();
    expect(prisma.taskLog.create).toHaveBeenCalled();
    // Success update
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: taskId },
        data: expect.objectContaining({ status: TaskStatus.COMPLETED }),
      }),
    );
  });

  it("should handle processing failure", async () => {
    // Force Math.random to return < 0.2 to trigger failure
    jest.spyOn(Math, "random").mockReturnValue(0.1);

    // First call returns PENDING (initial check), second call returns PROCESSING (after update)
    (prisma.task.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockTask)
      .mockResolvedValueOnce({ ...mockTask, status: TaskStatus.PROCESSING });

    const result = await processTask(taskId);

    expect(result).toEqual({
      processed: false,
      error: "Simulated processing failure",
    });
    // Error update
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: taskId },
        data: expect.objectContaining({ status: TaskStatus.FAILED }),
      }),
    );
  });

  it("should not process if task not found", async () => {
    (prisma.task.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await processTask(taskId);

    expect(result).toEqual({
      processed: false,
      reason: "Locked or invalid state",
    });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it("should not process if already processing or completed", async () => {
    (prisma.task.findUnique as jest.Mock).mockResolvedValue({
      ...mockTask,
      status: TaskStatus.PROCESSING,
    });

    const result = await processTask(taskId);

    expect(result).toEqual({
      processed: false,
      reason: "Locked or invalid state",
    });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it("should not process if failed and max retries reached", async () => {
    (prisma.task.findUnique as jest.Mock).mockResolvedValue({
      ...mockTask,
      status: TaskStatus.FAILED,
      attempts: 3,
    });

    const result = await processTask(taskId);

    expect(result).toEqual({
      processed: false,
      reason: "Locked or invalid state",
    });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it("should process if failed and retries < max", async () => {
    (prisma.task.findUnique as jest.Mock).mockResolvedValue({
      ...mockTask,
      status: TaskStatus.FAILED,
      attempts: 2,
    });
    jest.spyOn(Math, "random").mockReturnValue(0.5);

    const result = await processTask(taskId);

    expect(result).toEqual({ processed: true, status: "COMPLETED" });
    expect(prisma.task.updateMany).toHaveBeenCalled();
  });

  it("should handle locking failure (race condition)", async () => {
    (prisma.task.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await processTask(taskId);

    expect(result).toEqual({
      processed: false,
      reason: "Locked or invalid state",
    });
    expect(prisma.taskLog.create).not.toHaveBeenCalled();
  });

  it("should handle unexpected errors during processing logic", async () => {
    const errorMsg = "Unexpected error";
    (prisma.task.updateMany as jest.Mock).mockRejectedValue(
      new Error(errorMsg),
    );

    // When updateMany fails, it throws inside the transaction block used in valid implementations.
    // However, our mock calls $transaction callback immediately.
    // If updateMany throws, processTask catches it?
    // In lib/processing.ts:
    // try { const updated = await prisma.$transaction(...) } catch(error) ...

    // So if transaction throws, we catch it.

    // Adjust mockTask to simulate we were in PROCESSING state if we want to test that branch of catch?
    // The code says: if (updated?.status === TaskStatus.PROCESSING)
    // If transaction failed, 'updated' is undefined (or whatever line 12 produced).

    // Let's test the catch block logic
    const result = await processTask(taskId);

    expect(result).toEqual({ processed: false, error: errorMsg });
    // Should NOT mark as FAILED because the initial transaction failed (so we never got the lock)
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});
