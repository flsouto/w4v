# Looplicator

Serverless loop maker: a Rust audio engine and a React browser app in one repository.

See [TODO.md](TODO.md) for the renderer compatibility work to complete before implementing the next features.

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

Seed fixes the engine randomness for a given ordered input set; sample selection and random mixer choice are separately randomized. Tempo is speed/pitch adjustment relative to an assumed 120 BPM source, not BPM detection or pitch-preserving time stretching.

## Verification and profiling

```sh
cargo test
npm test
npm run build
cargo run --release --example profile_blenders -- AmenBreak.wav
```

The profiling harness runs each of the seven ported mixers with seeds 0–2 using the supplied WAV for all three inputs. Native timing is useful for comparisons, but browser timings are the relevant measure for WASM. Use browser profiling tools to measure WASM and end-to-end generation time. For a failing pattern, record the mixer, ordered inputs, seed, effect, and browser, then compare with the PHP reference before changing musical behavior.

## Dim mixer

`dim` ports `../beatcli/mixers/dim.php` and appears automatically in the browser's mixer catalog after rebuilding WASM. It uses two inputs (the current browser UI still selects three for every mixer).

The first input optionally receives stereo center cancellation, is slowed to 0.2–0.6 speed, low-pass filtered at 200–600 Hz, and delayed by 0.2–0.6 seconds in the first channel. The delay tail is trimmed. If the resulting duration exceeds 40 seconds, it is halved once, matching PHP. The optional second layer is resized to that duration, attenuated by 30 dB, multiplied by an offset sine at 250–500 Hz, high-pass filtered at 3000 Hz, and given 80% tremolo at 0.1–0.9 Hz. Mixing uses unity gains, followed by the engine's standard final normalization.

The implementation processes decoded PCM directly and caps slowed intermediate audio at 32 million samples (about 128 MB). Inputs must have matching sample rates and channel counts; browser imports already normalize these. Random choices use the Rust seed, not PHP's random-number sequence. Linear interpolation differs from SoX's band-limited resampling, so this is not a bit-identical port.

The normal Rust suite checks duration, channel delay, both optional branches, registration, and repeatable seeds. An additional reference test runs four fixed parameter combinations against the installed SoX executable, with relative RMS error required below 3% on the synthetic test inputs:

```sh
cargo test compare_fixed_parameters_with_sox -- --ignored --nocapture
```

Filter design follows the standard [RBJ biquad equations](https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html); the port's SoX interpretation was checked against the legacy Sampler wrapper and SoX behavior.

## News and release notes

`/news/` and each `/news/<slug>/` article are generated as complete static HTML during the Vite build. They have a small independent stylesheet and do not load React, the DAW bundle, workers, or WASM. The app only adds a News link. Builds also produce `/news/feed.xml`, `/sitemap.xml`, and `/robots.txt`; article pages include canonical URLs and BlogPosting structured data. Archived copies point to the canonical live news URLs.

To publish a release note, add a JSON file to `web/news/` with `slug`, `title`, `date` (YYYY-MM-DD), `version`, `summary`, and `body` (trusted author-written HTML). Use a unique lowercase hyphenated slug. Posts sort by date and then version. Keep earlier post files so the index, feed, and sitemap retain their links. `web/news/style.css` styles the static pages, and `scripts/build-news.mjs` renders them. News source is never imported into the DAW runtime bundle.

Update root and web package versions, refresh the lockfile with `npm install --package-lock-only --ignore-scripts`, run checks, and commit. Then `npm run deploy` builds and uploads both the app and all news files to S3, creates the new app archive, and invalidates CloudFront. Existing release archives remain unchanged. Rebuilds also refresh the news index and discovery files when adding an article. Content changes must use a fresh app version for deployment because published app archives cannot be overwritten.

Recent UI controls include compact players, waveform seeking/playhead, autoplay, eligible random Mixer/FX checkboxes, and output favorites. F generates, S saves, and X saves as a favorite; shortcuts ignore editing controls and modifier keys.

## Videos from your existing farm workflow

Keep using `aliases`, `.farmrc`, and the existing generate/save/repeat commands. The renderer reads completed WAVs from the directories those commands already populate; it does not change the framework, move files, or create a generation manifest inside it. The default input is `commits/` (kept loops). Use `stash/` for a broader pool, or pass both: duplicate audio files are identified by SHA-256 and rendered once.

```sh
npm ci
npx playwright install chromium --only-shell
# FFmpeg and ffprobe must also be installed on your system.

# Check the selection first; this does not launch a browser or write videos.
npm run render:videos -- --input commits --last 10 --list-only

# Ten newest unique saved loops, each first-quarter excerpt repeated four times, at 1080p / 30 fps.
npm run render:videos -- --input commits --last 10 --cycles 4

# Include stash as well, with content deduplication across both folders.
npm run render:videos -- --input commits --input stash --last 10 --cycles 2

# A quick low-frame-rate preview.
npm run render:videos -- --input commits --last 1 --seconds 2 --fps 6 --size 1280x800
```

