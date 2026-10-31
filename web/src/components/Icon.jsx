import React from 'react';

const paths = {
  infinity: 'M12 12C9 8 7.5 6.5 5.5 6.5a5.5 5.5 0 0 0 0 11C8 17.5 10 14 12 12s4-5.5 6.5-5.5a5.5 5.5 0 0 1 0 11C16.5 17.5 15 16 12 12Z',
  loopFx: 'M12 13C9 9 7.5 7.5 5.5 7.5a4.5 4.5 0 0 0 0 9C8 16.5 10 15 12 13s4-5.5 6.5-5.5a4.5 4.5 0 0 1 0 9C16.5 16.5 15 17 12 13ZM20 1v4m-2-2h4',
  loader: 'M21 12a9 9 0 1 1-9-9',
  check: 'm5 12 4 4L19 6',
  play: 'm8 5 11 7-11 7Z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6 6h12v12H6Z',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
  save: 'M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  wave: 'M3 10v4m4-8v12m5-15v18m5-15v12m4-8v4',
  shuffle: 'M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 4-3 6-6s4-6 6-6h3m-4-4 4 4-4 4',
  lock: 'M6 10h12v11H6ZM8 10V7a4 4 0 0 1 8 0v3',
  unlock: 'M6 10h12v11H6ZM8 10V7a4 4 0 0 1 7-2.6',
  sparkles: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4',
  close: 'm6 6 12 12M6 18 18 6',
  repeat: 'm17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3',
  volume: 'm11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  mute: 'm11 4-6 5H2v6h3l6 5Zm5 5 6 6m-6 0 6-6',
};
export function Icon({ name }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.wave}/></svg>;
}
export function IconButton({ icon, label, className = '', shortcut, ...props }) {
  return <button type="button" className={`icon-button ${className}`} title={shortcut ? `${label} (${shortcut.toUpperCase()})` : label} aria-label={label} aria-keyshortcuts={shortcut} {...props}><Icon name={icon}/></button>;
}
