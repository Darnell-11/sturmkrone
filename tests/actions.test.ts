import { describe, expect, it } from 'vitest';
import { ACTION_GROUPS, ACTION_IDS, ACTION_LABELS, ART_ACTIONS, COMMAND_ACTIONS, DEFAULT_KEYS, artOnKey, commandOnKey, sharesKey } from '../src/data/actions';
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

  it('Tasten teilen sich nur Aktionen, die nie gleichzeitig gelten (See und zu Fuß; Kampfkünste und Schnellleiste 1–4 nach festem Vorrang)', () => {
    // 4.6A: zu Fuß gehören 1–4 den Kampfkünsten (die Güter dort ruhen, Game.update), an Bord den Gütern; Truppenbefehle (nur zu Fuß) liegen
    // auf 5–7 wie die Flottenbefehle (nur auf See)
    const allowed = new Set(['fireLeft|swap', 'fireRight|talk', 'art1|item1', 'art2|item2', 'art3|item3', 'art4|item4', 'cmdSturm|fleetHold', 'cmdFollow|fleetAttack', 'cmdHold|fleetRally']);
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
    // Standard seit 4.6A: Befehle auf 5–7, die Schnellleiste bleibt frei
    for (const it of ['item1', 'item2', 'item3', 'item4'] as const) expect(commandOnKey(DEFAULT_KEYS, it)).toBeNull();
    // Befehle auf die Tasten der Schnellleiste gelegt: dort gehören sie den Befehlen
    const onBar = { ...DEFAULT_KEYS, cmdSturm: ['Digit1'], cmdFollow: ['Digit2'], cmdHold: ['Digit3'] };
    expect(commandOnKey(onBar, 'item1')).toBe('sturm');
    expect(commandOnKey(onBar, 'item3')).toBe('halten');
    expect(commandOnKey(onBar, 'item4')).toBeNull();
  });

  it('Kampfkünste 1–4: zu Fuß ruhen die Güter auf denselben Tasten, nach dem Umbelegen nicht mehr', () => {
    expect(ART_ACTIONS.map((a) => DEFAULT_KEYS[a])).toEqual([['Digit1'], ['Digit2'], ['Digit3'], ['Digit4']]);
    expect([1, 2, 3, 4].map((i) => artOnKey(DEFAULT_KEYS, `item${i}` as 'item1'))).toEqual([1, 2, 3, 4]);
    expect(artOnKey({ ...DEFAULT_KEYS, item1: ['Numpad1'] }, 'item1')).toBeNull();
    // Springen liegt allein auf der Leertaste, Ausweichen auf Umschalt
    expect(DEFAULT_KEYS.jump).toEqual(['Space']);
    expect(DEFAULT_KEYS.dodge).not.toContain('Space');
  });

  it('gemeinsame Tasten werden erkannt', () => {
    expect(sharesKey(DEFAULT_KEYS.item1, DEFAULT_KEYS.art1)).toBe(true);
    expect(sharesKey(DEFAULT_KEYS.item1, DEFAULT_KEYS.cmdSturm)).toBe(false);
    expect(sharesKey(DEFAULT_KEYS.cmdSturm, DEFAULT_KEYS.fleetHold)).toBe(true);
    expect(sharesKey(['KeyZ'], DEFAULT_KEYS.cmdSturm)).toBe(false);
  });
});
