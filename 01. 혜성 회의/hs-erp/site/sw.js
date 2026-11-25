/* 홈 화면 어플용 (2026-11-19)
 *  · 늘 인터넷에서 새로 받고(network-first), 안 될 때만 지난번에 받아 둔 화면을 보여 줍니다.
 *    → 고친 내용이 바로 반영되고, 지하철처럼 끊기는 곳에서도 화면은 뜹니다.
 *  · 회사 자료(Supabase 응답)는 저장하지 않습니다. 화면 파일만 저장합니다.
 */
const V = 'hs-v1';
const SHELL = ['./', './index.html', './css/app.css', './manifest.webmanifest', './icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).catch(() => null).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return; // 회사 자료(Supabase)는 건드리지 않음
  e.respondWith(
    fetch(r).then((res) => {
      if (res && res.ok && (u.pathname.endsWith('/') || /\.(html|css|js|png|webmanifest)$/.test(u.pathname))) {
        const copy = res.clone(); caches.open(V).then((c) => c.put(r, copy)).catch(() => null);
      }
      return res;
    }).catch(() => caches.match(r).then((hit) => hit || caches.match('./index.html')))
  );
});
