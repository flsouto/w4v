import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSupportPreferences, saveSupportPreferences, recordSupportGeneration, supportPromptDue, SUPPORT_STORAGE_KEY, SUPPORT_LOOP_INTERVAL } from '../src/services/support-prompt.js';

test('support reminders become due after ten completed loops and stop for supporters', () => {
  let preferences = readSupportPreferences({ getItem: () => null });
  assert.equal(supportPromptDue(preferences), false);
  for (let count = 1; count < SUPPORT_LOOP_INTERVAL; count++) {
    preferences = recordSupportGeneration(preferences);
    assert.equal(supportPromptDue(preferences), false);
  }
  preferences = recordSupportGeneration(preferences);
  assert.equal(supportPromptDue(preferences), true);
  assert.deepEqual(recordSupportGeneration(preferences), preferences, 'Pending prompts saturate at ten');
  const supported = { ...preferences, supported: true };
  assert.equal(supportPromptDue(supported), false);
  assert.equal(recordSupportGeneration(supported), supported);
  assert.equal(supportPromptDue({ ...preferences, generatedSincePrompt: 0 }), false);
});
test('counter and supporter choice survive storage; legacy timed preferences retain opt-out', () => {
  let data;
  const store = { getItem(key) { assert.equal(key, SUPPORT_STORAGE_KEY); return data; }, setItem(key, value) { assert.equal(key, SUPPORT_STORAGE_KEY); data = value; } };
  saveSupportPreferences({ supported: false, generatedSincePrompt: 9 }, store);
  assert.deepEqual(readSupportPreferences(store), { supported: false, generatedSincePrompt: 9 });
  data = JSON.stringify({ supported: true, firstSeenAt: 1, lastPromptAt: 1 });
  assert.deepEqual(readSupportPreferences(store), { supported: true, generatedSincePrompt: 0 });
  data = JSON.stringify({ supported: false, firstSeenAt: 1, lastPromptAt: 1 });
  assert.equal(supportPromptDue(readSupportPreferences(store)), false, 'Old time-based reminders must not trigger prompts');
  for (const value of ['{', 'null', '[]', '{"supported":"true","generatedSincePrompt":-1}', '{"generatedSincePrompt":1.5}']) {
    data = value;
    assert.deepEqual(readSupportPreferences(store), { supported: false, generatedSincePrompt: 0 });
  }
  const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(readSupportPreferences(unavailable), { supported: false, generatedSincePrompt: 0 });
  assert.doesNotThrow(() => saveSupportPreferences({ supported: true }, unavailable));
});
