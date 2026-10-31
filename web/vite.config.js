import { defineConfig } from 'vite';
import { buildNews } from '../scripts/build-news.mjs';
import { cpSync, mkdirSync, readFileSync, readFile } from 'node:fs';
import { resolve } from 'node:path';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

let outputDirectory;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Copy only this release's runtime files, under a version-specific namespace.
  // This leaves legacy /w4v_pkg and /assets dependencies intact on the host.
  build: { copyPublicDir: false },
  plugins: [{
    name:'static-wasm-in-development',
    apply:'serve',
    configureServer(server) {
      server.middlewares.use((request,response,next)=>{
        const path=request.url?.split('?')[0];
        if(!['/w4v_pkg/w4v.js','/w4v_pkg/w4v_bg.wasm'].includes(path))return next();
        readFile(new URL(`./public${path}`,import.meta.url),(error,bytes)=>{
          if(error)return next(error);
          response.setHeader('Content-Type',path.endsWith('.wasm')?'application/wasm':'text/javascript');
          response.end(bytes);
        });
      });
    },
  }, {
    name:'exclude-private-capture-api',
    apply:'build',
    generateBundle(_options,bundle) {
      for(const item of Object.values(bundle)) {
        if(item.type==='chunk' && /__looplicatorCapture|__looplicatorRender|render-bridge/.test(item.code)) throw new Error('Production build contains private capture code');
      }
    },
  }, {
    name: 'versioned-engine',
    apply: 'build',
    configResolved(config) { outputDirectory = resolve(config.root, config.build.outDir); },
    closeBundle() {
      const output = outputDirectory;
      buildNews(output);
      mkdirSync(resolve(output, 'engine'), { recursive: true });
      cpSync(new URL('./public/w4v_pkg', import.meta.url), resolve(output, 'engine', `v${version}`), { recursive: true });
      cpSync(new URL('./public/looplicator.png', import.meta.url), resolve(output, 'looplicator.png'));
    },
  }],
});
