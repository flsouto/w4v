import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPatternSettings, validPattern, PATTERN_STORAGE_KEY } from '../src/services/mosaic-patterns.js';

test('imported pool is unique and valid', () => {
  const patterns = readFileSync(new URL('../../src/blenders/mosaic-patterns.txt', import.meta.url), 'utf8').trim().split('\n');
  assert.equal(patterns.length, 430);
  assert.equal(new Set(patterns).size, 430);
  assert.ok(patterns.every(validPattern));
  assert.ok(patterns.includes('aa__a_a_b_baa___'));
  assert.ok(patterns.includes('abcccbaad_cabdcd'));
});
test('pattern settings default to all and recover safely from invalid storage', () => {
  for (const raw of [null, '{', '{}', 'null']) assert.deepEqual(loadPatternSettings({ getItem: () => raw }), { custom: [], excluded: [] });
  assert.deepEqual(loadPatternSettings({ getItem() { throw Error('unavailable'); } }), { custom: [], excluded: [] });
});
test('custom patterns and exclusions survive storage, with validation and deduplication', () => {
  const stored = { custom: ['a_z_', 'a_z_', '', '___', 'A', 'a'.repeat(257)], excluded: ['a_b_', 'a_b_'] };
  assert.deepEqual(loadPatternSettings({ getItem(key) { assert.equal(key, PATTERN_STORAGE_KEY); return JSON.stringify(stored); } }), { custom: ['a_z_'], excluded: ['a_b_'] });
});
