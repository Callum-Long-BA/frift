import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Never publish source maps: the live site only ships the minified bundle.
  build: { sourcemap: false },
});
