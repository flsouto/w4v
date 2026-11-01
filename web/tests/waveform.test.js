import test from 'node:test';
import assert from 'node:assert/strict';
import { waveformPeaks } from '../src/waveform.js';

const audio = (...channels) => ({ length: channels[0].length, numberOfChannels: channels.length, getChannelData: ch => Float32Array.from(channels[ch]) });

test('waveform shows right-channel audio while the left channel is delayed', () => {
  assert.deepEqual([...waveformPeaks(audio([0, 0, .5, -.5], [.75, -.75, 0, 0]), 2)], [.75, .5]);
});

test('opposite-phase channels remain visible and brief peaks are retained', () => {
  assert.deepEqual([...waveformPeaks(audio([0, 1, 0, 0, -.5], [0, -1, 0, 0, .5]), 2)], [1, .5]);
});

test('mono, silence, and buffers shorter than the canvas fill the full timeline', () => {
  assert.deepEqual([...waveformPeaks(audio([-.5, .25]), 4)], [.5, .5, .25, .25]);
  assert.deepEqual([...waveformPeaks(audio([0, 0]), 2)], [0, 0]);
  assert.deepEqual([...waveformPeaks(audio([]), 2)], [0, 0]);
});
