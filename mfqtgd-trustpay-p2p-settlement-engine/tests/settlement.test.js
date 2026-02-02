const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const request = require("supertest");

// Prisma + SQLite + Windows filesystem can be slow on cold runs; avoid flaky 5s per-test timeouts.
jest.setTimeout(60000);

const backendRoot = path.join(__dirname, "..", "repository_after", "backend");
const schemaPath = path.join(backendRoot, "prisma", "schema.prisma");
const testDbPath = path.join(backendRoot, "prisma", "test.db");

function toFileUrl(p) {
  return `file:${path.resolve(p).replace(/\\/g, "/")}`;
}

function resetDb() {
  const prismaDir = path.join(backendRoot, "prisma");
  if (!fs.existsSync(prismaDir)) fs.mkdirSync(prismaDir, { recursive: true });
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch {
    // ignore
  }

  // Avoid running Prisma "generate" during tests (can be flaky on Windows if a dev server is running).
  execSync(`npx prisma db push --schema="${schemaPath}" --skip-generate`, {
    cwd: backendRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: toFileUrl(testDbPath) },
  });
}

function loadAppAndPrisma() {
  jest.resetModules();
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = toFileUrl(testDbPath);
  const { app } = require("../repository_after/backend/src/app");
  const { prisma } = require("../repository_after/backend/src/prisma");
  return { app, prisma };
}

async function seedUsers(prisma, users) {
  await prisma.settlementItem.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.user.deleteMany();
  return prisma.user.createMany({ data: users });
}

