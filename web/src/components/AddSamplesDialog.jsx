import React, { useEffect, useRef, useState } from 'react';
import { Icon, IconButton } from './Icon.jsx';
import { fetchStoreCatalog, randomStorePack } from '../services/looplicator-store.js';

export function AddSamplesDialog({ onClose, onComputer, onLoadPack, progress, minimized, onMinimize, onRestore }) {
  const dialog = useRef(null), importController = useRef(null);
  const [source, setSource] = useState(''), [packs, setPacks] = useState(null), [selected, setSelected] = useState('');
  const [error, setError] = useState(''), [retry, setRetry] = useState(0), [loading, setLoading] = useState(false), [result, setResult] = useState(null);
  useEffect(() => {
    return () => importController.current?.abort();
  }, []);
  useEffect(() => {
    if (minimized) dialog.current.close();
    else if (!dialog.current.open) dialog.current.showModal();
  }, [minimized]);
  useEffect(() => {
    if (source !== 'store') return;
    const controller = new AbortController();
    setError(''); setPacks(null);
    fetchStoreCatalog(controller.signal).then(setPacks).catch(error => {
      if (!controller.signal.aborted) setError(`Unable to load the store. ${error.message}`);
    });
    return () => controller.abort();
  }, [source, retry]);
  function close() { if (loading) onMinimize(); else onClose(); }
  useEffect(() => {
    dialog.current.querySelector('input[name="store-pack"]:checked')?.closest('label')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  async function load(pack = packs.find(pack => pack.id === selected)) {
    if (!pack || !pack.trackCount || loading) return;
    setSelected(pack.id);
    const controller = new AbortController();
    importController.current = controller;
    setLoading(true); setResult(null); setError(''); onMinimize();
    try { setResult(await onLoadPack(pack, controller.signal)); }
    catch (error) { if (!controller.signal.aborted) setError(error.message); }
    finally { setLoading(false); }
  }
  const resultText = result ? `${result.cancelled ? 'Loading stopped.' : 'Pack processed.'} ${result.added} added${result.skipped ? ` · ${result.skipped} already in library` : ''}${result.failures.length ? ` · ${result.failures.length} failed` : ''}.` : '';
  return <><dialog className="add-samples-dialog" ref={dialog} aria-labelledby="add-samples-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="row"><h2 id="add-samples-title">{source === 'store' ? 'Looplicator store' : 'Add samples'}</h2><IconButton icon="close" label="Close add samples" onClick={close}/></div>
    {!source ? <div className="sample-sources"><button type="button" onClick={() => { onComputer(); close(); }}>Load from my computer</button><button type="button" onClick={() => setSource('store')}>Load from Looplicator store</button></div> : <>
      <p className="muted">Choose a pack. Tracks are downloaded and added to your library as WAVs, one at a time.</p>
      {!packs && !error && <p role="status">Loading packs…</p>}
      {error && <div role="alert"><p>{error}</p>{!packs && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry catalog</button>}</div>}
      {packs && <>
        <fieldset className="store-packs" disabled={loading} aria-label="Store packs"><legend className="sr-only">Choose one pack</legend>
          {!packs.length && <p>No packs are available.</p>}
          {packs.map(pack => <label className={`store-pack ${selected === pack.id ? 'selected' : ''}`} key={pack.id}>
            <input type="radio" name="store-pack" value={pack.id} checked={selected === pack.id} disabled={!pack.trackCount} onChange={() => { setSelected(pack.id); setResult(null); }}/>
            <PackThumbnail key={pack.thumbnail} url={pack.thumbnail}/>
            <span><strong>{pack.title}</strong><span className="muted">{pack.id} · {pack.trackCount} {pack.trackCount === 1 ? 'track' : 'tracks'}{!pack.trackCount && ' · No MP3 tracks'} · {pack.price === 0 ? 'Free' : 'No sample downloads'}</span></span>
          </label>)}
        </fieldset>
        {loading && progress && <div className="upload-progress" role="status"><span><strong>{packs.find(pack => pack.id === selected)?.title}</strong> · {progress.stage} · {progress.track} · {progress.completed} / {progress.total}</span><progress aria-label="Store pack progress" value={progress.completed} max={progress.total}/></div>}
        {result && <div className="store-result" role="status"><p>{resultText}</p>{result.failures.length > 0 && <details><summary>Failed tracks</summary><ul>{result.failures.map((failure, index) => <li key={index}>{failure}</li>)}</ul><p>You can load this pack again to retry; existing tracks will be skipped.</p></details>}</div>}
        <div className="actions">{loading ? <button type="button" onClick={() => importController.current?.abort()}>Stop loading</button> : <><button type="button" disabled={!selected} onClick={() => load()}>Load selected pack</button><button type="button" disabled={!packs.some(pack => pack.trackCount)} onClick={() => load(randomStorePack(packs))}>Load random pack</button><button type="button" onClick={close}>Done</button></>}</div>
      </>}
    </>}
  </dialog>
    {minimized && <div className="store-import-progress" role="region" aria-label="Pack import">
      <strong>{packs?.find(pack => pack.id === selected)?.title || 'Store import'}</strong>
      {loading ? <><span role="status">{progress?.stage || 'Starting'} · {progress?.completed || 0} / {progress?.total || 0}</span><progress aria-label="Store pack progress" value={progress?.completed || 0} max={progress?.total || 1}/></> : <p role="status">{error || resultText}</p>}
      <div className="actions"><button type="button" onClick={onRestore}>Show details</button>{loading ? <button type="button" onClick={() => importController.current?.abort()}>Stop loading</button> : <button type="button" onClick={close}>Dismiss</button>}</div>
    </div>}
  </>;
}

function PackThumbnail({ url }) {
  const [failed, setFailed] = useState(false);
  return url && !failed
    ? <img className="store-pack-thumbnail" src={url} alt="" loading="lazy" decoding="async" width="54" height="54" onError={() => setFailed(true)}/>
    : <span className="store-pack-thumbnail placeholder" aria-hidden="true"><Icon name="grid"/></span>;
}
