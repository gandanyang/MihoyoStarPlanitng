import { defineConfig } from 'vite';

// Vite 配置：Phase 0 基础配置
export default defineConfig({
  base: './',
  server: {
    open: true,
    port: 5173,
  },
});
