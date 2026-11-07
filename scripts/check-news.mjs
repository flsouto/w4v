// Exercise the actual development News link in an isolated browser context.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let server, browser;
try {
  server = await createServer({root:join(root,'web'),configFile:join(root,'web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:31000+Math.floor(Math.random()*1000),strictPort:false}});
  await server.listen();
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext(), page = await context.newPage();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(origin);
  await page.getByRole('link',{name:'News',exact:true}).click();
  await page.getByRole('heading',{name:'News & release notes',exact:true}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/news/');
  assert.equal(await page.locator('#root').count(),0,'News must not fall back to the DAW');
  const published = page.locator('.posts').first().getByRole('link',{name:'Read the release note →',exact:true}).first();
  await published.click();
  await page.getByRole('heading',{name:/Looplicator DAW 3(?:\.3)?:/}).waitFor();
  await page.getByRole('link',{name:'← All news',exact:true}).click();
  const draftFiles = readdirSync(join(root,'web/news/drafts')).filter(file=>file.endsWith('.json'));
  for (const file of draftFiles) {
    const draft = JSON.parse(readFileSync(join(root,'web/news/drafts',file),'utf8'));
    await page.getByRole('link',{name:draft.title,exact:true}).click();
    await page.getByRole('heading',{name:draft.title,exact:true}).waitFor();
    assert.match(await page.locator('.eyebrow').innerText(),/DRAFT.*NOT PUBLISHED/);
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex,nofollow');
    await page.getByRole('link',{name:'← All news',exact:true}).click();
  }
  const redirect = await context.request.get(`${origin}/news?example=1`,{maxRedirects:0});
  assert.equal(redirect.status(),302);assert.equal(redirect.headers().location,'/news/?example=1');
  for(const path of ['/news/style.css','/news/feed.xml','/sitemap.xml','/robots.txt']) {
    const response=await context.request.get(origin+path);
    assert.equal(response.status(),200);assert.ok(!(await response.text()).includes('<div id="root">'));
  }
  const missing=await context.request.get(`${origin}/news/missing-post/`);
  assert.equal(missing.status(),404);assert.equal(await missing.text(),'News page not found');
  await page.getByRole('link',{name:'Open the DAW ↗',exact:true}).click();
  await page.getByRole('heading',{name:'Looplicator DAW',exact:true}).waitFor();
  console.log('Local news regression passed: home-to-news navigation, published articles, local draft previews, CSS/feed/discovery routes, slash redirects, real 404s, and return to the DAW.');
} finally {await browser?.close();await server?.close();}
