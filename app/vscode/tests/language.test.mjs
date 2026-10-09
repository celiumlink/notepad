import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelRequest } from '../kernel/index.mjs';

test('German draft with English references directs language inference to the local draft', () => {
  for (const mode of ['complete', 'hint']) {
    const input = { prefix: 'Heute möchte ich mehr Zeit für', suffix: ' finden.', mode,
      preContext: [{ label: 'Reference', text: 'Make room for what matters.' }], intent: 'Keep it brief.' };
    const { prompt } = buildModelRequest(input, 'test');
    assert.match(prompt, /(?:own language|language of the draft)/);
    assert.match(prompt, /without explanations or translations/);
    assert.ok(prompt.lastIndexOf(input.prefix) > prompt.indexOf('Make room for what matters.'));
    assert.ok(prompt.includes(input.prefix)); assert.ok(prompt.includes(input.suffix));
    assert.ok(prompt.endsWith(input.prefix + (mode === 'hint' ? '\n' : '')));
    assert.ok(!prompt.includes('I need [gap] to think'));
    assert.ok(!prompt.includes('I want more time for the things I care about'));
  }
});

test('plain continuation retains the original draft as the sole language cue', () => {
  const prefix = 'Ich freue mich darauf, morgen';
  assert.equal(buildModelRequest({ prefix, suffix: '', mode: 'complete' }, 'test').prompt, prefix);
});
