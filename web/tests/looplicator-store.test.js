import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchStoreCatalog, importStorePack, parseStoreCatalog, randomStorePack, storeTrackId, STORE_URL } from '../src/services/looplicator-store.js';

const pack = { id: '2026-01-30', title: 'Atmoskribe', price: 10, tracks: [
  { title: 'L001 117BPM', url: 'https://example.test/one.mp3' },
  { title: 'L002 213BPM', url: 'https://example.test/two.mp3' },
] };
const response = () => new Response(new Uint8Array([1, 2, 3]));

test('store catalog uses dated packs, newest first, and valid unique MP3 tracks', () => {
  const catalog = parseStoreCatalog({
    '2023-01-01': { title: 'Empty', tracks: [] },
    '2026-01-30': { title: 'Atmoskribe', tracks: [
      { title: 'L001', url: 'http://looplipacker.s3.amazonaws.com/one.mp3' },
      { title: 'Duplicate', url: 'https://looplipacker.s3.amazonaws.com/one.mp3' },
      { url: 'https://example.test/two.mp3?download=1' },
      { url: 'javascript:alert(1)' }, { url: 'https://example.test/pack.zip' }, null,
    ] }, invalid: {},
  });
  assert.deepEqual(catalog.map(pack => pack.id), ['2026-01-30', '2023-01-01']);
  assert.deepEqual(catalog[0].tracks, [{ title: 'L001', url: 'https://looplipacker.s3.amazonaws.com/one.mp3' }, { title: 'Track 3', url: 'https://example.test/two.mp3?download=1' }]);
  assert.deepEqual(catalog[1].tracks, []);
  for (const invalid of [null, [], 'invalid']) assert.throws(() => parseStoreCatalog(invalid), /invalid pack catalog/);
});
test('catalog fetch uses HTTPS and reports HTTP errors', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(fetchStoreCatalog(signal, async (url, options) => {
    assert.equal(url, STORE_URL); assert.equal(options.signal, signal);
    return new Response('', { status: 503 });
  }), /HTTP 503/);
});
test('pack import converts and saves sequentially, then skips imported tracks on retry', async () => {
  const events = [], existingIds = new Set(), saved = [];
  const options = {
    signal: new AbortController().signal, existingIds,
    fetcher: async url => { events.push(`fetch ${url}`); return response(); },
    convert: async file => { events.push(`convert ${file.type}`); return new Uint8Array([82, 73, 70, 70]); },
    save: async file => { events.push(`save ${file.type}`); saved.push(file); return file; },
    onAdded: file => events.push(`added ${file.id}`),
    yieldControl: async () => { events.push('yield'); },
  };
  const result = await importStorePack(pack, options);
  assert.equal(result.added, 2); assert.deepEqual(result.failures, []);
  assert.deepEqual(events, pack.tracks.flatMap(track => [`fetch ${track.url}`, 'convert audio/mpeg', 'save audio/wav', `added ${storeTrackId(pack, track)}`, 'yield']));
  assert.deepEqual(saved[0].storePack, { id: pack.id, title: pack.title, price: 10 });
  assert.equal(saved[0].name, '2026-01-30 - L001 117BPM.wav');
  assert.deepEqual(new Uint8Array(await saved[0].arrayBuffer()), new Uint8Array([82, 73, 70, 70]));
  const retry = await importStorePack(pack, options);
  assert.equal(retry.skipped, 2); assert.equal(retry.added, 0); assert.equal(saved.length, 2);
});
test('partial failures do not stop later tracks and can be retried', async () => {
  const existingIds = new Set(), options = {
    signal: new AbortController().signal, existingIds, convert: async () => new Uint8Array([1]), save: async file => file,
    fetcher: async url => url.endsWith('one.mp3') ? new Response('', { status: 404 }) : response(), yieldControl: async () => {},
  };
  const first = await importStorePack(pack, options);
  assert.equal(first.added, 1); assert.match(first.failures[0], /L001.*HTTP 404/);
  const retry = await importStorePack(pack, { ...options, fetcher: async () => response() });
  assert.equal(retry.added, 1); assert.equal(retry.skipped, 1); assert.deepEqual(retry.failures, []);
});
test('cancelling during conversion prevents saving and downloading further tracks', async () => {
  const controller = new AbortController(); let fetched = 0, saved = 0;
  const result = await importStorePack(pack, {
    signal: controller.signal, fetcher: async () => { fetched++; return response(); },
    convert: async () => { controller.abort(); return new Uint8Array([1]); },
    save: async () => { saved++; },
  });
  assert.equal(result.cancelled, true); assert.equal(result.added, 0);
  assert.equal(fetched, 1); assert.equal(saved, 0); assert.deepEqual(result.failures, []);
});
test('oversize tracks are rejected before decoding', async () => {
  let converted = false;
  const result = await importStorePack({ ...pack, tracks: pack.tracks.slice(0, 1) }, {
    signal: new AbortController().signal,
    fetcher: async () => new Response('', { headers: { 'content-length': String(41 * 1024 * 1024) } }),
    convert: async () => { converted = true; }, save: async () => {}, yieldControl: async () => {},
  });
  assert.equal(converted, false); assert.equal(result.failures.length, 1); assert.match(result.failures[0], /40 MB/);
});

test('catalog prefers small thumbnails, falls back to covers, and rejects unsafe URLs', () => {
  const catalog = parseStoreCatalog({
    '2026-01-30': { thumbs: { 280: 'http://looplipacker.s3.amazonaws.com/small.jpg', 400: 'https://example.test/large.jpg' }, cover_url: 'https://example.test/cover.jpg' },
    '2026-01-29': { cover_url: 'https://example.test/cover.jpg' },
    '2026-01-28': { thumbs: { 280: 'javascript:alert(1)' }, cover_url: 'https://example.test/fallback.jpg' },
    '2026-01-27': {},
  });
  assert.deepEqual(catalog.map(pack => pack.thumbnail), ['https://looplipacker.s3.amazonaws.com/small.jpg', 'https://example.test/cover.jpg', 'https://example.test/fallback.jpg', null]);
});
test('random packs sample only packs with tracks and handle an empty catalog', () => {
  const older = { ...pack, id: '2026-01-01' }, empty = { id: '2023-01-01', tracks: [] };
  assert.equal(randomStorePack([empty, pack, older], () => 0), pack);
  assert.equal(randomStorePack([empty, pack, older], () => 0.999999), older);
  assert.equal(randomStorePack([empty]), null);
  assert.equal(randomStorePack([]), null);
});

test('catalog prices distinguish explicitly free packs from paid or unknown prices', () => {
  for (const [price, expected] of [[0, 0], [12.5, 12.5], [null, null], [undefined, null], ['0', null], [-1, null]]) {
    assert.equal(parseStoreCatalog({ '2026-01-30': { price } })[0].price, expected);
  }
});
