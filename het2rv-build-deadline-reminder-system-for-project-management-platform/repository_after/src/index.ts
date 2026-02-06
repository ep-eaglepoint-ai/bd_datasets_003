import express from 'express';
import { initDB, pool } from './db';
import { startScheduler } from './scheduler';

export const app = express();
app.use(express.json());

// Middleware to mock authentication
const authenticateUser = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized: Missing X-User-ID header' });
    return;
  }
  // @ts-ignore
  req.user = { id: parseInt(userId as string, 10) };
  next();
};

app.use(authenticateUser);

const PORT = 3000;

// API Endpoints
// ... (routes are same)

// Create User
app.post('/users', async (req, res) => {
  const { name } = req.body;
  try {
    const result = await pool.query('INSERT INTO users (name) VALUES ($1) RETURNING *', [name]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create Task with Reminders
app.post('/tasks', async (req, res) => {
  const { title, reminders } = req.body;
  // @ts-ignore
  const owner_id = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskResult = await client.query(
      'INSERT INTO tasks (title, owner_id) VALUES ($1, $2) RETURNING *',
      [title, owner_id]
    );
    const task = taskResult.rows[0];

    if (reminders && Array.isArray(reminders)) {
      for (const triggerAt of reminders) {
        await client.query(
          'INSERT INTO reminders (task_id, trigger_at) VALUES ($1, $2)',
          [task.id, triggerAt]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(task);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// Get Task with Reminders
app.get('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  // @ts-ignore
  const userId = req.user.id;

  try {
    const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rowCount === 0) {
       res.status(404).json({ error: 'Task not found' });
       return;
    }
    const task = taskResult.rows[0];
    if (task.owner_id !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }

    const remindersResult = await pool.query('SELECT * FROM reminders WHERE task_id = $1', [id]);
    res.json({ ...task, reminders: remindersResult.rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Add Reminder to Task
app.post('/tasks/:id/reminders', async (req, res) => {
  const { id } = req.params;
  const { trigger_at } = req.body;
  // @ts-ignore
  const userId = req.user.id;

  try {
    const taskResult = await pool.query('SELECT owner_id FROM tasks WHERE id = $1', [id]);
    if (taskResult.rowCount === 0) {
       res.status(404).json({ error: 'Task not found' });
       return;
    }
    if (taskResult.rows[0].owner_id !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }

    const result = await pool.query(
      'INSERT INTO reminders (task_id, trigger_at) VALUES ($1, $2) RETURNING *',
      [id, trigger_at]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete Reminder
app.delete('/reminders/:id', async (req, res) => {
    const { id } = req.params;
    // @ts-ignore
    const userId = req.user.id;

    try {
        const reminderResult = await pool.query(`
            SELECT r.id, t.owner_id
            FROM reminders r
            JOIN tasks t ON r.task_id = t.id
            WHERE r.id = $1
        `, [id]);

        if (reminderResult.rowCount === 0) {
            res.status(404).json({ error: 'Reminder not found' });
            return;
        }

        if (reminderResult.rows[0].owner_id !== userId) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        await pool.query('DELETE FROM reminders WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Cancel Task (Soft)
app.patch('/tasks/:id/cancel', async (req, res) => {
    const { id } = req.params;
    // @ts-ignore
    const userId = req.user.id;

    try {
        const result = await pool.query(
            "UPDATE tasks SET status = 'canceled' WHERE id = $1 AND owner_id = $2 RETURNING *",
            [id, userId]
        );

        if (result.rowCount === 0) {
             const check = await pool.query('SELECT owner_id FROM tasks WHERE id = $1', [id]);
             if (check.rowCount && check.rowCount > 0 && check.rows[0].owner_id !== userId) {
                 res.status(403).json({ error: 'Forbidden' });
                 return;
             }
             res.status(404).json({ error: 'Task not found' });
             return;
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Delete Task (Hard Delete)
app.delete('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  // @ts-ignore
  const userId = req.user.id;

  try {
    const result = await pool.query('DELETE FROM tasks WHERE id = $1 AND owner_id = $2', [id, userId]);
    if (result.rowCount === 0) {
        const check = await pool.query('SELECT owner_id FROM tasks WHERE id = $1', [id]);
        if (check.rowCount && check.rowCount > 0 && check.rows[0].owner_id !== userId) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
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

