const express = require("express");
const cors = require("cors");
const { prisma } = require("./prisma");
const { AppError, errorResponse } = require("./errors");
const { settleGroup } = require("./settlementService");

const app = express();

app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/users", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, active: true, balanceCents: true },
    });
    res.json({ users });
  } catch (e) {
    next(e);
  }
});

app.post("/api/settlements", async (req, res, next) => {
  try {
    const debugFailAfterCredits =
      process.env.NODE_ENV === "test" && req.header("x-debug-fail-after-credits")
        ? Number(req.header("x-debug-fail-after-credits"))
        : undefined;

    const result = await settleGroup(prisma, req.body, {
      debugFailAfterCredits:
        Number.isFinite(debugFailAfterCredits) && debugFailAfterCredits > 0 ? debugFailAfterCredits : undefined,
    });

    res.status(201).json({
      settlement: result.settlement,
      breakdown: result.breakdown,
    });
  } catch (e) {
    // Map simulated failure into a consistent app error for nicer UX.
    if (String(e && e.message).includes("Simulated database failure")) {
      next(new AppError("SIMULATED_DB_FAILURE", "A database error occurred mid-settlement", 500));
      return;
    }
    next(e);
  }
});

// Consistent error handling
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const { status, body } = errorResponse(err);
  res.status(status).json(body);
});

module.exports = { app };

