import { z } from 'zod';

export const createCountdownSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  targetDate: z.string().datetime(),
  timezone: z.string().default('UTC'),
  backgroundColor: z.string().regex(/^#[0-9A-F]{6}$/i).default('#000000'),
  textColor: z.string().regex(/^#[0-9A-F]{6}$/i).default('#FFFFFF'),
  accentColor: z.string().regex(/^#[0-9A-F]{6}$/i).default('#3B82F6'),
  theme: z.enum(['minimal', 'celebration', 'elegant', 'neon']).default('minimal'),
  backgroundImage: z.string().url().optional(),
  isPublic: z.boolean().default(true),
});

export const updateCountdownSchema = createCountdownSchema.partial();
export type CreateCountdownInput = z.infer<typeof createCountdownSchema>;
export type UpdateCountdownInput = z.infer<typeof updateCountdownSchema>;