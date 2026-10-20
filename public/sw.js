/* 通知専用。画面・API・ログイン情報をオフラインに保存しない。 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch {}
  event.waitUntil(self.registration.showNotification('LocAIからのお知らせ', {
    body: '新しい通知があります。開いてご確認ください。',
    icon: '/icon.png', badge: '/icon.png', tag: typeof data.tag === 'string' ? data.tag : 'locai',
    data: { url: '/notifications' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const tab of tabs) if (new URL(tab.url).origin === self.location.origin) {
      await tab.navigate('/notifications'); return tab.focus();
    }
    return self.clients.openWindow('/notifications');
  })());
});
