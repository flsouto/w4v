import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectInputs, parseOptions } from '../../scripts/video/inputs.mjs';

test('selects newest unique saved WAVs across farm folders without changing them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'looplicator-inputs-'));
  try {
    const commits = join(root, 'commits'), stash = join(root, 'stash');
    await mkdir(commits); await mkdir(stash);
    for (const [path, bytes, time] of [[join(commits,'old.wav'),'old',100], [join(commits,'new.WAV'),'new',300], [join(stash,'duplicate.wav'),'new',200], [join(stash,'other.wav'),'other',250], [join(stash,'not-audio.txt'),'ignore',400]]) {
      await writeFile(path, bytes); await utimes(path,time,time);
    }
    const selected = await selectInputs([commits,stash],2);
    assert.deepEqual(selected.map(file=>file.name),['new.WAV','other.wav']);
    assert.equal(selected[0].sha256.length,64);
    assert.equal(await readFile(join(commits,'new.WAV'),'utf8'),'new');
    assert.equal(await readFile(join(stash,'duplicate.wav'),'utf8'),'new');
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('validates render timing and even video dimensions', () => {
  assert.deepEqual(parseOptions({}),{last:1,cycles:1,fps:30,width:1920,height:1080,seconds:undefined,portion:0.25,showUrl:false,randomUi:false});
  assert.equal(parseOptions({portion:'1/2'}).portion,0.5);
  assert.equal(parseOptions({portion:'1'}).portion,1);
  assert.equal(parseOptions({'show-url':true}).showUrl,true);
  for(const values of [{fps:'0'},{last:'1.5'},{cycles:'-1'},{size:'1081x1920'},{size:'oops'},{seconds:'NaN'},{portion:'0'},{portion:'2'},{portion:'1/0'}]) assert.throws(()=>parseOptions(values));
});

test('UI fingerprints track content changes independently of file timestamps', async () => {
  const { fingerprintFiles } = await import('../../scripts/video/inputs.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'looplicator-ui-hash-'));
  try {
    await writeFile(join(dir,'app.jsx'),'first');
    const first = await fingerprintFiles(dir);
    await utimes(join(dir,'app.jsx'),100,100);
    assert.equal(await fingerprintFiles(dir),first);
    await writeFile(join(dir,'app.jsx'),'second');
    assert.notEqual(await fingerprintFiles(dir),first);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('compilation refuses incomplete batches rather than silently dropping selected loops', async () => {
  const { concatenateClips } = await import('../../scripts/video/concatenate.mjs');
  await assert.rejects(concatenateClips([], '/tmp/unused-compilation.mp4',30), /every selected clip/);
  await assert.rejects(concatenateClips([{status:'failed'}], '/tmp/unused-compilation.mp4',30), /every selected clip/);
});

test('renderer BPM uses full duration and rounds to a positive whole number', async () => {
  const { estimateBpm } = await import('../../scripts/video/inputs.mjs');
  assert.equal(estimateBpm(16),120);
  assert.equal(estimateBpm(8),240);
  assert.equal(estimateBpm(35.47),54);
  assert.equal(estimateBpm(13),148);
  assert.equal(estimateBpm(10000),1);
  assert.throws(()=>estimateBpm(0));
  assert.equal(parseOptions({'random-ui':true}).randomUi,true);
});
