import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { subscriptionSchema, pushMessageSchema } from '../shared/validation.js';
// AES-GCM detects changes to stored push subscriptions as well as encrypting them.
export class SubscriptionCipher {
  constructor(key) {
    this.key = Buffer.from(key, 'hex');
    if (this.key.length !== 32) throw new Error('Subscription key must contain 32 bytes');
  }
  encrypt(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  decrypt(value) {
    const data = Buffer.from(value, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8'),
    );
  }
}
// PushService is an adapter around web-push, injectable for deterministic tests.
export class PushService {
  constructor(subscriptions, transport, cipher, logger) {
    Object.assign(this, { subscriptions, transport, cipher, logger });
  }
  async subscribe(owner, input) {
    const subscription = subscriptionSchema.parse(input);
    const endpointHash = createHash('sha256').update(subscription.endpoint).digest('hex');
    await this.subscriptions.updateOne(
      { endpointHash },
      { $set: { owner, encrypted: this.cipher.encrypt(subscription) } },
      { upsert: true },
    );
    return { subscribed: true };
  }
  async unsubscribe(owner) {
    await this.subscriptions.deleteMany({ owner });
    return { subscribed: false };
  }
  async send(owner, input) {
    const message = pushMessageSchema.parse(input);
    const subscriptions = await this.subscriptions.find({ owner });
    let sent = 0,
      failed = 0,
      removed = 0;
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await this.transport.sendNotification(
            this.cipher.decrypt(sub.encrypted),
            JSON.stringify({ ...message, url: '/' }),
            { TTL: 300, timeout: 10000 },
          );
          sent++;
        } catch (error) {
          if ([404, 410].includes(error.statusCode)) {
            await this.subscriptions.deleteOne({ _id: sub._id });
            removed++;
          } else {
            failed++;
            this.logger.warn({ status: error.statusCode }, 'Push delivery failed');
          }
        }
      }),
    );
    return { sent, failed, removed, total: subscriptions.length };
  }
}
