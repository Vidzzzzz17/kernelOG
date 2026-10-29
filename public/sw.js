const CACHE = "kernel-v1"
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/kernel/Main.html"])))
  self.skipWaiting()
})
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)))
})
