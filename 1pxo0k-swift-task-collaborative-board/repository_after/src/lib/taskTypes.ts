import { z } from "zod";

export const TaskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const UpdateTaskInputSchema = z.object({
  id: z.string().min(1),
  expectedVersion: z.number().int().positive(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: TaskStatusSchema.optional(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export type TaskDTO = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  version: number;
  updatedAt: string;
};
