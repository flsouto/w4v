import { readFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { relative, isAbsolute, dirname } from 'node:path';

export async function readHistory(path) {
  try { return new Set((await readFile(path,'utf8')).split(/\r?\n/).filter(line=>line && !line.startsWith('#'))); }
  catch(error) { if(error.code==='ENOENT') return new Set(); throw error; }
}
export async function recordCompilation(path, records, compilation) {
  if (!['complete','skipped-existing'].includes(compilation?.status) || !records.length || records.some(r=>!['complete','skipped-existing'].includes(r.status))) throw new Error('Only complete compilations can update history');
  const existing = await readHistory(path);
  const added = [...new Set(records.map(record=>record.name))].filter(name=>!existing.has(name));
  if(added.some(name=>/[\r\n]/.test(name)||name.startsWith('#'))) throw new Error('Unsupported filename in compilation history');
  if(added.length) {
    let previous='';
    try { previous=await readFile(path,'utf8'); } catch(error) { if(error.code!=='ENOENT') throw error; }
    await appendFile(path,(previous && !previous.endsWith('\n') ? '\n' : '')+added.join('\n')+'\n');
  }
  return added;
}
export function syncHistory(path) {
  const run = args=>execFileSync('git',args,{cwd:dirname(path),encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const root=run(['rev-parse','--show-toplevel']);
  const file=relative(root,path);
  if(file.startsWith('../')||isAbsolute(file)) throw new Error('History must be inside the repository to sync');
  const status=run(['status','--porcelain','--',file]);
  if(status) {
    run(['add','--',file]);
    run(['commit','--only','-m','Record compiled loops','--',file]);
  }
  // Retry a previous failed push too, even if the ledger is already committed.
  run(['push']);
}
