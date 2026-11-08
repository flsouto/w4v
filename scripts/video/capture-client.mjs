import { assertCaptureVersion, CAPTURE_TARGETS, CAPTURE_API_VERSION, CAPTURE_METHODS } from '../../web/src/capture-contract.js';

export async function connectCapture(page) {
  await page.waitForFunction(()=>Boolean(window.__looplicatorCapture));
  assertCaptureVersion(await page.evaluate(()=>window.__looplicatorCapture.apiVersion));
  const missing = await page.evaluate(methods=>methods.filter(name=>typeof window.__looplicatorCapture[name]!=='function'),CAPTURE_METHODS);
  if(missing.length)throw new Error(`Capture API v${CAPTURE_API_VERSION} is missing methods: ${missing.join(', ')}`);
  return {
    apiVersion:CAPTURE_API_VERSION,
    loadBatch:loops=>page.evaluate(loops=>window.__looplicatorCapture.loadBatch({loops}),loops),
    getCatalog:()=>page.evaluate(()=>window.__looplicatorCapture.getCatalog()),
    // Mixer/FX accept engine names, '' for unknown metadata, or 'random'.
    setPresentation:options=>page.evaluate(options=>window.__looplicatorCapture.setPresentation(options),options),
    showLoop:options=>page.evaluate(options=>window.__looplicatorCapture.showLoop(options),options),
    renderFrame:time=>page.evaluate(time=>window.__looplicatorCapture.renderFrame({time}),time),
    async assertFits() {
      const visible=await page.locator(CAPTURE_TARGETS.output).evaluate(element=>{const box=element.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight&&box.left>=0&&box.right<=innerWidth;});
      if(!visible)throw new Error('Capture output does not fit the viewport; choose a taller --size, such as 1920x1080 or 1280x800');
    },
  };
}
