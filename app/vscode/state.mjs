import { ollamaHost } from './provider.mjs';
// Native editor UI observes snapshots; the shared kernel has no editor dependency.
export class StateView {
  constructor(vscode, settings, references) {
    Object.assign(this, { vscode, settings, references, state: { phase: 'idle', connection: 'checking' } });
    this.changes = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changes.event;
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10);
    this.status.command = 'thoughtstream.checkModel';
    this.status.name = 'Thoughtstream model';
  }
  update(values) {
    Object.assign(this.state, values);
    const { enabled, model } = this.settings();
    const busy = ['loading', 'streaming'].includes(this.state.phase);
    const icon = !enabled ? 'circle-slash' : busy || this.state.connection === 'checking' ? 'sync~spin' :
      this.state.error || this.state.connection !== 'ready' ? 'warning' : 'circle-filled';
    this.status.text = `$(${icon}) ${model}`;
    this.status.color = icon === 'warning' ? new this.vscode.ThemeColor('statusBarItem.warningForeground') : undefined;
    this.status.tooltip = `Thoughtstream: ${!enabled ? 'off' : this.state.connection} · ${this.state.phase}\n${this.state.error || 'Click to check the model connection.'}`;
    this.status.show(); this.changes.fire();
    void this.vscode.commands.executeCommand('setContext', 'thoughtstream.modelReady', this.state.connection === 'ready');
  }
  getTreeItem(item) { return item; }
  getChildren(parent) {
    const { vscode, state } = this, references = this.references();
    const groups = {
      Model: { ...this.settings(), connection: state.connection, error: state.error || '' },
      Completion: { phase: state.phase, cached: state.cached || false, lastAction: state.lastAction || '', rawSuggestion: state.rawSuggestion || '', suggestion: state.suggestion || '' },
      'Pre-context': references.preContext, 'Post-context': references.postContext,
      Input: state.input || {}, Request: state.request || {}
    };
    if (!parent) return Object.keys(groups).map(label => new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded));
    const group = groups[parent.label];
    if (Array.isArray(group)) return group.map((block, index) => {
      const item = new vscode.TreeItem(block.label);
      item.tooltip = block.text; item.contextValue = 'reference'; item.index = index;
      item.side = parent.label === 'Pre-context' ? 'preContext' : 'postContext';
      item.command = { command: 'thoughtstream.editContext', title: 'Edit reference', arguments: [item] };
      return item;
    });
    return Object.entries(group || {}).map(([label, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      const item = new vscode.TreeItem(label);
      item.description = text.replace(/\s+/g, ' ').slice(0, 120) || '(empty)';
      item.tooltip = text || '(empty)';
      item.command = { command: 'thoughtstream.copyValue', title: 'Copy value', arguments: [text] };
      return item;
    });
  }
  async check(fetchImpl = globalThis.fetch) {
    const generation = this.checkGeneration = (this.checkGeneration || 0) + 1;
    this.checkAbort?.abort(); this.checkAbort = new AbortController();
    this.update({ connection: 'checking' });
    try {
      const { host, model } = this.settings();
      const response = await fetchImpl(ollamaHost(host) + '/api/tags', { signal: AbortSignal.any([this.checkAbort.signal, AbortSignal.timeout(5000)]) });
      if (!response.ok) throw Error(`Ollama returned HTTP ${response.status}`);
      const { models = [] } = await response.json();
      if (!models.some(m => m.name === model || m.name === model + ':latest')) throw Error(`Model ${model} is not installed in Ollama.`);
      if (this.checkGeneration === generation) this.update({ connection: 'ready', error: '' });
    } catch (error) {
      if (this.checkGeneration === generation) this.update({ connection: 'unavailable', error: error.message });
    }
  }
  dispose() { this.checkGeneration++; this.checkAbort?.abort(); this.status.dispose(); this.changes.dispose(); }
}
