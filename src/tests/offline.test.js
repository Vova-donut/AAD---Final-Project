import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { saveSnapshot, readSnapshot, clearSnapshots } from '../client/lib/offline.js';
// A real IndexedDB-compatible store checks account isolation and logout cleanup.
describe('offline snapshots', () => {
  it('stores separate snapshots and removes all data on logout', async () => {
    await saveSnapshot('alice', { tasks: [{ title: 'Private task' }], sessions: [] });
    await saveSnapshot('bob', { tasks: [], sessions: [{ title: 'Revision' }] });
    expect((await readSnapshot('alice')).tasks[0].title).toBe('Private task');
    expect((await readSnapshot('bob')).tasks).toEqual([]);
    expect((await readSnapshot('alice')).savedAt).toMatch(/^\d{4}-/);
    await clearSnapshots();
    expect(await readSnapshot('alice')).toBeUndefined();
    expect(await readSnapshot('bob')).toBeUndefined();
  });
});
