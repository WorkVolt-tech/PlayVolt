import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Every build gets a unique version. It is baked into the app and published as
// /version.json, so open pages can notice a newer deploy and show the update banner.
const buildVersion = `pin-and-spin-${Date.now()}`;

function versionFile() {
  return {
    name: 'pin-and-spin-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: buildVersion }, null, 2) + '\n' });
    },
  };
}

// Independent Cloudflare Pages build: root directory pin-and-spin, output dist.
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(buildVersion) },
  server: { allowedHosts: ['terminal.local'] },
  build: {
    outDir: 'dist',
    // The ball pictures (src/balls) are built into the stylesheet, so every color is there the
    // moment a ball appears. As separate files, the bigger ones were only fetched the first time
    // that color showed up, which made those balls appear a moment late.
    assetsInlineLimit: (file) => (/[\\/]balls[\\/][^\\/]+\.svg$/.test(file) ? true : undefined),
  },
});
