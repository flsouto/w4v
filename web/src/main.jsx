import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { Engine } from './engine.js';
import { prepareWav, encodeWav, download } from './audio.js';
import { storage } from './services/storage.js';
import './style.css';

function App() {
  const engine = useRef(null);
  if (!engine.current) engine.current = new Engine();
  const context = useRef(null), canvas = useRef(null), operation = useRef(0);
  const [files, setFiles] = useState([]), [filter, setFilter] = useState('all');
  const [catalog, setCatalog] = useState({ blenders: [], effects: [] });
  const [blender, setBlender] = useState('mosaic'), [effect, setEffect] = useState('');
  const [random, setRandom] = useState(false), [enabled, setEnabled] = useState([]);
  const [seed, setSeed] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Loading audio engine…'), [output, setOutput] = useState(null);
  const [bpm, setBpm] = useState(120), [randomBpm, setRandomBpm] = useState(false), [locked, setLocked] = useState(false);
  const [range, setRange] = useState([80, 160]), [usage, setUsage] = useState(null);
  const audio = () => context.current ||= new AudioContext({ sampleRate: 44100 });
  const refresh = async () => { setFiles(await storage.getAllFiles()); setUsage(await storage.getStorageInfo()); };
  useEffect(() => {
    let active = true;
    Promise.all([engine.current.run('catalog'), storage.getAllFiles(), storage.getStorageInfo()]).then(([{ result }, saved, info]) => {
      if (!active) return;
      setCatalog(result); setEnabled(result.blenders); setFiles(saved); setUsage(info); setReady(true); setMessage('Ready. Add samples to start.');
    }).catch(error => active && setMessage(error.message));
    return () => { active = false; operation.current++; engine.current.cancel(); context.current?.close(); };
  }, []);
  useEffect(() => {
    if (!output || !canvas.current) return;
    const el = canvas.current, ctx = el.getContext('2d'), samples = output.buffer.getChannelData(0);
    ctx.clearRect(0, 0, el.width, el.height); ctx.fillStyle = '#7fe0be';
    const step = Math.max(1, Math.ceil(samples.length / el.width));
    for (let x = 0; x < el.width; x++) {
      let peak = 0;
      for (let i = x * step; i < Math.min(samples.length, (x + 1) * step); i++) peak = Math.max(peak, Math.abs(samples[i]));
      ctx.fillRect(x, (1 - peak) * el.height / 2, 1, Math.max(1, peak * el.height));
    }
  }, [output]);
  useEffect(() => {
    if (!output) return;
    return () => URL.revokeObjectURL(output.url);
  }, [output]);
  const visible = files.filter(file => filter === 'all' || (filter === 'favorite' ? file.favorite : filter === 'generated' ? file.isGenerated : !file.isGenerated));
  const report = task => Promise.resolve().then(task).catch(error => setMessage(error.message));
  async function upload(event) {
    const selected = [...event.target.files]; event.target.value = '';
    await report(async () => {
      for (const file of selected) { await prepareWav(file, audio()); await storage.saveFile(file); }
      setMessage('Samples added.');
    });
    await refresh();
  }
  async function generate(fxOnly = false) {
    const token = ++operation.current;
    setBusy(true); setMessage('Processing…');
    try {
      audio();
      if (token !== operation.current) return;
      const choices = random ? enabled : [blender];
      if (!choices.length) throw new Error('Select at least one mixer.');
      const chosen = choices[Math.floor(Math.random() * choices.length)];
      const selectedSeed = seed || String(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
      if (!/^\d+$/.test(selectedSeed) || BigInt(selectedSeed) > 18446744073709551615n) throw new Error('Seed must be an unsigned 64-bit integer.');
      const start = performance.now();
      let response;
      if (fxOnly) {
        response = await engine.current.run('effect', { wav: output.bytes.slice(), seed: selectedSeed, effect });
      } else {
        if (visible.length < 3) throw new Error('Add at least three samples to the current filter.');
        const pool = [...visible];
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        const wavs = [];
        for (const file of pool.slice(0, 3)) {
          wavs.push(await prepareWav(file, audio()));
          if (token !== operation.current) return;
        }
        response = await engine.current.run('blend', { wavs, seed: selectedSeed, blender: chosen, effect }, wavs.map(wav => wav.buffer));
      }
      if (token !== operation.current) return;
      const buffer = await audio().decodeAudioData(response.result.slice().buffer);
      if (token !== operation.current) return;
      const bytes = response.result, blob = new Blob([bytes], { type: 'audio/wav' });
      setOutput({ bytes, buffer, url: URL.createObjectURL(blob), name: `generated-${fxOnly ? effect : chosen}-${selectedSeed}.wav` });
      if (randomBpm && !locked) setBpm(Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0]);
      setMessage(`${fxOnly ? effect : chosen} · seed ${selectedSeed} · WASM ${(response.elapsed / 1000).toFixed(2)}s · total ${((performance.now() - start) / 1000).toFixed(2)}s`);
    } catch (error) { if (token === operation.current) setMessage(error.message); }
    finally { if (token === operation.current) setBusy(false); }
  }
  const cancel = () => { operation.current++; engine.current.cancel(); setBusy(false); setMessage('Processing cancelled.'); };
  const outputFile = () => new File([encodeWav(output.buffer, bpm / 120)], output.name, { type: 'audio/wav' });
  async function save() { await storage.saveFile(outputFile(), { isGenerated: true }); await refresh(); setMessage('Loop saved to library.'); }
  async function deleteFiltered() {
    if (!window.confirm(`Delete ${visible.length} samples from the library?`)) return;
    for (const file of visible) await storage.deleteFile(file.id);
    await refresh();
  }
  async function zip() { const archive = new JSZip(); for (const [i, file] of visible.entries()) archive.file(`${i + 1}-${file.name}`, file); download(await archive.generateAsync({ type: 'blob' }), 'looplicator-samples.zip'); }
  return <div className="app">
    <header><img src={`${import.meta.env.BASE_URL}looplicator.png`} alt=""/><div><h1>Looplicator</h1><span>Loop laboratory / entirely in your browser</span></div><span className="badge">v{__APP_VERSION__} · RUST + WASM</span></header>
    <div className="layout"><aside><div className="row"><h2>Sample library</h2><label className="button">+ Add files<input type="file" accept=".wav,audio/wav" multiple hidden onChange={upload}/></label></div>
      <p className="muted">{files.length} samples · {usage ? `${(usage.used / 1048576).toFixed(1)} MB stored` : 'Local storage'}</p>
      <nav>{['all', 'uploaded', 'generated', 'favorite'].map(value => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value}</button>)}</nav>
      <div className="files">{!visible.length && <p className="empty">Add three WAV samples to start making loops.</p>}{visible.map(file => <LibraryFile key={file.id} file={file} onDelete={() => report(async () => { await storage.deleteFile(file.id); await refresh(); })} onFavorite={() => report(async () => { await storage.updateFileFavorite(file.id, !file.favorite); await refresh(); })}/>)}</div>
      <button disabled={!visible.length} onClick={() => report(zip)}>Download filtered samples as ZIP</button><button disabled={!visible.length} onClick={() => report(deleteFiltered)}>Delete filtered samples</button>
    </aside><main><section><div className="row"><h2>Generator</h2><span className="muted">01 / COMPOSE</span></div>
      <div className="controls"><label>Mixer<select value={blender} disabled={random || busy} onChange={e => setBlender(e.target.value)}>{catalog.blenders.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>Post effect<select value={effect} disabled={busy} onChange={e => setEffect(e.target.value)}><option value="">None</option>{catalog.effects.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>Seed<input value={seed} disabled={busy} placeholder="Random" onChange={e => setSeed(e.target.value)}/></label></div>
      <label className="check"><input type="checkbox" checked={random} disabled={busy} onChange={e => setRandom(e.target.checked)}/> Random mixer</label>
      {random && <div className="mixers">{catalog.blenders.map(name => <label className="check" key={name}><input type="checkbox" checked={enabled.includes(name)} disabled={busy} onChange={e => setEnabled(e.target.checked ? [...enabled, name] : enabled.filter(n => n !== name))}/>{name}</label>)}</div>}
      <div className="tempo"><label>Playback tempo · {bpm} BPM<input type="range" min="40" max="200" value={bpm} disabled={locked} onChange={e => setBpm(Number(e.target.value))}/></label><label className="check"><input type="checkbox" checked={locked} onChange={e => setLocked(e.target.checked)}/> Lock</label><label className="check"><input type="checkbox" checked={randomBpm} disabled={locked} onChange={e => setRandomBpm(e.target.checked)}/> Random BPM</label>{randomBpm && <div className="row">{range.map((value, i) => <label key={i}>{i ? 'Max' : 'Min'}<input type="number" min="40" max="200" value={value} disabled={locked} onChange={e => { const next = [...range]; next[i] = Math.max(40, Math.min(200, Number(e.target.value))); if (next[0] > next[1]) next[1 - i] = next[i]; setRange(next); }}/></label>)}</div>}</div>
      <div className="row"><button className="primary" disabled={!ready || busy || visible.length < 3} onClick={() => generate()}>Generate loop →</button>{busy && <button onClick={cancel}>Cancel processing</button>}</div><p role="status" className="status">{message}</p>
    </section><section><div className="row"><h2>Loop output</h2><span className="muted">02 / LISTEN</span></div><canvas ref={canvas} width="1000" height="160" aria-label="Generated loop waveform"/>{output ? <><p className="muted">{output.name}</p><audio controls loop src={output.url} ref={el => { if (el) { el.preservesPitch = false; el.playbackRate = bpm / 120; } }}/><div className="actions"><button onClick={() => download(outputFile(), output.name)}>Download WAV</button><button onClick={() => report(save)}>Save to library</button><button disabled={busy || !effect} onClick={() => generate(true)}>Apply selected effect</button></div></> : <p className="empty">Your next loop starts with three samples.</p>}</section>
    <p className="muted">WAV inputs up to 60 seconds / 40 MB each. Processing stops after 60 seconds. Tempo changes speed and pitch, assuming a 120 BPM source.</p></main></div>
  </div>;
}
function LibraryFile({ file, onDelete, onFavorite }) {
  const [url, setUrl] = useState(undefined);
  useEffect(() => { const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return <article><div className="row"><span className="filename" title={file.name}>{file.name}</span><button onClick={onFavorite} aria-label={file.favorite ? 'Remove favorite' : 'Favorite'}>{file.favorite ? '★' : '☆'}</button><button onClick={onDelete} aria-label={`Delete ${file.name}`}>×</button></div><audio controls preload="none" src={url}/></article>;
}
createRoot(document.getElementById('root')).render(<App/>);
