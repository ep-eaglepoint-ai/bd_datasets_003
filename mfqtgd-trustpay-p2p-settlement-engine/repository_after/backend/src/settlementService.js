const { AppError } = require("./errors");
const { splitCentsEvenly } = require("./money");

function uniq(arr) {
  return Array.from(new Set(arr));
}

/**
 * Perform an atomic group settlement.
 *
 * Requirements satisfied:
 * - Atomicity via Prisma $transaction
 * - Double-spend prevention via conditional payer UPDATE inside transaction
 * - Fixed-point math via integer cents
 * - Participant validation inside transaction
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ payerId: string, participantIds: string[], totalCents: number }} input
 * @param {{ debugFailAfterCredits?: number }} [opts]
 */
async function settleGroup(prisma, input, opts = {}) {
  const payerId = String(input.payerId || "");
  const participantIdsRaw = Array.isArray(input.participantIds) ? input.participantIds.map(String) : [];
  const participantIds = uniq(participantIdsRaw);
  const totalCents = input.totalCents;

  if (!payerId) throw new AppError("INVALID_PAYER", "payerId is required", 400);
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new AppError("INVALID_AMOUNT", "totalCents must be a positive integer", 400);
  }
  if (participantIds.length === 0) {
    throw new AppError("INVALID_PARTICIPANTS", "participantIds must be a non-empty array", 400);
  }
  if (participantIds.includes(payerId)) {
    throw new AppError("INVALID_PARTICIPANTS", "payerId cannot be included in participantIds", 400);
  }

  const shares = splitCentsEvenly(totalCents, participantIds.length);

  // Basic retry for SQLite "database is locked" under concurrent tests.
  const maxAttempts = 2;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Validate all users exist + active, *inside* the transaction.
        const idsToLoad = [payerId, ...participantIds];
        const users = await tx.user.findMany({
          where: { id: { in: idsToLoad } },
          select: { id: true, active: true, balanceCents: true, name: true },
        });

        const byId = new Map(users.map((u) => [u.id, u]));
        const payer = byId.get(payerId);
        if (!payer) throw new AppError("PAYER_NOT_FOUND", "Payer does not exist", 404);
        if (!payer.active) throw new AppError("PAYER_INACTIVE", "Payer account is inactive", 409);

        for (const pid of participantIds) {
          const p = byId.get(pid);
          if (!p) throw new AppError("PARTICIPANT_NOT_FOUND", `Participant ${pid} does not exist`, 404);
          if (!p.active) throw new AppError("PARTICIPANT_INACTIVE", `Participant ${pid} is inactive`, 409);
        }

        // Double-spend prevention: conditional atomic debit inside transaction.
        const debit = await tx.user.updateMany({
          where: { id: payerId, active: true, balanceCents: { gte: totalCents } },
          data: { balanceCents: { decrement: totalCents } },
        });
        if (debit.count !== 1) {
          throw new AppError("INSUFFICIENT_FUNDS", "Insufficient balance for settlement", 409);
        }

        let creditsApplied = 0;
        for (let i = 0; i < participantIds.length; i++) {
          const participantId = participantIds[i];
          const amountCents = shares[i];

          const credit = await tx.user.updateMany({
            where: { id: participantId, active: true },
            data: { balanceCents: { increment: amountCents } },
          });
          if (credit.count !== 1) {
            throw new AppError("PARTICIPANT_INVALID", `Participant ${participantId} cannot be credited`, 409);
          }

          creditsApplied++;
          if (opts.debugFailAfterCredits && creditsApplied === opts.debugFailAfterCredits) {
            // Deterministic "halfway" crash injection for tests. Must roll back all changes.
            throw new Error("Simulated database failure");
          }
        }

        const settlement = await tx.settlement.create({
          data: {
            payerId,
            totalCents,
            items: {
              create: participantIds.map((participantId, i) => ({
                participantId,
                amountCents: shares[i],
              })),
            },
          },
          include: {
            payer: { select: { id: true, name: true, balanceCents: true } },
            items: {
              include: { participant: { select: { id: true, name: true, balanceCents: true } } },
            },
          },
        });

        return {
          settlement,
          breakdown: participantIds.map((id, i) => ({ participantId: id, amountCents: shares[i] })),
        };
      });
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message ? err.message : "");
      if (attempt < maxAttempts && msg.toLowerCase().includes("database is locked")) {
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new AppError("INTERNAL_ERROR", "Unknown error", 500);
}

module.exports = { settleGroup };

