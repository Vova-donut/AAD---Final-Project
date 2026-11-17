import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import * as webpush from 'web-push';
import pino from 'pino';
import { config } from './config.js';
import { User, Task, StudySession, Subscription } from './models.js';
import { AuthService } from './auth-service.js';
import { OwnedRepository } from './repository.js';
import { ResourceService } from './resource-service.js';
import { PushService, SubscriptionCipher } from './push-service.js';
import { taskSchema, sessionSchema } from '../shared/validation.js';
import { createApp } from './app.js';
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
// Buffering is disabled so a database outage produces an error instead of hanging.
mongoose.set('bufferCommands', false);
try {
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Task.init(), StudySession.init(), Subscription.init()]);
  webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);
  const auth = new AuthService(User, config.JWT_SECRET);
  const tasks = new ResourceService(new OwnedRepository(Task, 'dueDate'), taskSchema);
  const sessions = new ResourceService(new OwnedRepository(StudySession, 'startAt'), sessionSchema);
  const push = new PushService(
    Subscription,
    webpush,
    new SubscriptionCipher(config.SUBSCRIPTION_KEY),
    logger,
  );
  const app = createApp({
    auth,
    tasks,
    sessions,
    push,
    publicKey: config.VAPID_PUBLIC_KEY,
    logger,
    origin: config.APP_ORIGIN,
    ready: () => mongoose.connection.readyState === 1,
    stats: async () => ({
      users: await User.countDocuments(),
      tasks: await Task.countDocuments(),
      sessions: await StudySession.countDocuments(),
    }),
    staticDir: path.resolve('dist'),
  });
  const server = https.createServer(
    {
      key: fs.readFileSync(config.TLS_KEY),
      cert: fs.readFileSync(config.TLS_CERT),
      minVersion: 'TLSv1.2',
    },
    app,
  );
  server.listen(config.PORT, 'localhost', () =>
    logger.info({ url: config.APP_ORIGIN }, 'Study Planner HTTPS server ready'),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
      });
    });
} catch (error) {
  logger.fatal(
    { name: error.name, code: error.code },
    'Startup failed. Check .env, certificate files and MongoDB.',
  );
  process.exit(1);
}
