import { contextMarks } from './kernel/context-marks.mjs';
import { ContextStore } from './kernel/index.mjs';

export class Contexts {
  constructor(vscode, storage, changed) {
    Object.assign(this, { vscode, storage, changed });
    this.store = new ContextStore(storage.get('references', {}));
    this.editors = new Map();
    this.decorations = ['rgba(80,170,110,0.22)', 'rgba(160,100,210,0.22)'].map(backgroundColor =>
      vscode.window.createTextEditorDecorationType({ backgroundColor }));
  }
  get blocks() { return this.store.blocks; }
  snapshot() { return this.store.snapshot(); }
  async save() { await this.storage.update('references', this.blocks); this.changed(); this.decorate(); }
  async add(side) {
    const editor = this.vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) return this.vscode.window.showInformationMessage('Select reference text first.');
    const text = editor.document.getText(editor.selection);
    const source = { start: editor.document.offsetAt(editor.selection.start), documentId: editor.document.uri.toString() };
    const label = await this.vscode.window.showInputBox({ prompt: 'Reference label', value: 'Reference', validateInput: value => !value.trim() || value.length > 80 ? 'Use 1–80 characters.' : undefined });
    if (!label) return;
    try { this.store.add(side, { label, text, source }); }
    catch (error) { return this.vscode.window.showErrorMessage(error.message); }
    await this.save();
  }
  async edit({ side, index }) {
    const block = this.blocks[side][index];
    const document = await this.vscode.workspace.openTextDocument({ language: 'markdown', content: block.text });
    this.editors.set(document.uri.toString(), { side, index });
    await this.vscode.window.showTextDocument(document, this.vscode.ViewColumn.Beside);
  }
  async documentChanged(document) {
    const reference = this.editors.get(document.uri.toString());
    if (reference) {
      const { side, index } = reference, text = document.getText();
      try { this.store.replace(side, index, { label: this.blocks[side][index].label, text }); }
      catch (error) { return this.vscode.window.showErrorMessage(error.message); }
      await this.save();
    } else this.decorate();
  }
  async remove({ side, index }) {
    this.store.remove(side, index);
    for (const [uri, reference] of this.editors) if (reference.side === side) {
      if (reference.index === index) this.editors.delete(uri);
      else if (reference.index > index) reference.index--;
    }
    await this.save();
  }
  decorate() {
    for (const editor of this.vscode.window.visibleTextEditors) {
      const context = Object.fromEntries(Object.entries(this.blocks).map(([side, blocks]) => [side, blocks.filter(block => block.source?.documentId === editor.document.uri.toString())]));
      const marks = contextMarks(editor.document.getText(), context);
      ['pre', 'post'].forEach((kind, i) => editor.setDecorations(this.decorations[i], marks.filter(mark => mark.kind === kind).map(mark => new this.vscode.Range(editor.document.positionAt(mark.start), editor.document.positionAt(mark.end)))));
    }
  }
  dispose() { this.decorations.forEach(decoration => decoration.dispose()); this.editors.clear(); }
}
