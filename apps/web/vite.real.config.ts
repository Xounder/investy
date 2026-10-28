import { mergeConfig } from 'vite';
import base from './vite.config';

// Test-only same-origin reverse proxy; never used by the production build.
export default mergeConfig(base, {
  server: { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } } },
});
