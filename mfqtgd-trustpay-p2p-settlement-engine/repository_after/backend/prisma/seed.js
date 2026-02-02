/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const users = [
    { name: "Ava (Payer)", balanceCents: 100_00 },
    { name: "Ben", balanceCents: 0 },
    { name: "Chloe", balanceCents: 0 },
    { name: "Diego", balanceCents: 0 },
    { name: "Ethan", balanceCents: 0 },
  ];

  await prisma.user.deleteMany();
  await prisma.user.createMany({ data: users });

  console.log("Seeded users:", await prisma.user.findMany({ orderBy: { createdAt: "asc" } }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

