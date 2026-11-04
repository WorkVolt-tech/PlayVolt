import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Independent Cloudflare Pages build: root directory pin-and-spin, output dist.
export default defineConfig({
  plugins: [react()],
  server: { allowedHosts: ['terminal.local'] },
  build: { outDir: 'dist' },
});
