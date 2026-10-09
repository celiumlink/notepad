import test from 'node:test';
import assert from 'node:assert/strict';
import { CompletionKernel, ContextStore } from '../kernel/index.mjs';
import { StateView } from '../state.mjs';

test('portable snapshots expose exact requests, streaming, cache, and isolated context data', async () => {
  const snapshots = [], references = new ContextStore();
  references.add('preContext', { label: 'Tone', text: 'Keep it warm.' });
  const kernel = new CompletionKernel({ model: 'test', onChange: state => snapshots.push(state),
    fetchImpl: async () => new Response('{"response":" world","done":false}\n{"done":true}\n') });
  const input = { prefix: 'Hello', suffix: '', mode: 'complete', ...references.snapshot() };
  await kernel.request(input);
  assert.ok(snapshots.some(state => state.phase === 'streaming'));
  assert.match(kernel.snapshot().request.prompt, /Keep it warm/);
  const copy = kernel.snapshot(); copy.input.preContext[0].text = 'changed';
  assert.equal(kernel.snapshot().input.preContext[0].text, 'Keep it warm.');
  await kernel.request(input); assert.equal(kernel.snapshot().cached, true);
  assert.equal(kernel.accept(), ' world'); assert.equal(kernel.snapshot().lastAction, 'accepted');
});

test('reference edits enforce shared limits atomically and snapshots cannot mutate stored context', () => {
  const store = new ContextStore();
  store.add('postContext', { label: 'Reference', text: 'original' });
  assert.throws(() => store.replace('postContext', 0, { label: 'Reference', text: 'x'.repeat(4001) }), RangeError);
  assert.equal(store.snapshot().postContext[0].text, 'original');
  const copy = store.snapshot(); copy.postContext.length = 0;
  assert.equal(store.snapshot().postContext.length, 1);
  store.replace('postContext', 0, { label: 'Reference', text: 'edited' });
  store.remove('postContext', 0); assert.equal(store.snapshot().postContext.length, 0);
});

test('LLM indicator reports installed model and disconnected service', async () => {
  const vscode = { EventEmitter: class { event() {} fire() {} dispose() {} }, ThemeColor: class {},
    StatusBarAlignment: { Right: 1 }, commands: { executeCommand() {} },
    window: { createStatusBarItem: () => ({ show() {}, dispose() {} }) } };
  const view = new StateView(vscode, () => ({ enabled: true, host: 'http://localhost:11434', model: 'test' }), () => ({}));
  await view.check(async () => new Response('{"models":[{"name":"test:latest"}]}'));
  assert.equal(view.state.connection, 'ready'); assert.match(view.status.text, /circle-filled/);
  await view.check(async () => { throw Error('offline'); });
  assert.equal(view.state.connection, 'unavailable'); assert.match(view.status.text, /warning/);
  view.dispose();
});
