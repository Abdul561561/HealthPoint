// HealthPoint Notification Service Worker
// Handles click actions for browser notifications triggered by active HealthPoint tabs.
// Note: Background Web Push while the browser/app is closed requires server VAPID keys and push subscriptions.

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetRoute = (event.notification.data && event.notification.data.route) || '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetRoute);
          }
          return client;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetRoute);
      }
      return null;
    })
  );
});
