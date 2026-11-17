import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppError } from './errors.js';
import { credentialsSchema, registerSchema } from '../shared/validation.js';
export const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
});
// AuthService owns hashing and token rules; it never trusts a client-supplied role.
export class AuthService {
  constructor(users, secret) {
    this.users = users;
    this.secret = secret;
  }
  async register(input) {
    const data = registerSchema.parse(input);
    if (await this.users.findOne({ email: data.email }))
      throw new AppError(409, 'Email is already registered');
    const user = await this.users.create({
      name: data.name,
      email: data.email,
      passwordHash: await bcrypt.hash(data.password, 12),
      role: 'student',
    });
    return this.issue(user);
  }
  async login(input) {
    const data = credentialsSchema.parse(input);
    const user = await this.users.findOne({ email: data.email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(data.password, user.passwordHash)))
      throw new AppError(401, 'Invalid email or password');
    return this.issue(user);
  }
  issue(user) {
    return {
      user: publicUser(user),
      token: jwt.sign({ ver: user.tokenVersion }, this.secret, {
        subject: String(user._id),
        expiresIn: '1h',
        issuer: 'study-planner',
        audience: 'study-planner',
      }),
    };
  }
  async authenticate(token) {
    let payload;
    try {
      payload = jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: 'study-planner',
        audience: 'study-planner',
      });
    } catch {
      throw new AppError(401, 'Sign in required');
    }
    const user = await this.users.findById(payload.sub);
    if (!user || payload.ver !== user.tokenVersion) throw new AppError(401, 'Sign in required');
    return user;
  }
  async logout(user) {
    await this.users.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  }
}
