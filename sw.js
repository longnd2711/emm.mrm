const CACHE_NAME = 'emm-booking-v1';
const ASSETS = [
  'index.html',
  'js/core.js',
  'js/main.js',
  'js/form.js',
  'js/schedule.js',
  'js/bookings.js',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr',
  'https://cdn.tailwindcss.com'
];

// Cài đặt Service Worker và lưu trữ tài nguyên vào cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Xử lý các yêu cầu mạng: Ưu tiên lấy từ cache nếu có
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request);
    })
  );
});