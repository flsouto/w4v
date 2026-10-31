# Capture API v1

The development-only adapter exposes `window.__looplicatorCapture` when Vite runs the app with `?render=1`. Production builds ignore that query and must not contain the adapter or global. `web/src/capture-contract.js` defines the supported API version, required methods, and semantic DOM targets. Node automation connects through `scripts/video/capture-client.mjs`, which checks the version and method availability before rendering.

## Methods

- `loadBatch({loops})`: replace the displayed library and reset the active output/timeline. Each loop has a unique string `id`, string `name`, and browser-accessible `url`; optional `duration`, `size`, and `lastModified` populate the library. Does not write IndexedDB.
- `showLoop({id, url?, excerptSeconds?})`: display an existing batch loop and draw its decoded waveform. An optional URL supplies a stable audio snapshot instead of the library URL. `excerptSeconds` defaults to the full loop. Resolves after the UI paints, returning `{id, duration, excerptDuration}`. Never plays or changes the source audio.
- `setPresentation({showUrl?, bpm?, mixer?, fx?})`: update cosmetic controls. BPM must be a positive whole number. Empty mixer/FX strings show unknown metadata; other choices must exist in the real engine catalog. Presentation does not run a mixer, apply FX, or change video audio/timing. Resolves after paint.
- `renderFrame({time})`: render an absolute nonnegative elapsed time in seconds. The adapter wraps the playhead/timer at the selected excerpt boundary, then resolves after paint with `{time, position, duration, excerptDuration}`. The screenshot caller does not advance HTML media playback or inspect React state.
- `getCatalog()`: load the actual WASM catalog and return sorted `{blenders, effects}`. Requires the generated WASM package.

The renderer owns source selection, immutable file snapshots, frame cadence, audio encoding, concatenation, and history. The adapter owns translation from this API into React state and visual presentation.

## Stable capture targets

`CAPTURE_TARGETS` exports selectors for the app/header, library/items/names/count, mixer, FX, tempo, output, waveform, player, timeline, playhead, and clock. They use explicit `data-capture` attributes, not CSS classes. Preserve their semantic meaning when restyling or moving components. Only `capture-client.mjs` handles output-fit checks; the main renderer does not know component nesting or styling classes.

## Required compatibility gate

Run `npm run check` before completing UI or renderer changes. It includes unit tests and `npm run test:compat`. The latter builds production assets and runs:

1. A two-loop fixture test through the v1 API: library contents, actual waveform pixels, integer BPM (including values outside ordinary slider bounds), Mixer/FX selection, playhead movement, timer updates, and excerpt wrapping.
2. The real rendering CLI through a complete temporary batch: source fixtures, screenshots, lossless intermediates, final AAC compilation, history updates in a temporary ledger, and audio/video duration checks.
3. Production asset scanning and a browser visit with `?render=1` to confirm that capture globals remain absent.
4. Library browser checks: mutation performance, incremental upload progress, filtered counts, and save/favorite feedback.

`web/vite.config.js` also rejects production chunks containing the private capture API. `.github/workflows/check.yml` runs the gate on pushes and pull requests; ledger-only pushes are excluded because normal rendering commits history frequently. Repository branch rules can make the `compatibility` job a required merge status.

For a breaking API change, increment `CAPTURE_API_VERSION` and update the adapter, client, and tests in the same change. Do not weaken compatibility or production-isolation checks to bypass a regression. UI and encoding fingerprints remain part of output identity, so passing tests does not accidentally reuse footage from older visuals or audio settings.
