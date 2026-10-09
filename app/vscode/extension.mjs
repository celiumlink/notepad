import { ThoughtstreamProvider } from './provider.mjs';
import { StateView } from './state.mjs';
import { Contexts } from './contexts.mjs';

export function activate(vscode, context, fetchImpl = globalThis.fetch) {
  const output = vscode.window.createOutputChannel('Thoughtstream');
  const references = new Contexts(vscode, context.workspaceState, () => {
    provider.cancel(); view.update({ lastAction: 'context changed' });
    void vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
  });
  const provider = new ThoughtstreamProvider(vscode, {
    fetchImpl, references: () => references.snapshot(), onState: state => view.update(state),
    onError: error => { output.appendLine(error.message); view.update({ error: error.message }); }
  });
  const view = new StateView(vscode, () => provider.settings(vscode.window.activeTextEditor?.document), () => references.blocks);
  const check = () => view.check(fetchImpl);
  const timer = setInterval(check, 30000); timer.unref();
  const command = (name, handler) => vscode.commands.registerCommand('thoughtstream.' + name, handler);
  context.subscriptions.push(output, provider, view, references, { dispose: () => clearInterval(timer) },
    vscode.window.createTreeView('thoughtstream.state', { treeDataProvider: view }),
    vscode.languages.registerInlineCompletionItemProvider(['file', 'untitled', 'vscode-remote'].map(scheme => ({ scheme })), provider),
    command('suggest', async () => {
      provider.requestFresh();
      await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
      await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    }),
    command('toggle', async () => {
      const config = vscode.workspace.getConfiguration('thoughtstream', vscode.window.activeTextEditor?.document.uri);
      await config.update('enabled', !config.get('enabled', true), vscode.ConfigurationTarget.Global);
    }),
    command('checkModel', check), command('modelReady', check),
    command('accepted', () => provider.transport?.accept()),
    command('copyValue', text => vscode.env.clipboard.writeText(text)),
    command('addPreContext', () => references.add('preContext')),
    command('addPostContext', () => references.add('postContext')),
    command('editContext', item => references.edit(item)),
    command('removeContext', item => references.remove(item)),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document === vscode.window.activeTextEditor?.document) { provider.cancel(); view.update({ lastAction: 'edited' }); }
      void references.documentChanged(event.document);
    }),
    vscode.workspace.onDidCloseTextDocument(document => references.editors.delete(document.uri.toString())),
    vscode.window.onDidChangeTextEditorSelection(() => provider.cancel()),
    vscode.window.onDidChangeActiveTextEditor(() => { provider.cancel(); references.decorate(); }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('thoughtstream')) return;
      provider.cancel(); provider.transportKey = null;
      void vscode.commands.executeCommand('editor.action.inlineSuggest.hide'); void check();
    })
  );
  void check();
  return { provider, view, references };
}
