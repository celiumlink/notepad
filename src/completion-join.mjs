// Insertion-only reconciliation. Neither side of the user's draft is rewritten.
const WORD = /[\p{L}\p{N}\p{M}_]/u;
const HORIZONTAL = /[\t \u00a0]/u;
const WINDOW = 256;
const opening = /[([{“«]/u;
const closing = /[)\]}.,!?;:…»”]/u;
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const sentenceEnd = /[.,!?;:…)\]}»”]/u;
const last = value => Array.from(value).at(-1) || '';
const first = value => Array.from(value)[0] || '';

// Keep original offsets while folding runs of horizontal space for matching.
function folded(value) {
  let normalized = '', spans = [], offset = 0;
  for (const char of value) {
    const end = offset + char.length;
    if (HORIZONTAL.test(char)) {
      if (normalized.endsWith(' ')) spans[spans.length - 1].end = end;
      else { normalized += ' '; spans.push({ start: offset, end }); }
    } else {
      normalized += char;
      for (let i = 0; i < char.length; i++) spans.push({ start: offset, end });
    }
    offset = end;
  }
  return { normalized, spans };
}
function safeOverlap(left, right, length, side) {
  const match = left.slice(-length);
  if (!/[\p{L}\p{N}]/u.test(match)) {
    // Preserve ellipses, intentional dashes and repeated exclamation marks.
    return /^[\t \u00a0]*[,;:)\]}][\t \u00a0]*$/u.test(match) || match === '.' && !left.endsWith('..') && !right.startsWith('..');
  }
  const leftBefore = left.at(-length - 1) || '';
  const rightAfter = right[length] || '';
  if (!WORD.test(leftBefore) && !WORD.test(rightAfter)) return true;
  // Whole echoed word fragments, not coincidental shared letters (hel + lo).
  if (side === 'left') return length >= 3 && !WORD.test(leftBefore) && WORD.test(rightAfter);
  return length >= 3 && WORD.test(leftBefore) && !WORD.test(rightAfter);
}
function overlap(left, right, side) {
  for (let length = Math.min(left.length, right.length, WINDOW); length > 0; length--) {
    if (left.slice(-length) === right.slice(0, length) && safeOverlap(left, right, length, side)) return length;
  }
  return 0;
}
export function joinCompletion({ prefix = '', suffix = '', suggestion = '', mode = 'complete', complete = true }) {
  if (mode === 'hint') return suggestion;
  if (!suggestion) return '';
  // A cursor inside an existing word is not a safe prose insertion point.
  // Leave the word untouched; request again at its boundary.
  if (WORD.test(last(prefix)) && WORD.test(first(suffix)) && !cjk.test(last(prefix)) && !cjk.test(first(suffix))) return '';
  let text = suggestion;
  // A model may wrap an insertion in quotes already provided by the author.
  const leftQuote = last(prefix), rightQuote = first(suffix);
  if (['"', '“', '«'].includes(leftQuote)) {
    const trimmed = text.replace(/^[\t \u00a0]+/u, '');
    if (trimmed.startsWith(leftQuote)) text = trimmed.slice(leftQuote.length);
  }
  if (['"', '”', '»'].includes(rightQuote)) {
    const trimmed = text.replace(/[\t \u00a0]+$/u, '');
    if (trimmed.endsWith(rightQuote)) text = trimmed.slice(0, -rightQuote.length);
  }
  // Hold a partial echoed word until enough tokens arrive to distinguish it.
  if (!complete) {
    const partial = text.replace(/^[\t \u00a0]+/u, '');
    const tail = /[\p{L}\p{N}\p{M}_]+[\t \u00a0]*$/u.exec(prefix)?.[0].trimEnd() || '';
    if (partial && WORD.test(last(partial)) && tail.startsWith(partial)) return '';
  }
  const p = folded(prefix.slice(-WINDOW).replace(/[\t \u00a0]+$/u, ''));
  const s = folded(suffix.slice(0, WINDOW).replace(/^[\t \u00a0]+/u, ''));
  const leading = /^[\t \u00a0]*/u.exec(text)[0].length;
  let g = folded(text.slice(leading));
  const leftMatch = overlap(p.normalized, g.normalized, 'left');
  if (leftMatch) text = text.slice(leading + g.spans[leftMatch - 1].end);
  g = folded(text.replace(/[\t \u00a0]+$/u, ''));
  const rightMatch = overlap(g.normalized, s.normalized, 'right');
  if (rightMatch) text = text.slice(0, g.spans[g.normalized.length - rightMatch].start);

  // Clean generated horizontal spaces only; preserve paragraphs and indentation.
  text = text.replace(/[\t \u00a0]+([,.)\]}!?…])/gu, '$1');
  text = text.replace(/([([{“«])[\t \u00a0]+/gu, '$1');
  text = text.replace(/([,;:])[\t \u00a0]+/gu, '$1 ');
  // Numeric punctuation is meaningful (1,000; 3:30), not a prose separator.
  text = text.replace(/([,;:])(?=[\p{L}\p{N}])/gu, (match, mark, offset, value) => {
    if (/\p{N}/u.test(value[offset - 1] || '') && /\p{N}/u.test(value[offset + 1] || '')) return mark;
    return mark + ' ';
  });
  if (!text.trim()) return /[\r\n]/u.test(text) ? text : '';

  // A lower-case continuation or comma after the cursor continues this sentence.
  // Remove only a generated terminal full stop, retaining ellipses/abbreviations.
  const continuation = suffix.replace(/^[\t \u00a0]+/u, '');
  if (/^[\p{Ll},;:]/u.test(continuation) && /(?<!\.)\.[\t \u00a0]*$/u.test(text)) {
    const abbreviated = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)|\b(?:\p{L}\.)+\p{L})\.[\t \u00a0]*$/iu.test(text);
    if (!abbreviated) text = text.replace(/\.[\t \u00a0]*$/u, '');
  }

  // Reconcile whitespace at the two seams without changing existing spacing.
  const openDoubleQuote = (prefix.match(/(?<!\\)"/gu)?.length || 0) % 2 === 1;
  const opensAtLeft = opening.test(last(prefix)) || last(prefix) === '"' && openDoubleQuote;
  const closesAtRight = closing.test(first(suffix)) || first(suffix) === '"' && openDoubleQuote || /^['’][\p{L}]/u.test(suffix);
  if (HORIZONTAL.test(last(prefix)) || !prefix || opensAtLeft) text = text.replace(/^[\t \u00a0]+/u, '');
  if (/\s/u.test(first(suffix)) || closesAtRight) text = text.replace(/[\t \u00a0]+$/u, '');
  if (closing.test(first(text))) text = text.replace(/^[\t \u00a0]+/u, '');
  const a = last(prefix), b = first(text), c = last(text), d = first(suffix);
  // A leading space from the model is evidence that this starts a new word.
  // With no such evidence, an unfinished final word may receive a continuation.
  const rawStartsSpace = /^[\t \u00a0]/u.test(suggestion);
  const fragment = /[\p{L}\p{N}\p{M}_]+$/u.exec(prefix)?.[0] || '';
  const echoedFragment = fragment.length >= 3 && suggestion.startsWith(fragment);
  if (a && b && !/\s/u.test(a) && !/\s/u.test(b) && !opensAtLeft && !closing.test(b) && !cjk.test(a) && !cjk.test(b)) {
    if (sentenceEnd.test(a) || a === '"' && !openDoubleQuote || rawStartsSpace || leftMatch && !echoedFragment) text = ' ' + text;
  }
  if (c && d && !/\s/u.test(c) && !/\s/u.test(d) && !opening.test(c) && !closesAtRight && !cjk.test(c) && !cjk.test(d)) {
    if (!(rightMatch && WORD.test(c) && WORD.test(d)) && (WORD.test(c) && WORD.test(d) || sentenceEnd.test(c))) text += ' ';
  }
  // Do not manufacture a trailing boundary space while a word is still streaming.
  if (!complete && !suffix) text = text.replace(/[\t \u00a0]+$/u, '');
  return text;
}
