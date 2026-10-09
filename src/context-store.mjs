const sides = ['preContext', 'postContext'];

// Storage and editor decorations belong to hosts; limits and reference data do not.
export class ContextStore {
  constructor(blocks = {}, onChange = () => {}) {
    this.onChange = onChange;
    this.blocks = { preContext: [], postContext: [] };
    for (const side of sides) this.set(side, blocks[side] || []);
  }
  snapshot() { return structuredClone(this.blocks); }
  set(side, blocks) {
    if (!sides.includes(side) || !Array.isArray(blocks) || blocks.length > 16 ||
      blocks.some(block => !block || typeof block.label !== 'string' || !block.label.trim() || block.label.length > 80 ||
        typeof block.text !== 'string' || block.text.length > 4000) ||
      blocks.reduce((length, block) => length + block.text.length, 0) > 8000) {
      throw RangeError('Context needs labels of 1–80 characters, at most 4,000 characters per block, 8,000 per side, and 16 blocks per side.');
    }
    this.blocks[side] = structuredClone(blocks);
    this.onChange(this.snapshot());
  }
  add(side, block) { this.set(side, [...this.blocks[side], block]); }
  replace(side, index, block) {
    if (!this.blocks[side]?.[index]) throw RangeError('Unknown reference.');
    this.set(side, this.blocks[side].map((value, i) => i === index ? block : value));
  }
  remove(side, index) { this.set(side, this.blocks[side].filter((_block, i) => i !== index)); }
}
