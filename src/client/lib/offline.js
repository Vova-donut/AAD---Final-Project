import { openDB } from 'idb';
// IndexedDB snapshots are scoped by user ID. They contain no password or JWT.
const database = () =>
  openDB('study-planner', 1, {
    upgrade(db) {
      db.createObjectStore('snapshots');
    },
  });
export async function saveSnapshot(userId, data) {
  const db = await database();
  try {
    await db.put('snapshots', { ...data, savedAt: new Date().toISOString() }, userId);
  } finally {
    db.close();
  }
}
export async function readSnapshot(userId) {
  const db = await database();
  try {
    return await db.get('snapshots', userId);
  } finally {
    db.close();
  }
}
export async function clearSnapshots() {
  const db = await database();
  try {
    await db.clear('snapshots');
  } finally {
    db.close();
  }
}
