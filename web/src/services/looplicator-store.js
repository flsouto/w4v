export const STORE_URL = 'https://looplipacker.s3.amazonaws.com/looplishop.json';
const catalogPath = typeof __STORE_CATALOG_PATH__ === 'string' ? __STORE_CATALOG_PATH__ : 'store/catalog.json';
export const COMPILED_STORE_URL = `${import.meta.env?.BASE_URL ?? '/'}${catalogPath}`;
let cachedCatalog;
const MAX_TRACK_BYTES = 40 * 1024 * 1024;

function mediaUrl(value) {
  try {
    const url = new URL(value, STORE_URL);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.hostname === 'looplipacker.s3.amazonaws.com') url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}

export function parseStoreCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The store returned an invalid pack catalog.');
  return Object.entries(value).filter(([date, pack]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && pack && typeof pack === 'object').map(([date, pack]) => {
    const seen = new Set();
    const tracks = (Array.isArray(pack.tracks) ? pack.tracks : []).flatMap((track, index) => {
      const url = typeof track?.url === 'string' ? mediaUrl(track.url) : null;
      if (!url || !new URL(url).pathname.toLowerCase().endsWith('.mp3') || seen.has(url)) return [];
      seen.add(url);
      return [{ title: typeof track.title === 'string' && track.title.trim() ? track.title.trim() : `Track ${index + 1}`, url }];
    });
    const thumbnail = [pack.thumbs?.['280'], pack.thumbs?.['400'], pack.thumbs?.['650'], pack.cover_url]
      .filter(value => typeof value === 'string' && value.trim()).map(mediaUrl).find(Boolean) || null;
    return { price: typeof pack.price === 'number' && Number.isFinite(pack.price) && pack.price >= 0 ? pack.price : null, thumbnail, id: date, title: typeof pack.title === 'string' && pack.title.trim() ? pack.title.trim() : date, tracks };
  }).sort((a, b) => b.id.localeCompare(a.id));
}

export function randomStorePack(packs, random = Math.random) {
  const available = packs.filter(pack => (pack.trackCount ?? pack.tracks?.length ?? 0) > 0);
  return available.length ? available[Math.floor(random() * available.length)] : null;
}

export async function fetchStoreCatalog(signal, fetcher = fetch) {
  signal?.throwIfAborted();
  if (fetcher === fetch && cachedCatalog) return cachedCatalog;
  const response = await fetcher(COMPILED_STORE_URL, { signal });
  if (!response.ok) throw new Error(`Could not load the store catalog (HTTP ${response.status}).`);
  const packs = await response.json();
  if (!Array.isArray(packs) || packs.some(pack => !pack || typeof pack.id !== 'string' || typeof pack.title !== 'string' || !Number.isSafeInteger(pack.trackCount) || pack.trackCount < 0 || !/^packs\/[a-zA-Z0-9-]+\.json$/.test(pack.tracksPath))) throw new Error('The compiled store catalog is invalid.');
  if (fetcher === fetch) cachedCatalog = packs;
  return packs;
}

export async function fetchStoreTracks(pack, signal, fetcher = fetch) {
  signal?.throwIfAborted();
  if (!/^packs\/[a-zA-Z0-9-]+\.json$/.test(pack.tracksPath)) throw new Error('Invalid compiled pack path.');
  const path = `${COMPILED_STORE_URL.slice(0, COMPILED_STORE_URL.lastIndexOf('/') + 1)}${pack.tracksPath}`;
  const response = await fetcher(path, { signal });
  if (!response.ok) throw new Error(`Could not load pack tracks (HTTP ${response.status}).`);
  const tracks = await response.json();
  if (!Array.isArray(tracks) || tracks.length !== pack.trackCount || tracks.some(track => !track || typeof track.title !== 'string' || typeof track.url !== 'string' || !/^https?:\/\//.test(track.url))) throw new Error('The compiled pack track list is invalid.');
  return tracks;
}

export const storeTrackId = (pack, track) => `store:${pack.id}:${track.url}`;
export const storeTrackName = (pack, track) => `${pack.id} - ${track.title.replace(/[\\/\u0000-\u001f]/g, '-').replace(/\.(mp3|wav)$/i, '')}`;

// Process one track at a time: downloaded MP3s and decoded buffers are never
// accumulated for an entire pack. Completed WAVs appear in the library immediately.
export async function importStorePack(pack, { signal, existingIds = new Set(), convert, save, onAdded = () => {}, onProgress = () => {}, fetcher = fetch, yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)) }) {
  const result = { added: 0, skipped: 0, failures: [], cancelled: false };
  let tracks;
  try { tracks = Array.isArray(pack.tracks) ? pack.tracks : await fetchStoreTracks(pack, signal, fetcher); }
  catch (error) { if (signal.aborted) return { ...result, cancelled: true }; throw error; }
  for (const [index, track] of tracks.entries()) {
    if (signal.aborted) break;
    const id = storeTrackId(pack, track);
    try {
      if (existingIds.has(id)) { result.skipped++; }
      else {
        onProgress({ completed: index, total: tracks.length, track: track.title, stage: 'Downloading' });
        const response = await fetcher(track.url, { signal });
        if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);
        if (Number(response.headers.get('content-length')) > MAX_TRACK_BYTES) throw new Error('Maximum input size is 40 MB');
        const bytes = await response.arrayBuffer();
        signal.throwIfAborted();
        if (bytes.byteLength > MAX_TRACK_BYTES) throw new Error('Maximum input size is 40 MB');
        const name = storeTrackName(pack, track);
        onProgress({ completed: index, total: tracks.length, track: track.title, stage: 'Converting to WAV' });
        const wav = await convert(new File([bytes], `${name}.mp3`, { type: 'audio/mpeg' }));
        signal.throwIfAborted();
        const file = new File([wav], `${name}.wav`, { type: 'audio/wav' });
        Object.defineProperties(file, {
          id: { value: id },
          storePack: { value: { id: pack.id, title: pack.title, price: pack.price ?? null } },
        });
        onProgress({ completed: index, total: tracks.length, track: track.title, stage: 'Saving' });
        const saved = await save(file);
        existingIds.add(id); result.added++;
        onAdded(saved);
      }
    } catch (error) {
      if (signal.aborted) break;
      result.failures.push(`${track.title}: ${error.message}`);
    }
    onProgress({ completed: index + 1, total: tracks.length, track: track.title, stage: 'Processed' });
    await yieldControl();
  }
  result.cancelled = signal.aborted;
  return result;
}
