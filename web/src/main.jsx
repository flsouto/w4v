import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { Engine } from './engine.js';
import { prepareWav, download } from './audio.js';
import { encodeWavAsync } from './wav-export.js';
import { fileFromRecord, withFavorite, upsertFile } from './services/library-files.js';
import { storage } from './services/storage.js';
import { Icon, IconButton } from './components/Icon.jsx';
import { AudioPlayer } from './components/AudioPlayer.jsx';
import './style.css';
import builtInPatternText from '../../src/blenders/mosaic-patterns.txt?raw';
import { loadPatternSettings, PATTERN_STORAGE_KEY } from './services/mosaic-patterns.js';
import { MosaicPatterns } from './components/MosaicPatterns.jsx';
const builtInPatterns = builtInPatternText.trim().split('\n');

function App() {
  const renderMode = import.meta.env.DEV && new URLSearchParams(location.search).has('render');
  const [renderTime, setRenderTime] = useState(renderMode ? 0 : undefined);
  const [patternSettings, setPatternSettings] = useState(() => renderMode ? { custom: [], excluded: [] } : loadPatternSettings());
  const mosaicPatterns = [...new Set([...builtInPatterns, ...patternSettings.custom])];
  function updatePatterns(settings) {
    setPatternSettings(settings);
    try { localStorage.setItem(PATTERN_STORAGE_KEY, JSON.stringify(settings)); }
    catch { setMessage('Could not save pattern settings in this browser. Changes apply for this session.'); }
  }
  const engine = useRef(null);
  if (!engine.current) engine.current = new Engine();
  const context = useRef(null), operation = useRef(0), savingOutput = useRef(false);
  const [files, setFiles] = useState([]), [filter, setFilter] = useState('all');
  const [catalog, setCatalog] = useState({ blenders: [], effects: [] });
  const [blender, setBlender] = useState(renderMode ? '' : 'mosaic'), [effect, setEffect] = useState('');
  const [random, setRandom] = useState(false), [enabled, setEnabled] = useState([]);
  const [randomFx, setRandomFx] = useState(false), [enabledFx, setEnabledFx] = useState([]);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Loading audio engine…'), [output, setOutput] = useState(null);
  const [bpm, setBpm] = useState(120), [randomBpm, setRandomBpm] = useState(false), [locked, setLocked] = useState(false);
  const [savedLoop, setSavedLoop] = useState(null), [saving, setSaving] = useState(false);
  const savedOutput = savedLoop?.url === output?.url && savedLoop?.bpm === bpm ? files.find(file => file.id === savedLoop.id) : null;
  const [range, setRange] = useState([80, 160]), [usage, setUsage] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null), [feedback, setFeedback] = useState(null);
  const [loadingLibrary, setLoadingLibrary] = useState(!renderMode);
  const libraryBusy=Boolean(uploadProgress)||loadingLibrary;
  const uploading = useRef(false), feedbackTimer = useRef(null), feedbackSequence = useRef(0);
  const notify = useCallback((kind, message, loopId) => {
    clearTimeout(feedbackTimer.current);
    setFeedback({kind,message,loopId,sequence:++feedbackSequence.current});
    feedbackTimer.current=setTimeout(()=>setFeedback(null),1800);
  }, []);
  useEffect(()=>()=>clearTimeout(feedbackTimer.current),[]);
  const audio = () => context.current ||= new AudioContext({ sampleRate: 44100 });
  const refreshUsage = useCallback(() => storage.getStorageInfo().then(setUsage).catch(error => setMessage(error.message)), []);
  useEffect(() => {
    let active = true;
    Promise.all([renderMode ? Promise.resolve({ result: { blenders: [], effects: [] } }) : engine.current.run('catalog'), renderMode ? [] : storage.getAllFiles(), renderMode ? null : storage.getStorageInfo()]).then(([{ result }, saved, info]) => {
      if (!active) return;
      setCatalog(result); setEnabled(result.blenders); setEnabledFx(result.effects); setFiles(saved); setUsage(info); setReady(true); setLoadingLibrary(false); setMessage('');
    }).catch(error => { if(active){setLoadingLibrary(false);setMessage(error.message);} });
    return () => { active = false; operation.current++; engine.current.cancel(); context.current?.close(); };
  }, []);
  useEffect(() => {
    if (!output) return;
    return () => URL.revokeObjectURL(output.url);
  }, [output]);
  useEffect(() => {
    if (!import.meta.env.DEV || !renderMode) return;
    let active = true;
    import('./render-bridge.js').then(({ createRenderBridge }) => {
      if (active) window.__looplicatorCapture = createRenderBridge({ setOutput, setFiles, setTime: setRenderTime, setBpm, setCatalog, setBlender, setEffect });
    });
    return () => { active = false; delete window.__looplicatorCapture; };
  }, [renderMode]);
  const visible = files.filter(file => filter === 'all' || (filter === 'favorite' ? file.favorite : filter === 'generated' ? file.isGenerated : !file.isGenerated));
  const report = useCallback(task => Promise.resolve().then(task).catch(error => setMessage(error.message)), []);
  const removeFile = useCallback(id => report(async () => {
    await storage.deleteFile(id);
    setFiles(previous=>previous.filter(file=>file.id!==id));
    refreshUsage();
  }), [report,refreshUsage]);
  const favoriteFile = useCallback(file => report(async () => {
    const favorite=!file.favorite;
    await storage.updateFileFavorite(file.id,favorite);
    setFiles(previous=>previous.map(item=>item.id===file.id ? withFavorite(item,favorite) : item));
    notify(favorite ? 'favorite' : 'unfavorite',favorite ? 'Added to favorites' : 'Removed from favorites',file.id);
  }), [report,notify]);
  async function upload(event) {
    const selected=[...event.target.files];event.target.value='';
    if(!selected.length || uploading.current)return;
    uploading.current=true;setUploadProgress({completed:0,total:selected.length});setMessage('');
    let added=0,lastId;const failures=[];
    try {
      for(const [index,file] of selected.entries()) {
        try {
          await prepareWav(file,audio());
          const saved=fileFromRecord(await storage.saveFile(file));
          setFiles(previous=>upsertFile(previous,saved));added++;lastId=saved.id;
        } catch(error) {failures.push(`${file.name}: ${error.message}`);}
        setUploadProgress({completed:index+1,total:selected.length});
        // Let React paint each addition before processing the next sample.
        await new Promise(resolve=>requestAnimationFrame(resolve));
      }
      if(added)notify('upload',`Added ${added} ${added===1?'loop':'loops'}`,lastId);
      if(failures.length)setMessage(failures.join('; '));
    } finally {uploading.current=false;setUploadProgress(null);refreshUsage();}
  }
  async function generate(fxOnly = false, previewPattern = null) {
    const token = ++operation.current;
    setBusy(true); setMessage('');
    try {
      audio();
      if (token !== operation.current) return;
      const choices = previewPattern ? ['mosaic'] : !fxOnly && random ? enabled : [blender];
      if (!choices.length) throw new Error('Select at least one mixer for random selection.');
      const chosen = choices[Math.floor(Math.random() * choices.length)];
      const selectedPatterns = previewPattern ? [previewPattern] : mosaicPatterns.filter(pattern => !patternSettings.excluded.includes(pattern));
      if (!fxOnly && chosen === 'mosaic' && !selectedPatterns.length) throw new Error('Select at least one mosaic pattern.');
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
        response = await engine.current.run('blend', { wavs, seed: selectedSeed, blender: chosen, effect: chosenFx, patterns: chosen === 'mosaic' ? selectedPatterns : undefined }, wavs.map(wav => wav.buffer));
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
  const outputFile = async (current = output, tempo = bpm) => new File([tempo === 120 ? current.bytes : await encodeWavAsync(current.buffer,tempo / 120)], current.name, {type:'audio/wav'});
  async function save(favorite = savedOutput?.favorite || false) {
    if (savingOutput.current) return;
    savingOutput.current = true; setSaving(true);
    const current = output, tempo = bpm;
    try {
      if (savedOutput) {
        if (savedOutput.favorite !== favorite) {
          await storage.updateFileFavorite(savedOutput.id,favorite);
          setFiles(previous=>previous.map(file=>file.id===savedOutput.id ? withFavorite(file,favorite) : file));
          notify(favorite ? 'favorite' : 'unfavorite',favorite ? 'Added to favorites' : 'Removed from favorites',savedOutput.id);
        } else notify('save','Loop is already in your library',savedOutput.id);
      } else {
        const file = await outputFile(current,tempo);
        const saved = fileFromRecord(await storage.saveFile(file,{isGenerated:true,favorite}));
        setSavedLoop({url:current.url,bpm:tempo,id:saved.id});
        setFiles(previous=>upsertFile(previous,saved));
        notify(favorite ? 'favorite' : 'save',favorite ? 'Saved to favorites' : 'Loop saved to library',saved.id);
        refreshUsage();
      }
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
    const ids = new Set(visible.map(file=>file.id));
    await storage.deleteFiles([...ids]);
    setFiles(previous=>previous.filter(file=>!ids.has(file.id)));
    refreshUsage();
  }
  async function zip() { const archive = new JSZip(); for (const [i, file] of visible.entries()) archive.file(`${i + 1}-${file.name}`, file); download(await archive.generateAsync({ type: 'blob' }), 'looplicator-samples.zip'); }
  return <div className="app" data-capture="app">
    <header data-capture="header"><img src={`${import.meta.env.BASE_URL}looplicator.png`} alt=""/><div><h1>Looplicator DAW</h1><span>Feed the loop. Fuel the machine.</span></div><div className="header-links"><a href="/news/">News</a><span className="badge">v{__APP_VERSION__}</span></div></header>
    <div className="layout"><aside><div className="row"><h2>Sample library</h2><label className="button icon-button upload-button" aria-disabled={libraryBusy} onClick={event=>{if(libraryBusy)event.preventDefault();}} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if(!libraryBusy)event.currentTarget.querySelector('input').click(); } }} title="Add files" aria-label="Add files"><span className={libraryBusy ? 'spin' : ''}><Icon name={libraryBusy ? 'loader' : 'plus'}/></span><input disabled={libraryBusy} aria-label="Add audio files" type="file" accept=".wav,audio/wav" multiple hidden onChange={upload}/></label></div>
      <p className="muted" data-capture="library-count">{visible.length} / {files.length} loops · {usage ? `${(usage.used / 1048576).toFixed(1)} MB stored` : 'Local storage'}</p>
      {loadingLibrary && <div className="upload-progress" role="status"><span>Loading your library…</span><progress aria-label="Library loading"/></div>}
      {uploadProgress && <div className="upload-progress" role="status"><span>Loading loops {uploadProgress.completed} / {uploadProgress.total}</span><progress aria-label="Loop upload progress" value={uploadProgress.completed} max={uploadProgress.total}/></div>}
      <nav>{['all', 'uploaded', 'generated', 'favorite'].map(value => <IconButton key={value} icon={{all: 'grid', uploaded: 'upload', generated: 'wave', favorite: 'star'}[value]} label={{all: 'All samples', uploaded: 'Uploaded samples', generated: 'Generated samples', favorite: 'Favorite samples'}[value]} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}/>)}</nav>
      <div className="files" data-capture="library">{!visible.length && !libraryBusy && <p className="empty">Add three WAV samples to start making loops.</p>}{visible.map(file => <LibraryFile key={file.id} file={file} highlighted={feedback?.loopId===file.id} onError={setMessage} onDelete={removeFile} onFavorite={favoriteFile}/>)}</div>
      <div className="actions library-actions"><IconButton icon="download" label="Download filtered samples as ZIP" disabled={!visible.length} onClick={() => report(zip)}/><IconButton icon="trash" label="Delete filtered samples" disabled={!visible.length} onClick={() => report(deleteFiltered)}/></div>
    </aside><main><section className="generator-section" aria-label="Generator">
      <div className="controls">
        <div className="selector-group">
          <div className="mixer-control"><label>Mixer<select aria-label="Mixer" data-capture="mixer" value={blender} disabled={renderMode || random || busy} onChange={e => setBlender(e.target.value)}>{renderMode && <option value="">CLI output</option>}{catalog.blenders.map(name => <option key={name}>{name}</option>)}</select></label><IconButton icon="shuffle" label="Random mixer" aria-pressed={random} aria-expanded={random} aria-controls="mixer-choices" className={random ? 'active' : ''} disabled={busy} onClick={() => setRandom(!random)}/></div>
          {random && <fieldset id="mixer-choices" className="choice-options" aria-label="Random mixer choices">{renderMode && <option value="">CLI output</option>}{catalog.blenders.map(name => <label className="check" key={name}><input type="checkbox" checked={enabled.includes(name)} disabled={busy} onChange={e => setEnabled(e.target.checked ? [...enabled, name] : enabled.filter(n => n !== name))}/>{name}</label>)}</fieldset>}
        </div>
        <div className="selector-group">
          <div className="mixer-control"><label>FX<select aria-label="FX" data-capture="fx" value={effect} disabled={renderMode || randomFx || busy} onChange={e => setEffect(e.target.value)}><option value="">{renderMode ? 'Not recorded' : 'None'}</option>{catalog.effects.map(name => <option key={name}>{name}</option>)}</select></label><IconButton icon="shuffle" label="Random FX" aria-pressed={randomFx} aria-expanded={randomFx} aria-controls="fx-choices" className={randomFx ? 'active' : ''} disabled={busy} onClick={() => setRandomFx(!randomFx)}/></div>
          {randomFx && <fieldset id="fx-choices" className="choice-options" aria-label="Random FX choices">{catalog.effects.map(name => <label className="check" key={name}><input type="checkbox" checked={enabledFx.includes(name)} disabled={busy} onChange={e => setEnabledFx(e.target.checked ? [...enabledFx, name] : enabledFx.filter(n => n !== name))}/>{name}</label>)}</fieldset>}
        </div>
      </div>
      {!renderMode && (blender === 'mosaic' || (random && enabled.includes('mosaic'))) && <MosaicPatterns patterns={mosaicPatterns} settings={patternSettings} onChange={updatePatterns} onPreview={pattern => generate(false, pattern)} previewDisabled={!ready || visible.length < 3} disabled={busy}/>}
      <div className="tempo"><div className="tempo-main"><label>Playback tempo · {bpm} BPM<input type="range" data-capture="tempo" min={renderMode ? Math.min(40, bpm) : 40} max={renderMode ? Math.max(200, bpm) : 200} value={bpm} disabled={locked} onChange={e => setBpm(Number(e.target.value))}/></label><div className="actions tempo-actions"><IconButton icon={locked ? 'lock' : 'unlock'} label="Lock tempo" aria-pressed={locked} className={locked ? 'active' : ''} onClick={() => setLocked(!locked)}/><IconButton icon="shuffle" label="Random BPM" aria-pressed={randomBpm} className={randomBpm ? 'active' : ''} disabled={locked} onClick={() => setRandomBpm(!randomBpm)}/></div></div>{randomBpm && <div className="row">{range.map((value, i) => <label key={i}>{i ? 'Max' : 'Min'}<input type="number" min="40" max="200" value={value} disabled={locked} onChange={e => { const next = [...range]; next[i] = Math.max(40, Math.min(200, Number(e.target.value))); if (next[0] > next[1]) next[1 - i] = next[i]; setRange(next); }}/></label>)}</div>}</div>
      <div className="row"><IconButton icon="infinity" shortcut="f" label={busy ? 'Generating loop' : 'Generate loop'} className={`primary loop-generator ${busy ? 'processing' : ''}`} disabled={!ready || busy || visible.length < 3} onClick={() => generate()}/>{busy && <IconButton icon="close" label="Cancel processing" onClick={cancel}/>}</div><p role="status" className={message ? 'status' : 'sr-only'}>{message}</p>
    </section><section className="output-section" data-capture="output" aria-label="Loop output">{output ? <>
      <AudioPlayer key={output.url} src={output.url} name="loop output" autoPlay={!renderMode} renderTime={renderTime} buffer={output.buffer} rate={renderMode ? 1 : bpm / 120} onError={setMessage}/>
      <div className="output-footer"><p className="muted output-name" title={output.name}>{output.name}</p><div className="actions"><IconButton icon="download" label="Download WAV" onClick={() => report(async()=>download(await outputFile(),output.name))}/><IconButton className={feedback?.kind==='save' && feedback.loopId===savedOutput?.id ? 'is-flashing' : ''} icon="save" shortcut="s" label="Save to library" disabled={saving} onClick={() => report(() => save())}/><IconButton icon="star" shortcut="x" label={savedOutput?.favorite ? 'Remove output from favorites' : 'Favorite loop output'} aria-pressed={Boolean(savedOutput?.favorite)} className={`${savedOutput?.favorite ? 'active favorite' : ''} ${feedback?.kind==='favorite' && feedback.loopId===savedOutput?.id ? 'is-flashing' : ''}`} disabled={saving} onClick={() => report(() => save(!savedOutput?.favorite))}/><IconButton icon="loopFx" label="Apply selected effect" disabled={busy || (!randomFx && !effect)} onClick={() => generate(true)}/></div></div>
    </> : <p className="empty">Your next loop starts with three samples.</p>}</section>
    </main></div>
    {feedback && <div key={feedback.sequence} className="feedback-toast" role="status"><Icon name={feedback.kind==='favorite' ? 'star' : 'check'}/><span>{feedback.message}</span></div>}
  </div>;
}
const LibraryFile = memo(function LibraryFile({ file, highlighted, onDelete, onFavorite, onError }) {
  const [url, setUrl] = useState(undefined);
  const audioSource = file.audioSource || file;
  useEffect(() => { const next = file.previewUrl || URL.createObjectURL(audioSource); setUrl(next); return () => { if (!file.previewUrl) URL.revokeObjectURL(next); }; }, [audioSource, file.previewUrl]);
  return <article className={highlighted ? 'recently-updated' : ''} data-capture="library-item" data-loop-id={file.id}><div className="row"><span className="filename" data-capture="library-name" title={file.name}>{file.name}</span><IconButton icon="star" label={file.favorite ? 'Remove favorite' : 'Favorite'} aria-pressed={file.favorite} className={file.favorite ? 'active favorite' : ''} onClick={() => onFavorite(file)}/><IconButton icon="trash" label={`Delete ${file.name}`} onClick={() => onDelete(file.id)}/></div><AudioPlayer key={url || file.id} src={url} name={file.name} durationHint={file.duration} onError={onError}/></article>;
});
createRoot(document.getElementById('root')).render(<App/>);
