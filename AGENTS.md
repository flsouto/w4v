# Working on Looplicator

Before finishing changes to UI behavior, layout, playback, library operations, or video rendering, run `npm run check` and fix any failures. This command runs unit tests, the production build/isolation guard, the renderer compatibility smoke test, and the library browser regression test. First-time setup requires generated WASM (`npm run build:wasm`), FFmpeg/ffprobe, and Playwright Chromium.

The capture contract is documented in `docs/capture-api.md`. Node rendering code must use the capture client and explicit `data-capture` targets; keep React state setters and layout details behind the development adapter. Breaking changes must update the API version, client, adapter, and compatibility tests together.

Keep the production capture-code exclusion guard and UI/encoding cache fingerprints. Capture code must remain development-only. Browser/rendering checks must use isolated contexts, temporary fixtures/output/history, and `--no-history-sync`. Never consume real loop history, modify farm inputs, or push the compilation ledger while testing.
