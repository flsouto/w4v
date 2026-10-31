# Looplicator

Serverless loop maker: a Rust audio engine and a React browser app in one repository.

- `src/`: Rust engine, native CLI, and WASM exports.
- `web/`: React/Vite app. IndexedDB holds the sample library locally.
- `examples/profile_blenders.rs`: repeatable native mixer timing harness.
- `../beatcli/`: external PHP reference; not needed to build or run this project.

## Development

Requires Rust with `wasm32-unknown-unknown`, `wasm-pack`, and Node.js 22+.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
npm ci
npm run build:wasm
npm run dev
```

Rebuild WASM after changing Rust. The root Cargo package stays in place, preserving CLI commands and paths. There is no copying into a sibling repository.

## Production

```sh
npm ci
npm run build
npm run preview
```

Publish **`web/dist/`** to the existing static host. Serve `.wasm` as `application/wasm`; use HTTPS outside localhost. No application server or cross-origin isolation headers are required. Revalidate `index.html` and `engine/v<version>/*` on each request (for example `Cache-Control: no-cache`), because each version uses stable WASM filenames inside its own namespace. Vite hashes the app and worker bundles. Upload the complete output together and invalidate the CDN after deployment. `npm run deploy` uses the existing S3 bucket and CloudFront distribution. Set matching explicit versions in root and web package.json, update the lockfile, and commit first. The script builds both the root site and a self-contained `/v<version>/` archive. It refuses to overwrite an existing release, uploads the archive first, publishes root index.html last, preserves all older root assets and archives, and waits for CDN invalidation. There is no automatic version bump or commit during deployment. Runtime WASM lives under `engine/v<version>/`, so a new release cannot replace the legacy `/w4v_pkg/` loader. Old v1.13.0 HTML references root assets; those are deliberately retained.

The React app keeps the previous `audioSamplerDB` / `audioFiles` IndexedDB schema. Existing samples remain accessible **on the same browser origin**; localhost, a different domain, or a different port has a separate library. The sibling Vue and PHP repositories have not been changed. The frontend was migrated as source files; its previous Git history has not been imported.

## Audio processing and freezes

The previous Vue component called `blend_js` and `apply_fx_js` synchronously on the main thread. All WASM calls, including initialization, now run in a dedicated worker. Requests have IDs, errors return to the UI, cancellation terminates the worker, and a 60-second timeout terminates jobs that do not complete. The next job creates a new worker. Cancellation also discards stale results during input decoding.

Imports are normalized to stereo 44.1 kHz PCM WAV. Inputs are limited to 40 MB / 60 seconds each to constrain memory use; these limits are not a guarantee against every out-of-memory condition. Decoding, encoding input PCM, and drawing the waveform still use browser APIs and some main-thread work. Moving WASM to a worker prevents synchronous engine work from blocking the UI; it does not make every mixer cheap or protect against browser-wide memory exhaustion.

Mosaic previously concatenated by decoding and re-encoding the accumulated output after every pattern character, causing quadratic copying. It now joins the selected segments once. A seeded regression test checks that audio bytes are preserved. The engine still uses encoded WAVs between many effects; a future decoded-PCM representation could remove more conversion overhead. No general PHP/Rust audio parity claim is made.

The UI reports both WASM time and total generation time. Seed fixes the engine randomness for a given ordered input set; sample selection and random mixer choice are separately randomized. Tempo is speed/pitch adjustment relative to an assumed 120 BPM source, not BPM detection or pitch-preserving time stretching.

## Verification and profiling

```sh
cargo test
npm test
npm run build
cargo run --release --example profile_blenders -- AmenBreak.wav
```

The profiling harness runs each of the seven ported mixers with seeds 0–2 using the supplied WAV for all three inputs. Native timing is useful for comparisons, but browser timings are the relevant measure for WASM. The UI provides those timings. For a failing pattern, record the mixer, ordered inputs, seed, effect, and browser, then compare with the PHP reference before changing musical behavior.

## Dim mixer

`dim` ports `../beatcli/mixers/dim.php` and appears automatically in the browser's mixer catalog after rebuilding WASM. It uses two inputs (the current browser UI still selects three for every mixer).

The first input optionally receives stereo center cancellation, is slowed to 0.2–0.6 speed, low-pass filtered at 200–600 Hz, and delayed by 0.2–0.6 seconds in the first channel. The delay tail is trimmed. If the resulting duration exceeds 40 seconds, it is halved once, matching PHP. The optional second layer is resized to that duration, attenuated by 30 dB, multiplied by an offset sine at 250–500 Hz, high-pass filtered at 3000 Hz, and given 80% tremolo at 0.1–0.9 Hz. Mixing uses unity gains, followed by the engine's standard final normalization.

The implementation processes decoded PCM directly and caps slowed intermediate audio at 32 million samples (about 128 MB). Inputs must have matching sample rates and channel counts; browser imports already normalize these. Random choices use the Rust seed, not PHP's random-number sequence. Linear interpolation differs from SoX's band-limited resampling, so this is not a bit-identical port.

The normal Rust suite checks duration, channel delay, both optional branches, registration, and repeatable seeds. An additional reference test runs four fixed parameter combinations against the installed SoX executable, with relative RMS error required below 3% on the synthetic test inputs:

```sh
cargo test compare_fixed_parameters_with_sox -- --ignored --nocapture
```

Filter design follows the standard [RBJ biquad equations](https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html); the port's SoX interpretation was checked against the legacy Sampler wrapper and SoX behavior.
