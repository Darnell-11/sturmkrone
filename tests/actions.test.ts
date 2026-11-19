import { describe, expect, it } from 'vitest';
import { ACTION_GROUPS, ACTION_IDS, ACTION_LABELS, COMMAND_ACTIONS, DEFAULT_KEYS, commandOnKey, sharesKey } from '../src/data/actions';
import { COMMANDS } from '../src/data/troops';

describe('Tastenbelegung', () => {
  it('jede Aktion hat eine Belegung', () => {
    for (const a of ACTION_IDS) expect(DEFAULT_KEYS[a]).toBeDefined();
  });

  it('K öffnet den Talentbaum, Q wechselt die Waffe, der schwere Angriff liegt nicht auf K', () => {
    expect(DEFAULT_KEYS.skills).toContain('KeyK');
    expect(DEFAULT_KEYS.swap).toContain('KeyQ');
    expect(DEFAULT_KEYS.heavy).not.toContain('KeyK');
  });

  it('Tasten teilen sich nur Aktionen, die nie gleichzeitig gelten (See und zu Fuß; Befehle und Schnellleiste 1–3 nach festem Vorrang)', () => {
    // Befehle: solange Trupps im Einsatz sind, gehören die Tasten den Befehlen, die Güter dort ruhen (Game.update, HUD-Befehlsmodus)
    const allowed = new Set(['fireLeft|swap', 'fireRight|talk', 'cmdSturm|item1', 'cmdFollow|item2', 'cmdHold|item3']);
    const seen = new Map<string, string>();
    for (const a of ACTION_IDS) for (const code of DEFAULT_KEYS[a]) {
      const other = seen.get(code);
      if (other) expect(allowed.has([other, a].sort().join('|')) || allowed.has(`${other}|${a}`), `${code}: ${other} / ${a}`).toBe(true);
      else seen.set(code, a);
    }
  });

  it('jede Aktion hat einen Namen und steht in genau einem Bereich der Tastenbelegung', () => {
    const inGroups = ACTION_GROUPS.flatMap((g) => g.actions);
    expect(new Set(inGroups).size).toBe(inGroups.length);
    for (const a of ACTION_IDS) { expect(ACTION_LABELS[a], a).toBeTruthy(); expect(inGroups, a).toContain(a); }
  });

  it('jeder Truppenbefehl hat seine eigene, umbelegbare Aktion', () => {
    for (const c of COMMANDS) { const a = COMMAND_ACTIONS[c.id]; expect(ACTION_IDS).toContain(a); expect(DEFAULT_KEYS[a].length).toBeGreaterThan(0); }
    expect(new Set(Object.values(COMMAND_ACTIONS)).size).toBe(COMMANDS.length);
  });

  it('Befehl oder Gut: der Befehl besitzt nur die Taste, die er wirklich teilt (auch nach dem Umbelegen)', () => {
    expect(commandOnKey(DEFAULT_KEYS, 'item1')).toBe('sturm');
    expect(commandOnKey(DEFAULT_KEYS, 'item2')).toBe('folgen');
    expect(commandOnKey(DEFAULT_KEYS, 'item3')).toBe('halten');
    expect(commandOnKey(DEFAULT_KEYS, 'item4')).toBeNull();
    // Befehle auf eigene Tasten gelegt: die Schnellleiste 1–3 bleibt frei nutzbar
    expect(commandOnKey({ ...DEFAULT_KEYS, cmdSturm: ['KeyZ'], cmdFollow: ['KeyX'], cmdHold: ['KeyV'] }, 'item1')).toBeNull();
  });

  it('gemeinsame Tasten werden erkannt (Standard: Befehle 1–3 liegen auf den Schnellleisten-Tasten)', () => {
    expect(sharesKey(DEFAULT_KEYS.item1, DEFAULT_KEYS.cmdSturm)).toBe(true);
    expect(sharesKey(DEFAULT_KEYS.item4, DEFAULT_KEYS.cmdHold)).toBe(false);
    expect(sharesKey(['KeyZ'], DEFAULT_KEYS.cmdSturm)).toBe(false);
  });
});
