/* BrPec PWA · Service Worker
 *
 * Estratégia de cache:
 *   - Shell (HTML/CSS/JS + sql.js + ícone + seed do banco) → cache-first.
 *     Tudo que precisa para a UI subir offline.
 *   - Rede (/sync/*) → network-first com fallback (sem cache; sync exige fresh).
 *
 * Versionar `CACHE_NAME` força o SW a baixar shell novo num próximo deploy.
 */

const CACHE_NAME = 'brpec-pwa-v1';
const SHELL_ASSETS = [
  './',
  './index.html',
  './app.js',
  './db.js',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  '../brpec/brpec.db',
  'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm.js',
  'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm.wasm'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  // ativa imediatamente, sem esperar tabs antigas fecharem
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  // toma controle das tabs já abertas
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // /sync/* → network-first, sem cache. Se rede falhar, devolve 503 estruturado.
  if (url.pathname.startsWith('/sync/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ ok: false, reason: 'offline' }),
          { status: 503, headers: { 'content-type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Shell → cache-first; se faltar no cache, busca rede + atualiza cache.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        // só cacheia respostas válidas e do mesmo escopo
        if (resp.ok && (url.origin === self.location.origin || url.hostname === 'cdn.jsdelivr.net')) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached || new Response('offline', { status: 503 }));
    })
  );
});
