import { CompletionController } from './completion-controller.mjs';
import { createCompletionTransport } from '../../src/transports/http.mjs';
import { createInspector } from './inspector.mjs';
import { buildModelRequest } from '../../src/prompt.mjs';
import { contextMarks, markedSegments } from '../../src/context-marks.mjs';
import { createMarkdownEditor } from './markdown.mjs';
const $ = id => document.getElementById(id), text = $('text');
let ready = false, modelName = 'qwen-local', mode = 'complete', composing = false, lastCursor = 0, acceptedUndo = null, inspector, markdown;
try { text.value = localStorage.getItem('thoughtstream-draft') || ''; } catch {}
const options = () => Object.fromEntries(['temperature', 'top_p', 'num_predict'].map(key => [key, Number($(key).value)]));
const cached = (request, input) => { controller.cached = true; inspector?.sent(request.request || request, input, true); };
const localTransport = createCompletionTransport({ buildRequest: input => buildModelRequest(input, modelName), onRequest: (request, input) => inspector?.sent(request, input), onCache: cached });
const controller = new CompletionController({ generate: localTransport, onChange: render, onInteraction: event => {
  inspector?.event(event.action);
  if (!$('record').checked) return;
  fetch('/api/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event), keepalive: true })
    .then(r => { if (!r.ok) throw Error('Could not save interaction'); }).catch(e => { $('error').textContent = e.message; });
} });
function render(state = controller) {
  const cursor = text.selectionStart, value = text.value;
  const ghost = document.createElement('span'); ghost.className = 'ghost'; ghost.textContent = mode === 'complete' ? state.suggestion : '';
  const marks = contextMarks(value, inspector?.contexts || {});
  const decorated = (start, end) => markedSegments(value, marks, start, end).map(segment => {
    if (!segment.marks.length) return document.createTextNode(segment.text);
    const span = document.createElement('span'); span.textContent = segment.text;
    span.className = [...new Set(segment.marks.map(m => `context-${m.kind}`))].join(' ');
    span.title = segment.marks.map(m => `${m.kind}: ${m.label}`).join(' / '); return span;
  });
  $('mirror').replaceChildren(...decorated(0, cursor), ghost, ...decorated(cursor, value.length), document.createTextNode('\n'));
  $('mirror').scrollTop = text.scrollTop; $('mirror').scrollLeft = text.scrollLeft;
  $('hint').hidden = mode !== 'hint' || !state.suggestion; $('hint-text').textContent = state.suggestion;
  $('accept').disabled = !state.suggestion || mode === 'hint'; $('dismiss').disabled = !state.suggestion && !state.controller;
  $('suggest').disabled = !ready || !state.enabled;
  $('suggest').textContent = mode === 'complete' ? 'Suggest a continuation' : 'Give me a nudge';
  $('toggle-label').textContent = state.enabled ? 'Suggestions on' : 'Suggestions off'; $('toggle').setAttribute('aria-pressed', String(state.enabled));
  $('state').textContent = !ready ? 'Waiting for model' : !state.enabled ? 'A little quiet' : state.phase === 'loading' ? 'Finding the thread…' : state.phase === 'streaming' ? 'A thought is forming…' : state.suggestion ? mode === 'hint' ? 'A possible direction' : 'Tab to keep it' : 'Here when you need me';
  $('state').classList.toggle('busy', state.phase !== 'idle');
  if (state.cached && state.suggestion) $('state').textContent = mode === 'hint' ? 'Previous hint · cached' : 'Previous suggestion · Tab to keep it';
  $('word-count').textContent = `${value.trim() ? value.trim().split(/\s+/).length : 0} words`;
  const lines = value.slice(0, cursor).split('\n');
  $('cursor-position').textContent = `Ln ${lines.length}, Col ${Array.from(lines.at(-1)).length + 1}`;
  if (state.error) $('error').textContent = state.error;
  if (state.phase === 'idle' && state.suggestion) $('announcement').textContent = `Suggestion: ${state.suggestion}`;
  inspector?.update(state);
  markdown?.refresh();
}
function context() {
  const cursor = text.selectionStart;
  return { prefix: text.value.slice(0, cursor).slice(-6000), suffix: text.value.slice(cursor).slice(0, 3000), mode, intent: $('intent').value, options: options(), preContext: inspector?.contexts.preContext || '', postContext: inspector?.contexts.postContext || '' };
}
function eligible() { return ready && !composing && text.selectionStart === text.selectionEnd && text.value.trim(); }
function schedule() { if (eligible() && mode === 'complete') controller.schedule(context()); }
function generate() { if (eligible()) { $('error').textContent = ''; controller.request(context(), { fresh: true }); } }
function saveDraft() { try { localStorage.setItem('thoughtstream-draft', text.value); } catch {} }
function accept() {
  if (!controller.suggestion || mode !== 'complete') return;
  const cursor = text.selectionStart, suggestion = controller.accept();
  acceptedUndo = { value: text.value, cursor };
  text.setRangeText(suggestion, cursor, cursor, 'end'); text.focus(); lastCursor = text.selectionStart; saveDraft(); render();
}
text.addEventListener('input', () => { acceptedUndo = null; controller.cancel('edited'); lastCursor = text.selectionStart; saveDraft(); schedule(); });
text.addEventListener('select', () => { if (lastCursor !== text.selectionStart || text.selectionStart !== text.selectionEnd) { controller.cancel('dismissed'); lastCursor = text.selectionStart; } });
text.addEventListener('pointerdown', () => controller.cancel('dismissed'));
text.addEventListener('pointerup', () => { lastCursor = text.selectionStart; render(); });
text.addEventListener('scroll', () => render());
text.addEventListener('compositionstart', () => { composing = true; controller.cancel(); });
text.addEventListener('compositionend', () => { composing = false; controller.cancel(); saveDraft(); schedule(); });
text.addEventListener('blur', () => clearTimeout(controller.timer));
document.addEventListener('keydown', e => {
  if (e.isComposing) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && document.activeElement === text && acceptedUndo) {
    e.preventDefault(); controller.cancel(); text.value = acceptedUndo.value; text.setSelectionRange(acceptedUndo.cursor, acceptedUndo.cursor); acceptedUndo = null; saveDraft(); render();
  }
  else if ((e.ctrlKey || e.metaKey) && e.code === 'Space') { e.preventDefault(); if (e.shiftKey) toggle(); else generate(); }
  else if (e.key === 'Escape' && (controller.suggestion || controller.controller)) { e.preventDefault(); controller.cancel('dismissed'); }
  else if (e.key === 'Tab' && document.activeElement === text && controller.suggestion && mode === 'complete') { e.preventDefault(); accept(); }
  else if (document.activeElement === text && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)) controller.cancel('dismissed');
});
text.addEventListener('keyup', e => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)) { lastCursor = text.selectionStart; render(); } });
function toggle() { controller.setEnabled(!controller.enabled); if (controller.enabled) schedule(); }
$('toggle').onclick = toggle; $('suggest').onclick = generate; $('accept').onclick = accept; $('dismiss').onclick = () => controller.cancel('dismissed');
for (const key of ['temperature','top_p','num_predict','intent']) $(key).addEventListener('change', () => controller.cancel('dismissed'));
for (const next of ['complete','hint']) $(`mode-${next}`).onclick = () => {
  controller.cancel('dismissed'); mode = next;
  for (const key of ['complete','hint']) { $(`mode-${key}`).classList.toggle('active', key === mode); $(`mode-${key}`).setAttribute('aria-pressed', String(key === mode)); }
  render(); text.focus();
};
async function checkStatus() {
  try { const r = await fetch('/api/status'), s = await r.json(); if (!r.ok) throw Error(s.error);
    ready = s.ready; modelName = s.model; $('model').textContent = `${s.model} · JavaScript kernel`; render();
  } catch (e) { ready = false; $('error').textContent = e.message; render(); }
}
inspector = createInspector({ editor: text, getContext: context, getModel: () => modelName, onContextChange: () => controller.cancel('dismissed') });
markdown = createMarkdownEditor(text);
render(); checkStatus(); setInterval(checkStatus, 10000);
