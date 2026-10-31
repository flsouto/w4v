// Shared by the development adapter and the Node renderer. Breaking API changes
// must bump this version and update both sides plus test:compat in one change.
export const CAPTURE_API_VERSION = 1;
export const CAPTURE_METHODS = Object.freeze(['loadBatch','showLoop','setPresentation','renderFrame','getCatalog']);
export const CAPTURE_TARGETS = Object.freeze({
  app:'[data-capture="app"]', header:'[data-capture="header"]',
  library:'[data-capture="library"]', libraryItem:'[data-capture="library-item"]',
  libraryName:'[data-capture="library-name"]', mixer:'[data-capture="mixer"]',
  fx:'[data-capture="fx"]', tempo:'[data-capture="tempo"]',
  libraryCount:'[data-capture="library-count"]', timeline:'[data-capture="timeline"]',
  output:'[data-capture="output"]', waveform:'[data-capture="waveform"]',
  player:'[data-capture="player"]', playhead:'[data-capture="playhead"]', clock:'[data-capture="clock"]',
});
export function assertCaptureVersion(version) {
  if (version !== CAPTURE_API_VERSION) throw new Error(`Capture API mismatch: renderer expects v${CAPTURE_API_VERSION}, app provides v${version}. Update the adapter, renderer, and compatibility test together.`);
}
