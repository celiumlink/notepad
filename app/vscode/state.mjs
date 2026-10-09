import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ollamaHost } from './provider.mjs';

export class StateView {
  constructor(vscode, settings, references, { extensionUri, handleMessage } = {}) {
    Object.assign(this, { vscode, settings, references, extensionUri, handleMessage, state: { phase: 'idle', connection: 'checking' }, subscriptions: [] });
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10);
    this.status.command = 'thoughtstream.checkModel';
    this.status.name = 'Thoughtstream model';
  }
  async resolveWebviewView(view) {
    const { webview } = view, { vscode } = this;
    this.webview = webview;
    webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] };
    const nonce = randomBytes(16).toString('hex');
    const asset = name => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', name)).toString();
    webview.html = (await readFile(new URL('./media/panel.html', import.meta.url), 'utf8'))
      .replaceAll('{{source}}', webview.cspSource).replaceAll('{{nonce}}', nonce)
      .replace('{{style}}', asset('panel.css')).replace('{{script}}', asset('panel.js'));
    this.subscriptions.push(webview.onDidReceiveMessage(message => {
      if (message?.action === 'ready') this.publish();
      else if (['suggest', 'toggle', 'checkModel', 'addPreContext', 'addPostContext', 'editContext', 'removeContext', 'setIntent'].includes(message?.action)) {
        Promise.resolve(this.handleMessage(message)).catch(error => vscode.window.showErrorMessage(error.message));
      }
    }));
    this.publish();
  }
  publish() { void this.webview?.postMessage({ state: this.state, settings: this.settings(), references: this.references() }); }
  update(values) {
    Object.assign(this.state, values);
    const { enabled, model } = this.settings(), busy = ['loading', 'streaming'].includes(this.state.phase);
    const icon = !enabled ? 'circle-slash' : busy || this.state.connection === 'checking' ? 'sync~spin' :
      this.state.error || this.state.connection !== 'ready' ? 'warning' : 'circle-filled';
    this.status.text = `$(${icon}) ${model}`;
    this.status.color = icon === 'warning' ? new this.vscode.ThemeColor('statusBarItem.warningForeground') : undefined;
    this.status.tooltip = `Thoughtstream: ${!enabled ? 'off' : this.state.connection} · ${this.state.phase}\n${this.state.error || 'Click to check the model connection.'}`;
    this.status.show();
    clearTimeout(this.refresh); this.refresh = setTimeout(() => this.publish(), 40);
    void this.vscode.commands.executeCommand('setContext', 'thoughtstream.modelReady', this.state.connection === 'ready');
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
  dispose() { clearTimeout(this.refresh); this.checkGeneration++; this.checkAbort?.abort(); this.status.dispose(); this.subscriptions.forEach(subscription => subscription.dispose()); }
}
