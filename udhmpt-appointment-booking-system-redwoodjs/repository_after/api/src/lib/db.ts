import { PrismaClient } from '@prisma/client'

// Real database connection
export const prisma = new PrismaClient()

export type PrismaLike = typeof prisma;

export default prisma;
