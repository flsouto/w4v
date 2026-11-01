// Integration gate for UI/capture changes. All WAVs, history and videos are temporary.
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,readdir,rm,utimes } from 'node:fs/promises';
import { dirname,resolve,join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn,execFileSync } from 'node:child_process';
import { createServer,preview } from 'vite';
import { chromium } from 'playwright';
import { connectCapture } from './video/capture-client.mjs';
import { CAPTURE_TARGETS as targets } from '../web/src/capture-contract.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory=await mkdtemp(join(tmpdir(),'looplicator-compat-'));
let server,production,browser;
function wav(seconds,frequency) {
  const rate=8000,frames=seconds*rate,bytes=Buffer.alloc(44+frames*4);
  bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*4,28);bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*4,40);
  for(let i=0;i<frames;i++){bytes.writeInt16LE(i<rate/2 ? 0 : Math.round(Math.sin(2*Math.PI*frequency*i/rate)*9000),44+i*4);bytes.writeInt16LE(Math.round(Math.sin(2*Math.PI*(frequency+110)*i/rate)*7000),46+i*4);}
  return bytes;
}
try {
  const input=join(directory,'input'),output=join(directory,'videos');await mkdir(input);
  const fixtures=[{id:'first',name:'first.wav',duration:16,bpm:120},{id:'second',name:'second.wav',duration:8,bpm:240}];
  for(const [index,loop] of fixtures.entries()){await writeFile(join(input,loop.name),wav(loop.duration,220+index*110));await utimes(join(input,loop.name),200-index,200-index);}
  server=await createServer({root:join(root,'web'),configFile:join(root,'web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:29000+Math.floor(Math.random()*1000),strictPort:false}});await server.listen();
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'}),page=await context.newPage();
  await page.route('**/__compat/*',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);return fixtures.some(loop=>loop.name===name)?route.fulfill({path:join(input,name),contentType:'audio/wav'}):route.abort();});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?render=1`);
  const capture=await connectCapture(page);assert.equal(capture.apiVersion,1);
  await capture.loadBatch(fixtures.map(loop=>({...loop,url:`/__compat/${loop.name}`})));
  assert.equal(await page.locator(targets.libraryItem).count(),2);
  assert.deepEqual(await page.locator(targets.libraryName).allTextContents(),['first.wav','second.wav']);
  const catalog=await capture.getCatalog();assert.ok(catalog.blenders.includes('dim'));assert.ok(catalog.blenders.includes('glitch'));assert.ok(catalog.effects.includes('reverse'));
  const glitch=await page.evaluate(async()=>{
    const {Engine}=await import('/src/engine.js');const engine=new Engine();
    try {
      const bytes=new Uint8Array(await (await fetch('/__compat/first.wav')).arrayBuffer());
      const start=performance.now();
      const {result}=await engine.run('blend',{wavs:[bytes,bytes,bytes],seed:'42',blender:'glitch',effect:'reverse'});
      const audio=new AudioContext();
      try {const buffer=await audio.decodeAudioData(result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength));return {duration:buffer.duration,channels:buffer.numberOfChannels,elapsed:performance.now()-start,peak:buffer.getChannelData(0).reduce((p,s)=>Math.max(p,Math.abs(s)),0)};}
      finally {await audio.close();}
    } finally {engine.cancel();}
  });
  assert.ok(Math.abs(glitch.duration-16)<.01);assert.equal(glitch.channels,2);assert.ok(glitch.peak>.1);assert.ok(glitch.elapsed<60000);
  console.log(`Glitch WASM worker: ${glitch.elapsed.toFixed(0)} ms, ${glitch.duration}s stereo, reverse FX`);
  for(const loop of fixtures) {
    await capture.setPresentation({showUrl:true,bpm:loop.bpm,mixer:'dim',fx:'reverse'});
    await capture.showLoop({id:loop.id,excerptSeconds:loop.duration/4});await capture.assertFits();
    assert.equal(await page.locator(targets.mixer).inputValue(),'dim');assert.equal(await page.locator(targets.fx).inputValue(),'reverse');
    assert.equal(Number(await page.locator(targets.tempo).inputValue()),loop.bpm);
    assert.equal(await page.locator('[data-capture="address"]').innerText(),'https://daw.looplicator.com');
    const colored=await page.locator(targets.waveform).evaluate(canvas=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=3;i<data.length;i+=4)if(data[i])count++;return count;});assert.ok(colored>1000,'Waveform must be drawn from loaded audio');
    // Fixtures delay only the left channel, like dim. The right-channel onset
    // must still produce a visible waveform, rather than a one-pixel baseline.
    const onset=await page.locator(targets.waveform).evaluate(canvas=>{
      const data=canvas.getContext('2d').getImageData(1,0,1,canvas.height).data;
      let height=0;for(let i=3;i<data.length;i+=4)if(data[i])height++;return height;
    });
    assert.ok(onset>10,'Audible right-channel onset must be visible while the left is silent');
    await capture.renderFrame(1.25);
    assert.ok(Math.abs(Number(await page.locator(targets.timeline).getAttribute('aria-valuenow'))-1.25)<.001);
    assert.match(await page.locator(targets.clock).innerText(),/0:01/);
    const before=await page.locator(targets.playhead).boundingBox();
    const wrapped=await capture.renderFrame(loop.duration/4+.25);
    assert.ok(Math.abs(wrapped.position-.25)<.001);
    assert.ok(Math.abs(Number(await page.locator(targets.timeline).getAttribute('aria-valuenow'))-.25)<.001);
    const after=await page.locator(targets.playhead).boundingBox();assert.ok(after.x<before.x,'Playhead must visually wrap with the excerpt');
  }
  await assert.rejects(capture.showLoop({id:'missing'}),/not in capture batch/);
  await browser.close();browser=undefined;await server.close();server=undefined;
  // Run the real CLI, encoder, history isolation, and final compilation pipeline.
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[join(root,'scripts/render-videos.mjs'),'--input',input,'--last','2','--portion','1/4','--cycles','2','--fps','6','--size','1280x800','--show-url','--random-ui','--output',output,'--history',join(directory,'history.txt'),'--no-history-sync'],{cwd:root,stdio:'inherit'});
    child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(`Renderer smoke exited ${code}`)));
  });
  const manifests=(await readdir(output)).filter(name=>name.startsWith('render-')&&name.endsWith('.json'));
  const manifest=JSON.parse(await readFile(join(output,manifests[0]),'utf8'));
  assert.equal(manifest.captureApiVersion,1);assert.equal(manifest.loops.length,2);assert.equal(manifest.compilation.status,'complete');
  assert.equal(manifest.encodingProfile,'pcm-f32-aac384-v1');assert.deepEqual(manifest.loops.map(loop=>loop.ui.bpm),[120,240]);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,duration,sample_rate,channels','-of','json',join(output,'compilation.mp4')],{encoding:'utf8'}));
  const video=probe.streams.find(stream=>stream.codec_type==='video'),audio=probe.streams.find(stream=>stream.codec_type==='audio');
  assert.equal(audio.codec_name,'aac');assert.equal(audio.sample_rate,'48000');assert.equal(audio.channels,2);
  assert.ok(Math.abs(Number(video.duration)-12)<=1/6);assert.ok(Math.abs(Number(audio.duration)-Number(video.duration))<=1/6);
  assert.deepEqual((await readFile(join(directory,'history.txt'),'utf8')).trim().split('\n'),['first.wav','second.wav']);
  // Ensure compiled assets and live production behavior never expose capture control.
  for(const name of await readdir(join(root,'web/dist/assets')))if(name.endsWith('.js'))assert.doesNotMatch(await readFile(join(root,'web/dist/assets',name),'utf8'),/__looplicatorCapture|__looplicatorRender|render-bridge/);
  production=await preview({root:join(root,'web'),configFile:join(root,'web/vite.config.js'),logLevel:'error',preview:{host:'127.0.0.1',port:30000+Math.floor(Math.random()*1000),strictPort:false}});
  browser=await chromium.launch({headless:true});const live=await browser.newPage();await live.goto(`http://127.0.0.1:${production.httpServer.address().port}/?render=1`);
  await live.waitForFunction(expected=>document.querySelector('[data-capture="mixer"]')?.options.length===expected,catalog.blenders.length);
  assert.deepEqual(await live.locator(`${targets.mixer} option`).allTextContents(),catalog.blenders);
  assert.equal(await live.evaluate(()=>typeof window.__looplicatorCapture),'undefined');
  console.log('Renderer compatibility passed: v1 API, two loops, UI targets, waveform, rounded BPM, selections, playhead/excerpt wrap, real compilation A/V timing, and production isolation.');
} finally {
  await browser?.close();await server?.close();
  if(production)await new Promise(resolve=>{production.httpServer.closeAllConnections?.();production.httpServer.close(resolve);});
  await rm(directory,{recursive:true,force:true});
}
