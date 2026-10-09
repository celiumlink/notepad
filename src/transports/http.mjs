export function createCompletionTransport({ endpoint = "/api/complete", fetchImpl = globalThis.fetch, headers = {}, buildRequest = context => context, onRequest = () => {}, onCache = () => {}, cacheEntries = 64 } = {}) {
  const cache = new Map();
  return async function* completionTransport(context, signal, { fresh = false } = {}) {
  const body = JSON.stringify(buildRequest(context));
  signal?.throwIfAborted();
  if (!fresh && cache.has(body)) {
    const result = cache.get(body); cache.delete(body); cache.set(body, result);
    onCache(JSON.parse(body), context);
    if (result) yield result;
    return;
  }
  onRequest(JSON.parse(body), context); // The inspector receives precisely the serialized payload.
  const response = await fetchImpl(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body, signal });
  if (!response.ok) throw Error(await response.text());
  const decoder = new TextDecoder(); let pending = '', done = false, result = '';
  function parse(line) {
    if (!line.trim()) return null;
    const event = JSON.parse(line); if (event.error) throw Error(event.error);
    if (event.done) done = true;
    return event.response || null;
  }
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split('\n'); pending = lines.pop();
    for (const line of lines) { const token = parse(line); if (token) { result += token; yield token; } }
  }
  pending += decoder.decode(); const token = parse(pending); if (token) { result += token; yield token; }
  if (!done) throw Error('The model stream ended early. Try again.');
  signal?.throwIfAborted();
  if (cacheEntries > 0) {
    cache.delete(body); cache.set(body, result);
    while (cache.size > cacheEntries) cache.delete(cache.keys().next().value);
  }
}

}
