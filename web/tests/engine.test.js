import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';
function setup(timeout = 1000) {
  const workers = [];
  const engine = new Engine(() => {
    const worker = { postMessage(message) { this.message = message; }, terminate() { this.terminated = true; } };
    workers.push(worker); return worker;
  }, timeout);
  return { engine, workers };
}
test('routes out-of-order responses to the matching job', async () => {
  const { engine, workers } = setup();
  const a = engine.run('catalog'), b = engine.run('blend');
  workers[0].onmessage({ data: { id: 2, result: 'second' } });
  workers[0].onmessage({ data: { id: 1, result: 'first' } });
  assert.equal((await a).result, 'first'); assert.equal((await b).result, 'second');
  engine.cancel();
});
test('cancel terminates a busy worker and a later request gets a fresh instance', async () => {
  const { engine, workers } = setup();
  const pending = engine.run('blend');
  engine.cancel();
  await assert.rejects(pending, /cancelled/);
  assert.equal(workers[0].terminated, true);
  const retry = engine.run('catalog');
  workers[1].onmessage({ data: { id: 2, result: [] } });
  await retry; engine.cancel();
});
test('timeout kills a nonresponsive worker', async () => {
  const { engine, workers } = setup(10);
  await assert.rejects(engine.run('blend'), /exceeded/);
  assert.equal(workers[0].terminated, true);
  assert.equal(engine.pending.size, 0);
});
test('worker failures reject all pending jobs', async () => {
  const { engine, workers } = setup();
  const a = engine.run('catalog'), b = engine.run('blend');
  workers[0].onerror({ message: 'WASM trapped' });
  await assert.rejects(a, /trapped/); await assert.rejects(b, /trapped/);
});
