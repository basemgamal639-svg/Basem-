self.addEventListener('push', (event) => {
  let data = { title: 'Grok Bot · now', body: '', url: 'https://pump.fun' };
  try { data = { ...data, ...event.data.json() }; } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    data: { url: data.url },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || 'https://pump.fun';
  event.waitUntil(clients.openWindow(url));
});
