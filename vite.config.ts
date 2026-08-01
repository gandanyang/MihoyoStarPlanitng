import { defineConfig } from 'vite';

// Vite 配置：Phase 0 基础配置
export default defineConfig({
  base: './',
  server: {
    open: true,
    port: 5173,
    host: true, // 允许局域网访问（手机端测试：http://<电脑IP>:5173）
  },
});
