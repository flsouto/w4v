import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStoreCatalog, STORE_URL } from '../web/src/services/looplicator-store.js';

export const STORE_OUTPUT = fileURLToPath(new URL('../web/.generated/store/', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);

export async function compileStoreCatalog(source, output = STORE_OUTPUT) {
  const packs = parseStoreCatalog(source);
  if (!packs.length) throw new Error('The store catalog contains no valid packs.');
  await mkdir(resolve(output, 'packs'), { recursive: true });
  const index = [];
  for (const { tracks, ...pack } of packs) {
    const bytes = JSON.stringify(tracks);
    const tracksPath = `packs/${pack.id}-${hash(bytes)}.json`;
    await writeFile(resolve(output, tracksPath), bytes);
    index.push({ ...pack, trackCount: tracks.length, tracksPath });
  }
  const bytes = JSON.stringify(index);
  const catalogFile = `catalog-${hash(bytes)}.json`;
  await writeFile(resolve(output, catalogFile), bytes);
  const manifest = { catalogFile, files: [catalogFile, ...index.map(pack => pack.tracksPath)], packs: index.length, tracks: index.reduce((sum, pack) => sum + pack.trackCount, 0) };
  // Publish the manifest last so failed refreshes leave the previous snapshot usable.
  const temporary = resolve(output, 'manifest.json.tmp');
  await writeFile(temporary, JSON.stringify(manifest));
  await rename(temporary, resolve(output, 'manifest.json'));
  return manifest;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--if-missing')) {
    try {
      const manifest = JSON.parse(await readFile(resolve(STORE_OUTPUT, 'manifest.json'), 'utf8'));
      await readFile(resolve(STORE_OUTPUT, manifest.catalogFile));
      console.log(`Using compiled store catalog: ${manifest.packs} packs.`); return;
    } catch { /* First-time local setup needs a snapshot. */ }
  }
  const inputIndex = args.indexOf('--input');
  let source;
  if (inputIndex !== -1) {
    if (!args[inputIndex + 1]) throw new Error('--input requires a JSON file');
    source = JSON.parse(await readFile(args[inputIndex + 1], 'utf8'));
  } else {
    const response = await fetch(STORE_URL, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Store catalog download failed (HTTP ${response.status})`);
    source = await response.json();
  }
  const manifest = await compileStoreCatalog(source);
  console.log(`Compiled store catalog: ${manifest.packs} packs, ${manifest.tracks} tracks; ${manifest.catalogFile}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
