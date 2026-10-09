// Run optional live comparisons against the recorded original prompt. Requires Ollama.
import { readFile, writeFile } from 'node:fs/promises';
import { buildModelRequest, generationOptions } from '../src/prompt.mjs';
const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434', model = process.env.MODEL || 'qwen-local';
const recorded = JSON.parse(await readFile(new URL('./language-results.json', import.meta.url), 'utf8'));
const baselines = recorded.runs.filter(run => run.variant === 'baseline');
const shown = await fetch(host + '/api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }), signal: AbortSignal.timeout(5000) }).then(response => response.json());
const options = generationOptions({ temperature: 0, num_predict: 32 });
const results = { timestamp: new Date().toISOString(), model, details: shown.details, options, runs: [] };
for (const baseline of baselines) {
  const candidate = buildModelRequest(baseline.input, model);
  for (const [variant, source] of Object.entries({ baseline: baseline.request, candidate })) {
    const request = { ...source, model, stream: false, options: { ...options, stop: source.options.stop } };
    const response = await fetch(host + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw Error(await response.text());
    const output = await response.json();
    results.runs.push({ case: baseline.case, input: baseline.input, variant, request, output: output.response, doneReason: output.done_reason });
    console.log(JSON.stringify({ case: baseline.case, variant, output: output.response }));
  }
}
await writeFile(new URL('./language-final-results.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
