import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileFromRecord,withFavorite,upsertFile } from '../src/services/library-files.js';

test('favorite edits retain the same preview source without mutating the previous entry',async()=>{
  const file=fileFromRecord({id:'one',name:'loop.wav',type:'audio/wav',data:new Uint8Array([1,2,3]),lastModified:123,favorite:false,isGenerated:true});
  const favorite=withFavorite(file,true),unstarred=withFavorite(favorite,false);
  assert.equal(file.favorite,false);assert.equal(favorite.favorite,true);assert.equal(unstarred.favorite,false);
  assert.equal(favorite.audioSource,file);assert.equal(unstarred.audioSource,file);
  assert.equal(favorite.lastModified,file.lastModified);
  assert.deepEqual(new Uint8Array(await favorite.arrayBuffer()),new Uint8Array([1,2,3]));
});
test('incremental library updates preserve every unrelated file reference',()=>{
  const one={id:'one'},two={id:'two'},three={id:'three'};
  const added=upsertFile([one,two],three);
  assert.equal(added[0],one);assert.equal(added[1],two);
  const replacement={id:'two',favorite:true};const updated=upsertFile(added,replacement);
  assert.equal(updated.length,3);assert.equal(updated[0],one);assert.equal(updated[1],replacement);assert.equal(updated[2],three);
});
