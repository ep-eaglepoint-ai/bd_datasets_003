import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TaskStatus } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taskId, payload } = body;

    if (taskId) {
      // Idempotency check: Try to create, if exists return existing
      const existing = await prisma.task.findUnique({
        where: { taskId },
      });

      if (existing) {
        return NextResponse.json(existing, { status: 200 });
      }
    }

    // Create new task
    // Race condition: If two requests come with same taskId, one will fail unique constraint.
    // We should catch that.

    try {
      const task = await prisma.task.create({
        data: {
          taskId: taskId || undefined, // Prisma will ignore undefined and use UUID if not provided? No, taskId is optional unique.
          payload,
          status: TaskStatus.PENDING,
          logs: {
            create: {
              status: TaskStatus.PENDING,
              message: "Task submitted",
            },
          },
        },
      });
      return NextResponse.json(task, { status: 201 });
    } catch (e: any) {
      if (e.code === "P2002") {
        // Unique constraint violation
        const existing = await prisma.task.findUnique({
          where: { taskId: taskId! },
        });
        if (existing) {
          return NextResponse.json(existing, { status: 200 }); // Idempotent return
        }
      }
      throw e;
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { logs: true },
    });
    return NextResponse.json(tasks);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
