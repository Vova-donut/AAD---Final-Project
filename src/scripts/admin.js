import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { parseArgs } from 'node:util';
import { registerSchema } from '../shared/validation.js';
import { User } from '../server/models.js';
// CLI-only admin provisioning prevents role escalation through registration.
const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
const data = registerSchema.parse({ ...values, password: process.env.ADMIN_PASSWORD });
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  if (await User.findOne({ email: data.email }))
    throw new Error('Email already exists. Choose a separate administrator email.');
  await User.create({
    name: data.name,
    email: data.email,
    passwordHash: await bcrypt.hash(data.password, 12),
    role: 'admin',
  });
  console.log('Administrator created.');
} finally {
  await mongoose.disconnect();
}
