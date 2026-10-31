import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function simulate(existing = false) {
  const root = mkdtempSync(join(tmpdir(), 'looplicator-deploy-'));
  try {
    for (const dir of ['scripts', 'web', 'bin']) mkdirSync(join(root, dir));
    copyFileSync(new URL('../../scripts/deploy.sh', import.meta.url), join(root, 'scripts/deploy.sh'));
    for (const file of ['package.json', 'web/package.json']) writeFileSync(join(root, file), JSON.stringify({ version: '3.0.0' }));
    const log = join(root, 'aws.log');
    const executable = (name, code) => writeFileSync(join(root, 'bin', name), `#!${process.execPath}\n${code}`, { mode: 0o755 });
    executable('git', 'process.exit(0)');
    executable('npm', 'process.exit(0)');
    executable('aws', `const fs = require('node:fs'); const args = process.argv.slice(2); fs.appendFileSync(process.env.AWS_TEST_LOG, JSON.stringify(args)+'\\n'); if(args[0]==='s3api') console.log(process.env.AWS_TEST_EXISTS); if(args[1]==='create-invalidation') console.log('TEST-ID');`);
    const result = spawnSync('bash', ['scripts/deploy.sh'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, AWS_TEST_LOG: log, AWS_TEST_EXISTS: existing ? '1' : '0' },
    });
    const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    return { result, calls };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('deployment preserves old files, archives first, and publishes root HTML last', () => {
  const { result, calls } = simulate();
  assert.equal(result.status, 0, result.stderr);
  assert.ok(calls.every(args => !args.includes('--delete')));
  const uploads = calls.filter(args => args[0] === 's3');
  assert.deepEqual(uploads.map(args => args[3]), ['s3://daw-looplicator/v3.0.0/', 's3://daw-looplicator/', 's3://daw-looplicator/index.html']);
  assert.ok(uploads[1].includes('index.html')); // excluded from initial root sync
  assert.deepEqual(calls.at(-1).slice(0, 3), ['cloudfront', 'wait', 'invalidation-completed']);
});

test('deployment refuses to overwrite a published archive', () => {
  const { result, calls } = simulate(true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already exists/);
  assert.equal(calls.length, 1);
});
