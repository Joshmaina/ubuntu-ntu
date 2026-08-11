import { describe, it, expect } from 'vitest';
import {
  joinMorphemes,
  validateGloss,
  glossLine,
  alignColumns,
  shuffleForAssembly,
} from '../gloss.js';
import type { Morpheme } from '../types.js';

/**
 * Gĩkũyũ pilot sentence: "Nĩngũthiĩ ndũnyũ" — "I am going to the market."
 * Provisional content, not yet validated by a native speaker
 * (docs/09-DATA-GOVERNANCE.md). Used here only to exercise the parser.
 */
const SENTENCE: Morpheme[] = [
  { morph: 'Nĩ', category: 'FOCUS' },
  { morph: 'n', anchor: 'I' },
  { morph: 'gũ', category: 'FUTURE' },
  { morph: 'thiĩ', anchor: 'go' },
  { morph: ' ndũnyũ', anchor: 'market' },
];

describe('joinMorphemes', () => {
  it('concatenates surface forms in order', () => {
    expect(joinMorphemes(SENTENCE)).toBe('Nĩngũthiĩ ndũnyũ');
  });

  it('returns an empty string for no morphemes', () => {
    expect(joinMorphemes([])).toBe('');
  });
});

describe('validateGloss', () => {
  it('accepts a gloss that reassembles into the target', () => {
    expect(validateGloss('Nĩngũthiĩ ndũnyũ', SENTENCE)).toEqual({ valid: true, errors: [] });
  });

  it('ignores whitespace differences', () => {
    expect(validateGloss('Nĩngũthiĩ   ndũnyũ', SENTENCE).valid).toBe(true);
  });

  /**
   * The check that matters most. A gloss that does not reassemble teaches a
   * structure the language does not have — invisible on inspection, so it is
   * caught mechanically.
   */
  it('rejects a gloss that does not reassemble into the target', () => {
    const result = validateGloss('Nĩngũthiĩ mũgũnda', SENTENCE);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('do not reassemble'))).toBe(true);
  });

  it('rejects an empty gloss', () => {
    const result = validateGloss('anything', []);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('gloss is empty');
  });

  it('rejects an empty surface form', () => {
    const result = validateGloss('ab', [{ morph: 'a', anchor: 'a' }, { morph: '', anchor: 'b' }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('surface form is empty'))).toBe(true);
  });

  /** FR-043: never a blank cell under a morpheme. */
  it('rejects a morpheme with neither anchor nor category', () => {
    const result = validateGloss('ab', [{ morph: 'a', anchor: 'a' }, { morph: 'b' }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('needs an anchor or a category'))).toBe(true);
  });

  it('rejects empty-string anchor and category as equivalent to missing', () => {
    const result = validateGloss('a', [{ morph: 'a', anchor: '', category: '' }]);
    expect(result.valid).toBe(false);
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const result = validateGloss('xyz', [{ morph: 'a' }, { morph: '' }]);
    expect(result.errors.length).toBeGreaterThan(2);
  });
});

describe('glossLine', () => {
  it('uses the anchor when present', () => {
    expect(glossLine([{ morph: 'thiĩ', anchor: 'go' }])).toEqual(['go']);
  });

  it('uppercases a grammatical category', () => {
    expect(glossLine([{ morph: 'gũ', category: 'future' }])).toEqual(['FUTURE']);
  });

  it('prefers the anchor when both are present', () => {
    expect(glossLine([{ morph: 'x', anchor: 'thing', category: 'NOUN' }])).toEqual(['thing']);
  });

  it('falls back to ? when both are missing', () => {
    expect(glossLine([{ morph: 'x' }])).toEqual(['?']);
  });

  it('treats an empty anchor as missing', () => {
    expect(glossLine([{ morph: 'x', anchor: '', category: 'PAST' }])).toEqual(['PAST']);
  });
});

describe('alignColumns', () => {
  it('takes the wider of morpheme and gloss for each column', () => {
    const widths = alignColumns([
      { morph: 'n', anchor: 'I' },
      { morph: 'gũ', category: 'FUTURE' },
    ]);
    expect(widths[0]).toBe(1);
    expect(widths[1]).toBe(6); // "FUTURE" is wider than "gũ"
  });

  it('returns an empty array for no morphemes', () => {
    expect(alignColumns([])).toEqual([]);
  });
});

describe('shuffleForAssembly', () => {
  const tiles = ['Nĩ', 'n', 'gũ', 'thiĩ', 'ndũnyũ'];

  it('preserves every element', () => {
    expect([...shuffleForAssembly(tiles, 42)].sort()).toEqual([...tiles].sort());
  });

  /** Deterministic by design — ADR-0002 forbids Math.random in core. */
  it('is deterministic for a given seed', () => {
    expect(shuffleForAssembly(tiles, 42)).toEqual(shuffleForAssembly(tiles, 42));
  });

  it('produces different orderings for different seeds', () => {
    const orderings = [1, 2, 3, 4, 5, 6].map((s) => shuffleForAssembly(tiles, s).join('|'));
    expect(new Set(orderings).size).toBeGreaterThan(1);
  });

  it('does not mutate the input', () => {
    const original = [...tiles];
    shuffleForAssembly(tiles, 7);
    expect(tiles).toEqual(original);
  });

  it('handles empty and single-element inputs', () => {
    expect(shuffleForAssembly([], 1)).toEqual([]);
    expect(shuffleForAssembly(['only'], 1)).toEqual(['only']);
  });

  it('accepts a seed of zero', () => {
    expect(shuffleForAssembly(tiles, 0)).toHaveLength(tiles.length);
  });
});
