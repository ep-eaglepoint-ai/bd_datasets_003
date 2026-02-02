const { PrismaClient } = require("@prisma/client");

function getDatabaseUrl() {
  return process.env.DATABASE_URL || "file:./prisma/dev.db";
}

function createPrismaClient() {
  // Important for tests: read DATABASE_URL at creation time, not module-load time.
  return new PrismaClient({
    datasources: {
      db: { url: getDatabaseUrl() },
    },
  });
}

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__TRUSTPAY_PRISMA__ ??
  createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__TRUSTPAY_PRISMA__ = prisma;
}

module.exports = { prisma, createPrismaClient };

