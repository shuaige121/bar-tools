#!/bin/bash
# 构建：把四个测过的引擎原样内联进 index.html。
# 关键：浏览器里跑的字节 == node 里测过的字节，不存在"验了 A 发了 B"。
set -euo pipefail
cd "$(dirname "$0")"

echo "① 闸门（任一不过就不构建）"
for t in dice 24 holdem blackjack; do
  node "test/verify-$t.js" > "/tmp/dl-v-$t.log" 2>&1 || { tail -20 "/tmp/dl-v-$t.log"; echo "❌ verify-$t 未通过"; exit 1; }
  printf "   verify-%-10s %s\n" "$t" "$(grep -E '^  通过' "/tmp/dl-v-$t.log")"
done
for f in fault-inject fault-24 fault-holdem fault-blackjack; do
  node "test/$f.js" > "/tmp/dl-$f.log" 2>&1 || { tail -20 "/tmp/dl-$f.log"; echo "❌ $f 有漏网"; exit 1; }
  printf "   %-18s %s\n" "$f" "$(grep '故障注入' "/tmp/dl-$f.log")"
done

echo "② 内联四个引擎 + app"
python3 - <<'PY'
import io, hashlib
parts = {
  '/*__ENGINE_DICE__*/':   'src/engine-dice.js',
  '/*__ENGINE_24__*/':     'src/engine-24.js',
  '/*__ENGINE_HOLDEM__*/': 'src/engine-holdem.js',
  '/*__ENGINE_BJ__*/':     'src/engine-blackjack.js',
  '/*__APP__*/':           'src/app.js',
}
out = io.open('src/app-shell.html', encoding='utf-8').read()
for token, path in parts.items():
    src = io.open(path, encoding='utf-8').read()
    assert out.count(token) == 1, f'placeholder {token} not found exactly once'
    out = out.replace(token, src)              # 字面替换，不走正则（避免 \ 被当反向引用）
for token in parts:
    assert token not in out, f'{token} survived'
# SW 版本号 = 全部源码的内容哈希；内容一变，注册 URL 就变
ver = hashlib.sha256(''.join(io.open(p, encoding='utf-8').read() for p in sorted(parts.values())).encode()).hexdigest()[:10]
assert out.count('__SWVER__') == 1, 'SW version placeholder missing'
out = out.replace('__SWVER__', ver)
print('   sw version =', ver)
for need in ('DiceEngine','Engine24','EngineHoldem','EngineBJ'):
    assert need in out, f'{need} missing from bundle'
io.open('site/index.html','w',encoding='utf-8').write(out)
print('   bundle =', len(out.encode('utf-8')), 'bytes')
PY

echo "③ PWA 附件"
cat > site/manifest.webmanifest <<'M'
{
  "name": "酒桌工具箱",
  "short_name": "酒桌",
  "description": "吹牛骰子 / 德州扑克 / 21点 / 24点，四个算牌小工具，离线可用",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0b0d12",
  "theme_color": "#0b0d12",
  "lang": "zh-CN",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
M

# Service Worker：HTML 走"网络优先、离线回退缓存"。
# 故意不用 cache-first —— 那会把旧版本永久钉死在用户手机上。
VER=$(shasum -a 256 site/index.html | cut -c1-10)
cat > site/sw.js <<S
const V = 'bar-$VER';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // 放行 Cloudflare 注入的 /cdn-cgi/ 请求：离线时若回退成 index.html，
  // 浏览器会拿 HTML 当 JS 解析而报语法错，白白弄脏控制台。
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/cdn-cgi/')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(V).then(c => c.put(e.request, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match('/index.html')))
  );
});
S

cat > /tmp/dl-icon.svg <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0b0d12"/>
  <rect x="96" y="96" width="320" height="320" rx="64" fill="#f6c453"/>
  <g fill="#171310">
    <circle cx="168" cy="168" r="30"/><circle cx="344" cy="168" r="30"/>
    <circle cx="256" cy="256" r="30"/>
    <circle cx="168" cy="344" r="30"/><circle cx="344" cy="344" r="30"/>
  </g>
</svg>
SVG
for SZ in 180 192 512; do rsvg-convert -w $SZ -h $SZ /tmp/dl-icon.svg -o "site/icon-$SZ.png"; done

cat > site/_headers <<'H'
/sw.js
  Cache-Control: no-cache
  Service-Worker-Allowed: /
/index.html
  Cache-Control: no-cache
H

echo "④ 产物"
ls -la site/ | tail -n +4 | awk '{printf "   %-26s %8s\n", $9, $5}'
