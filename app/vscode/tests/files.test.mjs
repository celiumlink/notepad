import test from 'node:test';
import assert from 'node:assert/strict';
import { CompletionKernel, buildModelRequest, joinCompletion } from '../kernel/index.mjs';

test('format-preserving completions leave Python indentation and literal punctuation untouched', async () => {
  const suggestion = '\n    return "a,b"\n';
  const kernel = new CompletionKernel({ model: 'test', fetchImpl: async () => new Response(JSON.stringify({ response: suggestion, done: true }) + '\n') });
  await kernel.request({ prefix: 'def example():', suffix: '', mode: 'complete', preserveFormatting: true });
  assert.equal(kernel.snapshot().suggestion, suggestion);
  assert.equal(joinCompletion({ prefix: 'values = ', suggestion: '{"a":1,"b":2}', preserveFormatting: true }), '{"a":1,"b":2}');
});

test('contextual requests for code ask for syntax and formatting preservation', () => {
  const request = buildModelRequest({ prefix: 'def example():', suffix: '\nprint(example())', mode: 'complete', preserveFormatting: true }, 'test');
  assert.match(request.prompt, /Preserve syntax, indentation, punctuation, and whitespace/);
  assert.ok(request.prompt.endsWith('def example():'));
});