The renderer starts its own loopback-only Vite server and isolated headless browser. `?render=1` provides a development-only bridge into the same app components. Each selected WAV is loaded directly into the output panel, without regeneration, normalization, tempo changes, or browser playback. Every selected loop appears in the capture library, with its original duration; these entries do not preload audio. The waveform playhead and timer are driven by explicit frame timestamps; FFmpeg combines the PNG frame stream with audio from the original WAV, trimmed to its first quarter by default and repeated as requested. The full waveform stays visible, and its playhead traverses only that excerpt. Intermediate MOV clips use H.264 video and uncompressed 32-bit float PCM audio. The final MP4 uses H.264 video and 384 kbps AAC-LC audio at 48 kHz stereo. Only the final step applies lossy audio compression. Audio is encoded from the original, not captured from a sound device. Visual timing is quantized to the chosen frame rate, while the soundtrack is trimmed to the requested duration. Rendering can take longer than playback.

`videos/` receives a MOV intermediate and PNG thumbnail per loop, one final MP4 compilation, and a JSON manifest per batch. Upload the final compilation to YouTube. The manifest records selected file paths, modification times, source content hashes, source/target durations, frame counts, UI fingerprint, app version, settings, encoding profile, and per-loop completion/failure status. Matching existing intermediates are skipped; changed UI source, app version, logo, audio, resolution, frame rate, or duration produces a new filename. Invalid loops are reported individually, and the batch exits unsuccessfully if any fail. A temporary snapshot protects each render from subsequent farm moves/overwrites. Inputs are never modified. Keep the UI source stable until the batch finishes; changed source causes the affected render to be discarded rather than mixing UI versions.

“Last” means **file modification time**, not the exact time you pressed your framework's save command. Moving an old WAV may preserve its original modification time. Hash-named files do not retain mixer/FX provenance, so the capture labels these as CLI output / not recorded instead of guessing. The render manifest describes the video job, not generation history. If exact save-event ordering becomes necessary later, a passive directory observer could record it without changing the framework. This first version deliberately requires no watcher or hooks.

Folders are scanned non-recursively, relative to the current working directory. `.farmrc` is not sourced or executed; use `--input` to choose any custom save folder. `--output` changes the video directory. `--browser-executable /path/to/chromium` uses an existing Chromium installation instead of Playwright's bundled one. Run `npm run render:videos -- --help` for all options. The capture bridge is removed from production builds; none of this launches a browser or adds rendering dependencies when someone visits the online DAW.

Video excerpts use `--portion 1/4` by default. Set `--portion 1/2` for the first half, `--portion 1` for the whole loop, or a decimal such as `--portion 0.1`. `--cycles` repeats the selected excerpt, and `--seconds` caps the total clip duration. Output identity also includes the selected library batch so a different library is not mistaken for an already-rendered video.

Each successful batch now also creates one `compilation-<batch-id>.mp4` containing all selected clips in selection order, and prints its path as `Final video`. Individual MOV intermediates and thumbnails remain available. The manifest's `compilation` field records the final output and ordered segments. If any selected clip fails, no partial compilation is presented as a complete batch. Joining decodes/re-encodes the clips, resets timestamps, normalizes audio to 48 kHz stereo, and trims/pads each audio segment to its video's frame boundary to prevent timing drift across joins.

Use `--show-url` to display `https://daw.looplicator.com` in a compact header badge throughout the footage. This is a website-address overlay in the UI, rather than a simulated browser address bar; rendering still runs locally. The option participates in output identity, so URL-branded clips do not reuse unbranded files.

```sh
npm run render:videos -- --input commits --last 10 --portion 1/4 --show-url
```

The capture estimates BPM from the **full source loop** using `round(120 × 16 / durationSeconds)` (minimum 1 BPM). The slider displays this whole-number estimate and expands its bounds in capture mode if needed. This is the requested duration heuristic, not beat detection. It is display-only: playback timestamps and the soundtrack remain at the WAV's original speed even if a quarter excerpt is selected.

`--random-ui` fills the Mixer and FX dropdowns with randomly selected real engine options for each clip. These are visual presentation choices, not inferred generation metadata, and no effects or mixers are applied to the saved audio. Choices and estimated BPM are recorded in the manifest and included in cache identity. This optional flag needs the generated WASM catalog (`npm run build:wasm` if absent). Without it, unknown mixer/FX metadata remains labeled CLI output / not recorded.

```sh
npm run render:videos -- --input commits --last 10 --show-url --random-ui
```

Encoder settings are part of cache identity. Old AAC intermediate clips and their compilations are not reused by the PCM/384 kbps pipeline. The individual MOV files are larger; the final upload remains a compact fast-start MP4.

### Compilation history

`--last N` now selects the newest N **not-yet-compiled** unique WAVs. The tracked repository file `compiled-loops.txt` contains one filename per line. Matching basenames are excluded across input folders before applying the selection limit. Successful existing local compilation manifests were used to seed this file. The ledger tracks filenames, so intentionally renaming a loop makes it a new candidate.

Only a completed final compilation updates the ledger: failed or interrupted batches do not consume loops. The renderer commits **only** the ledger and runs `git push` automatically afterwards. Unrelated working/staged changes are left alone. Git push requires the current branch's normal remote/upstream and working credentials. A failed push returns an error but keeps the ledger and local commit; the next real run retries Git sync before selecting another batch. This prevents a failed push from causing already-compiled loops to be selected again.

`--list-only` is read-only and does not touch Git or history. `--history /path/to/file.txt` chooses a different ledger. `--no-history-sync` disables automatic Git operations while retaining local history updates (useful for isolated preview/test directories); it does not disable history filtering. To intentionally re-render earlier loops, use a separate history file. The normal default ledger belongs in Git and is not inside ignored `videos/`.
