/* ═══════════════════════════════════════════
   Service Worker - 장기재고 관리 시스템 PWA
   캐싱 전략:
     - 정적 자산(CSS/JS/HTML): Cache First
     - API 요청: Network Only (항상 최신 데이터)
   ═══════════════════════════════════════════ */

const CACHE_NAME      = 'inventory-pwa-v1';
const STATIC_ASSETS   = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Chart.js CDN 캐싱
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

// ── 설치: 정적 자산 사전 캐싱
self.addEventListener('install', event => {
  console.log('[SW] 설치 중...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 정적 자산 캐싱');
        return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { mode: 'no-cors' })));
      })
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] 캐싱 일부 실패 (무시):', err))
  );
});

// ── 활성화: 구 버전 캐시 삭제
self.addEventListener('activate', event => {
  console.log('[SW] 활성화');
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] 구 캐시 삭제:', name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── 요청 처리
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API 요청 → 항상 네트워크 (최신 데이터 보장)
  if (url.pathname.startsWith('/api/') || url.hostname.includes('render.com') || url.hostname.includes('railway.app')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ detail: '네트워크 오류. 인터넷 연결을 확인하세요.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // 정적 자산 → Cache First (캐시 없으면 네트워크)
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          // 성공한 응답만 캐시에 저장
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
      .catch(() =>
        // 오프라인 폴백: index.html 반환
        caches.match('/index.html')
      )
  );
});

// ── 백그라운드 동기화 (선택적)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-inventory') {
    console.log('[SW] 백그라운드 동기화');
  }
});

// ── 푸시 알림 (선택적)
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || '장기재고 알림', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  });
});
