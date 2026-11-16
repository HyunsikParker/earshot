import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Static multi-page build. `base: './'` keeps asset URLs relative so the same
// build runs from Firebase Hosting, a sub-path, or `python3 -m http.server`.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome139',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        eval: resolve(import.meta.dirname, 'eval/index.html'),
        read: resolve(import.meta.dirname, 'eval/read.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
