import test from 'node:test';
import assert from 'node:assert/strict';
import { ThoughtstreamProvider } from '../provider.mjs';
import { activate } from '../extension.mjs';

function fixture(overrides = {}, fetchImpl) {
  const position = { offset: 6, isEqual(other) { return this.offset === other.offset; } };
  const document = { uri: { scheme: 'file' }, languageId: 'markdown', version: 1,
    getText: () => 'Hello world', offsetAt: p => p.offset };
  const selection = { isEmpty: true, active: position };
  const settings = { enabled: true, automatic: true, host: 'http://localhost:11434', model: 'test',
    languages: ['markdown'], delay: 0, contextCharacters: 6000, ...overrides };
  const calls = [], errors = [], commands = new Map(), listeners = [];
  const disposable = { dispose() {} };
  const config = { get: (key, fallback) => settings[key] ?? fallback,
    update: async (key, value) => { settings[key] = value; } };
  const vscode = {
    workspace: { isTrusted: true, getConfiguration: () => config,
      onDidChangeTextDocument: fn => { listeners.push(fn); return disposable; },
      onDidChangeConfiguration: () => disposable, onDidCloseTextDocument: () => disposable },
    window: { activeTextEditor: { document, selection, selections: [selection] },
      createOutputChannel: () => ({ ...disposable, appendLine: message => errors.push(message) }),
      onDidChangeTextEditorSelection: () => disposable, onDidChangeActiveTextEditor: () => disposable,
      createStatusBarItem: () => ({ ...disposable, show() {} }), createTreeView: () => disposable,
      createTextEditorDecorationType: () => disposable, visibleTextEditors: [] },
    StatusBarAlignment: { Right: 1 }, ThemeColor: class {},
    EventEmitter: class { event() {} fire() {} dispose() {} },
    languages: { registerInlineCompletionItemProvider: () => disposable },
    commands: { registerCommand: (name, fn) => { commands.set(name, fn); return disposable; },
      executeCommand: async name => calls.push(name) },
    ConfigurationTarget: { Global: 1 }, InlineCompletionTriggerKind: { Invoke: 0, Automatic: 1 },
    Range: class { constructor(start, end) { Object.assign(this, { start, end }); } },
    InlineCompletionItem: class { constructor(insertText, range) { Object.assign(this, { insertText, range }); } }
  };
  const token = { isCancellationRequested: false, onCancellationRequested(fn) { this.cancel = () => { this.isCancellationRequested = true; fn(); }; return disposable; } };
  const provider = new ThoughtstreamProvider(vscode, { onError: error => errors.push(error.message),
    fetchImpl: fetchImpl || (async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return new Response('{"response":"beautiful ","done":false}\n{"done":true}\n');
    }) });
  const request = (triggerKind = 0) => provider.provideInlineCompletionItems(document, position, { triggerKind }, token);
  return { provider, request, vscode, document, position, selection, settings, token, calls, errors, commands, listeners };
}

test('maps cursor context to raw Ollama request and insertion-only ghost text; reuses kernel cache', async () => {
  const f = fixture();
  const [item] = await f.request();
  assert.equal(item.insertText, 'beautiful ');
  assert.equal(item.range.start, f.position);
  assert.equal(item.range.end, f.position);
  assert.match(f.calls[0].body.prompt, /Hello \[gap\]world/);
  assert.equal(f.calls[0].url, 'http://localhost:11434/api/generate');
  assert.equal(f.calls[0].body.model, 'test');
  assert.equal(f.calls[0].body.raw, true);
  await f.request();
  assert.equal(f.calls.length, 1);
  f.provider.requestFresh(); await f.request();
  assert.equal(f.calls.length, 2);
});

test('disabled, untrusted, selected, multiple-cursor, and unsupported documents never send text', async () => {
  for (const mutate of [f => { f.settings.enabled = false; }, f => { f.vscode.workspace.isTrusted = false; },
    f => { f.selection.isEmpty = false; }, f => { f.vscode.window.activeTextEditor.selections.push(f.selection); },
    f => { f.document.languageId = 'javascript'; }, f => { f.document.uri.scheme = 'git'; }]) {
    const f = fixture(); mutate(f); assert.deepEqual(await f.request(), []); assert.equal(f.calls.length, 0);
  }
});

test('manual requests work with automatic suggestions off; cancelled debounce does not fetch', async () => {
  const f = fixture({ automatic: false });
  assert.deepEqual(await f.request(1), []);
  assert.equal((await f.request()).length, 1);
  const waiting = fixture({ delay: 5000 });
  const pending = waiting.request(1); waiting.token.cancel();
  assert.deepEqual(await pending, []); assert.equal(waiting.calls.length, 0);
});

test('a cancelled in-flight stream is aborted and returns no suggestion', async () => {
  let started, signal;
  const ready = new Promise(resolve => { started = resolve; });
  const f = fixture({}, async (_url, options) => {
    signal = options.signal; started();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const pending = f.request(); await ready; f.token.cancel();
  assert.deepEqual(await pending, []); assert.equal(signal.aborted, true); assert.deepEqual(f.errors, []);
});

test('document revisions and cursor switches discard completed results', async () => {
  for (const mutate of [f => { f.document.version++; }, f => { f.selection.active = { isEqual: () => false }; },
    f => { f.vscode.window.activeTextEditor = undefined; }]) {
    let finish;
    const f = fixture({}, () => new Promise(resolve => { finish = resolve; }));
    const pending = f.request(); mutate(f);
    finish(new Response('{"response":"beautiful ","done":true}\n'));
    assert.deepEqual(await pending, []);
  }
});

test('transport failures are surfaced and do not produce ghost text', async () => {
  const f = fixture({}, async () => new Response('model missing', { status: 404 }));
  assert.deepEqual(await f.request(), []); assert.deepEqual(f.errors, ['model missing']);
});

test('context limits apply and switching models invalidates transport cache', async () => {
  const f = fixture({ contextCharacters: 3 }); await f.request();
  assert.match(f.calls[0].body.prompt, /lo \[gap\]wor/);
  f.settings.model = 'other'; await f.request();
  assert.equal(f.calls[1].body.model, 'other');
});

test('activation registers commands, delegates triggering to editor, and disposes resources', async () => {
  const f = fixture(), context = { subscriptions: [], workspaceState: { get: (_key, fallback) => fallback, update: async () => {} } };
  activate(f.vscode, context, async () => new Response('{"models":[{"name":"test"}]}'));
  await f.commands.get('thoughtstream.suggest')();
  assert.deepEqual(f.calls.filter(name => name !== 'setContext'), ['editor.action.inlineSuggest.hide', 'editor.action.inlineSuggest.trigger']);
  await f.commands.get('thoughtstream.toggle')(); assert.equal(f.settings.enabled, false);
  for (const resource of context.subscriptions) resource.dispose();
});
