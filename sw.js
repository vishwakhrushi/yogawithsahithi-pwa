/**
 * Service Worker — YogaWithSahithi PWA
 *
 * Strategy:
 * - Static assets (HTML, CSS, JS, icons): Cache-first with network fallback
 * - API calls: Network-first (no caching — always fresh data)
 */

const CACHE_NAME = "ywsh-static-v1";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/app.css",
  "/js/api.js",
  "/js/app.js",
  "/js/login.js",
  "/js/dashboard.js",
  "/js/payments.js",
  "/js/students.js",
  "/js/whatsapp.js",
  "/js/offline.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install — precache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch — cache-first for static, network-first for API
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (API POSTs go straight to network)
  if (event.request.method !== "GET") return;

  // API calls (Google Apps Script URLs) — network only
  if (url.hostname.includes("script.google.com") ||
      url.hostname.includes("script.googleusercontent.com") ||
      url.searchParams.has("action")) {
    return; // let browser handle normally
  }

  // Static assets — cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful responses for same-origin
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
