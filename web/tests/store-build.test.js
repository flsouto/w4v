import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileStoreCatalog } from '../../scripts/build-store.mjs';

test('deployment precompiles compact summaries and content-addressed per-pack tracks', async () => {
  const output = await mkdtemp(join(tmpdir(), 'looplicator-store-build-'));
  try {
    const source = {'2026-01-30':{title:'Fixture',price:10,thumbs:{280:'https://example.test/thumb.jpg'},payment_url:'https://example.test/buy',tracks:[{title:'Loop',url:'https://example.test/one.mp3'}]}};
    const manifest = await compileStoreCatalog(source, output);
    const index = JSON.parse(await readFile(join(output, manifest.catalogFile), 'utf8'));
    assert.equal(manifest.packs, 1); assert.equal(manifest.tracks, 1);
    assert.equal(index[0].price, 10); assert.equal(index[0].trackCount, 1);
    assert.ok(!('tracks' in index[0])); assert.ok(!('payment_url' in index[0]));
    assert.deepEqual(JSON.parse(await readFile(join(output,index[0].tracksPath),'utf8')),source['2026-01-30'].tracks);
    assert.deepEqual(await compileStoreCatalog(source, output), manifest, 'Identical input must produce reusable content hashes');
    await assert.rejects(compileStoreCatalog({}, output), /no valid packs/);
    assert.deepEqual(JSON.parse(await readFile(join(output,'manifest.json'),'utf8')),manifest,'A failed refresh must not replace the usable snapshot');
    source['2026-01-30'].tracks.push({title:'Another',url:'https://example.test/two.mp3'});
    const updated = await compileStoreCatalog(source, output);
    assert.notEqual(updated.catalogFile,manifest.catalogFile); assert.equal(updated.tracks,2);
  } finally { await rm(output,{recursive:true,force:true}); }
});
