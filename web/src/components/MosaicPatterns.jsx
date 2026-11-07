import React, { useLayoutEffect, useRef, useState } from 'react';
import { validPattern } from '../services/mosaic-patterns.js';

export function MosaicPatterns({ patterns, settings, onChange, onPreview, previewDisabled, disabled }) {
  const [draft, setDraft] = useState(''), [editing, setEditing] = useState(null), [error, setError] = useState('');
  const [newPatterns, setNewPatterns] = useState([]);
  const list = useRef(null), scrollToPattern = useRef(null);
  useLayoutEffect(() => {
    if (!scrollToPattern.current) return;
    const row = [...list.current.children].find(row => row.dataset.pattern === scrollToPattern.current);
    if (row) {
      const container = list.current;
      container.scrollTop += row.getBoundingClientRect().top - container.getBoundingClientRect().top - (container.clientHeight - row.offsetHeight) / 2;
      scrollToPattern.current = null;
    }
  }, [patterns]);
  const selected = patterns.filter(pattern => !settings.excluded.includes(pattern));
  function save(event) {
    event.preventDefault();
    const pattern = draft.trim();
    if (!validPattern(pattern)) return setError('Use 1–256 lowercase letters and underscores, with at least one letter.');
    if (patterns.includes(pattern) && pattern !== editing) return setError('That pattern already exists.');
    setNewPatterns(previous => editing
      ? previous.map(value => value === editing ? pattern : value)
      : [...previous, pattern]);
    scrollToPattern.current = pattern;
    onChange({ custom: [...settings.custom.filter(p => p !== editing), pattern], excluded: settings.excluded.filter(p => p !== editing && p !== pattern) });
    setDraft(''); setEditing(null); setError('');
  }
  function preview() {
    const pattern = draft.trim();
    if (!validPattern(pattern)) return setError('Use 1–256 lowercase letters and underscores, with at least one letter.');
    setError('');
    onPreview(pattern);
  }
  return <details className="mosaic-patterns"><summary>Mosaic patterns · {selected.length} / {patterns.length} selected</summary>
    <p className="muted">Each letter repeats a sample slice; _ adds silence. One selected pattern is picked per mosaic. Preview shows the steps on the waveform and skips extra FX.</p>
    <fieldset disabled={disabled}>
      <div className="actions"><button type="button" aria-pressed={selected.length === patterns.length} onClick={() => onChange({ ...settings, excluded: selected.length === patterns.length ? patterns : [] })}>{selected.length === patterns.length ? 'Clear selection' : 'Select all'}</button></div>
      <div className="pattern-list" ref={list}>{patterns.map(pattern => <div className="pattern-row" data-pattern={pattern} key={pattern}>
        <label className="check"><input type="checkbox" checked={!settings.excluded.includes(pattern)} onChange={event => onChange({ ...settings, excluded: event.target.checked ? settings.excluded.filter(p => p !== pattern) : [...settings.excluded, pattern] })}/><code>{pattern}</code>{newPatterns.includes(pattern) && <span className="pattern-new-chip">New</span>}</label>
        {settings.custom.includes(pattern) && <div className="actions"><button type="button" onClick={() => { setEditing(pattern); setDraft(pattern); setError(''); }}>Edit</button><button type="button" aria-label={`Delete pattern ${pattern}`} onClick={() => { setNewPatterns(previous => previous.filter(value => value !== pattern)); onChange({ custom: settings.custom.filter(p => p !== pattern), excluded: settings.excluded.filter(p => p !== pattern) }); if (editing === pattern) { setEditing(null); setDraft(''); } }}>Delete</button></div>}
      </div>)}</div>
      <form onSubmit={save}><div className="pattern-editor"><label>{editing ? 'Edit custom pattern' : 'New custom pattern'}<input aria-label="Custom pattern" value={draft} placeholder="a_b_ac_b" maxLength={256} onChange={event => setDraft(event.target.value)}/></label><div className="actions"><button type="submit">{editing ? 'Save pattern' : 'Add pattern'}</button><button type="button" disabled={previewDisabled} onClick={preview}>Preview pattern</button>{editing && <button type="button" onClick={() => { setEditing(null); setDraft(''); setError(''); }}>Cancel edit</button>}</div></div>{error && <p role="alert">{error}</p>}</form>
    </fieldset>
  </details>;
}
