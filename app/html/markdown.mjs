import { marked } from './vendor/marked.mjs';
import katex from './vendor/katex.mjs';
import DOMPurify from './vendor/purify.mjs';

// Parse math before Markdown can consume TeX escapes or underscores.
export function mathExtensions(render = (text, displayMode) => katex.renderToString(text, { displayMode, throwOnError: false, trust: false, maxExpand: 1000 })) {
  return [
    { name: 'blockMath', level: 'block', start: source => source.search(/\$\$|\\\[/), tokenizer(source) {
      const match = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])(?:\n|$)/.exec(source);
      if (match) return { type: 'blockMath', raw: match[0], text: match[1] ?? match[2] };
    }, renderer: token => render(token.text, true) },
    { name: 'inlineMath', level: 'inline', start: source => source.search(/\$|\\\(/), tokenizer(source) {
      const match = /^(?:\$(?!\$)([^\n$]+?)\$(?!\$)|\\\(([\s\S]+?)\\\))/.exec(source);
      if (match) return { type: 'inlineMath', raw: match[0], text: match[1] ?? match[2] };
    }, renderer: token => render(token.text, false) },
  ];
}
marked.use({ gfm: true, extensions: mathExtensions() });
export function createMarkdownEditor(editor) {
  const preview = document.getElementById('markdown-preview');
  let previous, timer;
  function refresh() {
    if (previous === editor.value) return;
    previous = editor.value;
    preview.innerHTML = DOMPurify.sanitize(marked.parse(previous || '*Your rendered Markdown will appear here.*'));
    for (const link of preview.querySelectorAll('a')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    for (const image of preview.querySelectorAll('img')) image.loading = 'lazy';
  }
  editor.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(refresh, 120); });
  for (const mode of ['edit', 'split', 'preview']) document.getElementById('view-' + mode).onclick = () => {
    document.getElementById('document-panes').dataset.view = mode;
    for (const name of ['edit', 'split', 'preview']) document.getElementById('view-' + name).setAttribute('aria-pressed', String(name === mode));
    refresh();
    if (mode === 'edit') editor.focus();
  };
  document.getElementById('download-markdown').onclick = () => {
    const url = URL.createObjectURL(new Blob([editor.value], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'thoughtstream.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  refresh(); return { refresh };
}
