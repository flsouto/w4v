import { defineConfig } from 'vite';
import { buildNews } from '../scripts/build-news.mjs';
import { cpSync, mkdirSync, readFileSync, readFile } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { STORE_OUTPUT } from '../scripts/build-store.mjs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

let outputDirectory;
const storeManifest = JSON.parse(readFileSync(resolve(STORE_OUTPUT, 'manifest.json'), 'utf8'));


export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version), __STORE_CATALOG_PATH__: JSON.stringify(`store/${storeManifest.catalogFile}`) },
  // Copy only this release's runtime files, under a version-specific namespace.
  // This leaves legacy /w4v_pkg and /assets dependencies intact on the host.
  build: { copyPublicDir: false },
  plugins: [{
    name: 'compiled-store-in-development',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0];
        if (!/^\/store\/(?:catalog-[a-f0-9]+\.json|packs\/[a-zA-Z0-9-]+\.json)$/.test(path)) return next();
        readFile(resolve(STORE_OUTPUT, path.slice('/store/'.length)), (error, bytes) => {
          if (error) { response.statusCode = 404; return response.end('Compiled store file not found'); }
          response.setHeader('Content-Type', 'application/json');
          response.end(bytes);
        });
      });
    },
  }, {
    name: 'news-in-development',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url, 'http://localhost');
        const path = url.pathname;
        if (!(path === '/news' || path.startsWith('/news/') || ['/sitemap.xml', '/robots.txt'].includes(path))) return next();
        if (!['GET', 'HEAD'].includes(request.method)) { response.statusCode = 405; response.setHeader('Allow', 'GET, HEAD'); return response.end(); }
        try {
          const files = buildNews(null, { includeDrafts: true });
          const key = path.slice(1);
          response.setHeader('Cache-Control', 'no-store');
          if (!path.endsWith('/') && files.has(`${key}/index.html`)) {
            response.statusCode = 302; response.setHeader('Location', `${path}/${url.search}`); return response.end();
          }
          const file = path.endsWith('/') ? `${key}index.html` : key;
          const content = files.get(file);
          response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.xml') ? 'application/xml; charset=utf-8' : file.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8');
          if (content === undefined) { response.statusCode = 404; return response.end('News page not found'); }
          response.end(request.method === 'HEAD' ? undefined : content);
        } catch (error) { next(error); }
      });
    },
  }, {
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
      for (const path of storeManifest.files) { const target = resolve(output, 'store', path); mkdirSync(dirname(target), { recursive: true }); cpSync(resolve(STORE_OUTPUT, path), target); }
      mkdirSync(resolve(output, 'engine'), { recursive: true });
      cpSync(new URL('./public/w4v_pkg', import.meta.url), resolve(output, 'engine', `v${version}`), { recursive: true });
      cpSync(new URL('./public/looplicator.png', import.meta.url), resolve(output, 'looplicator.png'));
    },
  }],
});
