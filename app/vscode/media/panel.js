const api = acquireVsCodeApi(), $ = id => document.getElementById(id);
const send = (action, values = {}) => api.postMessage({ action, ...values });
let referenceKey = '';
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => send(button.dataset.action)));
$('intent').addEventListener('change', () => send('setIntent', { value: $('intent').value }));
$('details').open = api.getState()?.details || false;
$('details').addEventListener('toggle', () => api.setState({ details: $('details').open }));

function references(side, blocks) {
  const container = $(side); container.replaceChildren();
  $(side === 'preContext' ? 'pre-count' : 'post-count').textContent = blocks.length;
  if (!blocks.length) {
    const empty = document.createElement('p'); empty.className = 'empty-reference';
    empty.textContent = 'Select a passage in your editor, then add it here. Entirely optional.';
    container.append(empty);
  }
  blocks.forEach((block, index) => {
    const card = document.createElement('article'); card.className = 'reference';
    const head = document.createElement('div'); head.className = 'reference-head';
    const title = document.createElement('button'); title.className = 'reference-title'; title.textContent = block.label;
    title.title = 'Edit reference'; title.addEventListener('click', () => send('editContext', { side, index }));
    const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = '×';
    remove.setAttribute('aria-label', 'Remove ' + block.label); remove.addEventListener('click', () => send('removeContext', { side, index }));
    const excerpt = document.createElement('p'); excerpt.className = 'excerpt'; excerpt.textContent = block.text;
    head.append(title, remove); card.append(head, excerpt); container.append(card);
  });
}
window.addEventListener('message', ({ data: { state, settings, references: blocks } }) => {
  if (!state || !settings || !blocks) return;
  const busy = ['loading', 'streaming'].includes(state.phase), ready = state.connection === 'ready';
  $('connection').textContent = busy ? 'Writing with you' : state.connection === 'checking' ? 'Checking model' : ready ? 'Connected' : 'Connection needs attention';
  $('connection').className = 'badge ' + (busy || state.connection === 'checking' ? 'busy' : ready ? 'ready' : 'warning');
  $('model').textContent = settings.model;
  $('toggle').textContent = settings.enabled ? 'On' : 'Off'; $('toggle').setAttribute('aria-pressed', settings.enabled);
  $('error').textContent = state.error || ''; $('error').hidden = !state.error;
  const key = JSON.stringify(blocks);
  if (referenceKey !== key) { referenceKey = key; references('preContext', blocks.preContext || []); references('postContext', blocks.postContext || []); }
  if (document.activeElement !== $('intent')) $('intent').value = settings.intent || '';
  $('phase').textContent = !settings.enabled ? 'Paused' : busy ? 'Finding your next words…' : state.cached ? 'Ready to use again' : 'Ready when you are';
  $('suggestion').textContent = state.suggestion || (busy ? 'A little thought is on its way…' : 'Start writing in your editor. A suggestion will appear when you pause.');
  $('suggestion').className = 'suggestion' + (state.suggestion ? '' : ' empty');
  $('suggest').disabled = !settings.enabled || busy || !ready;
  $('debug').textContent = JSON.stringify({ input: state.input, request: state.request, rawResponse: state.rawSuggestion, phase: state.phase, cached: state.cached }, null, 2);
});
send('ready');
