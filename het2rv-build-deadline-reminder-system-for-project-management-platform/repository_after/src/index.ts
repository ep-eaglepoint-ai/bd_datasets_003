import express from "express";
import { initDB, pool } from "./db";
import { startScheduler } from "./scheduler";

export const app = express();
app.use(express.json());

// Middleware: Authentication
const authenticateUser = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized: Missing X-User-ID header" });
    return;
  }
  const pid = parseInt(userId as string, 10);
  if (isNaN(pid) || pid <= 0) {
    res.status(400).json({ error: "Invalid X-User-ID" });
    return;
  }
  // @ts-ignore
  req.user = { id: pid };
  next();
};

app.use(authenticateUser);

const PORT = 3000;

// --- Helper: Parse Reminder Input (Absolute or Relative) ---
const parseReminderInput = (input: string, deadline: Date | null): Date => {
  // If it's a relative shorthand like "1h" or "24h" or "2d", parse it
  // Regex looks for digits followed by h or d
  const match = input.match(/^(\d+)([hd])$/);
  if (match) {
    if (!deadline) throw new Error("Deadline required for relative reminders");
    const val = parseInt(match[1], 10);
    const unit = match[2];

    const trigger = new Date(deadline.getTime());
    if (unit === "h") trigger.setHours(trigger.getHours() - val);
    if (unit === "d") trigger.setDate(trigger.getDate() - val);
    return trigger;
  }

  // Otherwise assume absolute ISO string
  const d = new Date(input);
  if (!isNaN(d.getTime())) return d;

  throw new Error(`Invalid reminder format: ${input}`);
};

// --- Helper: Validate Reminder Time ---
const validateReminderTime = (
  triggerAt: string | Date,
  deadline: string | Date | null
) => {
  const trigger = new Date(triggerAt);
  const now = new Date();

  if (isNaN(trigger.getTime()))
    throw new Error("Invalid date format for reminder");
  if (trigger <= now) throw new Error("Cannot schedule reminder in the past");

  if (deadline) {
    const dead = new Date(deadline);
    if (trigger > dead)
      throw new Error("Cannot schedule reminder after the task deadline");
  }
};

// --- Routes ---

