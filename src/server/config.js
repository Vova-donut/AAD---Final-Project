import 'dotenv/config';
import { z } from 'zod';
// Fail at startup instead of running with placeholder secrets or an invalid URL.
const env = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(3443),
  APP_ORIGIN: z.url(),
  MONGODB_URI: z.string().startsWith('mongodb'),
  JWT_SECRET: z.string().min(64),
  SUBSCRIPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  VAPID_PUBLIC_KEY: z.string().min(80),
  VAPID_PRIVATE_KEY: z.string().min(40),
  VAPID_SUBJECT: z.string().startsWith('mailto:'),
  TLS_KEY: z.string(),
  TLS_CERT: z.string(),
});
export const config = env.parse(process.env);
