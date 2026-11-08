// Simulated browser-storage failures in an isolated context. Never reset a real library.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
let server, browser;
try {
  server = await createServer({root:resolve('web'),configFile:resolve('web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:32500+Math.floor(Math.random()*500),strictPort:false}});
  await server.listen(); browser = await chromium.launch({headless:true});
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const ready = () => page.waitForFunction(()=>[...document.querySelector('select[aria-label="Mixer"]').options].some(option=>option.value==='glitch'));
  const frames=44100*4,bytes=Buffer.alloc(44+frames*2);
  bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(44100,24);bytes.writeUInt32LE(88200,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)bytes.writeInt16LE(Math.round(Math.sin(i*.05)*10000),44+i*2);
  const fixtures = prefix => Array.from({length:3},(_,index)=>({name:`${prefix}-${index}.wav`,mimeType:'audio/wav',buffer:bytes}));
  await page.goto(origin);await ready();
  await page.getByLabel('Add audio files',{exact:true}).setInputFiles(fixtures('saved'));
  await page.waitForFunction(()=>document.querySelectorAll('article').length===3&&!document.querySelector('progress[aria-label="Loop upload progress"]'));
  await page.addInitScript(()=>{
    const original=indexedDB.open.bind(indexedDB);window.originalLibraryOpen=original;
    window.failLibraryOpen=sessionStorage.getItem('libraryFailureMode')!=='read';
    window.failLibraryReads=sessionStorage.getItem('libraryFailureMode')==='read';
    const readAll=IDBObjectStore.prototype.openCursor;
    IDBObjectStore.prototype.openCursor=function(...args){
      if(!window.failLibraryReads)return readAll.apply(this,args);
      const request={};queueMicrotask(()=>{request.error=new DOMException('Fixture read failure','UnknownError');request.onerror?.();});return request;
    };
    indexedDB.open=(...args)=>{
      if(!window.failLibraryOpen)return original(...args);
      const request={};
      queueMicrotask(()=>{request.error=new DOMException('The operation failed for reasons unrelated to the database itself and not covered by any other error code.','UnknownError');request.onerror?.();});
      return request;
    };
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){this.muted=true;return play.call(this);};
  });
  await page.reload();await ready();
  await page.getByText('Your saved library could not be opened. Existing samples have not been changed.',{exact:true}).waitFor();
  assert.equal(await page.locator('progress[aria-label="Library loading"]').count(),0);
  assert.equal(await page.getByLabel('Mixer',{exact:true}).inputValue(),'mosaic');
  assert.equal(await page.getByRole('button',{name:'Add files',exact:true}).isDisabled(),true);
  await page.evaluate(()=>{window.failLibraryOpen=false;});
  await page.getByRole('button',{name:'Retry library',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('article').length===3);
  assert.equal(await page.getByRole('button',{name:'Retry library',exact:true}).count(),0);
  await page.reload();await ready();
  await page.getByRole('button',{name:'Use temporary library',exact:true}).click();
  await page.getByText('Temporary library — files will be lost when this page is reloaded.',{exact:true}).waitFor();
  await page.getByLabel('Add audio files',{exact:true}).setInputFiles(fixtures('session'));
  await page.waitForFunction(()=>document.querySelectorAll('article').length===3&&!document.querySelector('progress[aria-label="Loop upload progress"]'));
  await page.getByLabel('Mixer',{exact:true}).selectOption('samplicat');
  await page.getByRole('button',{name:'Generate loop',exact:true}).click();
  await page.locator('.waveform-player audio').waitFor({state:'attached'});
  await page.getByRole('button',{name:'Save to library',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('article').length===4);
  await page.locator('article').first().getByRole('button',{name:'Favorite',exact:true}).click();
  await page.locator('article').first().getByRole('button',{name:'Remove favorite',exact:true}).waitFor();
  await page.getByRole('button',{name:'Delete session-0.wav',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('article').length===3);
  const stored = await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const request=window.originalLibraryOpen('audioSamplerDB',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const names=await new Promise((resolve,reject)=>{const request=db.transaction('audioFiles').objectStore('audioFiles').getAll();request.onsuccess=()=>resolve(request.result.map(file=>file.name).sort());request.onerror=()=>reject(request.error);});db.close();return names;
  });
  assert.deepEqual(stored,['saved-0.wav','saved-1.wav','saved-2.wav'],'Temporary mode must never replace or erase saved samples');
  await page.reload();await ready();await page.evaluate(()=>{window.failLibraryOpen=false;});
  await page.getByRole('button',{name:'Retry library',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('article').length===3);
  assert.deepEqual((await page.locator('[data-capture="library-name"]').allTextContents()).sort(),stored);
  await page.evaluate(()=>sessionStorage.setItem('libraryFailureMode','read'));
  await page.reload();await ready();
  await page.getByRole('button',{name:'Retry library',exact:true}).waitFor();
  await page.evaluate(()=>{window.failLibraryReads=false;});
  await page.getByRole('button',{name:'Retry library',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('article').length===3);
  assert.deepEqual(errors,[],'Database failures must be handled without unhandled promise errors');
  console.log('Storage recovery passed: mixers survive open/read failures, retry restores saved files, temporary import/generation/save/favorite/delete works, and persistent samples remain untouched.');
} finally {await browser?.close();await server?.close();}
