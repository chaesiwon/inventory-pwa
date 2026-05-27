const CACHE = 'inventory-v2';
const STATIC = ['/', '/index.html', '/css/style.css', '/js/app.js', '/manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC.map(u => new Request(u,{mode:'no-cors'})))).then(()=>self.skipWaiting()).catch(()=>{}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/') || e.request.url.includes('onrender.com') || e.request.url.includes('railway.app')) {
    e.respondWith(fetch(e.request).catch(()=>new Response(JSON.stringify({detail:'오프라인'}),{status:503,headers:{'Content-Type':'application/json'}})));
    return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{
    if(r&&r.status===200&&r.type!=='opaque'){const cl=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cl));}
    return r;
  })).catch(()=>caches.match('/index.html')));
});
