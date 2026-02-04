"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import type { TaskDTO, TaskStatus } from "@/lib/taskTypes";
import { createTaskAction, updateTaskAction } from "@/actions/tasks";

type Props = {
  initialTasks: TaskDTO[];
};

const columns: { key: TaskStatus; title: string }[] = [
  { key: "TODO", title: "To Do" },
  { key: "IN_PROGRESS", title: "In Progress" },
  { key: "DONE", title: "Done" },
];

function nextStatus(status: TaskStatus): TaskStatus | null {
  if (status === "TODO") return "IN_PROGRESS";
  if (status === "IN_PROGRESS") return "DONE";
  return null;
}

function prevStatus(status: TaskStatus): TaskStatus | null {
  if (status === "DONE") return "IN_PROGRESS";
  if (status === "IN_PROGRESS") return "TODO";
  return null;
}

export function BoardClient({ initialTasks }: Props) {
  const [tasks, setTasks] = useState<TaskDTO[]>(initialTasks);
  const [isPending, startTransition] = useTransition();
  const [lastError, setLastError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState<string>("");

  const [optimisticTasks, applyOptimistic] = useOptimistic(
    tasks,
    (
      current: TaskDTO[],
      update: { type: "move"; id: string; to: TaskStatus }
    ) =>
      current.map((t) => (t.id === update.id ? { ...t, status: update.to } : t))
  );

  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, TaskDTO[]>();
    for (const col of columns) map.set(col.key, []);
    for (const t of optimisticTasks) map.get(t.status)!.push(t);
    return map;
  }, [optimisticTasks]);

  async function moveTask(taskId: string, to: TaskStatus) {
    setLastError(null);

    const before = tasks;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Optimistic UI update
    startTransition(() => {
      applyOptimistic({ type: "move", id: taskId, to });
    });

    startTransition(async () => {
      try {
        const res = await updateTaskAction({
          id: taskId,
          expectedVersion: task.version,
          status: to,
        });

        if (!res.ok) {
          // Roll back
          setTasks([...before]);
          setLastError(
            res.error === "CONFLICT"
              ? "Conflict: someone else updated this task."
              : res.message
          );
          return;
        }

        // Adopt server version + updatedAt
        setTasks((current) =>
          current.map((t) => (t.id === taskId ? res.data : t))
        );
      } catch (e) {
        // Network/offline/etc: roll back
        setTasks([...before]);
        setLastError("Update failed (offline/network). Reverted.");
      }
    });
  }

  async function createTask() {
    setLastError(null);
    const title = newTitle.trim();
    if (!title) return;

    startTransition(async () => {
      try {
        const res = await createTaskAction({ title });
        if (!res.ok) {
          setLastError(res.message);
          return;
        }

        setTasks((current) => [...current, res.data]);
        setNewTitle("");
      } catch (e) {
        setLastError("Create failed (offline/network). Reverted.");
      }
    });
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 8 }}>SwiftTask</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Shared board with optimistic concurrency control.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          aria-label="New task title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New task title"
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 6,
            border: "1px solid #ddd",
          }}
        />
        <button type="button" disabled={isPending} onClick={createTask}>
          Add
        </button>
      </div>

      {lastError ? (
        <div
          role="alert"
          style={{
            background: "#ffe9e9",
            padding: 8,
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          {lastError}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        {columns.map((col) => (
          <section
            key={col.key}
            aria-label={col.title}
            style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}
          >
            <h2 style={{ marginTop: 0 }}>{col.title}</h2>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {grouped.get(col.key)!.map((t) => (
                <li
                  key={t.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{t.title}</div>
                      {t.description ? (
                        <div style={{ color: "#666" }}>{t.description}</div>
                      ) : null}
                      <div style={{ color: "#999", fontSize: 12 }}>
                        v{t.version}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <button
                        type="button"
                        disabled={isPending || !prevStatus(t.status)}
                        onClick={() =>
                          prevStatus(t.status) &&
                          moveTask(t.id, prevStatus(t.status)!)
                        }
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        disabled={isPending || !nextStatus(t.status)}
                        onClick={() =>
                          nextStatus(t.status) &&
                          moveTask(t.id, nextStatus(t.status)!)
                        }
                      >
                        →
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
