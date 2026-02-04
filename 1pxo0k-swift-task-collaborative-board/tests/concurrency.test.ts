/** @jest-environment node */

import { prisma } from "@/lib/prisma";
import { createTaskAction, updateTaskAction } from "@/actions/tasks";

beforeEach(async () => {
  await prisma.task.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

test("stale update is rejected via version mismatch", async () => {
  const created = await createTaskAction({ title: "Task A" });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  // User A fetched version 1
  const staleVersion = created.data.version;

  // User B updates title first (version 1 -> 2)
  const bUpdate = await updateTaskAction({
    id: created.data.id,
    expectedVersion: staleVersion,
    title: "Task A (renamed)",
  });
  expect(bUpdate.ok).toBe(true);
  if (!bUpdate.ok) return;
  expect(bUpdate.data.version).toBe(staleVersion + 1);

  // User A tries to move using stale version -> conflict
  const aMove = await updateTaskAction({
    id: created.data.id,
    expectedVersion: staleVersion,
    status: "DONE",
  });

  expect(aMove.ok).toBe(false);
  if (aMove.ok) return;
  expect(aMove.error).toBe("CONFLICT");
});

test("simultaneous moves: only one succeeds (OCC)", async () => {
  const created = await createTaskAction({ title: "Task B" });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const expectedVersion = created.data.version;

  const move1 = updateTaskAction({
    id: created.data.id,
    expectedVersion,
    status: "IN_PROGRESS",
  });

  const move2 = updateTaskAction({
    id: created.data.id,
    expectedVersion,
    status: "DONE",
  });

  const [r1, r2] = await Promise.all([move1, move2]);
  const okCount = [r1, r2].filter((r) => r.ok).length;
  expect(okCount).toBe(1);

  const conflict = [r1, r2].find((r) => !r.ok);
  expect(conflict && !conflict.ok ? conflict.error : null).toBe("CONFLICT");

  const final = await prisma.task.findUnique({
    where: { id: created.data.id },
  });
  expect(final).not.toBeNull();
  expect(final!.version).toBe(expectedVersion + 1);
  expect(["IN_PROGRESS", "DONE"]).toContain(final!.status);
});

test("rejects invalid status values", async () => {
  const created = await createTaskAction({ title: "Task C" });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const res = await updateTaskAction({
    id: created.data.id,
    expectedVersion: created.data.version,
    // @ts-expect-error - intentional invalid status
    status: "INVALID_STATUS",
  });

  expect(res.ok).toBe(false);
  if (res.ok) return;
  expect(res.error).toBe("VALIDATION");
});

test("updating a missing task returns NOT_FOUND", async () => {
  const res = await updateTaskAction({
    id: "does-not-exist",
    expectedVersion: 1,
    status: "DONE",
  });

  expect(res.ok).toBe(false);
  if (res.ok) return;
  expect(res.error).toBe("NOT_FOUND");
});
