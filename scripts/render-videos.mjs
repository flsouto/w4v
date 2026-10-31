import { parseArgs } from 'node:util';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, rename, unlink, access, mkdtemp, rm } from 'node:fs/promises';
import { createHash, randomInt } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { connectCapture } from './video/capture-client.mjs';
import { resolveVideoSource } from './video/config.mjs';
import { clipTiming } from './video/timing.mjs';
import { readHistory, recordCompilation, syncHistory } from './video/history.mjs';
import { ENCODING_PROFILE, INTERMEDIATE_EXTENSION, INTERMEDIATE_AUDIO } from './video/encoding.mjs';
import { concatenateClips } from './video/concatenate.mjs';
import { selectInputs, parseOptions, fingerprintFiles, estimateBpm } from './video/inputs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function currentUiFingerprint() {
  return createHash('sha256').update(await fingerprintFiles(join(root, 'web/src')))
    .update(await readFile(join(root, 'web/package.json')))
    .update(await readFile(join(root, 'web/public/looplicator.png'))).digest('hex');
}
const { values } = parseArgs({ options: {
  glob: { type:'string' }, input: { type: 'string', multiple: true }, output: { type: 'string' },
  portion: { type: 'string' }, last: { type: 'string' }, cycles: { type: 'string' }, fps: { type: 'string' }, size: { type: 'string' }, seconds: { type: 'string' },
  history: { type: 'string' }, 'no-history-sync': { type: 'boolean' }, 'random-ui': { type: 'boolean' }, 'show-url': { type: 'boolean' }, 'browser-executable': { type: 'string' }, 'list-only': { type: 'boolean' }, help: { type: 'boolean' },
} });
if (values.help) {
  console.log(`Render existing farm WAVs with the current Looplicator UI. Does not modify inputs.\n\nnpm run render:videos -- --input commits --last 10 --cycles 4\n\n--input DIR                 Explicit folders (overrides .env glob; default: commits)\n--glob PATTERN              Override VIDEO_INPUT_GLOB from .env\n--last N                    Newest N not-yet-compiled unique WAVs by mtime (default: 1)\n--portion FRACTION          Beginning of each loop to use (default: 1/4; use 1 for full)\n--cycles N                  Repeat that excerpt N times (default: 1)\n--fps N                     Frame rate, 1–60 (default: 30)\n--size WIDTHxHEIGHT         Even dimensions (default: 1920x1080)\n--seconds N                 Limit each video duration, useful for previews\n--random-ui                 Pick visual-only Mixer/FX selections for each clip\n--show-url                  Show https://daw.looplicator.com in the captured header\n--output DIR                Destination for clips and final compilation (default: videos)\n--history FILE              Compilation ledger (default: repository compiled-loops.txt)\n--no-history-sync           Record locally without automatic Git commit/push\n--list-only                 Print selected WAVs without launching a browser\n--browser-executable PATH   Optional existing Chromium executable\n\nRequires FFmpeg/ffprobe and Chromium: npx playwright install chromium`);
  process.exit(0);
}
let server, browser;
let interrupted = false;
process.on('SIGINT', () => { interrupted = true; });
process.on('SIGTERM', () => { interrupted = true; });
try {
  const settings = parseOptions(values);
  const source = await resolveVideoSource(values,root);
  const directories = source.directories;
  const historyPath = resolve(values.history ?? join(root,'compiled-loops.txt'));
  if (!values['list-only'] && !values['no-history-sync']) syncHistory(historyPath);
  const compiled = await readHistory(historyPath);
  const inputs = await selectInputs(directories, settings.last, compiled, source.glob);
  if (!inputs.length) {
    console.log('No uncompiled WAV files found.');
    process.exit(0);
  }
  if (values['list-only']) { console.log(JSON.stringify(inputs, null, 2)); process.exit(0); }
  for (const command of ['ffmpeg', 'ffprobe']) execFileSync(command, ['-version'], { stdio: 'ignore' });
  const output = resolve(values.output ?? 'videos');
  await mkdir(output, { recursive: true });
  const version = JSON.parse(await readFile(join(root, 'web/package.json'), 'utf8')).version;
  const uiFingerprint = await currentUiFingerprint();
  const libraryFingerprint = createHash('sha256').update(JSON.stringify(inputs.map(file => [file.sha256,file.name]))).digest('hex').slice(0,8);
  const manifestPath = join(output, `render-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const manifest = { version, encodingProfile: ENCODING_PROFILE, historyPath, uiFingerprint, createdAt: new Date().toISOString(), ordering: 'mtime descending; content SHA-256 deduplication', inputGlob: source.glob, directories: directories.map(path => resolve(path)), settings, loops: inputs.map(file => ({ ...file, status: 'pending' })) };
  const saveManifest = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await saveManifest();
  const { createServer } = await import('vite');
  const { chromium } = await import('playwright');
  server = await createServer({ root: join(root, 'web'), configFile: join(root, 'web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 18000 + Math.floor(Math.random() * 10000), strictPort: false, open: false } });
  await server.listen();
  const address = server.httpServer.address();
  browser = await chromium.launch({ headless: true, ...(values['browser-executable'] ? { executablePath: resolve(values['browser-executable']) } : {}) });
  const context = await browser.newContext({ viewport: { width: settings.width, height: settings.height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  let currentInput;
  await page.route('**/__looplicator_render/audio', route => route.fulfill({ path: currentInput, contentType: 'audio/wav' }));
  await page.goto(`http://127.0.0.1:${address.port}/?render=1`);
  const capture = await connectCapture(page);
  manifest.captureApiVersion = capture.apiVersion;
  await page.route('**/__looplicator_render/library/*', route => {
    const index = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    return inputs[index] ? route.fulfill({ path: inputs[index].path, contentType: 'audio/wav' }) : route.abort();
  });
  const library = inputs.map((file, index) => {
    let duration = 0;
    try { duration = Number(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0',file.path], { encoding:'utf8', stdio:['ignore','pipe','pipe'] }).trim()); } catch {}
    return { id:file.sha256, name:file.name, size:file.size, lastModified:file.mtimeMs, url:`/__looplicator_render/library/${index}`, duration };
  });
  await capture.loadBatch(library);
  await capture.setPresentation({showUrl:settings.showUrl});
  const uiCatalog = settings.randomUi ? await capture.getCatalog() : null;
  if (uiCatalog && (!uiCatalog.blenders.length || !uiCatalog.effects.length)) throw new Error('Random UI requires a nonempty engine catalog; run npm run build:wasm first');
  let failures = 0;
  for (const record of manifest.loops) {
    if (interrupted) break;
    let encoder, partial, snapshotDirectory;
    try {
      // Freeze this selected file in memory for both the browser and encoder input.
      const bytes = await readFile(record.path);
      if (createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error('Input changed after selection; rerun to select it again');
      snapshotDirectory = await mkdtemp(join(tmpdir(), 'looplicator-video-'));
      const snapshot = join(snapshotDirectory, 'loop.wav');
      await writeFile(snapshot, bytes);
      currentInput = snapshot;
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,sample_rate', '-of', 'json', snapshot], { encoding: 'utf8' }));
      const sourceDuration = Number(probe.format?.duration);
      if (!(sourceDuration > 0) || !Number.isFinite(sourceDuration) || !probe.streams?.some(stream => stream.codec_type === 'audio')) throw new Error('Invalid or empty audio input');
      const sampleRate = Number(probe.streams.find(stream => stream.codec_type === 'audio').sample_rate);
      const {excerptSamples,excerptDuration,duration,frames} = clipTiming(sourceDuration,sampleRate,settings);
      record.ui = { bpm: estimateBpm(sourceDuration), mixer: uiCatalog ? uiCatalog.blenders[randomInt(uiCatalog.blenders.length)] : '', fx: uiCatalog ? uiCatalog.effects[randomInt(uiCatalog.effects.length)] : '', visualOnly: settings.randomUi };
      const controlsId = createHash('sha256').update(JSON.stringify(record.ui)).digest('hex').slice(0,8);
      const id = `${ENCODING_PROFILE}-${basename(record.name).replace(/\.wav$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}-${record.sha256.slice(0, 8)}-ui${uiFingerprint.slice(0, 8)}-lib${libraryFingerprint}-ctl${controlsId}-${settings.showUrl ? 'url' : 'plain'}-${settings.width}x${settings.height}-${settings.fps}fps-p${settings.portion}-c${settings.cycles}-${duration.toFixed(3)}s`;
      const destination = join(output, `${id}.${INTERMEDIATE_EXTENSION}`);
      record.video = destination; record.sourceDuration = sourceDuration; record.excerptDuration = excerptDuration; record.duration = duration; record.frames = frames;
      let existing = false;
      try { await access(destination); existing = true; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (existing) {
        record.status = 'skipped-existing';
        await rm(snapshotDirectory, { recursive: true, force: true }); snapshotDirectory = undefined;
        await saveManifest(); console.log(`Already rendered: ${destination}`); continue;
      }
      await capture.setPresentation({bpm:record.ui.bpm,mixer:record.ui.mixer,fx:record.ui.fx});
      const loaded = await capture.showLoop({id:record.sha256,url:'/__looplicator_render/audio',excerptSeconds:excerptDuration});
      if (Math.abs(loaded.duration-sourceDuration)>.05) throw new Error('Browser and source audio durations disagree');
      await capture.assertFits();
      partial = join(output, `${id}.${process.pid}.partial.${INTERMEDIATE_EXTENSION}`);
      const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(settings.fps), '-vcodec', 'png', '-i', 'pipe:0', '-i', snapshot, '-map', '0:v:0', '-map', '1:a:0', '-t', String(duration), '-af', `atrim=end_sample=${excerptSamples},asetpts=PTS-STARTPTS,aloop=loop=${settings.cycles - 1}:size=${excerptSamples}`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', ...INTERMEDIATE_AUDIO, partial];
      encoder = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
      let errors = '', stdinError;
      encoder.stderr.on('data', data => { errors = (errors + data).slice(-8000); });
      encoder.stdin.on('error', error => { stdinError = error; });
      const completed = new Promise((resolve, reject) => { encoder.once('error', reject); encoder.once('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${errors}`))); });
      completed.catch(() => {}); // Observe early failures while screenshot generation is still running.
      console.log(`Rendering ${record.name}: ${duration.toFixed(2)}s, ${frames} frames`);
      for (let frame = 0; frame < frames; frame++) {
        if (interrupted) throw new Error('Rendering interrupted');
        if (stdinError || encoder.exitCode !== null) throw stdinError || new Error(errors || 'Encoder exited early');
        await capture.renderFrame(frame / settings.fps);
        const png = await page.screenshot({ type: 'png', animations: 'disabled' });
        if (frame === 0) await writeFile(join(output, `${id}.png`), png);
        if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
        if (frame && frame % settings.fps === 0) process.stdout.write(`  ${frame}/${frames}\r`);
      }
      encoder.stdin.end();
      await completed;
      if (await currentUiFingerprint() !== uiFingerprint) throw new Error('UI source changed during rendering; rerun with the updated UI');
      await rename(partial, destination); partial = undefined;
      record.status = 'complete';
      console.log(`Saved ${destination}`);
    } catch (error) {
      encoder?.kill('SIGTERM');
      if (encoder) await new Promise(resolve => { if (encoder.exitCode !== null || encoder.signalCode !== null) resolve(); else encoder.once('close', resolve); });
      if (partial) await unlink(partial).catch(() => {});
      record.status = interrupted ? 'interrupted' : 'failed'; record.error = error.message;
      failures++;
      console.error(`${record.name}: ${error.message}`);
    }
    if (snapshotDirectory) await rm(snapshotDirectory, { recursive: true, force: true });
    await saveManifest();
  }
  if (!failures && !interrupted) {
    console.log('Combining all selected clips…');
    try {
      manifest.compilation = await concatenateClips(manifest.loops, join(output, 'compilation.mp4'), settings.fps);
      console.log(`Final video: ${manifest.compilation.video}`);
    } catch(error) {
      manifest.compilation = {status:'failed',error:error.message};
      failures++;console.error(error.message);
    }
  } else manifest.compilation = {status:'not-created',reason:'Not all selected clips completed'};
  await saveManifest();
  if (!failures && !interrupted) {
    try {
      const added = await recordCompilation(historyPath, manifest.loops, manifest.compilation);
      manifest.history = {path:historyPath,added,sync:values['no-history-sync']?'disabled':'pending'};
      await saveManifest();
      if (!values['no-history-sync']) { syncHistory(historyPath); manifest.history.sync='pushed'; }
      console.log(`Recorded ${added.length} compiled loop(s) in ${historyPath}`);
    } catch(error) {
      manifest.history ||= {path:historyPath};
      manifest.history.error=error.message;failures++;
      console.error(`Compilation history/Git sync failed: ${error.message}. Local history is retained; retry Git sync before rendering another batch.`);
    }
    await saveManifest();
  }
  console.log(`Render manifest: ${manifestPath}`);
  if (failures || interrupted) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