describe("TrustPay Group Settlement Engine", () => {
  beforeAll(() => {
    resetDb();
  });

  test("Edge: rejects non-integer or non-positive totalCents", async () => {
    const { app, prisma } = loadAppAndPrisma();

    const payer = { id: "payer-a", name: "PayerA", active: true, balanceCents: 10000 };
    const participants = [{ id: "pa-1", name: "PA1", active: true, balanceCents: 0 }];
    await seedUsers(prisma, [payer, ...participants]);

    const bad1 = await request(app)
      .post("/api/settlements")
      .send({ payerId: payer.id, participantIds: [participants[0].id], totalCents: 0 });
    expect(bad1.status).toBe(400);
    expect(bad1.body?.error?.code).toBe("INVALID_AMOUNT");

    const bad2 = await request(app)
      .post("/api/settlements")
      .send({ payerId: payer.id, participantIds: [participants[0].id], totalCents: -1 });
    expect(bad2.status).toBe(400);
    expect(bad2.body?.error?.code).toBe("INVALID_AMOUNT");

    const bad3 = await request(app)
      .post("/api/settlements")
      .send({ payerId: payer.id, participantIds: [participants[0].id], totalCents: 12.34 });
    expect(bad3.status).toBe(400);
    expect(bad3.body?.error?.code).toBe("INVALID_AMOUNT");
  });

  test("Edge: rejects empty participants and payer included in participants", async () => {
    const { app, prisma } = loadAppAndPrisma();

    const payer = { id: "payer-b", name: "PayerB", active: true, balanceCents: 10000 };
    const p1 = { id: "pb-1", name: "PB1", active: true, balanceCents: 0 };
    await seedUsers(prisma, [payer, p1]);

    const empty = await request(app)
      .post("/api/settlements")
      .send({ payerId: payer.id, participantIds: [], totalCents: 100 });
    expect(empty.status).toBe(400);
    expect(empty.body?.error?.code).toBe("INVALID_PARTICIPANTS");

    const includesPayer = await request(app)
      .post("/api/settlements")
      .send({ payerId: payer.id, participantIds: [payer.id, p1.id], totalCents: 100 });
    expect(includesPayer.status).toBe(400);
    expect(includesPayer.body?.error?.code).toBe("INVALID_PARTICIPANTS");
  });

  test("Edge: participant validation (non-existent or inactive) aborts the whole transaction", async () => {
    const { app, prisma } = loadAppAndPrisma();

    const payer = { id: "payer-c", name: "PayerC", active: true, balanceCents: 10000 };
    const p1 = { id: "pc-1", name: "PC1", active: true, balanceCents: 0 };
    const p2 = { id: "pc-2", name: "PC2", active: true, balanceCents: 0 };
    await seedUsers(prisma, [payer, p1, p2]);

    // Non-existent participant
    const missing = await request(app)
      .post("/api/settlements")
      .send({ payerId: payer.id, participantIds: [p1.id, "does-not-exist"], totalCents: 1000 });
    expect(missing.status).toBe(404);
    expect(missing.body?.error?.code).toBe("PARTICIPANT_NOT_FOUND");

    // Ensure no partial debits/credits happened
    const payerAfterMissing = await prisma.user.findUnique({ where: { id: payer.id } });
    const p1AfterMissing = await prisma.user.findUnique({ where: { id: p1.id } });
    expect(payerAfterMissing.balanceCents).toBe(10000);
    expect(p1AfterMissing.balanceCents).toBe(0);

    // Inactive participant
    await prisma.user.update({ where: { id: p2.id }, data: { active: false } });
    const inactive = await request(app)
      .post("/api/settlements")
      .send({ payerId: payer.id, participantIds: [p1.id, p2.id], totalCents: 1000 });
    expect(inactive.status).toBe(409);
    expect(inactive.body?.error?.code).toBe("PARTICIPANT_INACTIVE");

    const payerAfterInactive = await prisma.user.findUnique({ where: { id: payer.id } });
    const p1AfterInactive = await prisma.user.findUnique({ where: { id: p1.id } });
    expect(payerAfterInactive.balanceCents).toBe(10000);
    expect(p1AfterInactive.balanceCents).toBe(0);
  });

  test("Edge: duplicate participantIds do not double-credit (deduped) and split uses unique participants", async () => {
    const { app, prisma } = loadAppAndPrisma();

    const payer = { id: "payer-d", name: "PayerD", active: true, balanceCents: 10000 };
    const p1 = { id: "pd-1", name: "PD1", active: true, balanceCents: 0 };
    const p2 = { id: "pd-2", name: "PD2", active: true, balanceCents: 0 };
    await seedUsers(prisma, [payer, p1, p2]);

    const res = await request(app)
      .post("/api/settlements")
      .send({ payerId: payer.id, participantIds: [p1.id, p1.id, p2.id], totalCents: 300 });

    expect(res.status).toBe(201);
    // Dedup => 2 participants => 150/150
    expect(res.body?.breakdown?.length).toBe(2);
    const amounts = res.body.breakdown.map((b) => b.amountCents).sort((a, b) => a - b);
    expect(amounts).toEqual([150, 150]);

    const p1After = await prisma.user.findUnique({ where: { id: p1.id } });
    const p2After = await prisma.user.findUnique({ where: { id: p2.id } });
    expect(p1After.balanceCents).toBe(150);
    expect(p2After.balanceCents).toBe(150);
  });

  test("Edge: remainder split is deterministic and sums exactly to totalCents", async () => {
    const { app, prisma } = loadAppAndPrisma();

    const payer = { id: "payer-e", name: "PayerE", active: true, balanceCents: 10000 };
    const participants = Array.from({ length: 3 }, (_, i) => ({
      id: `pe-${i + 1}`,
      name: `PE${i + 1}`,
      active: true,
      balanceCents: 0,
    }));
    await seedUsers(prisma, [payer, ...participants]);

    const res = await request(app)
      .post("/api/settlements")
      .send({ payerId: payer.id, participantIds: participants.map((p) => p.id), totalCents: 100 });

    expect(res.status).toBe(201);
    const breakdown = res.body.breakdown;
    expect(breakdown.length).toBe(3);
    const sum = breakdown.reduce((acc, b) => acc + b.amountCents, 0);
    expect(sum).toBe(100);
    // With our algorithm: remainder goes to earliest participants => [34,33,33]
    const amounts = breakdown.map((b) => b.amountCents).sort((a, b) => b - a);
    expect(amounts).toEqual([34, 33, 33]);
  });

  test("Requirement 6 (Partial Failure): simulated DB error halfway rolls back payer + participant balances", async () => {
    const { app, prisma } = loadAppAndPrisma();

    const payer = { id: "payer-1", name: "Payer", active: true, balanceCents: 10000 };
    const participants = Array.from({ length: 5 }, (_, i) => ({
      id: `p-${i + 1}`,
      name: `P${i + 1}`,
      active: true,
      balanceCents: 0,
    }));
    await seedUsers(prisma, [payer, ...participants]);

    const res = await request(app)
      .post("/api/settlements")
      .set("x-debug-fail-after-credits", "2") // halfway through 5 credits (after 2 participants credited)
      .send({
        payerId: payer.id,
        participantIds: participants.map((p) => p.id),
        totalCents: 5000,
      });

    expect(res.status).toBe(500);
    expect(res.body?.error?.code).toBe("SIMULATED_DB_FAILURE");

    const payerAfter = await prisma.user.findUnique({ where: { id: payer.id } });
    const p1After = await prisma.user.findUnique({ where: { id: participants[0].id } });
    const p2After = await prisma.user.findUnique({ where: { id: participants[1].id } });

    expect(payerAfter.balanceCents).toBe(10000);
    expect(p1After.balanceCents).toBe(0);
    expect(p2After.balanceCents).toBe(0);

    const settlements = await prisma.settlement.findMany();
    expect(settlements.length).toBe(0);
  });

  test("Requirement 7 (Race Condition): two concurrent settlements, only one succeeds, payer never goes negative", async () => {
    const { app, prisma } = loadAppAndPrisma();

    const payer = { id: "payer-rc", name: "PayerRC", active: true, balanceCents: 2500 };
    const participants = [
      { id: "rc-a", name: "A", active: true, balanceCents: 0 },
      { id: "rc-b", name: "B", active: true, balanceCents: 0 },
    ];
    await seedUsers(prisma, [payer, ...participants]);

    const payload = {
      payerId: payer.id,
      participantIds: participants.map((p) => p.id),
      totalCents: 2500,
    };

    const [r1, r2] = await Promise.all([
      request(app).post("/api/settlements").send(payload),
      request(app).post("/api/settlements").send(payload),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const payerAfter = await prisma.user.findUnique({ where: { id: payer.id } });
    expect(payerAfter.balanceCents).toBeGreaterThanOrEqual(0);
    expect(payerAfter.balanceCents).toBe(0);

    const aAfter = await prisma.user.findUnique({ where: { id: participants[0].id } });
    const bAfter = await prisma.user.findUnique({ where: { id: participants[1].id } });

    // totalCents split evenly across 2 participants
    expect(aAfter.balanceCents + bAfter.balanceCents).toBe(2500);

    const settlements = await prisma.settlement.findMany();
    expect(settlements.length).toBe(1);
  });
});

