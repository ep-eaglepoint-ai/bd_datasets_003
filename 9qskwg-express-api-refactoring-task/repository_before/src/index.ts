import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

type User = {
  id: number;
  name: string;
  active: boolean;
};

let users: User[] = [
  { id: 1, name: "Alice", active: true },
  { id: 2, name: "Bob", active: false },
  { id: 3, name: "Charlie", active: true },
];

function findUserById(id: number): User | undefined {
  for (let i = 0; i < users.length; i++) {
    if (users[i].id === id) {
      return users[i];
    }
  }
  return undefined;
}

function parseActiveQuery(value: any): boolean | null {
  if (value === undefined) {
    return null;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

app.get("/users", (req, res) => {
  try {
    const activeQuery = parseActiveQuery(req.query.active);

    if (activeQuery === true) {
      const result: User[] = [];
      users.forEach((u) => {
        if (u.active === true) {
          result.push(u);
        }
      });
      res.status(200).json(result);
      return;
    }

    if (activeQuery === false) {
      const result: User[] = [];
      for (let i = 0; i < users.length; i++) {
        if (!users[i].active) {
          result.push(users[i]);
        }
      }
      res.status(200).json(result);
      return;
    }

    res.status(200).json(users);
  } catch (err) {
    console.error("GET /users failed", err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/users/:id/toggle", (req, res) => {
  try {
    const rawId = req.params.id;
    if (!rawId) {
      res.status(400).json({ error: "missing_id" });
      return;
    }

    const id = Number(rawId);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const user = findUserById(id);
    if (!user) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    let updatedUsers: User[] = [];
    for (let i = 0; i < users.length; i++) {
      const current = users[i];
      if (current.id === id) {
        updatedUsers.push({
          id: current.id,
          name: current.name,
          active: !current.active,
        });
      } else {
        updatedUsers.push(current);
      }
    }

    users = updatedUsers;

    res.status(200).json({
      success: true,
      userId: id,
    });
  } catch (err) {
    console.error("POST /users/:id/toggle failed", err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.listen(3000, () => {
  console.log("Server started on port 3000");
});
