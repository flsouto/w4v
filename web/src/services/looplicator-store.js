export const STORE_URL = 'https://looplipacker.s3.amazonaws.com/looplishop.json';
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
  const available = packs.filter(pack => pack.tracks.length > 0);
  return available.length ? available[Math.floor(random() * available.length)] : null;
}

export async function fetchStoreCatalog(signal, fetcher = fetch) {
  const response = await fetcher(STORE_URL, { signal });
  if (!response.ok) throw new Error(`Could not load the store catalog (HTTP ${response.status}).`);
  return parseStoreCatalog(await response.json());
}

export const storeTrackId = (pack, track) => `store:${pack.id}:${track.url}`;
export const storeTrackName = (pack, track) => `${pack.id} - ${track.title.replace(/[\\/\u0000-\u001f]/g, '-').replace(/\.(mp3|wav)$/i, '')}`;

// Process one track at a time: downloaded MP3s and decoded buffers are never
// accumulated for an entire pack. Completed WAVs appear in the library immediately.
export async function importStorePack(pack, { signal, existingIds = new Set(), convert, save, onAdded = () => {}, onProgress = () => {}, fetcher = fetch, yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)) }) {
  const result = { added: 0, skipped: 0, failures: [], cancelled: false };
  for (const [index, track] of pack.tracks.entries()) {
    if (signal.aborted) break;
    const id = storeTrackId(pack, track);
    try {
      if (existingIds.has(id)) { result.skipped++; }
      else {
        onProgress({ completed: index, total: pack.tracks.length, track: track.title, stage: 'Downloading' });
        const response = await fetcher(track.url, { signal });
        if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);
        if (Number(response.headers.get('content-length')) > MAX_TRACK_BYTES) throw new Error('Maximum input size is 40 MB');
        const bytes = await response.arrayBuffer();
        signal.throwIfAborted();
        if (bytes.byteLength > MAX_TRACK_BYTES) throw new Error('Maximum input size is 40 MB');
        const name = storeTrackName(pack, track);
        onProgress({ completed: index, total: pack.tracks.length, track: track.title, stage: 'Converting to WAV' });
        const wav = await convert(new File([bytes], `${name}.mp3`, { type: 'audio/mpeg' }));
        signal.throwIfAborted();
        const file = new File([wav], `${name}.wav`, { type: 'audio/wav' });
        Object.defineProperties(file, {
          id: { value: id },
          storePack: { value: { id: pack.id, title: pack.title, price: pack.price ?? null } },
        });
        onProgress({ completed: index, total: pack.tracks.length, track: track.title, stage: 'Saving' });
        const saved = await save(file);
        existingIds.add(id); result.added++;
        onAdded(saved);
      }
    } catch (error) {
      if (signal.aborted) break;
      result.failures.push(`${track.title}: ${error.message}`);
    }
    onProgress({ completed: index + 1, total: pack.tracks.length, track: track.title, stage: 'Processed' });
    await yieldControl();
  }
  result.cancelled = signal.aborted;
  return result;
}
