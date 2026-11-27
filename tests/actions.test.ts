import { describe, expect, it } from 'vitest';
import { ACTION_GROUPS, ACTION_IDS, ACTION_LABELS, ART_ACTIONS, COMMAND_ACTIONS, DEFAULT_KEYS, GEIST_ACTIONS, artOnKey, commandOnKey, sharesKey } from '../src/data/actions';
import { COMMANDS } from '../src/data/troops';

describe('Tastenbelegung', () => {
  it('jede Aktion hat eine Belegung', () => {
    for (const a of ACTION_IDS) expect(DEFAULT_KEYS[a]).toBeDefined();
  });

  it('K öffnet den Klassenbaum, Q ist Geistes-Faji (kein Waffenwechsel mehr), der schwere Angriff liegt nicht auf K', () => {
    expect(DEFAULT_KEYS.skills).toContain('KeyK');
    expect(DEFAULT_KEYS.geist1).toEqual(['KeyQ']);
    expect((ACTION_IDS as readonly string[]).includes('swap')).toBe(false);
    expect(DEFAULT_KEYS.heavy).not.toContain('KeyK');
  });

  it('Tasten teilen sich nur Aktionen, die nie gleichzeitig gelten (See und zu Fuß; Kampfkünste und Schnellleiste 1–4 nach festem Vorrang)', () => {
    // 4.6A: zu Fuß gehören 1–4 den Formen (die Güter dort ruhen, Game.update), an Bord den Gütern. 4.9: auch am Steuer liegen 1 – 5 auf den Formen;
    // Truppenbefehle (zu Fuß) und Flottenbefehle (auf See) teilen sich 6/7/Z; Geistes-Faji Q/G zu Fuß, Breitseite/Flicken auf See; R: Handlung vor Lebensstrom
    const allowed = new Set(['fireLeft|geist1', 'fireRight|talk', 'art1|item1', 'art2|item2', 'art3|item3', 'art4|item4', 'cmdSturm|fleetHold', 'cmdFollow|fleetAttack', 'cmdHold|fleetRally', 'geist2|interact', 'geist4|repair']);
    const seen = new Map<string, string>();
    for (const a of ACTION_IDS) for (const code of DEFAULT_KEYS[a]) {
      const other = seen.get(code);
      if (other) expect(allowed.has([other, a].sort().join('|')) || allowed.has(`${other}|${a}`), `${code}: ${other} / ${a}`).toBe(true);
      else seen.set(code, a);
    }
  });

  it('jede Aktion hat einen Namen und steht in genau einem Bereich der Tastenbelegung', () => {
    const inGroups: string[] = ACTION_GROUPS.flatMap((g) => g.actions);
    expect(new Set(inGroups).size).toBe(inGroups.length);
    for (const a of ACTION_IDS) {
      expect(ACTION_LABELS[a], a).toBeTruthy();
      expect(inGroups, a).toContain(a);
    }
  });

  it('4.7B: zehn Formen auf 1 – 5 und Umschalt + 1 – 5, Geistes-Faji auf Q/R/T/G, keine Kollision mit den Assists 8 – 0', () => {
    expect(ART_ACTIONS.map((a) => DEFAULT_KEYS[a][0])).toEqual(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Shift+Digit1', 'Shift+Digit2', 'Shift+Digit3', 'Shift+Digit4', 'Shift+Digit5']);
    expect(GEIST_ACTIONS.map((a) => DEFAULT_KEYS[a][0])).toEqual(['KeyQ', 'KeyR', 'KeyT', 'KeyG']);
    const assists = [...DEFAULT_KEYS.assist1, ...DEFAULT_KEYS.assist2, ...DEFAULT_KEYS.assist3];
    for (const a of [...ART_ACTIONS, ...GEIST_ACTIONS]) for (const c of DEFAULT_KEYS[a]) expect(assists, `${a}: ${c}`).not.toContain(c);
    // T erfasst kein Ziel mehr (Kamera-Erfassung bleibt auf F und mittlerer Maustaste)
    expect(DEFAULT_KEYS.lockon).not.toContain('KeyT');
  });

  it('jeder Truppenbefehl hat seine eigene, umbelegbare Aktion', () => {
    for (const c of COMMANDS) { const a = COMMAND_ACTIONS[c.id]; expect(ACTION_IDS).toContain(a); expect(DEFAULT_KEYS[a].length).toBeGreaterThan(0); }
    expect(new Set(Object.values(COMMAND_ACTIONS)).size).toBe(COMMANDS.length);
  });

  it('Befehl oder Gut: der Befehl besitzt nur die Taste, die er wirklich teilt (auch nach dem Umbelegen)', () => {
    // Standard seit 4.7B: Befehle auf 6, 7 und Z, die Schnellleiste bleibt frei
    for (const it of ['item1', 'item2', 'item3', 'item4'] as const) expect(commandOnKey(DEFAULT_KEYS, it)).toBeNull();
    // Befehle auf die Tasten der Schnellleiste gelegt: dort gehören sie den Befehlen
    const onBar = { ...DEFAULT_KEYS, cmdSturm: ['Digit1'], cmdFollow: ['Digit2'], cmdHold: ['Digit3'] };
    expect(commandOnKey(onBar, 'item1')).toBe('sturm');
    expect(commandOnKey(onBar, 'item3')).toBe('halten');
    expect(commandOnKey(onBar, 'item4')).toBeNull();
  });

  it('Formen 1–4: zu Fuß ruhen die Güter auf denselben Tasten, nach dem Umbelegen nicht mehr', () => {
    expect(ART_ACTIONS.slice(0, 4).map((a) => DEFAULT_KEYS[a])).toEqual([['Digit1'], ['Digit2'], ['Digit3'], ['Digit4']]);
    expect([1, 2, 3, 4].map((i) => artOnKey(DEFAULT_KEYS, `item${i}` as 'item1'))).toEqual([1, 2, 3, 4]);
    expect(artOnKey({ ...DEFAULT_KEYS, item1: ['Numpad1'] }, 'item1')).toBeNull();
    // Springen liegt allein auf der Leertaste, Ausweichen auf Umschalt
    expect(DEFAULT_KEYS.jump).toEqual(['Space']);
    expect(DEFAULT_KEYS.dodge).not.toContain('Space');
  });

  it('gemeinsame Tasten werden erkannt', () => {
    expect(sharesKey(DEFAULT_KEYS.item1, DEFAULT_KEYS.art1)).toBe(true);
    expect(sharesKey(DEFAULT_KEYS.item1, DEFAULT_KEYS.cmdSturm)).toBe(false);
    // 4.9: Truppen- und Flottenbefehle teilen sich 6/7/Z (zu Fuß bzw. auf See)
    expect(sharesKey(DEFAULT_KEYS.cmdSturm, DEFAULT_KEYS.fleetHold)).toBe(true);
    expect(sharesKey(DEFAULT_KEYS.cmdHold, DEFAULT_KEYS.fleetRally)).toBe(true);
    expect(sharesKey(['KeyZ'], DEFAULT_KEYS.cmdSturm)).toBe(false);
  });
});
