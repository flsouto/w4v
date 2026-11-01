// Isolated browser regression check: never reads or changes the user's browser library.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname,resolve,join } from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let server,browser;
try {
  server=await preview({root:join(root,'web'),configFile:join(root,'web/vite.config.js'),logLevel:'error',preview:{host:'127.0.0.1',port:28000+Math.floor(Math.random()*1000),strictPort:false}});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext(),page=await context.newPage();
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.waitForFunction(()=>Array.from(document.querySelector('select[aria-label="Mixer"]')?.options || []).some(option=>option.value==='glitch'));
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('audioSamplerDB',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const frames=44100,raw=new ArrayBuffer(44+frames*4),view=new DataView(raw);
    const put=(offset,text)=>[...text].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
    put(0,'RIFF');view.setUint32(4,raw.byteLength-8,true);put(8,'WAVE');put(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,44100,true);view.setUint32(28,176400,true);view.setUint16(32,4,true);view.setUint16(34,16,true);put(36,'data');view.setUint32(40,frames*4,true);
    for(let i=0;i<frames;i++){view.setInt16(44+i*4,Math.sin(i*.03)*10000,true);view.setInt16(46+i*4,Math.sin(i*.05)*10000,true);}
    const tx=db.transaction('audioFiles','readwrite');
    for(let i=0;i<80;i++)tx.objectStore('audioFiles').put({id:`fixture-${i}`,name:`fixture-${i}.wav`,type:'audio/wav',size:raw.byteLength,data:raw,lastModified:Date.now(),favorite:false,isGenerated:false});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  });
  await page.reload();
  await page.waitForFunction(()=>document.querySelectorAll('article').length===80 && [...document.querySelectorAll('article audio')].every(a=>a.src.startsWith('blob:')));
  await page.evaluate(()=>{
    window.fullReads=0;const getAll=IDBObjectStore.prototype.getAll;IDBObjectStore.prototype.getAll=function(...args){window.fullReads++;return getAll.apply(this,args);};
    window.initialPlayers=new Map([...document.querySelectorAll('article')].map(row=>[row.querySelector('.filename').textContent,{audio:row.querySelector('audio'),src:row.querySelector('audio').src}]));
    const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){this.muted=true;return play.call(this);};
  });
  await page.getByLabel('Mixer',{exact:true}).selectOption('samplicat');
  await page.getByRole('button',{name:'Generate loop',exact:true}).click();
  await page.locator('.waveform-player audio').waitFor({state:'attached'});
  await page.locator('.tempo input[type=range]').fill('160');
  await page.getByRole('button',{name:'Save to library',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('article').length===81);
  await page.getByText('Loop saved to library',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Delete fixture-0.wav',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('article').length===80);
  const favorite=page.locator('article').filter({has:page.locator('[title="fixture-1.wav"]')});
  await favorite.getByRole('button',{name:'Favorite',exact:true}).click();
  await favorite.getByRole('button',{name:'Remove favorite',exact:true}).waitFor();
  const result=await page.evaluate(()=>({fullReads:window.fullReads,preservedPlayers:[...document.querySelectorAll('article')].every(row=>{const previous=window.initialPlayers.get(row.querySelector('.filename').textContent);return !previous||(previous.audio===row.querySelector('audio')&&previous.src===row.querySelector('audio').src);})}));
  assert.equal(result.fullReads,0,'Mutations must not reload every WAV');
  assert.equal(result.preservedPlayers,true,'Unrelated and metadata-only edits must retain audio players');
  assert.ok(requests.some(url=>url.includes('wav-worker')),'Tempo-adjusted save must use the WAV worker');
  await page.evaluate(()=>{window.bulkWrites=0;const transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(names,mode,...rest){if(mode==='readwrite')window.bulkWrites++;return transaction.call(this,names,mode,...rest);};});
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Delete filtered samples',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('article').length===0);
  const bulk=await page.evaluate(()=>({writes:window.bulkWrites,reads:window.fullReads}));
  assert.equal(bulk.writes,1,'Bulk deletion should use one transaction');assert.equal(bulk.reads,0);
  await page.evaluate(async()=>{
    window.uploadSnapshots=[];
    const observer=new MutationObserver(()=>{
      const progress=document.querySelector('progress[aria-label="Loop upload progress"]');
      if(progress)window.uploadSnapshots.push({count:document.querySelectorAll('article').length,completed:progress.value,total:progress.max});
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['value']});window.uploadObserver=observer;
    const bytes=await (await fetch(document.querySelector('.waveform-player audio').src)).arrayBuffer();
    const files=new DataTransfer();for(let i=0;i<3;i++)files.items.add(new File([bytes],`uploaded-${i}.wav`,{type:'audio/wav'}));
    const input=document.querySelector('input[type=file]');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>document.querySelectorAll('article').length===3&&!document.querySelector('progress[aria-label="Loop upload progress"]'));
  const progress=await page.evaluate(()=>{window.uploadObserver.disconnect();return window.uploadSnapshots;});
  assert.ok(progress.some(step=>step.count===1&&step.total===3),'First upload should paint before the batch ends');
  assert.ok(progress.some(step=>step.count===2&&step.total===3),'Second upload should paint before the batch ends');
  await page.getByRole('button',{name:'Generated samples',exact:true}).click();
  assert.match(await page.locator('[data-capture="library-count"]').innerText(),/^0 \/ 3 loops/);
  await page.getByRole('button',{name:'Uploaded samples',exact:true}).click();
  assert.match(await page.locator('[data-capture="library-count"]').innerText(),/^3 \/ 3 loops/);
  await page.locator('article').first().getByRole('button',{name:'Favorite',exact:true}).click();
  await page.getByText('Added to favorites',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Favorite samples',exact:true}).click();
  assert.match(await page.locator('[data-capture="library-count"]').innerText(),/^1 \/ 3 loops/);
  console.log('Library regression passed: 80 WAVs, worker export, zero full reads, stable previews, one bulk-delete transaction, incremental upload loader, filtered counts, and save/favorite feedback.');
} finally {await browser?.close();if(server) await new Promise(resolve=>{server.httpServer.closeAllConnections?.();server.httpServer.close(resolve);});}
