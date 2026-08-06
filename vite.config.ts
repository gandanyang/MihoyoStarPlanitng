import { defineConfig, type Plugin } from 'vite';
import { existsSync } from 'node:fs';
import { join, normalize } from 'node:path';

/**
 * 缺失媒体资源返回 404（不落 SPA fallback 的 index.html）。
 *
 * 背景：Vite 默认把未命中路径 fallback 成 index.html（Content-Type: text/html）。
 * 若浏览器（任何原因）请求一个不存在的 .wav/.mp3 等媒体 URL，会收到 text/html →
 * Chrome 媒体元素加载失败，部分环境下会弹出"下载"该文件（如 station_04.wav 误报下载）。
 * 这里对 public 下不存在的媒体资源直接 404，媒体元素静默失败，杜绝下载弹窗。
 */
function media404Plugin(): Plugin {
  const MEDIA_RE = /\.(wav|mp3|ogg|m4a|aac|flac|webm|mp4)(\/|$)/i;
  return {
    name: 'missing-media-404',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!MEDIA_RE.test(url)) { next(); return; }
        // public 目录下真实文件 → 放行交给 Vite；不存在 → 404
        const p = normalize(join(process.cwd(), 'public', decodeURIComponent(url).replace(/^\/+/, '')));
        if (!existsSync(p)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Not Found');
          return;
        }
        next();
      });
    },
  };
}

// Vite 配置：Phase 0 基础配置
export default defineConfig({
  base: './',
  server: {
    open: true,
    port: 5173,
    host: true, // 允许局域网访问（手机端测试：http://<电脑IP>:5173）
  },
  plugins: [media404Plugin()],
});
