const CACHE = 'lingostep-v4';
const ASSETS = ['/', '/index.html', '/style.css', '/curriculum.js', '/extra-words.js', '/app.js', '/manifest.json', '/icon.svg'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => { if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin || event.request.headers.has('range')) return; event.respondWith(fetch(event.request).then(response => { if (response.status===200) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(()=>{}); } return response; }).catch(() => caches.match(event.request))); });
