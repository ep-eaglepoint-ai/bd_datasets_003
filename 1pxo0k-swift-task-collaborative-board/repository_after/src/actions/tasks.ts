"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { TaskStatusSchema, UpdateTaskInputSchema } from "@/lib/taskTypes";

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: "VALIDATION" | "CONFLICT" | "NOT_FOUND" | "UNKNOWN";
      message: string;
      currentVersion?: number;
    };

function mapTask(task: {
  id: string;
  title: string;
  description: string;
  status: string;
  version: number;
  updatedAt: Date;
}) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: TaskStatusSchema.parse(task.status),
    version: task.version,
    updatedAt: task.updatedAt.toISOString(),
  };
}

export async function listTasksAction(): Promise<
  ActionResult<ReturnType<typeof mapTask>[]>
> {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: "asc" },
    });

    return { ok: true, data: tasks.map(mapTask) };
  } catch (error) {
    return { ok: false, error: "UNKNOWN", message: "Failed to list tasks" };
  }
}

export async function createTaskAction(input: {
  title: string;
  description?: string;
}): Promise<ActionResult<ReturnType<typeof mapTask>>> {
  try {
    const title = (input.title ?? "").trim();
    if (!title) {
      return { ok: false, error: "VALIDATION", message: "Title is required" };
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: input.description ?? "",
      },
    });

    revalidatePath("/");
    return { ok: true, data: mapTask(task) };
  } catch (error) {
    return { ok: false, error: "UNKNOWN", message: "Failed to create task" };
  }
}

/**
 * Optimistic Concurrency Control (OCC): the update only succeeds if `expectedVersion`
 * matches the DB row's current `version`. We then atomically increment `version`.
 */
export async function updateTaskAction(
  rawInput: unknown
): Promise<ActionResult<ReturnType<typeof mapTask>>> {
  const parsed = UpdateTaskInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "VALIDATION",
      message: "Invalid update payload",
    };
  }

  const { id, expectedVersion, title, description, status } = parsed.data;

  try {
    const data: Record<string, unknown> = {
      version: { increment: 1 },
    };

    if (typeof title === "string") data.title = title;
    if (typeof description === "string") data.description = description;
    if (typeof status === "string")
      data.status = TaskStatusSchema.parse(status);

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.updateMany({
        where: {
          id,
          version: expectedVersion,
        },
        data,
      });

      if (updated.count !== 1) {
        const current = await tx.task.findUnique({
          where: { id },
        });

        if (!current) return { kind: "not_found" as const };
        return { kind: "conflict" as const, currentVersion: current.version };
      }

      const task = await tx.task.findUnique({ where: { id } });
      if (!task) return { kind: "not_found" as const };

      return { kind: "ok" as const, task };
    });

    if (result.kind === "not_found") {
      return { ok: false, error: "NOT_FOUND", message: "Task not found" };
    }

    if (result.kind === "conflict") {
      return {
        ok: false,
        error: "CONFLICT",
        message: "Task was changed by someone else",
        currentVersion: result.currentVersion,
      };
    }

    revalidatePath("/");
    return { ok: true, data: mapTask(result.task) };
  } catch (error) {
    return { ok: false, error: "UNKNOWN", message: "Failed to update task" };
  }
}
