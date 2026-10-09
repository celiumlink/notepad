import { CompletionController } from './completion-controller.mjs';

// Host contract: readContext(), insertText(text, expectedContext).
// insertText MUST verify the expected document/revision and return true only
// after committing the insertion. The host owns cursor units and UI rendering.
export class InputSession {
  constructor({ adapter, generate, onChange, onInteraction, settings = {} }) {
    if (typeof adapter?.readContext !== 'function' || typeof adapter?.insertText !== 'function') throw TypeError('Input adapter needs readContext and insertText');
    this.adapter = adapter; this.settings = settings;
    this.controller = new CompletionController({ generate, onChange, onInteraction });
  }
  snapshot() {
    const input = this.adapter.readContext();
    if (!input || typeof input.prefix !== 'string' || typeof input.suffix !== 'string') return null;
    if (input.sensitive || input.composing || input.hasSelection) return null;
    return { ...input, ...this.settings, prefix: input.prefix, suffix: input.suffix };
  }
  inputChanged({ delay = 800, automatic = true } = {}) {
    if (this.committing) return;
    this.controller.cancel('edited');
    const context = this.snapshot();
    if (automatic && context && context.prefix.trim()) this.controller.schedule(context, delay);
  }
  async suggest({ fresh = false } = {}) {
    const context = this.snapshot();
    if (!context) { this.controller.cancel(); return; }
    await this.controller.request(context, { fresh });
  }
  accept() {
    const expected = this.controller.context, current = this.snapshot();
    if (!expected || !current || !this.controller.suggestion) return false;
    if (['prefix', 'suffix', 'documentId', 'revision'].some(key => expected[key] !== current[key])) {
      this.controller.cancel('dismissed'); return false;
    }
    let inserted;
    this.committing = true;
    try { inserted = this.adapter.insertText(this.controller.suggestion, expected); }
    finally { this.committing = false; }
    if (inserted !== true) {
      this.controller.cancel('dismissed'); return false;
    }
    this.controller.accept(); return true;
  }
  dismiss() { this.controller.cancel('dismissed'); }
  setEnabled(enabled) { this.controller.setEnabled(enabled); }
  dispose() { this.controller.setEnabled(false); }
}
