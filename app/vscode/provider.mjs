import { CompletionKernel } from './kernel/index.mjs';
import { setTimeout as pause } from 'node:timers/promises';

export function ollamaHost(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw Error('Use an HTTP or HTTPS Ollama URL without credentials, query, or fragment.');
  }
  return url.href.replace(/\/$/, '');
}

export class ThoughtstreamProvider {
  constructor(vscode, { fetchImpl = globalThis.fetch, onError = () => {}, onState = () => {}, references = () => ({}) } = {}) {
    Object.assign(this, { vscode, fetchImpl, onError, onState, references });
  }
  settings(document) {
    const config = this.vscode.workspace.getConfiguration('thoughtstream', document?.uri);
    return {
      enabled: config.get('enabled', true), automatic: config.get('automatic', true),
      host: config.get('host', 'http://127.0.0.1:11434'), model: config.get('model', 'qwen-local'),
      languages: config.get('languages', ['markdown', 'plaintext']),
      delay: config.get('delay', 800), contextCharacters: config.get('contextCharacters', 6000),
      intent: config.get('intent', ''),
      options: { temperature: config.get('temperature', 0.5), num_predict: config.get('maxTokens', 32) }
    };
  }
  cancel() {
    const run = this.active;
    this.active = null;
    run?.abort.abort();
    run?.controller?.cancel();
    this.onState({ phase: 'idle' });
  }
  dispose() { this.cancel(); this.transport = null; }
  requestFresh() {
    this.cancel();
    const editor = this.vscode.window.activeTextEditor;
    this.fresh = editor && { document: editor.document, version: editor.document.version, position: editor.selection.active };
  }
  transportFor(settings) {
    const endpoint = ollamaHost(settings.host) + '/api/generate';
    const key = JSON.stringify([endpoint, settings.model]);
    if (this.transportKey !== key) {
      this.transportKey = key;
      this.transport = new CompletionKernel({ endpoint, model: settings.model, fetchImpl: this.fetchImpl, onChange: this.onState });
    }
    return this.transport;
  }
  matches(document, position, version) {
    const editor = this.vscode.window.activeTextEditor;
    return this.vscode.workspace.isTrusted && !document.isClosed && document.version === version &&
      editor?.document === document && editor.selections.length === 1 && editor.selection.isEmpty &&
      editor.selection.active.isEqual(position);
  }
  async provideInlineCompletionItems(document, position, context, token) {
    this.cancel();
    const settings = this.settings(document), version = document.version;
    const manual = context.triggerKind === this.vscode.InlineCompletionTriggerKind.Invoke;
    const fresh = this.fresh?.document === document && this.fresh.version === version && this.fresh.position.isEqual(position);
    if (fresh) this.fresh = null;
    if (!settings.enabled || (!manual && !fresh && !settings.automatic) || token.isCancellationRequested ||
      !this.matches(document, position, version) || context.selectedCompletionInfo ||
      !['file', 'untitled', 'vscode-remote'].includes(document.uri.scheme) ||
      !settings.languages.some(language => language === '*' || language === document.languageId)) return [];
    const text = document.getText(), offset = document.offsetAt(position);
    const input = { prefix: text.slice(Math.max(0, offset - settings.contextCharacters), offset),
      suffix: text.slice(offset, offset + settings.contextCharacters), mode: 'complete',
      intent: settings.intent, options: settings.options, ...this.references() };
    if (!input.prefix.trim()) return [];
    this.onState({ input, model: settings.model, error: '', rawSuggestion: '', suggestion: '', cached: false });
    const run = { abort: new AbortController() };
    this.active = run;
    const subscription = token.onCancellationRequested(() => {
      if (this.active === run) this.cancel();
    });
    try {
      if (!manual && !fresh) {
        this.onState({ phase: 'debouncing' });
        await pause(settings.delay, undefined, { signal: run.abort.signal });
      }
      if (run.abort.signal.aborted || !this.matches(document, position, version)) return [];
      run.controller = this.transportFor(settings);
      await run.controller.request(input, { fresh: Boolean(fresh), signal: AbortSignal.any([run.abort.signal, AbortSignal.timeout(60000)]) });
      if (this.active !== run || token.isCancellationRequested || !this.matches(document, position, version)) return [];
      const state = run.controller.snapshot();
      if (state.error) throw Error(state.error);
      if (!state.suggestion) return [];
      return [new this.vscode.InlineCompletionItem(state.suggestion, new this.vscode.Range(position, position),
        { command: 'thoughtstream.accepted', title: 'Record acceptance' })];
    } catch (error) {
      if (this.active === run && !run.abort.signal.aborted) this.onError(error);
      return [];
    } finally {
      subscription.dispose();
      if (this.active === run) this.active = null;
    }
  }
}
