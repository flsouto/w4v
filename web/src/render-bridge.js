// Development-only adapter. React setters and component structure stay here;
// automation consumes the versioned capture contract instead of app internals.
import { flushSync } from 'react-dom';
import { CAPTURE_API_VERSION, CAPTURE_TARGETS } from './capture-contract.js';

export function createRenderBridge({ setOutput, setFiles, setTime, setBpm, setCatalog, setBlender, setEffect }) {
  let batch = new Map(), duration = 0, excerptDuration = 0, catalogPromise;
  const paint = () => new Promise(resolve => requestAnimationFrame(resolve));
  async function getCatalog() {
    catalogPromise ||= import(/* @vite-ignore */ `${import.meta.env.BASE_URL}w4v_pkg/w4v.js`).then(async wasm => {
      await wasm.default();
      return {blenders:wasm.get_blenders_js().sort(),effects:wasm.get_fx_list_js().sort()};
    });
    const catalog=await catalogPromise;
    flushSync(()=>setCatalog(catalog));
    return catalog;
  }
  return Object.freeze({
    apiVersion:CAPTURE_API_VERSION,
    getCatalog,
    async loadBatch({ loops }) {
      if (!Array.isArray(loops) || loops.some(loop=>!loop || typeof loop.id!=='string' || !loop.id || typeof loop.name!=='string' || !loop.name || typeof loop.url!=='string' || !loop.url) || new Set(loops.map(loop=>loop.id)).size!==loops.length) throw new Error('Capture batch needs unique IDs, names, and audio URLs');
      batch = new Map(loops.map(loop=>[loop.id,{...loop}]));
      duration=0;excerptDuration=0;
      flushSync(()=>{setOutput(null);setTime(0);setFiles(loops.map(loop=>({id:loop.id,name:loop.name,size:loop.size,lastModified:loop.lastModified,isGenerated:true,previewUrl:loop.url,duration:loop.duration})));});
      await paint();
      return {count:batch.size};
    },
    async setPresentation({ showUrl, bpm, mixer, fx } = {}) {
      if (bpm!==undefined && (!Number.isInteger(bpm)||bpm<1)) throw new Error('Capture BPM must be a positive integer');
      if ((mixer!==undefined && mixer!=='') || (fx!==undefined && fx!=='')) {
        const catalog=await getCatalog();
        if (mixer && !catalog.blenders.includes(mixer)) throw new Error(`Unknown capture mixer: ${mixer}`);
        if (fx && !catalog.effects.includes(fx)) throw new Error(`Unknown capture FX: ${fx}`);
      }
      flushSync(()=>{
        if(bpm!==undefined)setBpm(bpm);
        if(mixer!==undefined)setBlender(mixer);
        if(fx!==undefined)setEffect(fx);
      });
      if (showUrl!==undefined) {
        document.querySelector('[data-capture="address"]')?.remove();
        if(showUrl) {
          const address=document.createElement('a');
          address.dataset.capture='address';address.href='https://daw.looplicator.com';address.textContent='https://daw.looplicator.com';
          address.style.cssText='font:13px ui-monospace,monospace;color:#a5e6cf;text-decoration:none;border:1px solid #40534d;background:#1b2925;padding:10px 14px;border-radius:7px;margin-left:auto;white-space:nowrap';
          document.querySelector(CAPTURE_TARGETS.header).append(address);
        }
      }
      await paint();
    },
    async showLoop({ id, url, excerptSeconds }) {
      const loop=batch.get(id);
      if(!loop)throw new Error(`Loop not in capture batch: ${id}`);
      const response=await fetch(url || loop.url);
      if(!response.ok)throw new Error(`Unable to load render input: ${response.status}`);
      const bytes=new Uint8Array(await response.arrayBuffer());
      const buffer=await new OfflineAudioContext(2,1,44100).decodeAudioData(bytes.slice().buffer);
      if(!(buffer.duration>0))throw new Error('Cannot capture empty audio');
      const excerpt=excerptSeconds??buffer.duration;
      if(!Number.isFinite(excerpt)||excerpt<=0||excerpt>buffer.duration+.05)throw new Error('Invalid capture excerpt duration');
      duration=buffer.duration;excerptDuration=excerpt;
      flushSync(()=>{setTime(0);setOutput({bytes,buffer,name:loop.name,url:URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}))});});
      await document.fonts.ready;await paint();
      return {id,duration,excerptDuration};
    },
    async renderFrame({ time }) {
      if(!Number.isFinite(time)||time<0||!duration)throw new Error('Capture frame needs a loaded loop and nonnegative time');
      const position=time%excerptDuration;
      flushSync(()=>setTime(position));await paint();
      return {time,position,duration,excerptDuration};
    },
  });
}
