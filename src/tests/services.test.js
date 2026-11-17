import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  taskSchema,
  sessionSchema,
  credentialsSchema,
  subscriptionSchema,
} from '../shared/validation.js';
import { ResourceService } from '../server/resource-service.js';
import { OwnedRepository } from '../server/repository.js';
import { AuthService } from '../server/auth-service.js';
import { PushService, SubscriptionCipher } from '../server/push-service.js';
const task = {
  title: 'Finish report',
  course: 'AAD',
  dueDate: '2026-11-25',
  priority: 'high',
  status: 'todo',
  notes: '',
};
const session = {
  title: 'API practice',
  course: 'AAD',
  startAt: '2026-11-24T10:00:00+13:00',
  duration: 45,
  status: 'planned',
  notes: '',
};
const owner = '507f1f77bcf86cd799439011',
  id = '507f1f77bcf86cd799439012';
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/example',
  keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) },
};
describe('shared validation', () => {
  it('accepts a leap day and rejects an impossible date', () => {
    expect(taskSchema.parse({ ...task, dueDate: '2028-02-29' }).dueDate).toBe('2028-02-29');
    expect(() => taskSchema.parse({ ...task, dueDate: '2026-02-29' })).toThrow();
  });
  it.each([
    ['title', ' '],
    ['priority', 'urgent'],
    ['status', 'unknown'],
    ['course', { $ne: null }],
    ['dueDate', 'tomorrow'],
  ])('rejects invalid task %s', (key, value) =>
    expect(() => taskSchema.parse({ ...task, [key]: value })).toThrow(),
  );
  it('rejects ownership and operator injection', () => {
    expect(() => taskSchema.parse({ ...task, owner: 'attacker' })).toThrow();
    expect(() =>
      credentialsSchema.parse({ email: { $ne: null }, password: 'valid-password' }),
    ).toThrow();
  });
  it('normalises whitespace and email casing', () => {
    expect(taskSchema.parse({ ...task, title: '  Finish report  ' }).title).toBe('Finish report');
    expect(
      credentialsSchema.parse({ email: 'Student@Example.com', password: 'strong-password' }).email,
    ).toBe('student@example.com');
  });
  it.each([15, 240])('accepts duration boundary %s', (duration) =>
    expect(sessionSchema.parse({ ...session, duration }).duration).toBe(duration),
  );
  it.each([14, 241, 45.5, '45'])('rejects invalid duration %s', (duration) =>
    expect(() => sessionSchema.parse({ ...session, duration })).toThrow(),
  );
  it('requires timezone in session start', () =>
    expect(() => sessionSchema.parse({ ...session, startAt: '2026-11-24T10:00:00' })).toThrow());
  it.each([
    'https://localhost/push',
    'http://fcm.googleapis.com/push',
    'https://fcm.googleapis.com.evil.test/push',
    'https://fcm.googleapis.com:8443/push',
  ])('blocks unsafe push endpoint %s', (endpoint) =>
    expect(() => subscriptionSchema.parse({ ...subscription, endpoint })).toThrow(),
  );
});
describe('resource services', () => {
  for (const [name, schema, input] of [
    ['tasks', taskSchema, task],
    ['sessions', sessionSchema, session],
  ]) {
    it(`${name}: delegates CRUD with the authenticated owner`, async () => {
      const repo = {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(input),
        create: vi.fn().mockResolvedValue(input),
        update: vi.fn().mockResolvedValue(input),
        remove: vi.fn(),
      };
      const service = new ResourceService(repo, schema);
      await service.list(owner, 2);
      await service.get(owner, id);
      await service.create(owner, input);
      await service.update(owner, id, input);
      await service.remove(owner, id);
      expect(repo.list).toHaveBeenCalledWith(owner, 2);
      expect(repo.get).toHaveBeenCalledWith(owner, id);
      expect(repo.create).toHaveBeenCalledWith(owner, input);
      expect(repo.update).toHaveBeenCalledWith(owner, id, input);
      expect(repo.remove).toHaveBeenCalledWith(owner, id);
    });
    it(`${name}: rejects invalid input before persistence`, () => {
      const repo = { create: vi.fn(), update: vi.fn() };
      const service = new ResourceService(repo, schema);
      expect(() => service.create(owner, { ...input, title: '' })).toThrow();
      expect(() => service.update(owner, id, { ...input, title: '' })).toThrow();
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });
  }
});
describe('owner-scoped repository', () => {
  it('queries records by ID and owner', async () => {
    const model = { findOne: vi.fn().mockReturnValue({ lean: async () => task }) };
    expect(await new OwnedRepository(model, 'dueDate').get(owner, id)).toEqual(task);
    expect(model.findOne).toHaveBeenCalledWith({ _id: id, owner });
  });
  it('rejects malformed and missing IDs', async () => {
    const repo = new OwnedRepository({ findOne: () => ({ lean: async () => null }) }, 'dueDate');
    await expect(repo.get(owner, 'bad')).rejects.toMatchObject({ status: 400 });
    await expect(repo.get(owner, id)).rejects.toMatchObject({ status: 404 });
  });
  it('forces owner on create and uses a bounded sorted page', async () => {
    const chain = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    };
    const model = { create: vi.fn(), find: vi.fn().mockReturnValue(chain) };
    const repo = new OwnedRepository(model, 'dueDate');
    await repo.create(owner, { ...task, owner: 'attacker' });
    expect(model.create).toHaveBeenCalledWith({ ...task, owner });
    await repo.list(owner, 3);
    expect(model.find).toHaveBeenCalledWith({ owner });
    expect(chain.sort).toHaveBeenCalledWith({ dueDate: 1, _id: 1 });
    expect(chain.skip).toHaveBeenCalledWith(100);
    expect(chain.limit).toHaveBeenCalledWith(50);
  });
  it('scopes updates and deletion; returns 404 for other owners', async () => {
    const model = {
      findOneAndUpdate: vi.fn().mockReturnValue({ lean: async () => null }),
      findOneAndDelete: vi.fn().mockResolvedValue(null),
    };
    const repo = new OwnedRepository(model, 'dueDate');
    await expect(repo.update(owner, id, task)).rejects.toMatchObject({ status: 404 });
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id, owner },
      { $set: task },
      { new: true, runValidators: true },
    );
    await expect(repo.remove(owner, id)).rejects.toMatchObject({ status: 404 });
    expect(model.findOneAndDelete).toHaveBeenCalledWith({ _id: id, owner });
  });
});
describe('authentication', () => {
  const secret = 's'.repeat(96);
  const user = {
    _id: owner,
    name: 'Alex',
    email: 'alex@example.com',
    role: 'student',
    tokenVersion: 0,
  };
  it('hashes registered passwords and issues an expiring token', async () => {
    let stored;
    const users = {
      findOne: async () => null,
      create: async (data) => {
        stored = data;
        return { ...user, ...data };
      },
    };
    const result = await new AuthService(users, secret).register({
      name: 'Alex',
      email: user.email,
      password: 'my-long-password',
    });
    expect(stored.passwordHash).not.toBe('my-long-password');
    expect(await bcrypt.compare('my-long-password', stored.passwordHash)).toBe(true);
    expect(stored.role).toBe('student');
    expect(result.user).not.toHaveProperty('passwordHash');
    const decoded = jwt.verify(result.token, secret);
    expect(decoded.exp - decoded.iat).toBe(3600);
  });
  it('rejects duplicates and role escalation', async () => {
    const service = new AuthService({ findOne: async () => user }, secret);
    await expect(
      service.register({ name: 'Alex', email: user.email, password: 'my-long-password' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.register({
        name: 'Alex',
        email: user.email,
        password: 'my-long-password',
        role: 'admin',
      }),
    ).rejects.toThrow();
  });
  it('accepts a matching hash and rejects a wrong password', async () => {
    const passwordHash = await bcrypt.hash('my-long-password', 4);
    const service = new AuthService(
      { findOne: () => ({ select: async () => ({ ...user, passwordHash }) }) },
      secret,
    );
    expect((await service.login({ email: user.email, password: 'my-long-password' })).user.id).toBe(
      owner,
    );
    await expect(
      service.login({ email: user.email, password: 'wrong-password' }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('checks signature, expiration and logout version', async () => {
    const users = { findById: vi.fn().mockResolvedValue(user), updateOne: vi.fn() };
    const service = new AuthService(users, secret);
    expect(await service.authenticate(service.issue(user).token)).toEqual(user);
    await expect(service.authenticate('bad')).rejects.toMatchObject({ status: 401 });
    const expired = jwt.sign({ ver: 0 }, secret, {
      subject: owner,
      expiresIn: -1,
      issuer: 'study-planner',
      audience: 'study-planner',
    });
    await expect(service.authenticate(expired)).rejects.toMatchObject({ status: 401 });
    users.findById.mockResolvedValue({ ...user, tokenVersion: 1 });
    await expect(service.authenticate(service.issue(user).token)).rejects.toMatchObject({
      status: 401,
    });
    await service.logout(user);
    expect(users.updateOne).toHaveBeenCalledWith({ _id: owner }, { $inc: { tokenVersion: 1 } });
  });
});
describe('encrypted Web Push', () => {
  const cipher = new SubscriptionCipher('a'.repeat(64));
  it('round trips subscriptions without storing plaintext and detects tampering', () => {
    const value = cipher.encrypt(subscription);
    expect(value).not.toContain(subscription.endpoint);
    expect(cipher.decrypt(value)).toEqual(subscription);
    const bytes = Buffer.from(value, 'base64');
    bytes[30] ^= 1;
    expect(() => cipher.decrypt(bytes.toString('base64'))).toThrow();
    expect(() => new SubscriptionCipher('bad')).toThrow();
  });
  it('stores encrypted subscriptions under a hashed endpoint and removes owner subscriptions', async () => {
    const db = { updateOne: vi.fn(), deleteMany: vi.fn() };
    const service = new PushService(db, {}, cipher, {});
    await service.subscribe(owner, subscription);
    const [query, update] = db.updateOne.mock.calls[0];
    expect(query.endpointHash).toMatch(/^[a-f0-9]{64}$/);
    expect(update.$set.owner).toBe(owner);
    expect(cipher.decrypt(update.$set.encrypted)).toEqual(subscription);
    await service.unsubscribe(owner);
    expect(db.deleteMany).toHaveBeenCalledWith({ owner });
  });
  it('counts delivery failures and removes expired subscriptions', async () => {
    const db = {
      find: async () => [1, 2, 3].map((n) => ({ _id: n, encrypted: cipher.encrypt(subscription) })),
      deleteOne: vi.fn(),
    };
    const transport = {
      sendNotification: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce({ statusCode: 410 })
        .mockRejectedValueOnce({ statusCode: 503 }),
    };
    const logger = { warn: vi.fn() };
    const result = await new PushService(db, transport, cipher, logger).send(owner, {
      title: 'Study time',
      body: 'Review the API',
    });
    expect(result).toEqual({ sent: 1, failed: 1, removed: 1, total: 3 });
    expect(db.deleteOne).toHaveBeenCalledWith({ _id: 2 });
    expect(logger.warn).toHaveBeenCalled();
  });
  it('returns zero for a user without subscriptions', async () => {
    expect(
      await new PushService({ find: async () => [] }, {}, cipher, {}).send(owner, {
        title: 'Study time',
        body: 'Review the API',
      }),
    ).toEqual({ sent: 0, failed: 0, removed: 0, total: 0 });
  });
});
