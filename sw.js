
/* ============================================================
   Service Worker — Lector EPUB
   Corregido para GitHub Pages (sitio publicado en subruta).
   ============================================================ */

const CACHE_VERSION = 'v1.0.1';
const APP_CACHE = `lector-app-${CACHE_VERSION}`;
const RUNTIME_CACHE = `lector-runtime-${CACHE_VERSION}`;
const BASE_URL = self.registration.scope;
const INDEX_URL = new URL('./index.html', BASE_URL).href;

/* Recursos locales de la aplicación */
const APP_SHELL = [
  INDEX_URL,
  new URL('./manifest.json', BASE_URL).href,
  new URL('./icon-192.png', BASE_URL).href,
  new URL('./icon-512.png', BASE_URL).href
];

/* ---------- Instalación ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);

    try {
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    } catch (error) {
      console.error(
        '[SW] No se pudo precargar el shell de la PWA.',
        error
      );
      throw error;
    }
  })());
});

/* ---------- Activación ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter((key) =>
          (
            key.startsWith('lector-app-') ||
            key.startsWith('lector-runtime-')
          ) &&
          key !== APP_CACHE &&
          key !== RUNTIME_CACHE
        )
        .map((key) => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

/* ---------- Estrategias de fetch ---------- */
self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const base = new URL(BASE_URL);

  /* Navegación: red primero; caché como alternativa offline */
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);

        if (response && response.ok) {
          const cache = await caches.open(APP_CACHE);
          await cache.put(INDEX_URL, response.clone());
        }

        return response;
      } catch (error) {
        const cached = await caches.match(INDEX_URL);

        if (cached) return cached;
        throw error;
      }
    })());

    return;
  }

  /* Recursos del mismo sitio */
  if (
    url.origin === base.origin &&
    url.pathname.startsWith(base.pathname)
  ) {
    // No guardar respuestas parciales (por ejemplo, Range).
    if (request.headers.has('range')) return;

    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(request);

      if (cached) return cached;

      const response = await fetch(request);

      if (
        response &&
        response.ok &&
        response.type === 'basic'
      ) {
        await cache.put(request, response.clone());
      }

      return response;
    })());

    return;
  }

  /* Recursos externos: epubjs/esm.sh y Google Fonts.
     Estrategia stale-while-revalidate. */
  const updateExternalCache = caches
    .open(RUNTIME_CACHE)
    .then(async (cache) => {
      const response = await fetch(request);

      if (
        response &&
        response.ok &&
        response.type !== 'opaque'
      ) {
        try {
          await cache.put(request, response.clone());
        } catch (error) {
          console.warn(
            '[SW] No se pudo guardar recurso externo:',
            error
          );
        }
      }

      return response;
    });

  event.waitUntil(
    updateExternalCache
      .then(() => undefined)
      .catch(() => undefined)
  );

  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) =>
      cache.match(request).then(
        (cached) => cached || updateExternalCache
      )
    )
  );
});

/* ---------- Mensajes desde la aplicación ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
