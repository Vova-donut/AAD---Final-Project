import mongoose from 'mongoose';
// User stores a one-way password hash; tokenVersion invalidates issued JWTs on logout.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);
// Owner indexes support isolated, ordered reads without loading other users' records.
const taskSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: String,
    course: String,
    dueDate: String,
    priority: { type: String, enum: ['low', 'medium', 'high'] },
    status: { type: String, enum: ['todo', 'in-progress', 'done'] },
    notes: String,
  },
  { timestamps: true, strict: 'throw' },
);
taskSchema.index({ owner: 1, dueDate: 1, _id: 1 });
const sessionSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: String,
    course: String,
    startAt: Date,
    duration: Number,
    status: { type: String, enum: ['planned', 'completed'] },
    notes: String,
  },
  { timestamps: true, strict: 'throw' },
);
sessionSchema.index({ owner: 1, startAt: 1, _id: 1 });
// Subscription contents are encrypted by PushService before MongoDB sees them.
const subscriptionSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    endpointHash: { type: String, unique: true, required: true },
    encrypted: { type: String, required: true },
  },
  { timestamps: true },
);
subscriptionSchema.index({ owner: 1 });
export const User = mongoose.model('User', userSchema);
export const Task = mongoose.model('Task', taskSchema);
export const StudySession = mongoose.model('StudySession', sessionSchema);
export const Subscription = mongoose.model('Subscription', subscriptionSchema);
