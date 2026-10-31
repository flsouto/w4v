import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { join } from 'node:path';

export async function resolveVideoSource(values, root, environment = process.env) {
  // Explicit CLI input choices override configuration; never execute .env as shell code.
  if (values.glob) return { directories: [], glob: values.glob };
  if (values.input?.length) return { directories: values.input, glob: undefined };
  let local = {};
  try { local = parseEnv(await readFile(join(root,'.env'),'utf8')); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  const glob = environment.VIDEO_INPUT_GLOB ?? local.VIDEO_INPUT_GLOB;
  return glob?.trim() ? {directories:[],glob:glob.trim()} : {directories:['commits'],glob:undefined};
}
