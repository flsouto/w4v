import { defineConfig } from 'vite';
import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

let outputDirectory;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Copy only this release's runtime files, under a version-specific namespace.
  // This leaves legacy /w4v_pkg and /assets dependencies intact on the host.
  build: { copyPublicDir: false },
  plugins: [{
    name: 'versioned-engine',
    apply: 'build',
    configResolved(config) { outputDirectory = resolve(config.root, config.build.outDir); },
    closeBundle() {
      const output = outputDirectory;
      mkdirSync(resolve(output, 'engine'), { recursive: true });
      cpSync(new URL('./public/w4v_pkg', import.meta.url), resolve(output, 'engine', `v${version}`), { recursive: true });
      cpSync(new URL('./public/looplicator.png', import.meta.url), resolve(output, 'looplicator.png'));
    },
  }],
});
