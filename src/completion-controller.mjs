import { joinCompletion } from './completion-join.mjs';
// Headless lifecycle: usable by textarea, contenteditable, terminal, or other adapters.
export class CompletionController {
  constructor({ generate, onChange = () => {}, onInteraction = () => {} }) {
    this.generate = generate; this.onChange = onChange; this.onInteraction = onInteraction;
    this.enabled = true; this.revision = 0; this.suggestion = ''; this.rawSuggestion = ''; this.context = null; this.phase = 'idle';
  }
  notify() { this.onChange(this); }
  cancel(action) {
    this.cached = false;
    this.lastAction = action || null;
    if (action && this.context && this.suggestion) this.onInteraction({ ...this.context, action, suggestion: this.suggestion, rawSuggestion: this.rawSuggestion });
    clearTimeout(this.timer); this.controller?.abort(); this.controller = null;
    this.revision++; this.suggestion = ''; this.rawSuggestion = ''; this.context = null; this.phase = 'idle'; this.notify();
  }
  setEnabled(enabled) { this.enabled = enabled; this.cancel('disabled'); }
  schedule(context, delay = 800) {
    clearTimeout(this.timer);
    if (this.enabled) { this.lastAction = null; this.phase = 'debouncing'; this.notify(); this.timer = setTimeout(() => this.request(context), delay); }
  }
  async request(context, { fresh = false } = {}) {
    this.cancel(); if (!this.enabled) return;
    const revision = this.revision, controller = new AbortController();
    this.controller = controller; this.context = context; this.phase = 'loading'; this.error = ''; this.notify();
    try {
      for await (const token of this.generate(context, controller.signal, { fresh })) {
        if (revision !== this.revision) return;
        this.rawSuggestion += token;
        this.suggestion = joinCompletion({ ...context, suggestion: this.rawSuggestion, complete: false });
        this.phase = 'streaming'; this.notify();
      }
      if (revision === this.revision) this.suggestion = joinCompletion({ ...context, suggestion: this.rawSuggestion });
    } catch (error) {
      if (revision === this.revision && error.name !== 'AbortError') { this.error = error.message; this.suggestion = ''; }
    } finally {
      if (revision === this.revision) { this.controller = null; this.phase = 'idle'; this.notify(); }
    }
  }
  accept() { const value = this.suggestion; this.cancel('accepted'); return value; }
}
