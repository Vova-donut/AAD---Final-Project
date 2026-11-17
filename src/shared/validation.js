import { z } from 'zod';
// Shared strict schemas reject unknown fields and object-valued NoSQL payloads.
const title = z.string().trim().min(2).max(120);
const date = z.iso.date();
export const credentialsSchema = z
  .object({ email: z.email().trim().toLowerCase().max(254), password: z.string().min(10).max(128) })
  .strict();
export const registerSchema = credentialsSchema.extend({ name: z.string().trim().min(2).max(60) });
export const taskSchema = z
  .object({
    title,
    course: z.string().trim().min(2).max(80),
    dueDate: date,
    priority: z.enum(['low', 'medium', 'high']),
    status: z.enum(['todo', 'in-progress', 'done']),
    notes: z.string().trim().max(1000).default(''),
  })
  .strict();
export const sessionSchema = z
  .object({
    title,
    course: z.string().trim().min(2).max(80),
    startAt: z.iso.datetime({ offset: true }),
    duration: z.number().int().min(15).max(240),
    status: z.enum(['planned', 'completed']),
    notes: z.string().trim().max(1000).default(''),
  })
  .strict();
const endpoint = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === '443') &&
    ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(
      url.hostname,
    )
  );
}, 'Unsupported push provider. Use Chrome, Firefox or Safari.');
export const subscriptionSchema = z
  .object({
    endpoint,
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().regex(/^[A-Za-z0-9_-]{87,88}$/),
        auth: z.string().regex(/^[A-Za-z0-9_-]{22,24}$/),
      })
      .strict(),
  })
  .strict();
export const pushMessageSchema = z
  .object({ title: z.string().trim().min(2).max(80), body: z.string().trim().min(2).max(240) })
  .strict();
