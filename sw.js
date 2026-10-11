/* ============================================================
   Service Worker — Lector EPUB
   ============================================================ */

const CACHE_VERSION = 'v1.0.2';
const APP_CACHE = `lector-app-${CACHE_VERSION}`;
const RUNTIME_CACHE = `lector-runtime-${CACHE_VERSION}`;

/* Recursos del shell: se cachean en la instalación.
   Rutas relativas para funcionar bajo subdirectorio de GitHub Pages. */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

/* ---------- Instalación ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] install failed', err))
  );
});

/* ---------- Activación: limpia versiones antiguas ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- Estrategias de fetch ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Navegación (abrir la app): red primero, fallback al index cacheado
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(APP_CACHE).then((c) => c.put('./index.html', clone));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 2) Mismo origen: cache-first con relleno
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const clone = resp.clone();
            caches.open(APP_CACHE).then((c) => c.put(req, clone));
          }
          return resp;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 3) Recursos externos (esm.sh, Google Fonts): stale-while-revalidate
  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((resp) => {
            if (resp && resp.status === 200) {
              cache.put(req, resp.clone());
            }
            return resp;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});

/* ---------- Mensajes desde la app (para forzar update) ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
