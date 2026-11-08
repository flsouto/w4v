// Isolated store fixtures: never download a real pack or use the user's library.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { preview } from 'vite';
import { parseStoreCatalog } from '../web/src/services/looplicator-store.js';
import JSZip from 'jszip';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = await mkdtemp(join(tmpdir(), 'looplicator-store-'));
let server, browser;
try {
  const mp3Path = join(fixtureRoot, 'track.mp3'), wavPath = join(fixtureRoot, 'computer.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:a', 'libmp3lame', '-y', mp3Path]);
  execFileSync('ffmpeg', ['-v', 'error', '-i', mp3Path, '-y', wavPath]);
  const mp3 = await readFile(mp3Path);
  server = await preview({ root: join(root, 'web'), configFile: join(root, 'web/vite.config.js'), logLevel: 'error', preview: { host: '127.0.0.1', port: 29000 + Math.floor(Math.random() * 1000), strictPort: false } });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(), page = await context.newPage();
  const localOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const compiledManifest = JSON.parse(await readFile(join(root,'web/.generated/store/manifest.json'),'utf8'));
  const compiledResponse = await context.request.get(`${localOrigin}/store/${compiledManifest.catalogFile}`);
  assert.equal(compiledResponse.status(),200);
  const compiledIndex = await compiledResponse.json();
  assert.equal(compiledIndex.length,compiledManifest.packs);
  assert.ok(compiledIndex.every(pack=>!('tracks' in pack)),'The index must not carry every pack’s track list');
  const compiledPack = compiledIndex.find(pack=>pack.trackCount>0);
  const compiledTracksResponse = await context.request.get(`${localOrigin}/store/${compiledPack.tracksPath}`);
  assert.equal(compiledTracksResponse.status(),200);
  assert.equal((await compiledTracksResponse.json()).length,compiledPack.trackCount);
  const base = 'https://looplipacker.s3.amazonaws.com';
  const catalog = {
    '2026-01-01': { title: 'Older pack', price: 0, cover_url: `${base}/broken.jpg`, tracks: [{ title: 'Old loop', url: `${base}/old.mp3` }] },
    '2026-01-30': { title: 'Fixture pack', price: 12, thumbs: { 280: `${base}/thumb.png` }, cover_url: `${base}/cover.jpg`, tracks: [{ title: 'First loop', url: `${base}/first.mp3` }, { title: 'Second loop', url: `${base}/second.mp3` }, { title: 'Missing loop', url: `${base}/missing.mp3` }] },
    '2023-01-01': { title: 'Empty pack', tracks: [] },
    '2026-01-29': { title: 'Cancel pack', price: 0, tracks: [{ title: 'Slow loop', url: `${base}/slow.mp3` }, { title: 'Never requested', url: `${base}/never.mp3` }] },
  };
  let catalogCalls = 0, failMissing = true, releaseSlow;
  const trackRequests = [];
  const compiledPacks = parseStoreCatalog(catalog);
  await page.route('**/store/catalog*.json', route => {
    catalogCalls++;
    return route.fulfill(catalogCalls === 1 ? {status:503,body:'Unavailable'} : {status:200,json:compiledPacks.map(({tracks,...pack})=>({...pack,trackCount:tracks.length,tracksPath:`packs/${pack.id}.json`}))});
  });
  await page.route('**/store/packs/*.json', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1).replace('.json','');
    return route.fulfill({status:200,json:compiledPacks.find(pack=>pack.id===id).tracks});
  });
  await page.route(`${base}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/looplishop.json') {
      throw new Error('The browser must never fetch the upstream store feed');
    }
    if (path === '/thumb.png') return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/FsAAAAASUVORK5CYII=', 'base64') });
    if (path.endsWith('.jpg')) return route.fulfill({ status: 404, body: 'Missing image' });
    trackRequests.push(path);
    if (path === '/slow.mp3') await new Promise(resolve => { releaseSlow = resolve; });
    if (path === '/missing.mp3' && failMissing) return route.fulfill({ status: 404, body: 'Missing' });
    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: mp3 }).catch(() => {});
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.getByRole('button', { name: 'Add files', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Add files"]').disabled);
  await page.getByRole('button', { name: 'Add files', exact: true }).click();
  await page.getByRole('dialog', { name: 'Add samples', exact: true }).waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load from my computer', exact: true }).click();
  await (await chooser).setFiles(wavPath);
  await page.waitForFunction(() => document.querySelectorAll('article').length === 1 && !document.querySelector('progress[aria-label="Loop upload progress"]'));
  await page.getByRole('button', { name: 'Add files', exact: true }).click();
  await page.getByRole('button', { name: 'Load from Looplicator store', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'HTTP 503' }).waitFor();
  await page.getByRole('button', { name: 'Retry catalog', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Looplicator store', exact: true });
  await dialog.getByRole('radio', { name: /Fixture pack/ }).waitFor();
  assert.equal(trackRequests.length, 0, 'Browsing packs must not download MP3s');
  assert.match(await dialog.locator('.store-pack').first().innerText(), /Fixture pack/);
  assert.equal(await dialog.getByRole('radio', { name: /Empty pack/ }).isDisabled(), true);
  await dialog.locator('.store-pack img').first().waitFor();
  await page.waitForFunction(() => document.querySelector('.store-pack img')?.naturalWidth > 0);
  assert.equal(await dialog.locator('.store-pack img').first().getAttribute('loading'), 'lazy');
  assert.ok((await dialog.locator('.store-pack img').first().getAttribute('src')).endsWith('/thumb.png'));
  await dialog.locator('.store-pack').filter({ hasText: 'Older pack' }).locator('.placeholder').waitFor();
  await dialog.getByRole('radio', { name: /Fixture pack/ }).check();
  await page.evaluate(() => {
    window.storeSnapshots = [];
    const observer = new MutationObserver(() => window.storeSnapshots.push({ count: document.querySelectorAll('article').length, loading: Boolean(document.querySelector('progress[aria-label="Store pack progress"]')) }));
    observer.observe(document.body, { childList: true, subtree: true }); window.storeObserver = observer;
  });
  await dialog.getByRole('button', { name: 'Load selected pack', exact: true }).click();
  const importPanel = page.getByRole('region', { name: 'Pack import', exact: true });
  await importPanel.getByText('Pack processed. 2 added · 1 failed.', { exact: true }).waitFor();
  assert.equal(await page.locator('dialog:modal').count(), 0, 'Imports must release the modal and leave the UI usable');
  assert.equal(await page.locator('article').count(), 3);
  assert.ok(await page.evaluate(() => window.storeSnapshots.some(snapshot => snapshot.count === 2 && snapshot.loading)), 'WAVs must appear incrementally');
  assert.deepEqual(trackRequests, ['/first.mp3', '/second.mp3', '/missing.mp3']);
  const records = await page.evaluate(async () => {
    window.storeObserver.disconnect();
    const db = await new Promise(resolve => { const request = indexedDB.open('audioSamplerDB', 1); request.onsuccess = () => resolve(request.result); });
    const records = await new Promise(resolve => { const request = db.transaction('audioFiles').objectStore('audioFiles').getAll(); request.onsuccess = () => resolve(request.result); }); db.close();
    return records.filter(record => record.id.startsWith('store:')).map(record => ({ name: record.name, type: record.type, header: String.fromCharCode(...new Uint8Array(record.data).slice(0, 4)), sampleRate: new DataView(record.data).getUint32(24, true), channels: new DataView(record.data).getUint16(22, true) }));
  });
  assert.equal(records.length, 2);
  for (const record of records) { assert.ok(record.name.endsWith('.wav')); assert.equal(record.type, 'audio/wav'); assert.equal(record.header, 'RIFF'); assert.equal(record.sampleRate, 44100); assert.equal(record.channels, 2); }
  const zipDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download filtered samples as ZIP', exact: true }).click();
  const zipPath = join(fixtureRoot, 'mixed.zip');
  await (await zipDownload).saveAs(zipPath);
  const archive = await JSZip.loadAsync(await readFile(zipPath));
  assert.deepEqual(Object.keys(archive.files), ['1-computer.wav'], 'Mixed ZIPs must exclude paid store samples');
  await importPanel.getByRole('button', { name: 'Show details', exact: true }).click();
  await dialog.getByText('Failed tracks', { exact: true }).click();
  await dialog.getByText('Missing loop: Download failed (HTTP 404)', { exact: true }).waitFor();
  failMissing = false;
  await dialog.getByRole('button', { name: 'Load selected pack', exact: true }).click();
  await importPanel.getByText('Pack processed. 1 added · 2 already in library.', { exact: true }).waitFor();
  assert.equal(await page.locator('article').count(), 4);
  assert.deepEqual(trackRequests, ['/first.mp3', '/second.mp3', '/missing.mp3', '/missing.mp3']);
  await page.getByRole('button', { name: 'Delete computer.wav', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('article').length === 3);
  assert.equal(await page.getByRole('button', { name: 'Download filtered samples as ZIP', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Uploaded samples', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Download filtered samples as ZIP', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'All samples', exact: true }).click();
  await importPanel.getByRole('button', { name: 'Show details', exact: true }).click();
  await dialog.getByRole('radio', { name: /Cancel pack/ }).check();
  await dialog.getByRole('button', { name: 'Load selected pack', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('progress[aria-label="Store pack progress"]'));
  assert.equal(await page.locator('dialog:modal').count(), 0);
  await page.getByLabel('Mixer', {exact:true}).selectOption('samplicat');
  await page.locator('.tempo input[type=range]').fill('140');
  await page.locator('article').first().getByRole('button', {name:'Favorite', exact:true}).click();
  await page.getByRole('button', {name:'Generate loop', exact:true}).click();
  await page.locator('.waveform-player audio').waitFor({state:'attached'});
  assert.ok(!trackRequests.includes('/never.mp3'));
  await importPanel.getByRole('button', { name: 'Stop loading', exact: true }).click();
  releaseSlow?.();
  await importPanel.getByText('Loading stopped. 0 added.', { exact: true }).waitFor();
  await importPanel.getByRole('button', { name: 'Show details', exact: true }).click();
  assert.ok(!trackRequests.includes('/never.mp3'));
  await page.evaluate(() => { window.originalRandom = Math.random; Math.random = () => 0.999999; });
  await dialog.getByRole('button', { name: 'Load random pack', exact: true }).click();
  await page.evaluate(() => { Math.random = window.originalRandom; });
  await importPanel.getByText('Pack processed. 1 added.', { exact: true }).waitFor();
  await importPanel.getByRole('button', { name: 'Show details', exact: true }).click();
  assert.equal(await dialog.getByRole('radio', { name: /Older pack/ }).isChecked(), true);
  assert.equal(trackRequests.at(-1), '/old.mp3');
  assert.equal(await page.locator('article').count(), 4);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await page.getByRole('button',{name:'Add files',exact:true}).click();
  await page.getByRole('button',{name:'Load from Looplicator store',exact:true}).click();
  await dialog.getByRole('radio',{name:/Fixture pack/}).waitFor();
  assert.equal(catalogCalls,2,'Reopening the store must reuse the compiled catalog already fetched');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('article').length === 4);
  const freeZipDownload = page.waitForEvent('download');
  await page.getByRole('button', {name:'Download filtered samples as ZIP', exact:true}).click();
  const freeZipPath = join(fixtureRoot, 'free.zip');
  await (await freeZipDownload).saveAs(freeZipPath);
  const freeArchive = await JSZip.loadAsync(await readFile(freeZipPath));
  assert.deepEqual(Object.keys(freeArchive.files), ['1-2026-01-01 - Old loop.wav']);
  await page.getByRole('button', {name:'Delete 2026-01-01 - Old loop.wav', exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll('article').length === 3);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('article').length === 3);
  assert.equal(await page.getByRole('button', {name:'Download filtered samples as ZIP', exact:true}).count(), 0, 'Paid restrictions must persist after reload and favorite edits');
  console.log('Store regression passed: computer picker, catalog retry, dated packs, sequential MP3-to-WAV imports, incremental library updates, persisted PCM WAVs, partial failures, duplicate skipping, cancellation, thumbnails with fallbacks, random pack loading, background UI operation, and paid/free ZIP export rules.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => { server.httpServer.closeAllConnections?.(); server.httpServer.close(resolve); });
  await rm(fixtureRoot, { recursive: true, force: true });
}
