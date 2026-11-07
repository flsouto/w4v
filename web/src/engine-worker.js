// Keep every synchronous WASM call off the UI thread, including initialization.
const enginePath = import.meta.env.PROD
  ? `${import.meta.env.BASE_URL}engine/v${__APP_VERSION__}/w4v.js`
  : `${import.meta.env.BASE_URL}w4v_pkg/w4v.js`;
const engine = import(/* @vite-ignore */ enginePath).then(async module => {
  await module.default();
  return module;
});
self.onmessage = async ({ data: { id, type, payload } }) => {
  try {
    const wasm = await engine;
    let result;
    const start = performance.now();
    if (type === 'catalog') {
      result = { blenders: wasm.get_blenders_js().sort(), effects: wasm.get_fx_list_js().sort() };
    } else if (type === 'blend') {
      result = wasm.blend_js(...payload.wavs, BigInt(payload.seed), payload.blender, payload.effect || undefined, payload.patterns?.join('\n'));
    } else if (type === 'effect') {
      result = wasm.apply_fx_js(payload.wav, BigInt(payload.seed), payload.effect);
    } else throw new Error(`Unknown operation: ${type}`);
    const transfer = result instanceof Uint8Array ? [result.buffer] : [];
    self.postMessage({ id, result, elapsed: performance.now() - start }, transfer);
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