// Create User
app.post("/users", async (req, res) => {
  try {
    const result = await pool.query(
      "INSERT INTO users (name) VALUES ($1) RETURNING *",
      [req.body.name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// List Reminders for User
app.get("/reminders", async (req, res) => {
  // @ts-ignore
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT r.* FROM reminders r
       JOIN tasks t ON r.task_id = t.id
       WHERE t.owner_id = $1
       ORDER BY r.trigger_at ASC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create Task (With Deadline & Reminders)
app.post("/tasks", async (req, res) => {
  const { title, reminders, deadline } = req.body;
  // @ts-ignore
  const owner_id = req.user.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Create Task
    const taskResult = await client.query(
      "INSERT INTO tasks (title, owner_id, deadline) VALUES ($1, $2, $3) RETURNING *",
      [title, owner_id, deadline]
    );
    const task = taskResult.rows[0];

    // 2. Process Reminders
    if (reminders && Array.isArray(reminders)) {
      for (const rawInput of reminders) {
        // Parse & Validate
        const triggerDate = parseReminderInput(
          rawInput,
          deadline ? new Date(deadline) : null
        );
        validateReminderTime(triggerDate, deadline);

        await client.query(
          "INSERT INTO reminders (task_id, trigger_at) VALUES ($1, $2)",
          [task.id, triggerDate]
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json(task);
  } catch (err) {
    await client.query("ROLLBACK");
    const anyErr = err as any;
    if (anyErr?.code === "23505") {
      res.status(409).json({ error: "Reminder already exists" });
      return;
    }

    const msg = (err as Error).message;
    // Distinguish Validation errors (400) from Server errors (500)
    if (
      msg.includes("Cannot schedule") ||
      msg.includes("Invalid date") ||
      msg.includes("Deadline required") ||
      msg.includes("Invalid reminder format") // Catch parse errors
    ) {
      res.status(400).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  } finally {
    client.release();
  }
});

// Get Task
app.get("/tasks/:id", async (req, res) => {
  // @ts-ignore
  const userId = req.user.id;
  try {
    const taskResult = await pool.query("SELECT * FROM tasks WHERE id = $1", [
      req.params.id,
    ]);
    if (taskResult.rowCount === 0)
      return res.status(404).json({ error: "Task not found" });

    const task = taskResult.rows[0];
    if (task.owner_id !== userId)
      return res.status(403).json({ error: "Forbidden" });

    const reminders = await pool.query(
      "SELECT * FROM reminders WHERE task_id = $1",
      [task.id]
    );
    res.json({ ...task, reminders: reminders.rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Add Reminder (Enforce Deadline)
app.post("/tasks/:id/reminders", async (req, res) => {
  const { trigger_at } = req.body;
  // @ts-ignore
  const userId = req.user.id;

  try {
    // Check Task Ownership AND Deadline
    const taskRes = await pool.query(
      "SELECT owner_id, deadline FROM tasks WHERE id = $1",
      [req.params.id]
    );
    if (taskRes.rowCount === 0)
      return res.status(404).json({ error: "Task not found" });

    const task = taskRes.rows[0];
    if (task.owner_id !== userId)
      return res.status(403).json({ error: "Forbidden" });

    try {
      validateReminderTime(trigger_at, task.deadline);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    const result = await pool.query(
      "INSERT INTO reminders (task_id, trigger_at) VALUES ($1, $2) RETURNING *",
      [req.params.id, trigger_at]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const anyErr = err as any;
    if (anyErr?.code === "23505") {
      res.status(409).json({ error: "Reminder already exists" });
      return;
    }
    // Added specific validation catch here
    const msg = (err as Error).message;
    if (msg.includes("Invalid date")) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

// Delete Reminder
app.delete("/reminders/:id", async (req, res) => {
  // @ts-ignore
  const userId = req.user.id;
  try {
    const check = await pool.query(
      `SELECT r.id, t.owner_id FROM reminders r JOIN tasks t ON r.task_id = t.id WHERE r.id = $1`,
      [req.params.id]
    );
    if (check.rowCount === 0)
      return res.status(404).json({ error: "Reminder not found" });
    if (check.rows[0].owner_id !== userId)
      return res.status(403).json({ error: "Forbidden" });

    await pool.query("DELETE FROM reminders WHERE id = $1", [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Modify Reminder (PATCH)
app.patch("/reminders/:id", async (req, res) => {
  const { trigger_at } = req.body;
  // @ts-ignore
  const userId = req.user.id;

  if (!trigger_at) return res.status(400).json({ error: "Missing trigger_at" });

  try {
    // Need task details to validate deadline
    const rRes = await pool.query(
      `
            SELECT r.id, t.owner_id, t.deadline
            FROM reminders r
            JOIN tasks t ON r.task_id = t.id
            WHERE r.id = $1
        `,
      [req.params.id]
    );

    if (rRes.rowCount === 0)
      return res.status(404).json({ error: "Reminder not found" });
    const row = rRes.rows[0];
    if (row.owner_id !== userId)
      return res.status(403).json({ error: "Forbidden" });

    try {
      validateReminderTime(trigger_at, row.deadline);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    const update = await pool.query(
      "UPDATE reminders SET trigger_at = $1, updated_at = NOW(), status = 'pending' WHERE id = $2 RETURNING *",
      [trigger_at, req.params.id]
    );
    res.json(update.rows[0]);
  } catch (err) {
    const anyErr = err as any;
    if (anyErr?.code === "23505") {
      res.status(409).json({ error: "Reminder already exists" });
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

// Cancel Task (Soft)
app.patch("/tasks/:id/cancel", async (req, res) => {
  // @ts-ignore
  const userId = req.user.id;
  try {
    const result = await pool.query(
      "UPDATE tasks SET status = 'canceled' WHERE id = $1 AND owner_id = $2 RETURNING *",
      [req.params.id, userId]
    );

    if (result.rowCount === 0) {
      const check = await pool.query(
        "SELECT owner_id FROM tasks WHERE id = $1",
        [req.params.id]
      );
      if (
        check.rowCount &&
        check.rowCount > 0 &&
        check.rows[0].owner_id !== userId
      )
        return res.status(403).json({ error: "Forbidden" });
      return res.status(404).json({ error: "Task not found" });
    }

    // Requirement: Cancel pending reminders
    await pool.query(
      "UPDATE reminders SET status = 'canceled', updated_at = NOW() WHERE task_id = $1 AND status = 'pending'",
      [req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete Task (Hard)
app.delete("/tasks/:id", async (req, res) => {
  // @ts-ignore
  const userId = req.user.id;
  try {
    const result = await pool.query(
      "DELETE FROM tasks WHERE id = $1 AND owner_id = $2",
      [req.params.id, userId]
    );
    if (result.rowCount === 0) {
      const check = await pool.query(
        "SELECT owner_id FROM tasks WHERE id = $1",
        [req.params.id]
      );
      if (
        check.rowCount &&
        check.rowCount > 0 &&
        check.rows[0].owner_id !== userId
      )
        return res.status(403).json({ error: "Forbidden" });
      // Assuming 404 if not found
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export const startServer = async () => {
  await initDB();
  startScheduler();
  return app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

if (require.main === module) {
  startServer();
}
