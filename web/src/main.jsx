import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { Engine } from './engine.js';
import { prepareWav, encodeWav, download } from './audio.js';
import { storage } from './services/storage.js';
import { Icon, IconButton } from './components/Icon.jsx';
import { AudioPlayer } from './components/AudioPlayer.jsx';
import './style.css';

function App() {
  const engine = useRef(null);
  if (!engine.current) engine.current = new Engine();
  const context = useRef(null), operation = useRef(0), savingOutput = useRef(false);
  const [files, setFiles] = useState([]), [filter, setFilter] = useState('all');
  const [catalog, setCatalog] = useState({ blenders: [], effects: [] });
  const [blender, setBlender] = useState('mosaic'), [effect, setEffect] = useState('');
  const [random, setRandom] = useState(false), [enabled, setEnabled] = useState([]);
  const [randomFx, setRandomFx] = useState(false), [enabledFx, setEnabledFx] = useState([]);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Loading audio engine…'), [output, setOutput] = useState(null);
  const [bpm, setBpm] = useState(120), [randomBpm, setRandomBpm] = useState(false), [locked, setLocked] = useState(false);
  const [savedLoop, setSavedLoop] = useState(null), [saving, setSaving] = useState(false);
  const savedOutput = savedLoop?.url === output?.url && savedLoop?.bpm === bpm ? files.find(file => file.id === savedLoop.id) : null;
  const [range, setRange] = useState([80, 160]), [usage, setUsage] = useState(null);
  const audio = () => context.current ||= new AudioContext({ sampleRate: 44100 });
  const refresh = async () => { setFiles(await storage.getAllFiles()); setUsage(await storage.getStorageInfo()); };
  useEffect(() => {
    let active = true;
    Promise.all([engine.current.run('catalog'), storage.getAllFiles(), storage.getStorageInfo()]).then(([{ result }, saved, info]) => {
      if (!active) return;
      setCatalog(result); setEnabled(result.blenders); setEnabledFx(result.effects); setFiles(saved); setUsage(info); setReady(true); setMessage('');
    }).catch(error => active && setMessage(error.message));
    return () => { active = false; operation.current++; engine.current.cancel(); context.current?.close(); };
  }, []);
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
    setBusy(true); setMessage('');
    try {
      audio();
      if (token !== operation.current) return;
      const choices = !fxOnly && random ? enabled : [blender];
      if (!choices.length) throw new Error('Select at least one mixer for random selection.');
      const chosen = choices[Math.floor(Math.random() * choices.length)];
      const fxChoices = randomFx ? enabledFx : [effect];
      if (!fxChoices.length) throw new Error('Select at least one FX for random selection.');
      const chosenFx = fxChoices[Math.floor(Math.random() * fxChoices.length)];
      const selectedSeed = String(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
      let response;
      if (fxOnly) {
        response = await engine.current.run('effect', { wav: output.bytes.slice(), seed: selectedSeed, effect: chosenFx });
      } else {
        if (visible.length < 3) throw new Error('Add at least three samples to the current filter.');
        const pool = [...visible];
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        const wavs = [];
        for (const file of pool.slice(0, 3)) {
          wavs.push(await prepareWav(file, audio()));
          if (token !== operation.current) return;
        }
        response = await engine.current.run('blend', { wavs, seed: selectedSeed, blender: chosen, effect: chosenFx }, wavs.map(wav => wav.buffer));
      }
      if (token !== operation.current) return;
      const buffer = await audio().decodeAudioData(response.result.slice().buffer);
      if (token !== operation.current) return;
      const bytes = response.result, blob = new Blob([bytes], { type: 'audio/wav' });
      setOutput({ bytes, buffer, url: URL.createObjectURL(blob), name: `generated-${fxOnly ? chosenFx : chosen}-${selectedSeed}.wav` });
      if (random && !fxOnly) setBlender(chosen);
      if (randomFx) setEffect(chosenFx);
      if (randomBpm && !locked) setBpm(Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0]);
      setMessage('');
    } catch (error) { if (token === operation.current) setMessage(error.message); }
    finally { if (token === operation.current) setBusy(false); }
  }
  const cancel = () => { operation.current++; engine.current.cancel(); setBusy(false); setMessage('Processing cancelled.'); };
  const outputFile = () => new File([encodeWav(output.buffer, bpm / 120)], output.name, { type: 'audio/wav' });
  async function save(favorite = savedOutput?.favorite || false) {
    if (savingOutput.current) return;
    savingOutput.current = true; setSaving(true);
    const current = output, tempo = bpm;
    try {
      const file = outputFile();
      if (savedOutput) Object.defineProperty(file, 'id', { value: savedOutput.id });
      const saved = await storage.saveFile(file, { isGenerated: true, favorite });
      setSavedLoop({ url: current.url, bpm: tempo, id: saved.id });
      await refresh();
      setMessage('');
    } finally { savingOutput.current = false; setSaving(false); }
  }
  useEffect(() => {
    function onShortcut(event) {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'f' && ready && !busy && visible.length >= 3) {
        event.preventDefault();
        generate();
      } else if ((key === 's' || key === 'x') && output && !busy && !saving) {
        event.preventDefault();
        report(() => key === 'x' ? save(true) : save());
      }
    }
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  });
  async function deleteFiltered() {
    if (!window.confirm(`Delete ${visible.length} samples from the library?`)) return;
    for (const file of visible) await storage.deleteFile(file.id);
    await refresh();
  }
  async function zip() { const archive = new JSZip(); for (const [i, file] of visible.entries()) archive.file(`${i + 1}-${file.name}`, file); download(await archive.generateAsync({ type: 'blob' }), 'looplicator-samples.zip'); }
  return <div className="app">
    <header><img src={`${import.meta.env.BASE_URL}looplicator.png`} alt=""/><div><h1>Looplicator DAW</h1><span>Feed the loop. Fuel the machine.</span></div><div className="header-links"><a href="/news/">News</a><span className="badge">v{__APP_VERSION__}</span></div></header>
    <div className="layout"><aside><div className="row"><h2>Sample library</h2><label className="button icon-button upload-button" role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.querySelector('input').click(); } }} title="Add files" aria-label="Add files"><Icon name="plus"/><input aria-label="Add audio files" type="file" accept=".wav,audio/wav" multiple hidden onChange={upload}/></label></div>
      <p className="muted">{files.length} samples · {usage ? `${(usage.used / 1048576).toFixed(1)} MB stored` : 'Local storage'}</p>
      <nav>{['all', 'uploaded', 'generated', 'favorite'].map(value => <IconButton key={value} icon={{all: 'grid', uploaded: 'upload', generated: 'wave', favorite: 'star'}[value]} label={{all: 'All samples', uploaded: 'Uploaded samples', generated: 'Generated samples', favorite: 'Favorite samples'}[value]} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}/>)}</nav>
      <div className="files">{!visible.length && <p className="empty">Add three WAV samples to start making loops.</p>}{visible.map(file => <LibraryFile key={file.id} file={file} onError={setMessage} onDelete={() => report(async () => { await storage.deleteFile(file.id); await refresh(); })} onFavorite={() => report(async () => { await storage.updateFileFavorite(file.id, !file.favorite); await refresh(); })}/>)}</div>
      <div className="actions library-actions"><IconButton icon="download" label="Download filtered samples as ZIP" disabled={!visible.length} onClick={() => report(zip)}/><IconButton icon="trash" label="Delete filtered samples" disabled={!visible.length} onClick={() => report(deleteFiltered)}/></div>
    </aside><main><section className="generator-section" aria-label="Generator">
      <div className="controls">
        <div className="selector-group">
          <div className="mixer-control"><label>Mixer<select aria-label="Mixer" value={blender} disabled={random || busy} onChange={e => setBlender(e.target.value)}>{catalog.blenders.map(name => <option key={name}>{name}</option>)}</select></label><IconButton icon="shuffle" label="Random mixer" aria-pressed={random} aria-expanded={random} aria-controls="mixer-choices" className={random ? 'active' : ''} disabled={busy} onClick={() => setRandom(!random)}/></div>
          {random && <fieldset id="mixer-choices" className="choice-options" aria-label="Random mixer choices">{catalog.blenders.map(name => <label className="check" key={name}><input type="checkbox" checked={enabled.includes(name)} disabled={busy} onChange={e => setEnabled(e.target.checked ? [...enabled, name] : enabled.filter(n => n !== name))}/>{name}</label>)}</fieldset>}
        </div>
        <div className="selector-group">
          <div className="mixer-control"><label>FX<select aria-label="FX" value={effect} disabled={randomFx || busy} onChange={e => setEffect(e.target.value)}><option value="">None</option>{catalog.effects.map(name => <option key={name}>{name}</option>)}</select></label><IconButton icon="shuffle" label="Random FX" aria-pressed={randomFx} aria-expanded={randomFx} aria-controls="fx-choices" className={randomFx ? 'active' : ''} disabled={busy} onClick={() => setRandomFx(!randomFx)}/></div>
          {randomFx && <fieldset id="fx-choices" className="choice-options" aria-label="Random FX choices">{catalog.effects.map(name => <label className="check" key={name}><input type="checkbox" checked={enabledFx.includes(name)} disabled={busy} onChange={e => setEnabledFx(e.target.checked ? [...enabledFx, name] : enabledFx.filter(n => n !== name))}/>{name}</label>)}</fieldset>}
        </div>
      </div>
      <div className="tempo"><div className="tempo-main"><label>Playback tempo · {bpm} BPM<input type="range" min="40" max="200" value={bpm} disabled={locked} onChange={e => setBpm(Number(e.target.value))}/></label><div className="actions tempo-actions"><IconButton icon={locked ? 'lock' : 'unlock'} label="Lock tempo" aria-pressed={locked} className={locked ? 'active' : ''} onClick={() => setLocked(!locked)}/><IconButton icon="shuffle" label="Random BPM" aria-pressed={randomBpm} className={randomBpm ? 'active' : ''} disabled={locked} onClick={() => setRandomBpm(!randomBpm)}/></div></div>{randomBpm && <div className="row">{range.map((value, i) => <label key={i}>{i ? 'Max' : 'Min'}<input type="number" min="40" max="200" value={value} disabled={locked} onChange={e => { const next = [...range]; next[i] = Math.max(40, Math.min(200, Number(e.target.value))); if (next[0] > next[1]) next[1 - i] = next[i]; setRange(next); }}/></label>)}</div>}</div>
      <div className="row"><IconButton icon="infinity" shortcut="f" label={busy ? 'Generating loop' : 'Generate loop'} className={`primary loop-generator ${busy ? 'processing' : ''}`} disabled={!ready || busy || visible.length < 3} onClick={() => generate()}/>{busy && <IconButton icon="close" label="Cancel processing" onClick={cancel}/>}</div><p role="status" className={message ? 'status' : 'sr-only'}>{message}</p>
    </section><section className="output-section" aria-label="Loop output">{output ? <>
      <AudioPlayer key={output.url} src={output.url} name="loop output" autoPlay buffer={output.buffer} rate={bpm / 120} onError={setMessage}/>
      <div className="output-footer"><p className="muted output-name" title={output.name}>{output.name}</p><div className="actions"><IconButton icon="download" label="Download WAV" onClick={() => download(outputFile(), output.name)}/><IconButton icon="save" shortcut="s" label="Save to library" disabled={saving} onClick={() => report(() => save())}/><IconButton icon="star" shortcut="x" label={savedOutput?.favorite ? 'Remove output from favorites' : 'Favorite loop output'} aria-pressed={Boolean(savedOutput?.favorite)} className={savedOutput?.favorite ? 'active favorite' : ''} disabled={saving} onClick={() => report(() => save(!savedOutput?.favorite))}/><IconButton icon="loopFx" label="Apply selected effect" disabled={busy || (!randomFx && !effect)} onClick={() => generate(true)}/></div></div>
    </> : <p className="empty">Your next loop starts with three samples.</p>}</section>
    </main></div>
  </div>;
}
function LibraryFile({ file, onDelete, onFavorite, onError }) {
  const [url, setUrl] = useState(undefined);
  useEffect(() => { const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return <article><div className="row"><span className="filename" title={file.name}>{file.name}</span><IconButton icon="star" label={file.favorite ? 'Remove favorite' : 'Favorite'} aria-pressed={file.favorite} className={file.favorite ? 'active favorite' : ''} onClick={onFavorite}/><IconButton icon="trash" label={`Delete ${file.name}`} onClick={onDelete}/></div><AudioPlayer key={url || file.id} src={url} name={file.name} onError={onError}/></article>;
}
createRoot(document.getElementById('root')).render(<App/>);
