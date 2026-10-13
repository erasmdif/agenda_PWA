/* Cache esclusivamente dell'app statica; lo stato personale non passa dal service worker.
   Network-first per risolvere gli aggiornamenti bloccati dalla vecchia cache,
   con ripiego sulla versione salvata quando l'app è offline. */
const CACHE = 'agenda-shell-v9-1.5.1';
const SHELL = [
  './', 'index.html', 'style.css', 'logic.js', 'chatgpt-bridge.js', 'state-sync.js', 'daily-reminder.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    // Per HTML/JS/CSS tentiamo prima la rete: le nuove versioni non restano
    // invisibili per uno o più avvii perché la cache era ancora valida.
    const url = new URL(req.url);
    const fresh = req.mode === 'navigate' || /\.(html|js|css)(?:$)/i.test(url.pathname) || url.pathname.endsWith('/');
    if (fresh) {
      try {
        const res = await fetch(req);
        if (res && res.ok) { await cache.put(req, res.clone()); return res; }
      } catch (err) { /* offline: usa la copia già disponibile */ }
    }
    const saved = await cache.match(req, { ignoreSearch: true });
    if (saved) return saved;
    try {
      const res = await fetch(req);
      if (res && res.ok) await cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') {
        const fallback = await cache.match('index.html');
        if (fallback) return fallback;
      }
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  }));
});
/* Il service worker gestisce i pulsanti delle notifiche anche quando la PWA
   non ha una finestra visibile. Non può tuttavia creare da solo un allarme
   futuro: per notifiche affidabili ad app chiusa occorre Web Push. */
self.addEventListener('notificationclick', (event) => {
  const note = event.notification;
  const data = note.data || {};
  const action = event.action === 'ok' ? 'ok' : event.action === 'snooze' ? 'snooze' : 'open';
  note.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const url = new URL('./', self.registration.scope);
    if (data.agendaDaily) {
      for (const client of windows) {
        if (!client.url.startsWith(self.registration.scope)) continue;
        client.postMessage({ type: 'agenda-daily-action', action, date: data.date });
        if ('focus' in client) await client.focus();
        return;
      }
      url.searchParams.set('daily_action', action);
      url.searchParams.set('daily_date', String(data.date || ''));
    } else {
      for (const client of windows) {
        if ('focus' in client) { await client.focus(); return; }
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url.href);
  })());
});
