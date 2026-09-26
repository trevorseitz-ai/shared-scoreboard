import { z } from "zod";

const sideName = z
  .string()
  .trim()
  .min(1, "Enter a player or team name.")
  .max(80, "Keep names under 80 characters.");

export const createGameSchema = z.object({
  sideOneName: sideName,
  sideTwoName: sideName,
});

export const scoreActionSchema = z.object({
  sessionToken: z.string().min(32).max(256),
  amount: z.number().int().min(1).max(999_999),
  operation: z.enum(["add", "subtract"]),
  actionId: z.uuid(),
});

export const undoActionSchema = z.object({
  sessionToken: z.string().min(32).max(256),
  actionId: z.uuid(),
});

export const hostScoreActionSchema = z.object({
  hostToken: z.string().min(32).max(256),
  side: z.union([z.literal(1), z.literal(2)]),
  amount: z.number().int().min(1).max(999_999),
  operation: z.enum(["add", "subtract"]),
  actionId: z.uuid(),
});

export const hostUndoActionSchema = z.object({
  hostToken: z.string().min(32).max(256),
  side: z.union([z.literal(1), z.literal(2)]),
  actionId: z.uuid(),
});

export const claimControllerSchema = z.object({
  inviteToken: z.string().min(32).max(256),
});

export const hostActionSchema = z.object({
  hostToken: z.string().min(32).max(256),
  actionId: z.uuid().optional(),
});

export const replaceControllerSchema = z.object({
  hostToken: z.string().min(32).max(256),
  side: z.union([z.literal(1), z.literal(2)]),
});
