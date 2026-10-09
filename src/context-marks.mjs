// Decorations never change draft text. Ambiguous repeated matches stay unmarked.
import { contextReferences } from './prompt.mjs';
export function contextMarks(value, context) {
  const marks = [];
  for (const [key, kind] of [['preContext', 'pre'], ['postContext', 'post']]) {
    for (const block of contextReferences(context[key])) {
      if (!block.text) continue;
      let start = block.source?.start;
      if (!Number.isInteger(start) || value.slice(start, start + block.text.length) !== block.text) {
        start = value.indexOf(block.text);
        if (start !== value.lastIndexOf(block.text)) continue;
      }
      if (start >= 0) marks.push({ start, end: start + block.text.length, kind, label: block.label });
    }
  }
  return marks;
}
export function markedSegments(value, marks, start = 0, end = value.length) {
  const boundaries = [...new Set([start, end, ...marks.flatMap(m => [Math.max(start, Math.min(end, m.start)), Math.max(start, Math.min(end, m.end))])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((from, i) => ({ text: value.slice(from, boundaries[i + 1]), marks: marks.filter(m => m.start <= from && m.end >= boundaries[i + 1]) }));
}
