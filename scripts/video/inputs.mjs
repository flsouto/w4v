import fastGlob from 'fast-glob';
import { readdir, stat, readFile } from 'node:fs/promises';
import { createHash, randomInt } from 'node:crypto';
import { resolve, basename } from 'node:path';

// Top-level directory scan only. Never source/execute .farmrc or modify farm files.
export async function selectInputs(directories, last, compiled = new Set(), pattern, selection = {}) {
  const candidates = [];
  let paths = [];
  if (pattern) paths = await fastGlob(pattern, { absolute:true, onlyFiles:true, unique:true, followSymbolicLinks:false });
  else for (const directory of [...new Set(directories.map(path => resolve(path)))]) {
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      if(entry.isFile()) paths.push(resolve(directory,entry.name));
    }
  }
  for (const path of paths) {
    const name=basename(path);
    if (!/\.wav$/i.test(name) || compiled.has(name)) continue;
    let info;
    try { info=await stat(path); } catch(error) { if(error.code==='ENOENT') continue;throw error; }
    if(info.isFile() && info.size) candidates.push({path,name,mtimeMs:info.mtimeMs,size:info.size});
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
  const selected = [], hashes = new Set();
  for (const file of candidates) {
    let bytes;
    try { bytes = await readFile(file.path); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    file.sha256 = createHash('sha256').update(bytes).digest('hex');
    if (hashes.has(file.sha256)) continue;
    hashes.add(file.sha256);
    selected.push(file);
    if (!selection.random && selected.length === last) break;
  }
  return chooseInputs(selected, last, selection);
}

export function chooseInputs(files, count, { random = false, pick = randomInt } = {}) {
  if (!random) return files.slice(0, count);
  const pool = [...files], size = Math.min(count, pool.length);
  // Uniform sampling without replacement, after history filtering and deduplication.
  for (let i = 0; i < size; i++) {
    const j = i + pick(pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

export function parseOptions(values) {
  const integer = (key, fallback, max) => {
    const value = Number(values[key] ?? fallback);
    if (!Number.isInteger(value) || value <= 0 || value > max) throw new Error(`--${key} must be an integer from 1 to ${max}`);
    return value;
  };
  if (values.random !== undefined && values.last !== undefined) throw new Error('Choose either --random X or --last N, not both');
  const random = values.random === undefined ? undefined : integer('random', undefined, 10000);
  const last = integer('last', 1, 10000), cycles = integer('cycles', 1, 1000), fps = integer('fps', 30, 60);
  const size = /^(\d+)x(\d+)$/.exec(values.size ?? '1920x1080');
  if (!size) throw new Error('--size must be WIDTHxHEIGHT');
  const [width, height] = size.slice(1).map(Number);
  if ([width, height].some(n => n < 320 || n > 3840 || n % 2)) throw new Error('Video dimensions must be even integers from 320 to 3840');
  const seconds = values.seconds === undefined ? undefined : Number(values.seconds);
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds <= 0)) throw new Error('--seconds must be positive');
  const text = String(values.portion ?? '1/4');
  const parts = text.split('/');
  const portion = parts.length === 2 ? Number(parts[0]) / Number(parts[1]) : Number(text);
  if (parts.length > 2 || !Number.isFinite(portion) || portion <= 0 || portion > 1) throw new Error('--portion must be a fraction or decimal greater than 0 and at most 1');
  const mixer = values.mixer;
  const fx = values.fx;
  for (const [key, choice] of [['mixer', mixer], ['fx', fx]]) {
    if (choice !== undefined && choice !== '' && !/^[a-z][a-z0-9]*$/.test(choice)) throw new Error(`--${key} must be an engine option or random`);
  }
  return { mixer, fx, random, last, cycles, fps, width, height, seconds, portion, showUrl: Boolean(values['show-url']), randomUi: Boolean(values['random-ui']) };
}

export async function fingerprintFiles(directory) {
  const hash = createHash('sha256');
  async function visit(path, prefix = '') {
    const entries = (await readdir(path, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await visit(resolve(path,entry.name),`${relative}/`);
      else if (entry.isFile()) { hash.update(relative+'\0'); hash.update(await readFile(resolve(path,entry.name))); hash.update('\0'); }
    }
  }
  await visit(directory);
  return hash.digest('hex');
}

export function estimateBpm(duration) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('BPM estimation requires a positive duration');
  return Math.max(1, Math.round(120 * 16 / duration));
}
