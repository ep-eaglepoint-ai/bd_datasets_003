import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  UNSPLASH_ACCESS_KEY: z.string().optional(),
  SESSION_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
});

export const config = envSchema.parse(process.env);
