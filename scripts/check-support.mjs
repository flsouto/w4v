// Real loop generations in an isolated browser profile; never touch user preferences.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { SUPPORT_STORAGE_KEY } from '../web/src/services/support-prompt.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let server, browser;
try {
  server = await preview({ root: join(root, 'web'), configFile: join(root, 'web/vite.config.js'), logLevel: 'error', preview: { host: '127.0.0.1', port: 30000 + Math.floor(Math.random() * 1000), strictPort: false } });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(), page = await context.newPage();
  await page.addInitScript(key => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({supported:false, firstSeenAt:1, lastPromptAt:1}));
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() { this.muted = true; return play.call(this); };
  }, SUPPORT_STORAGE_KEY);
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  const ready = () => page.waitForFunction(() => Array.from(document.querySelector('select[aria-label="Mixer"]')?.options || []).some(option => option.value === 'mosaic'));
  const prompt = page.getByRole('dialog', { name: 'Enjoying Looplicator?', exact: true });
  await page.goto(url); await ready();
  assert.equal(await prompt.count(), 0, 'New visitors should not see a support prompt immediately');
  const frames = 44100 * 4, bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(44100, 24); bytes.writeUInt32LE(88200, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) bytes.writeInt16LE(Math.round(Math.sin(i * .05) * 10000), 44 + i * 2);
  await page.getByLabel('Add audio files', {exact:true}).setInputFiles(Array.from({length:3}, (_, index) => ({name:`support-${index}.wav`, mimeType:'audio/wav', buffer:bytes})));
  await page.waitForFunction(() => document.querySelectorAll('article').length === 3 && !document.querySelector('progress[aria-label="Loop upload progress"]'));
  await page.getByLabel('Mixer', {exact:true}).selectOption('samplicat');
  async function generateLoop() {
    const previous = await page.locator('.waveform-player audio').getAttribute('src').catch(() => null);
    await page.getByRole('button', {name:'Generate loop', exact:true}).click();
    await page.waitForFunction(src => {
      const current = document.querySelector('.waveform-player audio')?.getAttribute('src');
      return current && current !== src && !document.querySelector('button[aria-label="Generating loop"]');
    }, previous);
  }
  async function counter() { return page.evaluate(key => JSON.parse(localStorage.getItem(key)).generatedSincePrompt, SUPPORT_STORAGE_KEY); }
  // Avoid a locator wait before the first output exists.
  const firstGenerate = page.getByRole('button', {name:'Generate loop', exact:true});
  await firstGenerate.click();
  await page.locator('.waveform-player audio').waitFor({state:'attached'});
  for (let count = 2; count <= 9; count++) await generateLoop();
  assert.equal(await counter(), 9); assert.equal(await prompt.count(), 0);
  const beforeFx = await page.locator('.waveform-player audio').getAttribute('src');
  await page.getByLabel('FX', {exact:true}).selectOption('reverse');
  await page.getByRole('button', {name:'Apply selected effect', exact:true}).click();
  await page.waitForFunction(src => document.querySelector('.waveform-player audio')?.getAttribute('src') !== src, beforeFx);
  assert.equal(await counter(), 9, 'FX-only operations must not count as generated loops');
  await page.reload(); await ready();
  assert.equal(await counter(), 9); assert.equal(await prompt.count(), 0, 'Generation count must survive reload');
  await page.getByLabel('Mixer', {exact:true}).selectOption('samplicat');
  await firstGenerate.click();
  await prompt.waitFor();
  assert.equal(await prompt.getByRole('link', { name: 'Packs on looplicator.com', exact: true }).getAttribute('href'), 'https://www.looplicator.com/loops');
  assert.equal(await prompt.getByRole('link', { name: 'Packs on Bandcamp', exact: true }).getAttribute('href'), 'https://looplicator.bandcamp.com/music');
  await prompt.getByRole('button', { name: 'Maybe later', exact: true }).click();
  assert.equal(await counter(), 0);
  for (let count = 1; count <= 9; count++) { await generateLoop(); assert.equal(await prompt.count(), 0); }
  await generateLoop();
  await prompt.waitFor();
  await prompt.getByRole('button', { name: 'I’ve already supported', exact: true }).click();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).supported, SUPPORT_STORAGE_KEY), true);
  await page.reload(); await ready();
  await page.getByLabel('Mixer', {exact:true}).selectOption('samplicat');
  await firstGenerate.click();
  await page.locator('.waveform-player audio').waitFor({state:'attached'});
  for (let count = 2; count <= 10; count++) await generateLoop();
  assert.equal(await prompt.count(), 0, 'Supporters must never get automatic reminders');
  await page.evaluate(() => { location.hash = 'support'; });
  await prompt.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(new URL(page.url()).hash, '');
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).supported, SUPPORT_STORAGE_KEY), true);
  await page.goto(`${url}?example=1#support`); await ready();
  await prompt.waitFor();
  await prompt.getByRole('button', { name: 'Close support prompt', exact: true }).click();
  assert.equal(new URL(page.url()).search, '?example=1'); assert.equal(new URL(page.url()).hash, '');
  await page.getByRole('button', { name: 'Add files', exact: true }).click();
  await page.getByRole('dialog', { name: 'Add samples', exact: true }).waitFor();
  await page.evaluate(() => { location.hash = 'support'; });
  assert.equal(await prompt.count(), 0, 'Support requests must not stack over another modal');
  await page.keyboard.press('Escape');
  await prompt.waitFor();
  assert.equal(await page.locator('dialog:modal').count(), 1);
  await prompt.getByRole('button', { name: 'Maybe later', exact: true }).click();
  console.log('Support prompt regression passed: ten real loop generations, repeated milestone, persisted count, FX exclusion, permanent supporter opt-out, manual hash, links, Escape/close, and modal deferral.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => { server.httpServer.closeAllConnections?.(); server.httpServer.close(resolve); });
}
