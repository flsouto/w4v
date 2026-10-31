// Imported only in Vite development mode with ?render=1. Never shipped to production.
import { flushSync } from 'react-dom';

export function createRenderBridge({ setOutput, setFiles, setTime, setBpm, setCatalog, setBlender, setEffect }) {
  let duration = 0, catalogPromise;
  const paint = () => new Promise(resolve => requestAnimationFrame(resolve));
  return {
    async catalog() {
      catalogPromise ||= import(/* @vite-ignore */ `${import.meta.env.BASE_URL}w4v_pkg/w4v.js`).then(async wasm => {
        await wasm.default();
        return { blenders: wasm.get_blenders_js().sort(), effects: wasm.get_fx_list_js().sort() };
      });
      const catalog = await catalogPromise;
      flushSync(() => setCatalog(catalog));
      return catalog;
    },
    branding(enabled) {
      document.querySelector('.render-address')?.remove();
      if (!enabled) return;
      const address = document.createElement('a');
      address.className = 'render-address';
      address.href = 'https://daw.looplicator.com';
      address.textContent = 'https://daw.looplicator.com';
      address.style.cssText = 'font:13px ui-monospace,monospace;color:#a5e6cf;text-decoration:none;border:1px solid #40534d;background:#1b2925;padding:10px 14px;border-radius:7px;margin-left:auto;white-space:nowrap';
      const header = document.querySelector('header');
      header.insertBefore(address, header.querySelector('.header-links'));
    },
    library(items) { flushSync(() => setFiles(items)); },
    async load({ url, name, ui }) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load render input: ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const decoder = new OfflineAudioContext(2, 1, 44100);
      const buffer = await decoder.decodeAudioData(bytes.slice().buffer);
      duration = buffer.duration;
      if (!(duration > 0)) throw new Error('Cannot render empty audio');
      const file = new File([bytes], name, { type: 'audio/wav' });
      Object.defineProperties(file, { id: { value: name }, isGenerated: { value: true } });
      flushSync(() => {
        setTime(0);
        setBpm(ui.bpm);
        setBlender(ui.mixer);
        setEffect(ui.fx);
        setOutput({ bytes, buffer, name, url: URL.createObjectURL(file) });
      });
      await document.fonts.ready;
      await paint();
      return { duration };
    },
    async frame(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0 || !duration) throw new Error('Invalid render time');
      flushSync(() => setTime(seconds % duration));
      await paint();
    },
  };
}
