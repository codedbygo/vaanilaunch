import { z } from "zod";

// What the backend streams from POST /api/agent (Server-Sent Events, one JSON per event).
// Tool results are loose objects: each tool returns its own shape, read through the
// narrower schemas below only where the UI needs a field.

export const stepSchema = z.object({
  id: z.string(),
  tool: z.string(),
  label: z.string(),
  status: z.enum(["running", "done", "error"]),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});
export type Step = z.infer<typeof stepSchema>;

export const agentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), data: z.string() }),
  z.object({ type: z.literal("error"), data: z.string() }),
  z.object({ type: z.literal("step"), data: stepSchema }),
  z.object({ type: z.literal("done"), data: z.null() }),
  // Which model really answered (Claude, or the free backup), for honest timeline labels.
  z.object({ type: z.literal("model"), data: z.object({ model: z.string(), label: z.string() }) }),
]);
export type AgentEvent = z.infer<typeof agentEventSchema>;

// The owner's private key arrives in "_manage" on save_draft and publish_site results.
// It reaches this browser only; the backend strips it before Claude sees the result.
export const manageCredsSchema = z.object({ slug: z.string().min(1), key: z.string().min(1) });
export type ManageCreds = z.infer<typeof manageCredsSchema>;

export const draftResultSchema = z.object({
  needs_approval: z.literal(true),
  slug: z.string(),
  preview_url: z.string(),
  products: z.number(),
  _manage: manageCredsSchema.optional(),
  // Short-lived token that opens this private draft; the permanent key never goes in a URL.
  _preview: z.string().optional(),
});

export const publishResultSchema = z.object({
  live: z.literal(true),
  url: z.string(),
  dns: z.object({ record: z.string().optional(), skipped: z.boolean().optional() }).optional(),
  _manage: manageCredsSchema.optional(),
});

export const verifyResultSchema = z.object({
  ok: z.boolean(),
  https: z.boolean().optional(),
  dns_resolves: z.boolean().optional(),
});
export type VerifyResult = z.infer<typeof verifyResultSchema>;

export const domainSchema = z.object({
  domain: z.string(),
  available: z.boolean().optional(),
  price: z.number().nullable().optional(),
  currency: z.string().optional(),
});
export type Domain = z.infer<typeof domainSchema>;

export const checkDomainsResultSchema = z.object({ results: z.array(domainSchema) });

export const slugResultSchema = z.object({ slug: z.string() });

export const uploadResultSchema = z.object({ id: z.string(), url: z.string() });

// Server speech-to-text: whether it is switched on, and the text of one clip.
export const voiceConfigSchema = z.object({ server: z.boolean() });
export const transcribeResultSchema = z.object({ text: z.string() });
export type UploadResult = z.infer<typeof uploadResultSchema>;

export const approveResultSchema = z.object({ approved: z.literal(true) });

export const powChallengeSchema = z.object({ challenge: z.string(), bits: z.number() });
export type PowChallenge = z.infer<typeof powChallengeSchema>;
