import React, { useEffect, useRef } from 'react';
import { IconButton } from './Icon.jsx';
import { readSupportPreferences, saveSupportPreferences, recordSupportGeneration, supportPromptDue, SUPPORT_STORAGE_KEY } from '../services/support-prompt.js';

export function SupportPrompt({ blocked, generationCount }) {
  const dialog = useRef(null), preferences = useRef(null), requested = useRef(false), counted = useRef(generationCount);
  if (!preferences.current) preferences.current = readSupportPreferences();
  useEffect(() => { saveSupportPreferences(preferences.current); }, []);
  useEffect(() => {
    while (counted.current < generationCount) {
      preferences.current = recordSupportGeneration(preferences.current);
      counted.current++;
    }
    saveSupportPreferences(preferences.current);
  }, [generationCount]);
  useEffect(() => {
    function check() {
      if (dialog.current.open || blocked || document.hidden || document.querySelector('dialog[open]')) return;
      if (!requested.current && !supportPromptDue(preferences.current)) return;
      requested.current = false;
      preferences.current = { ...preferences.current, generatedSincePrompt: 0 };
      saveSupportPreferences(preferences.current);
      dialog.current.showModal();
    }
    function hashChanged() {
      if (location.hash.toLowerCase() === '#support' && !dialog.current.open) requested.current = true;
      check();
    }
    function storageChanged(event) {
      if (event.key !== SUPPORT_STORAGE_KEY) return;
      preferences.current = readSupportPreferences();
      if (preferences.current.supported) dialog.current.close();
      else check();
    }
    hashChanged();
    window.addEventListener('hashchange', hashChanged);
    window.addEventListener('storage', storageChanged);
    document.addEventListener('visibilitychange', check);
    document.addEventListener('close', check, true);
    return () => {
      window.removeEventListener('hashchange', hashChanged);
      window.removeEventListener('storage', storageChanged);
      document.removeEventListener('visibilitychange', check);
      document.removeEventListener('close', check, true);
    };
  }, [blocked, generationCount]);
  function close(supported = false) {
    preferences.current = { ...preferences.current, generatedSincePrompt: 0, supported: supported || preferences.current.supported };
    saveSupportPreferences(preferences.current);
    requested.current = false;
    dialog.current.close();
    if (location.hash.toLowerCase() === '#support') history.replaceState(history.state, '', location.pathname + location.search);
  }
  return <dialog ref={dialog} className="support-dialog" aria-labelledby="support-title" aria-describedby="support-description" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="row"><h2 id="support-title">Enjoying Looplicator?</h2><IconButton icon="close" label="Close support prompt" onClick={() => close()}/></div>
    <p id="support-description">Have you considered supporting the project? Buying a pack helps keep Looplicator growing and puts more sounds in your hands.</p>
    <div className="support-links"><a className="button" href="https://www.looplicator.com/loops" target="_blank" rel="noopener noreferrer">Packs on looplicator.com</a><a className="button" href="https://looplicator.bandcamp.com/music" target="_blank" rel="noopener noreferrer">Packs on Bandcamp</a></div>
    <p className="muted">Already bought a pack? Thank you! Just let us know below and we won’t ask again.</p>
    <div className="actions"><button type="button" onClick={() => close(true)}>I’ve already supported</button><button type="button" onClick={() => close()}>Maybe later</button></div>
  </dialog>;
}
