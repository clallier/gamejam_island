import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    fs: {
      allow: ['..'],
    },
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
  },
  build: {
    target: 'esnext',
    assetsInclude: ['**/*.wasm'],
  },
});
