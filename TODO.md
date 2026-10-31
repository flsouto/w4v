# Upcoming work

## First priority: before implementing the next features

- [x] Make UI/renderer compatibility a prerequisite for future feature work.
  - [x] Establish a stable, versioned capture API (`loadBatch`, `showLoop`, `setPresentation`, `renderFrame`) that hides React state and layout internals from the renderer.
  - [x] Add explicit capture targets instead of depending on styling classes such as `.output-section`.
  - [x] Add an end-to-end renderer smoke test with two fixture loops: verify library contents, waveform, rounded BPM, Mixer/FX presentation, playhead progression and excerpt wrapping, and final compilation audio/video timing.
  - [x] Check that production builds exclude the capture API and capture-only code.
  - [x] Require the smoke test to pass when changing UI behavior; update the capture API and renderer together when their contract changes.
  - [x] Retain UI and encoding fingerprints to prevent reuse of outdated rendered clips.

Completed through capture API v1, `data-capture` targets, `npm run check`, the compatibility CI workflow, and the project instructions in AGENTS.md. See docs/capture-api.md for the contract and validation policy. Future UI changes must continue to pass the gate; GitHub branch rules can require its compatibility status before merging.

## UI Improvements

- [x] Show loader indicator while loading loops into library (try to update the list for every new loop added).
- [x] Show count of loops in the current filtered list inside the library.
- [x] Show an indicator or some kind of flash or animation when saving / favoriting a loop.
