import { describe, expect, it, beforeAll, afterAll } from "@jest/globals";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

// Use localhost for tests running inside container or from host if port mapped
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

describe("Exactly-Once Processing Simulator Integration Tests", () => {
  // We assume the app is running (started by docker-compose)
  // and the DB is migrated.
  // If running in "test" service of docker-compose, we might need to migrate first?
  // Or we rely on the implementation to migrate on start?
  // Usually tests run against a test DB.

  beforeAll(async () => {
    // Wait for app to be ready?
    // In this setup, we assume the test runner waits for the app, or we retry.
    // We can do a health check loop here if needed.
    let retries = 10;
    while (retries > 0) {
      try {
        await axios.get(`${BASE_URL}/api/health`);
        break;
      } catch (e) {
        console.log("Waiting for app to be ready...");
        await new Promise((r) => setTimeout(r, 1000));
        retries--;
      }
    }

    // Cleanup DB
    await prisma.taskLog.deleteMany();
    await prisma.task.deleteMany();
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should submit a task successfully and return a task ID", async () => {
    const payload = { foo: "bar" };
    const res = await axios.post(`${BASE_URL}/api/tasks`, { payload });

    expect(res.status).toBe(201);
    expect(res.data.id).toBeDefined();
    expect(res.data.status).toBe("PENDING");
    expect(res.data.payload).toEqual(payload);
  });

  it("should handle duplicate task submissions with same taskId (Idempotency)", async () => {
    const taskId = `task-${Date.now()}`;
    const payload = { data: 123 };

    // First submission
    const res1 = await axios.post(`${BASE_URL}/api/tasks`, { taskId, payload });
    expect(res1.status).toBe(201);
    expect(res1.data.taskId).toBe(taskId);

    // Second submission (duplicate)
    const res2 = await axios.post(`${BASE_URL}/api/tasks`, { taskId, payload });

    // Depending on design, duplicate return 200 OK with existing task, or 409 Conflict.
    // Requirement says: "Ensure exactly-once processing per task" and "Handle duplicate submissions safely".
    // Usually returning the existing task is good practice.
    expect([200, 201, 409]).toContain(res2.status);
    if (res2.status === 200 || res2.status === 201) {
      expect(res2.data.id).toBe(res1.data.id);
    }

    // Verify only 1 record in DB
    const count = await prisma.task.count({ where: { taskId } });
    expect(count).toBe(1);
  });

  it("should process a task exactly once", async () => {
    const payload = { type: "process-me" };
    const res = await axios.post(`${BASE_URL}/api/tasks`, { payload });
    const id = res.data.id;

    // Trigger processing (simulation)
    // In a real app, a worker picks it up. Here we might need to trigger it or wait for background worker.
    // Let's assume we have an endpoint to trigger processing ONE task or we wait.
    // Requirement: "Backend must simulate processing logic".
    // Let's call a process endpoint.

    await axios.post(`${BASE_URL}/api/process`); // Trigger worker run

    // Poll for completion
    let status = "PENDING";
    let retries = 10;
    let taskData;
    while (status !== "COMPLETED" && status !== "FAILED" && retries > 0) {
      await new Promise((r) => setTimeout(r, 500));
      const pollRes = await axios.get(`${BASE_URL}/api/tasks/${id}`);
      taskData = pollRes.data;
      status = taskData.status;
      retries--;
    }

    expect(status).toBe("COMPLETED");
    expect(taskData.result).toBeDefined();
  });

  it("should handle concurrent submissions of the same task", async () => {
    const taskId = `concurrent-${Date.now()}`;
    const payload = { val: 1 };

    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(axios.post(`${BASE_URL}/api/tasks`, { taskId, payload }));
    }

    const responses = await Promise.allSettled(requests);

    // Check that we don't have errors? Or at least one succeeded.
    // DB should have exactly 1.
    const count = await prisma.task.count({ where: { taskId } });
    expect(count).toBe(1);
  });

  // Add more tests for failure/retry...
});
