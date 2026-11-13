import { z } from 'zod';

export const healthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  checks: z.record(z.string(), z.enum(['ok', 'down'])),
  version: z.string(),
});
export type HealthStatus = z.infer<typeof healthStatusSchema>;
