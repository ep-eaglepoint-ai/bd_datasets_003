import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processTask } from "@/lib/processing";
import { TaskStatus } from "@prisma/client";

export async function POST() {
  // Trigger processing for all PENDING tasks (limit 5)
  // Or just one. logic handles locking.

  try {
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { status: TaskStatus.PENDING },
          { status: TaskStatus.FAILED, attempts: { lt: 3 } },
        ],
      },
      take: 5,
      orderBy: { createdAt: "asc" },
    });

    // Process in background (fire and forget) or await?
    // For specific simulation test, we might want to await.
    const results = await Promise.allSettled(
      tasks.map((t) => processTask(t.id)),
    );

    return NextResponse.json({
      count: tasks.length,
      results: results.map((r) => r.status),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
