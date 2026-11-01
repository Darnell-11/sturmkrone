import { describe, expect, it } from 'vitest';
import { computePassives, learnBlock, SK, SKILLS, SYNERGIES } from '../src/data/skills';

describe('Faji-Baum', () => {
  it('hat mindestens 60 Fähigkeiten mit eindeutigen IDs und gültigen Verbindungen', () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(SKILLS.length);
    for (const s of SKILLS) for (const n of s.needs ?? []) expect(SK[n], `${s.id} braucht ${n}`).toBeDefined();
    for (const sy of SYNERGIES) for (const n of sy.needs) expect(SK[n]).toBeDefined();
  });

  it('enthält alle 37 Fähigkeiten aus 1.0', () => {
    const old = ['eisenfaust', 'eisenhaut', 'sprint', 'bergbrecher', 'stahlleib', 'hundert', 'atem', 'titan', 'schaerfe', 'riposte', 'meister', 'sichelwind', 'wirbel', 'tausend', 'blutrausch', 'himmel', 'fluss', 'formel', 'flamme', 'frost', 'blitz', 'sturm', 'erde', 'schatten', 'licht', 'sog', 'gift', 'flut', 'meteor', 'furcht', 'blick', 'vorahnung', 'quelle', 'herrscher', 'kampfgeist', 'ruf', 'koenig'];
    for (const id of old) expect(SK[id], id).toBeDefined();
  });

  it('prüft Lernbedingungen', () => {
    expect(learnBlock(SK.eisenfaust, {}, 1, 1, [])).toBeNull();
    expect(learnBlock(SK.eisenfaust, {}, 0, 1, [])).toBe('points');
    expect(learnBlock(SK.hundert, { eisenfaust: 1 }, 1, 1, [])).toBe('branch');
    expect(learnBlock(SK.hundert, { eisenfaust: 2 }, 1, 1, [])).toBeNull();
    expect(learnBlock(SK.titan, { eisenhaut: 3, stahlleib: 2 }, 1, 5, [])).toBe('level');
    expect(learnBlock(SK.urgewalt, {}, 5, 20, [])).toBe('awaken');
    expect(learnBlock(SK.atem, { atem: 1 }, 3, 20, [])).toBe('max');
  });

  it('summiert passive Boni und erkennt Synergien', () => {
    const r = computePassives({ eisenhaut: 2, erde: 1, schaerfe: 3, flamme: 1 });
    expect(r.p.reduce).toBeCloseTo(0.16 + 0.15);
    expect(r.p.dmgBlade).toBeCloseTo(0.36);
    expect(r.synergies.map((s) => s.id).sort()).toEqual(['brennklinge', 'felsenhaut']);
  });
});
