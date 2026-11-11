import { describe, expect, it } from 'vitest';
import { ACTION_IDS, DEFAULT_KEYS } from '../src/data/actions';

describe('Tastenbelegung', () => {
  it('jede Aktion hat eine Belegung', () => {
    for (const a of ACTION_IDS) expect(DEFAULT_KEYS[a]).toBeDefined();
  });

  it('K öffnet den Talentbaum, Q wechselt die Waffe, der schwere Angriff liegt nicht auf K', () => {
    expect(DEFAULT_KEYS.skills).toContain('KeyK');
    expect(DEFAULT_KEYS.swap).toContain('KeyQ');
    expect(DEFAULT_KEYS.heavy).not.toContain('KeyK');
  });

  it('Tasten teilen sich nur Aktionen, die nie gleichzeitig gelten (See und zu Fuß)', () => {
    const allowed = new Set(['fireLeft|swap', 'fireRight|talk']);
    const seen = new Map<string, string>();
    for (const a of ACTION_IDS) for (const code of DEFAULT_KEYS[a]) {
      const other = seen.get(code);
      if (other) expect(allowed.has([other, a].sort().join('|')) || allowed.has(`${other}|${a}`), `${code}: ${other} / ${a}`).toBe(true);
      else seen.set(code, a);
    }
  });
});
