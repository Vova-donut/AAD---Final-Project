import { api } from './api.js';
// Convert the URL-safe public VAPID key into the format required by PushManager.
export function decodeKey(key) {
  const value = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(value, (c) => c.charCodeAt(0));
}
export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    throw new Error('Web Push is unavailable in this browser. Try Chrome or Firefox.');
  if ((await Notification.requestPermission()) !== 'granted')
    throw new Error(
      'Notifications are blocked. Change the site notification permission and try again.',
    );
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await api('/push/key');
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(publicKey),
    }));
  await api('/push/subscriptions', { method: 'POST', body: subscription.toJSON() });
}
export async function disablePush() {
  await api('/push/subscriptions', { method: 'DELETE' });
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();
}
