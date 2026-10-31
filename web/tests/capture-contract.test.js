import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertCaptureVersion,CAPTURE_API_VERSION} from '../src/capture-contract.js';
test('capture client rejects incompatible app APIs with an actionable error',()=>{
  assert.doesNotThrow(()=>assertCaptureVersion(CAPTURE_API_VERSION));
  assert.throws(()=>assertCaptureVersion(CAPTURE_API_VERSION+1),/Update the adapter, renderer, and compatibility test together/);
  assert.throws(()=>assertCaptureVersion(undefined),/Capture API mismatch/);
});
