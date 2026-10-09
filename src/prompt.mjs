// Plain text contract; adapters own model-specific prompting.
export function contextText(value = '') {
  return typeof value === 'string' ? value : value.map(b => `### ${b.label}\n\n${b.text}\n\n---`).join('\n\n');
}
export function contextReferences(value) {
  if (Array.isArray(value)) return value;
  return (value || '').split(/\n\s*---\s*(?:\n|$)/).map(text => {
    const match = /^\s*### ([^\n]+)\n+([\s\S]*)$/.exec(text);
    return { label: match?.[1] || 'Reference', text: (match?.[2] ?? text).trim() };
  }).filter(b => b.text);
}
export function validateCompletionInput(input) {
  if (!input || typeof input.prefix !== 'string' || typeof input.suffix !== 'string' || !['complete', 'hint'].includes(input.mode) || (input.intent !== undefined && typeof input.intent !== 'string')) return false;
  return ['preContext', 'postContext'].every(key => input[key] === undefined || typeof input[key] === 'string' && input[key].length <= 8000 || Array.isArray(input[key]) && input[key].length <= 16 && input[key].every(block => block && typeof block.label === 'string' && block.label.length <= 80 && typeof block.text === 'string' && block.text.length <= 4000) && input[key].reduce((n, block) => n + block.text.length, 0) <= 8000);
}
export function buildCompletion({ prefix = '', suffix = '', mode = 'complete', intent = '', preContext = [], postContext = [], preserveFormatting = false }) {
  const stop = ['<|endoftext|>', '<|im_end|>'];
  const segments = [];
  const add = (kind, text) => { if (text) segments.push({ kind, text }); };
  const references = (kind, blocks) => {
    const text = contextText(blocks);
    if (text.trim()) add(kind, text + '\n\n');
  };
  if (mode === 'complete' && !suffix && !intent && !contextText(preContext).trim() && !contextText(postContext).trim()) {
    add('draft', prefix);
    return { prompt: prefix, segments, stop };
  }
  references('pre', preContext);
  references('post', postContext);
  if (intent) add('guidance', 'Writing direction: ' + intent + '\n\n');
  add('template', mode === 'hint'
    ? 'Suggest one brief next thought in the language of the draft. Output only the thought, without explanations or translations.\n'
    : preserveFormatting
      ? 'Continue the existing code or text in its own language and format. Preserve syntax, indentation, punctuation, and whitespace. Output only the insertion, without Markdown fences, explanations, or translations.\n'
      : 'Continue the draft in its own language. Output only the insertion, without explanations or translations.\n');
  if (suffix) {
    add('template', '\nExisting text after the cursor:\n');
    add('draft', suffix); add('template', '\n');
  }
  // References and directions must not supply the language of the continuation.
  // Keep the author's text last so raw generation starts in the draft's language.
  add('template', '\nDraft:\n');
  add('draft', prefix + (mode === 'hint' ? '\n' : ''));
  return { prompt: segments.map(s => s.text).join(''), segments, stop: ['[gap]', '\nPassage:', '\nMissing text:', ...stop] };
}
export function buildModelRequest(input, model) {
  if (!validateCompletionInput(input)) throw TypeError('Invalid completion context');
  const template = buildCompletion(input);
  return { model, prompt: template.prompt, raw: true, stream: true, options: { ...generationOptions(input.options), stop: template.stop } };
}
export function generationOptions(input = {}) {
  const bounded = (v, fallback, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  return { temperature: bounded(input.temperature, 0.5, 0, 2), top_p: bounded(input.top_p, 0.9, 0.05, 1),
    num_predict: Math.round(bounded(input.num_predict, 32, 1, 128)), num_ctx: 4096, repeat_penalty: 1.1 };
}
