import { CompletionController } from './completion-controller.mjs';
import { buildModelRequest } from './prompt.mjs';
import { createCompletionTransport } from './transports/http.mjs';

// Portable observable facade: hosts supply context and render plain snapshots.
export class CompletionKernel {
  constructor({ model, endpoint, fetchImpl, onChange = () => {} }) {
    this.onChange = onChange;
    this.state = { input: null, request: null, cached: false };
    const generate = createCompletionTransport({ endpoint, fetchImpl,
      buildRequest: input => buildModelRequest(input, model),
      onRequest: request => this.update({ request, cached: false }),
      onCache: request => this.update({ request, cached: true }) });
    this.controller = new CompletionController({ generate, onChange: controller => this.update({
      phase: controller.phase, enabled: controller.enabled, revision: controller.revision,
      rawSuggestion: controller.rawSuggestion, suggestion: controller.suggestion,
      error: controller.error || '', lastAction: controller.lastAction || ''
    }) });
    this.update({ phase: 'idle', enabled: true, revision: 0, rawSuggestion: '', suggestion: '', error: '', lastAction: '' });
  }
  snapshot() { return structuredClone(this.state); }
  update(values) { Object.assign(this.state, values); this.onChange(this.snapshot()); }
  async request(input, { signal, fresh = false } = {}) {
    this.update({ input: structuredClone(input), request: null, cached: false, error: '' });
    if (signal?.aborted) return;
    const cancel = () => this.cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    try { await this.controller.request(input, { fresh }); }
    finally { signal?.removeEventListener('abort', cancel); }
  }
  cancel(action) { this.controller.cancel(action); }
  accept() { return this.controller.accept(); }
  setEnabled(enabled) { this.controller.setEnabled(enabled); }
  dispose() { this.cancel(); }
}
