import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { AppError } from '../server/errors.js';
// HTTP contract tests use injected services; Postman verifies the real database path.
function fixture(role = 'student') {
  const user = { _id: 'owner-a', name: 'Alex', email: 'alex@example.com', role };
  const auth = {
    authenticate: vi.fn(async (token) => {
      if (token === 'valid') return user;
      throw new AppError(401, 'Sign in required');
    }),
    register: vi.fn(async () => ({ user: { id: 'owner-a' }, token: 'jwt' })),
    login: vi.fn(async () => ({ user: { id: 'owner-a' }, token: 'jwt' })),
    logout: vi.fn(),
  };
  const resource = {
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({ title: 'Saved' })),
    create: vi.fn(async (_owner, input) => input),
    update: vi.fn(async (_owner, _id, input) => input),
    remove: vi.fn(),
  };
  const push = {
    subscribe: vi.fn(async () => ({ subscribed: true })),
    unsubscribe: vi.fn(async () => ({ subscribed: false })),
    send: vi.fn(async () => ({ sent: 1 })),
  };
  const logger = { info: vi.fn(), error: vi.fn() };
  return {
    auth,
    resource,
    push,
    logger,
    app: createApp({
      auth,
      tasks: resource,
      sessions: resource,
      push,
      publicKey: 'key',
      logger,
      origin: 'https://localhost:3443',
      stats: async () => ({ users: 2 }),
    }),
  };
}
describe('HTTP security and CRUD contracts', () => {
  it.each(['tasks', 'sessions'])('%s requires authentication', async (name) => {
    const { app } = fixture();
    expect((await request(app).get(`/api/${name}`)).status).toBe(401);
  });
  it('sets secure cookie and never caches auth results', async () => {
    const { app } = fixture();
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(res.headers['set-cookie'][0]).toContain('Secure');
    expect(res.headers['set-cookie'][0]).toContain('SameSite=Strict');
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it.each(['tasks', 'sessions'])(
    '%s implements all CRUD endpoints with owner scoping',
    async (name) => {
      const { app, resource } = fixture();
      const agent = request(app);
      expect(
        (await agent.get(`/api/${name}?page=2`).set('Authorization', 'Bearer valid')).body,
      ).toMatchObject({ page: 2, pageSize: 50 });
      expect(resource.list).toHaveBeenCalledWith('owner-a', 2);
      expect(
        (
          await agent
            .post(`/api/${name}`)
            .set('Authorization', 'Bearer valid')
            .send({ title: 'New' })
        ).status,
      ).toBe(201);
      expect(resource.create).toHaveBeenCalledWith('owner-a', { title: 'New' });
      expect(
        (await agent.get(`/api/${name}/record`).set('Authorization', 'Bearer valid')).status,
      ).toBe(200);
      expect(
        (
          await agent
            .put(`/api/${name}/record`)
            .set('Authorization', 'Bearer valid')
            .send({ title: 'Updated' })
        ).status,
      ).toBe(200);
      expect(
        (await agent.delete(`/api/${name}/record`).set('Authorization', 'Bearer valid')).status,
      ).toBe(204);
      expect(resource.remove).toHaveBeenCalledWith('owner-a', 'record');
    },
  );
  it('supports cookie authentication', async () => {
    const { app, auth } = fixture();
    expect((await request(app).get('/api/auth/me').set('Cookie', 'session=valid')).status).toBe(
      200,
    );
    expect(auth.authenticate).toHaveBeenCalledWith('valid');
  });
  it('blocks cross-site writes', async () => {
    const { app } = fixture();
    expect(
      (
        await request(app)
          .post('/api/tasks')
          .set('Origin', 'https://evil.example')
          .set('Authorization', 'Bearer valid')
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/tasks')
          .set('Sec-Fetch-Site', 'cross-site')
          .set('Authorization', 'Bearer valid')
          .send({})
      ).status,
    ).toBe(403);
  });
  it.each(['0', '-1', 'abc', '1.5'])('rejects invalid page %s', async (page) => {
    const { app } = fixture();
    expect(
      (await request(app).get(`/api/tasks?page=${page}`).set('Authorization', 'Bearer valid'))
        .status,
    ).toBe(400);
  });
  it('denies student access to admin totals', async () => {
    expect(
      (await request(fixture().app).get('/api/admin/stats').set('Authorization', 'Bearer valid'))
        .status,
    ).toBe(403);
    expect(
      (
        await request(fixture('admin').app)
          .get('/api/admin/stats')
          .set('Authorization', 'Bearer valid')
      ).body.users,
    ).toBe(2);
  });
  it('supports subscribe, test and unsubscribe', async () => {
    const { app, push } = fixture();
    expect(
      (await request(app).get('/api/push/key').set('Authorization', 'Bearer valid')).body.publicKey,
    ).toBe('key');
    expect(
      (
        await request(app)
          .post('/api/push/subscriptions')
          .set('Authorization', 'Bearer valid')
          .send({})
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post('/api/push/test')
          .set('Authorization', 'Bearer valid')
          .send({ title: 'Test', body: 'Hello' })
      ).body.sent,
    ).toBe(1);
    expect(push.send).toHaveBeenCalledWith('owner-a', { title: 'Test', body: 'Hello' });
    expect(
      (await request(app).delete('/api/push/subscriptions').set('Authorization', 'Bearer valid'))
        .status,
    ).toBe(200);
  });
  it('logout removes subscriptions and revokes tokens', async () => {
    const { app, push, auth } = fixture();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer valid')
      .send({});
    expect(res.status).toBe(204);
    expect(push.unsubscribe).toHaveBeenCalledWith('owner-a');
    expect(auth.logout).toHaveBeenCalled();
    expect(res.headers['set-cookie'][0]).toContain('Expires=');
  });
  it('hides unexpected errors and returns a request ID', async () => {
    const { app, resource, logger } = fixture();
    resource.list.mockRejectedValue(new Error('private database details'));
    const res = await request(app).get('/api/tasks').set('Authorization', 'Bearer valid');
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Service temporarily unavailable');
    expect(res.body.error.requestId).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('private database');
    expect(logger.error).toHaveBeenCalled();
  });
  it('handles invalid JSON, duplicate keys and unknown routes', async () => {
    const { app, auth } = fixture();
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .set('Content-Type', 'application/json')
          .send('{bad')
      ).status,
    ).toBe(400);
    auth.register.mockRejectedValue({ code: 11000 });
    expect((await request(app).post('/api/auth/register').send({})).status).toBe(409);
    expect((await request(app).get('/api/no-such-route')).status).toBe(404);
  });
  it('reports readiness in health checks', async () => {
    expect((await request(fixture().app).get('/api/health')).body.database).toBe('connected');
  });
});
