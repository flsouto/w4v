# Upcoming work

## First priority: before implementing the next features

- [ ] Make UI/renderer compatibility a prerequisite for future feature work.
  - Establish a stable, versioned capture API (`loadBatch`, `showLoop`, `setPresentation`, `renderFrame`) that hides React state and layout internals from the renderer.
  - Add explicit capture targets instead of depending on styling classes such as `.output-section`.
  - Add an end-to-end renderer smoke test with two fixture loops: verify library contents, waveform, rounded BPM, Mixer/FX presentation, playhead progression and excerpt wrapping, and final compilation audio/video timing.
  - Check that production builds exclude the capture API and capture-only code.
  - Require the smoke test to pass when changing UI behavior; update the capture API and renderer together when their contract changes.
  - Retain UI and encoding fingerprints to prevent reuse of outdated rendered clips.

Requested timing: tackle this at the start of the next feature implementation, before introducing further UI behavior changes.
