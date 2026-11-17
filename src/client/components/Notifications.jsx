import { useEffect, useState } from 'react';
import { enablePush, disablePush } from '../lib/push.js';
import { api } from '../lib/api.js';
// Push controls require a deliberate click before asking for browser permission.
export default function Notifications({ disabled }) {
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.ready
        .then((r) => r.pushManager?.getSubscription())
        .then((s) => setEnabled(Boolean(s)))
        .catch(() => {});
  }, []);
  async function action(fn) {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card">
      <p className="eyebrow">A GENTLE NUDGE</p>
      <h2>Stay in the loop</h2>
      <p>
        Enable browser notifications, then send yourself a test message. Notifications are sent on
        request; this version does not schedule automatic reminders.
      </p>
      <p>
        Permission: {typeof Notification === 'undefined' ? 'unsupported' : Notification.permission}{' '}
        · Subscription: {enabled ? 'enabled' : 'not enabled'}
      </p>
      <div className="form-actions">
        <button
          className="primary"
          disabled={disabled || busy}
          onClick={() =>
            action(async () => {
              await enablePush();
              setEnabled(true);
              setMessage('Notifications enabled. Send a test to check delivery.');
            })
          }
        >
          Enable notifications
        </button>
        <button
          disabled={disabled || busy || !enabled}
          onClick={() =>
            action(async () => {
              const result = await api('/push/test', {
                method: 'POST',
                body: {
                  title: 'Your study space is ready',
                  body: 'Take a moment to plan your next study session.',
                },
              });
              setMessage(
                `Push service accepted: ${result.sent}. Failed: ${result.failed}. Expired subscriptions removed: ${result.removed}. Check your system notifications.`,
              );
            })
          }
        >
          Send test
        </button>
        <button
          disabled={disabled || busy || !enabled}
          onClick={() =>
            action(async () => {
              await disablePush();
              setEnabled(false);
              setMessage('Notifications disabled.');
            })
          }
        >
          Disable
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      <small>
        Web Push needs an internet connection, notification permission, and a trusted HTTPS
        certificate.
      </small>
    </section>
  );
}
