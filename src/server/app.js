import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { AppError, errorHandler } from './errors.js';
// Composition root accepts services, keeping HTTP tests independent of MongoDB.
export function createApp({
  auth,
  tasks,
  sessions,
  push,
  publicKey,
  logger,
  origin,
  stats,
  ready = () => true,
  staticDir,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
    }),
  );
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set('X-Request-ID', req.id);
    const started = Date.now();
    res.on('finish', () =>
      logger.info(
        {
          requestId: req.id,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          durationMs: Date.now() - started,
        },
        'HTTP request',
      ),
    );
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 150,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: { message: 'Too many requests. Try again shortly.' } },
    }),
  );
  app.use(express.json({ limit: '16kb' }), cookieParser());
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  // SameSite cookies plus Origin/Fetch-Metadata checks prevent cross-site mutations.
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('Sec-Fetch-Site') === 'cross-site')
        throw new AppError(403, 'Cross-site request rejected');
      if (
        req.get('Origin') &&
        req.get('Origin') !== origin &&
        req.get('Origin') !== 'https://localhost:5173'
      )
        throw new AppError(403, 'Origin rejected');
    }
    next();
  });
  const guard = async (req, _res, next) => {
    const header = req.get('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies.session;
    if (!token) throw new AppError(401, 'Sign in required');
    req.user = await auth.authenticate(token);
    next();
  };
  const loginLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message: 'Too many sign-in attempts. Wait 15 minutes.' } },
  });
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 3600000,
  };
  for (const action of ['register', 'login'])
    app.post(`/api/auth/${action}`, loginLimit, async (req, res) => {
      const result = await auth[action](req.body);
      res.cookie('session', result.token, cookieOptions);
      res.status(action === 'register' ? 201 : 200).json(result);
    });
  app.get('/api/auth/me', guard, (req, res) =>
    res.json({
      user: {
        id: String(req.user._id),
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
    }),
  );
  app.post('/api/auth/logout', guard, async (req, res) => {
    await push.unsubscribe(req.user._id);
    await auth.logout(req.user);
    res.clearCookie('session', cookieOptions);
    res.status(204).end();
  });
  // Factory function mounts the same CRUD contract for both independent features.
  for (const [name, service] of Object.entries({ tasks, sessions })) {
    const router = express.Router();
    router.use(guard);
    router.get('/', async (req, res) => {
      const value = req.query.page ?? '1';
      if (typeof value !== 'string' || !/^\d+$/.test(value) || +value < 1 || +value > 10000)
        throw new AppError(400, 'Invalid page');
      const page = +value;
      const data = await service.list(req.user._id, page);
      res.json({ data, page, pageSize: 50 });
    });
    router.post('/', async (req, res) =>
      res.status(201).json({ data: await service.create(req.user._id, req.body) }),
    );
    router.get('/:id', async (req, res) =>
      res.json({ data: await service.get(req.user._id, req.params.id) }),
    );
    router.put('/:id', async (req, res) =>
      res.json({ data: await service.update(req.user._id, req.params.id, req.body) }),
    );
    router.delete('/:id', async (req, res) => {
      await service.remove(req.user._id, req.params.id);
      res.status(204).end();
    });
    app.use(`/api/${name}`, router);
  }
  app.get('/api/push/key', guard, (_req, res) => res.json({ publicKey }));
  app.post('/api/push/subscriptions', guard, async (req, res) =>
    res.status(201).json(await push.subscribe(req.user._id, req.body)),
  );
  app.delete('/api/push/subscriptions', guard, async (req, res) =>
    res.json(await push.unsubscribe(req.user._id)),
  );
  app.post('/api/push/test', guard, rateLimit({ windowMs: 60000, limit: 5 }), async (req, res) =>
    res.json(await push.send(req.user._id, req.body)),
  );
  app.get('/api/admin/stats', guard, async (req, res) => {
    if (req.user.role !== 'admin') throw new AppError(403, 'Administrator access required');
    res.json(await stats());
  });
  app.get('/api/health', (_req, res) =>
    res.status(ready() ? 200 : 503).json({
      status: ready() ? 'ok' : 'unavailable',
      database: ready() ? 'connected' : 'disconnected',
    }),
  );
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Endpoint not found')));
  if (staticDir) {
    app.use(
      express.static(staticDir, {
        setHeaders(res, file) {
          if (file.endsWith('sw.js')) res.set('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get('/{*path}', (req, res, next) => {
      if (path.extname(req.path)) return next(new AppError(404, 'File not found'));
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }
  app.use(errorHandler(logger));
  return app;
}
