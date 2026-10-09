import { buildCompletion, buildModelRequest, contextText } from '../../src/prompt.mjs';
const $ = id => document.getElementById(id);
export function createInspector({ editor, getContext, getModel, onContextChange }) {
  document.querySelector('.shell').classList.toggle('inspector-hidden', true);
  $('inspect-toggle').setAttribute('aria-expanded', 'false');
  const stored = (() => { try { return JSON.parse(localStorage.getItem('thoughtstream-context') || '{}'); } catch { return {}; } })();
  const contexts = { preContext: '', postContext: '' };
  for (const key of Object.keys(contexts)) {
    const value = stored[key];
    contexts[key] = typeof value === 'string' ? value : Array.isArray(value) ? contextText(value.filter(b => b && typeof b.label === 'string' && typeof b.text === 'string')) : '';
    $(key + '-text').value = contexts[key];
  }
  let planned, sent, plannedInput, sentInput, signature = '', edit, selection, lastPhase = '';
  const trace = [];
  function drawContexts() {
    for (const key of Object.keys(contexts)) $(key + '-count').textContent = contexts[key].length + ' / 8,000';
  }
  function wire() {
    const source = $('wire-source').value, request = source === 'sent' ? sent : planned;
    $('wire-prompt').value = request ? ($('wire-json').checked ? JSON.stringify(request, null, 2) : request.prompt) : source === 'sent' ? 'No request has been sent yet.' : 'Building preview…';
    const value = $('wire-prompt').value, input = source === 'sent' ? sentInput : plannedInput;
    const segments = input && !$('wire-json').checked ? buildCompletion(input).segments : [];
    $('wire-highlight').replaceChildren(...(segments.map(s => s.text).join('') === value ? segments.map(segment => {
      const span = document.createElement('span'); span.textContent = segment.text;
      span.className = segment.kind === 'pre' || segment.kind === 'post' ? `context-${segment.kind}` : segment.kind === 'gap' ? 'prompt-gap' : ''; return span;
    }) : [document.createTextNode(value)]));
    $('wire-highlight').scrollTop = $('wire-prompt').scrollTop;
    $('wire-meta').textContent = request ? `${request.model} · ${request.prompt.length} characters · ${source === 'sent' ? 'actual request' : 'preview, not sent'}` : 'No model call is made for previews.';
  }
  function refresh() {
    const input = getContext(), key = JSON.stringify([input, getModel()]);
    if (key === signature) return;
    signature = key;
    try { plannedInput = input; planned = buildModelRequest(input, getModel()); wire(); }
    catch (error) { planned = null; wire(); $('wire-meta').textContent = error.message; }
  }
  function persist() {
    try { localStorage.setItem('thoughtstream-context', JSON.stringify(contexts)); } catch {}
    onContextChange(); drawContexts(); refresh();
  }
  function open(key) {
    edit = { key };
    if (!selection && editor.selectionEnd > editor.selectionStart) selection = { text: editor.value.slice(editor.selectionStart, editor.selectionEnd), end: editor.selectionEnd };
    $('context-title').textContent = 'Add ' + (key === 'preContext' ? 'pre' : 'post') + '-context';
    $('context-label').value = 'Reference';
    $('context-text').value = selection?.text || '';
    $('context-error').textContent = ''; $('context-menu').hidden = true;
    $('context-dialog').showModal(); $('context-label').focus();
  }
  for (const key of Object.keys(contexts)) {
    $(key + '-add').onclick = () => open(key);
    $(key + '-menu').onclick = () => open(key);
    $(key + '-text').addEventListener('input', () => {
      contexts[key] = $(key + '-text').value;
      persist();
    });
  }
  editor.addEventListener('contextmenu', event => {
    const value = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (!value) return; // Preserve ordinary browser copy/paste when no text is selected.
    event.preventDefault(); selection = { text: value, start: editor.selectionStart, end: editor.selectionEnd };
    const menu = $('context-menu'); menu.hidden = false;
    menu.style.left = Math.max(8, Math.min(event.clientX, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(event.clientY, innerHeight - menu.offsetHeight - 36)) + 'px';
    $('preContext-menu').focus();
  });
  document.addEventListener('pointerdown', e => { if (!$('context-menu').contains(e.target)) $('context-menu').hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('context-menu').hidden = true; });
  $('context-form').onsubmit = event => {
    event.preventDefault();
    const { key } = edit, block = { label: $('context-label').value.trim(), text: $('context-text').value };
    const addition = contextText([block]);
    const value = contexts[key] + (contexts[key] ? '\n\n' : '') + addition;
    if (!block.label || !block.text.trim() || value.length > 8000) {
      $('context-error').textContent = 'Use a label and text; max 8,000 characters per context.'; return;
    }
    contexts[key] = value; $(key + '-text').value = value;
    $('context-dialog').close(); persist();
    if (selection) editor.setSelectionRange(selection.end, selection.end);
    selection = null; editor.focus();
  };
  $('context-cancel').onclick = () => { $('context-dialog').close(); selection = null; };
  $('context-dialog').addEventListener('cancel', () => { selection = null; });
  $('wire-prompt').addEventListener('scroll', () => { $('wire-highlight').scrollTop = $('wire-prompt').scrollTop; });
  $('wire-source').onchange = $('wire-json').onchange = wire;
  $('wire-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('wire-prompt').value); $('wire-meta').textContent = 'Copied exactly as displayed.'; }
    catch { $('wire-prompt').focus(); $('wire-prompt').select(); $('wire-meta').textContent = 'Press Ctrl/Cmd+C to copy.'; }
  };
  $('inspect-toggle').onclick = () => {
    const hidden = document.querySelector('.shell').classList.toggle('inspector-hidden');
    $('inspect-toggle').setAttribute('aria-expanded', String(!hidden));
  };
  $('inspector-close').onclick = () => { document.querySelector('.shell').classList.toggle('inspector-hidden', true); $('inspect-toggle').setAttribute('aria-expanded', 'false'); $('inspect-toggle').focus(); };
  function event(name) {
    trace.push(`${new Date().toLocaleTimeString()}  ${name}`);
    $('kernel-trace').textContent = trace.slice(-3).join('\n');
  }
  drawContexts();
  return {
    contexts, refresh, event,
    sent(request, input = getContext(), cached = false) { sent = request; sentInput = JSON.parse(JSON.stringify(input)); $('wire-source').value = 'sent'; wire(); if (cached) $('wire-meta').textContent += ' · cached, no model call'; event(cached ? 'cached result reused' : 'prompt serialized → LLM'); },
    update(state) {
      const phase = state.error ? 'error' : state.phase === 'idle' && state.lastAction ? state.lastAction : state.phase;
      $('kernel-state').textContent = phase;
      const active = { idle: 'input', edited: 'input', disabled: 'input', accepted: 'accept', dismissed: 'dismiss', debouncing: 'debounce', loading: 'llm', streaming: 'join', error: 'llm' }[phase];
      for (const el of document.querySelectorAll('[data-stage]')) el.classList.toggle('active', el.dataset.stage === active || phase === 'streaming' && el.dataset.stage === 'ghost');
      $('kernel-counts').textContent = `${state.rawSuggestion.length} raw → ${state.suggestion.length} cleaned characters`;
      if (phase !== lastPhase) { event(phase); lastPhase = phase; }
      refresh();
    },
  };
}
