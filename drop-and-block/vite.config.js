import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Every Cloudflare deployment has a unique identifier; the open page detects
// a new /version.json and prompts the player to refresh (same as Pin & Spin).
const version = `drop-and-block-${Date.now()}`;
const versionFile = () => ({
  name: 'drop-and-block-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json',
      source: JSON.stringify({ version }) + '\n' });
  },
});
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: 'dist' },
});
