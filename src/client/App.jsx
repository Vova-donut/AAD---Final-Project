import { useCallback, useEffect, useRef, useState } from 'react';
import AuthForm from './components/AuthForm.jsx';
import RecordForm from './components/RecordForm.jsx';
import RecordList from './components/RecordList.jsx';
import Notifications from './components/Notifications.jsx';
import { api, getAll } from './lib/api.js';
import { saveSnapshot, readSnapshot, clearSnapshots } from './lib/offline.js';
const savedUser = () => {
  try {
    return JSON.parse(sessionStorage.getItem('planner-user'));
  } catch {
    return null;
  }
};
// App coordinates authenticated data and read-only offline snapshots.
export default function App() {
  const [user, setUser] = useState(savedUser),
    [boot, setBoot] = useState(true),
    [online, setOnline] = useState(navigator.onLine),
    [tab, setTab] = useState('tasks'),
    [data, setData] = useState({ tasks: [], sessions: [] }),
    [snapshot, setSnapshot] = useState(null),
    [offline, setOffline] = useState(!navigator.onLine),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [modal, setModal] = useState(null),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [stats, setStats] = useState(null),
    [loggingOut, setLoggingOut] = useState(false);
  const generation = useRef(0);
  const login = useCallback((u) => {
    generation.current++;
    setData({ tasks: [], sessions: [] });
    setUser(u);
    sessionStorage.setItem('planner-user', JSON.stringify(u));
    setError('');
  }, []);
  const forget = useCallback(async () => {
    generation.current++;
    setUser(null);
    setData({ tasks: [], sessions: [] });
    setStats(null);
    setModal(null);
    sessionStorage.removeItem('planner-user');
    await clearSnapshots().catch(() => {});
  }, []);
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await api('/auth/me');
        if (active) {
          setUser(result.user);
          sessionStorage.setItem('planner-user', JSON.stringify(result.user));
        }
      } catch (e) {
        if (active && e.status === 401) await forget();
      } finally {
        if (active) setBoot(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [forget]);
  const load = useCallback(async () => {
    if (!user) return;
    const version = generation.current;
    setLoading(true);
    setError('');
    try {
      if (!online) throw new TypeError('Offline');
      const [tasks, sessions] = await Promise.all([getAll('tasks'), getAll('sessions')]);
      if (version !== generation.current) return;
      setData({ tasks, sessions });
      setOffline(false);
      const savedAt = new Date().toISOString();
      setSnapshot(savedAt);
      try {
        await saveSnapshot(user.id, { tasks, sessions });
      } catch {
        setError('Records loaded, but offline storage is unavailable in this browser.');
      }
    } catch (e) {
      if (version !== generation.current) return;
      if (e.status === 401) {
        await forget();
        return;
      }
      if (e.status) {
        setError(e.message);
        return;
      }
      const cached = await readSnapshot(user.id).catch(() => null);
      if (version !== generation.current) return;
      setData(
        cached ? { tasks: cached.tasks, sessions: cached.sessions } : { tasks: [], sessions: [] },
      );
      setSnapshot(cached?.savedAt || null);
      setOffline(true);
      if (!cached) setError('No offline snapshot yet. Connect and refresh to save your records.');
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [user, online, forget]);
  useEffect(() => {
    if (!boot) void load();
  }, [load, boot]);
  async function save(values, id) {
    await api(`/${tab}${id ? '/' + id : ''}`, { method: id ? 'PUT' : 'POST', body: values });
    await load();
  }
  async function remove(item) {
    if (!confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await api(`/${tab}/${item._id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function logout() {
    setLoggingOut(true);
    try {
      await api('/auth/logout', { method: 'POST' });
      const reg = await navigator.serviceWorker?.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      await sub?.unsubscribe().catch(() => {});
      await forget();
    } catch (e) {
      if (e.status === 401) await forget();
      else setError('Connect to the server to sign out and revoke your session. ' + e.message);
    } finally {
      setLoggingOut(false);
    }
  }
  if (boot) return <div className="loading-screen">Opening your study space…</div>;
  if (!user) return <AuthForm onLogin={login} />;
  const disabled = offline || !online || loading;
  const items = (data[tab] || []).filter(
    (x) =>
      (filter === 'all' || x.status === filter) &&
      `${x.title} ${x.course} ${x.notes}`.toLowerCase().includes(query.toLowerCase()),
  );
  const openTasks = data.tasks.filter((x) => x.status !== 'done').length,
    completed = data.tasks.filter((x) => x.status === 'done').length;
  const minutes = data.sessions
    .filter((x) => x.status === 'completed')
    .reduce((sum, x) => sum + x.duration, 0);
  function navigate(key) {
    setTab(key);
    setFilter('all');
    setQuery('');
    setModal(null);
    setError('');
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="wordmark">
          SP <span>Study Planner</span>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            ['tasks', '✓', 'My tasks'],
            ['sessions', '◷', 'Study sessions'],
            ['notifications', '◉', 'Notifications'],
            ...(user.role === 'admin' ? [['admin', '▤', 'Administration']] : []),
          ].map(([key, icon, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => navigate(key)}>
              <span>{icon}</span>
              {label}
              {key === 'tasks' && <small>{openTasks}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p>
            One focused session
            <br />
            at a time.
          </p>
          <div className="profile">
            <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
            <div>
              {user.name}
              <small>{user.role}</small>
            </div>
          </div>
          <button className="signout" onClick={logout} disabled={loggingOut}>
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            My workspace{' '}
            <span className="crumb">
              /{' '}
              {tab === 'tasks'
                ? 'Tasks'
                : tab === 'sessions'
                  ? 'Study sessions'
                  : tab === 'admin'
                    ? 'Administration'
                    : 'Notifications'}
            </span>
          </span>
          <span className={`connection ${offline || !online ? 'is-offline' : ''}`}>
            {offline || !online ? 'Offline · read only' : 'Connected'}
          </span>
        </header>
        <div className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {new Date()
                  .toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })
                  .toUpperCase()}
              </p>
              <h1>
                {tab === 'tasks'
                  ? 'A little progress, every day.'
                  : tab === 'sessions'
                    ? 'Make time to focus.'
                    : tab === 'admin'
                      ? 'Workspace overview.'
                      : 'Keep your plans close.'}
              </h1>
              <p>
                {tab === 'tasks'
                  ? 'Your coursework, with a clear next step.'
                  : tab === 'sessions'
                    ? 'Turn good intentions into time on your calendar.'
                    : 'Manage your study workspace.'}
              </p>
            </div>
            {['tasks', 'sessions'].includes(tab) && (
              <button
                className="primary"
                disabled={disabled}
                onClick={() => setModal({ record: null })}
              >
                + New {tab === 'tasks' ? 'task' : 'session'}
              </button>
            )}
          </div>
          {(offline || !online) && (
            <div className="offline-banner" role="status">
              You are viewing a saved copy. Editing is available when the server reconnects.
              {snapshot && ` Last saved: ${new Date(snapshot).toLocaleString('en-NZ')}.`}
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <section className="metrics" aria-label="Study overview">
            <article>
              <small>OPEN TASKS</small>
              <strong>{openTasks.toString().padStart(2, '0')}</strong>
              <p>A clear next step</p>
            </article>
            <article>
              <small>TASKS COMPLETED</small>
              <strong>{completed.toString().padStart(2, '0')}</strong>
              <p>Progress you can see</p>
            </article>
            <article>
              <small>FOCUSED MINUTES</small>
              <strong>{minutes}</strong>
              <p>From completed sessions</p>
            </article>
          </section>
          {['tasks', 'sessions'].includes(tab) ? (
            <section className="list-section">
              <div className="list-heading">
                <h2>
                  {tab === 'tasks' ? 'My tasks' : 'Study sessions'} <span>{items.length}</span>
                </h2>
                <button onClick={load} disabled={loading}>
                  {loading ? 'Refreshing…' : '↻ Refresh'}
                </button>
              </div>
              <div className="toolbar">
                <div className="filters" role="group" aria-label="Filter by status">
                  {[
                    'all',
                    ...(tab === 'tasks'
                      ? ['todo', 'in-progress', 'done']
                      : ['planned', 'completed']),
                  ].map((x) => (
                    <button
                      key={x}
                      className={filter === x ? 'selected' : ''}
                      onClick={() => setFilter(x)}
                    >
                      {x.replace('-', ' ')}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <span className="sr-only">Search records</span>
                  <input
                    placeholder="Search title, course or notes…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <RecordList
                kind={tab}
                items={items}
                disabled={disabled}
                onEdit={(record) => setModal({ record })}
                onDelete={remove}
              />
            </section>
          ) : tab === 'notifications' ? (
            <Notifications disabled={disabled} />
          ) : (
            <section className="settings-card">
              <h2>Administrator statistics</h2>
              <p>
                Only administrator accounts can request these totals. Personal records remain
                private to their owners.
              </p>
              <button
                disabled={disabled}
                onClick={async () => {
                  try {
                    setStats(await api('/admin/stats'));
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                Load statistics
              </button>
              {stats && (
                <p>
                  Users: {stats.users} · Tasks: {stats.tasks} · Sessions: {stats.sessions}
                </p>
              )}
            </section>
          )}
          <footer>
            Study Planner <span>Your semester, a little more organised.</span>
          </footer>
        </div>
      </main>
      {modal && !offline && online && (
        <RecordForm kind={tab} record={modal.record} onSave={save} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
