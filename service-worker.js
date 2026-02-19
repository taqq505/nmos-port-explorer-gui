// NMOS Port Explorer - Service Worker
// バージョンを上げるとキャッシュが更新されます
const CACHE_NAME = 'nmos-explorer-v1';

const FILES_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './nmos-favicon.svg',
  './manifest.json'
];

// インストール時: キャッシュにファイルを保存
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  // 旧バージョンを待たずに即時アクティベート
  self.skipWaiting();
});

// アクティベート時: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// フェッチ時: キャッシュ優先、なければネットワークへ
self.addEventListener('fetch', (event) => {
  // NMOS デバイスへのリクエストはキャッシュしない
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
