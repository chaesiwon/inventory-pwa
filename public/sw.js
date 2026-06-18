// sw.js - 최소 서비스워커 (오프라인 캐싱 없음, PWA 설치 요건만 충족)
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => self.clients.claim());
self.addEventListener('fetch', (e) => {
  // 네트워크 우선, 캐싱 없음 (API 서버 데이터가 항상 최신이어야 하므로)
  e.respondWith(fetch(e.request).catch(() => new Response('오프라인 상태입니다.')));
});
