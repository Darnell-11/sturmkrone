import { describe, expect, it } from 'vitest';
import { addItem, armorEq, bagConsumables, computeStats, ensureGear, itemCount, takeItem, weaponEq, type StatInput } from '../src/core/inventory';
import { createSave } from '../src/core/save/types';
import { ARMOR_LOOK, CONSUMABLES, GEAR, HEADS } from '../src/data/items';
import { EQUIP_BY_ID, loadoutFromLook, resolveLoadout } from '../src/data/equipment';
import { defaultLook } from '../src/data/characterParts';
import { ARMOR } from '../src/data/items';
import { slotBudget } from '../src/data/balanceConfig';

const base = (gear: ReturnType<typeof createSave>['gear']): StatInput => ({
  level: 5, gear, style: 'schwert', hpPassive: 0, critPassive: 0, atkCrew: 1, weaponCrew: 1, fajiCrew: 0, buff: { atk: 0, reduce: 0, crit: 0 },
});

describe('Inventar', () => {
  it('alte Spielstände bekommen Standardwerte', () => {
    const g = { weapon: 1, armor: 0, potions: 2, shrine: 0, trinkets: [], trinket: null } as ReturnType<typeof createSave>['gear'];
    ensureGear(g);
    expect(g.items).toEqual({});
    expect(g.bar).toEqual(['proviant', null, null, null]);
    expect(weaponEq(g)).toBe(1);
  });

  it('Verbrauchsgüter: Proviant liegt in potions, Rest in items, Obergrenze gilt', () => {
    const g = createSave('A', 'pirat', 'x').gear;
    expect(itemCount(g, 'proviant')).toBe(3);
    expect(addItem(g, 'kraftsaft', 3)).toBe(3);
    expect(itemCount(g, 'kraftsaft')).toBe(3);
    expect(addItem(g, 'kraftsaft', 10)).toBe(2);
    expect(takeItem(g, 'kraftsaft')).toBe(true);
    expect(addItem(g, 'proviant', 99)).toBe(7);
    expect(takeItem(g, 'festmahl')).toBe(false);
    expect(bagConsumables(g).map((x) => x.def.id)).toContain('kraftsaft');
  });

  it('Ausrüsten ändert die Werte sofort', () => {
    const g = createSave('A', 'pirat', 'x').gear;
    const s0 = computeStats(base(g));
    g.heads = ['eisenhelm']; g.head = 'eisenhelm';
    const s1 = computeStats(base(g));
    const helm = slotBudget(2, 'head');
    expect(s1.hp).toBeCloseTo(s0.hp + helm.hp);
    expect(s1.armor).toBeCloseTo(s0.armor + helm.armor);
    expect(s1.resist).toBeCloseTo(s1.armor * 0.8);
    g.weapon = 3; g.armor = 2;
    expect(computeStats(base(g)).atk).toBeGreaterThan(s1.atk);
    g.armorEq = 0;
    expect(armorEq(g)).toBe(0);
    expect(computeStats(base(g)).hp).toBeLessThan(computeStats(base({ ...g, armorEq: undefined })).hp);
  });

  it('Stärkungen wirken auf Angriff, Volltreffer und Schadensminderung', () => {
    const g = createSave('A', 'pirat', 'x').gear;
    const a = computeStats(base(g));
    const b = computeStats({ ...base(g), buff: { atk: 0.25, reduce: 0.25, crit: 0.15 } });
    expect(b.atk).toBeCloseTo(a.atk * 1.25);
    expect(b.crit).toBeCloseTo(a.crit + 0.15);
    expect(b.reduce).toBeCloseTo(0.25);
  });

  it('Daten: jede Rüstungsstufe hat eine Optik, Kataloge sind einmalig', () => {
    expect(ARMOR_LOOK.length).toBe(ARMOR.length);
    expect(new Set(CONSUMABLES.map((c) => c.id)).size).toBe(CONSUMABLES.length);
    expect(new Set(HEADS.map((h) => h.id)).size).toBe(HEADS.length);
  });

  it('angelegte Schienen, Stiefel und Schilde zählen zu den Werten; jedes Stück verweist auf ein vorhandenes Teil', () => {
    const g = createSave('A', 'pirat', 'x').gear;
    ensureGear(g);
    const before = computeStats(base(g));
    g.owned = ['armschienen_stahl', 'eisenschild'];
    g.worn = { hands: 'armschienen_stahl', offhand: 'eisenschild' };
    const after = computeStats(base(g));
    expect(after.hp - before.hp).toBeCloseTo(slotBudget(2, 'hands').hp + slotBudget(2, 'offhand').hp);
    expect(after.armor - before.armor).toBeCloseTo(slotBudget(2, 'hands').armor + slotBudget(2, 'offhand').armor);
    // ein Stück auf dem falschen Platz zählt nicht
    g.worn = { legs: 'armschienen_stahl' };
    expect(computeStats(base(g)).hp).toBeCloseTo(before.hp);
    expect(new Set(GEAR.map((d) => d.id)).size).toBe(GEAR.length);
    for (const d of GEAR) if (d.equip) expect(EQUIP_BY_ID[d.equip]).toBeTruthy();
    for (const a of ARMOR_LOOK) for (const e of a?.extra ?? []) expect(EQUIP_BY_ID[e]).toBeTruthy();
  });

  it('das Aussehen wird vollständig in Ausrüstung übersetzt', () => {
    const l = loadoutFromLook({ ...defaultLook('pirat'), outfit: 'jacke', coat: 'kurz', scarf: true, gloves: true, extra: ['kuerass', 'schulterplatten', 'armschienen_leder'] });
    const r = resolveLoadout(l);
    const kinds = r.shells.map((s) => s.kind);
    // die Brustplatte entfällt unter dem Mantel, alles andere ist da
    expect(kinds).toEqual(['hose', 'jacke', 'guertel', 'schal', 'handschuhe', 'stiefel', 'mantelKurz', 'armschiene']);
    expect(r.ctx).toEqual({ under: 'jacke', coat: 'kurz', boots: true });
    // 4.6G: die Jacke trägt eine Knopfleiste (Messingknöpfe auf dem Leder)
    expect(r.rigid.map((x) => x.build)).toEqual(['knoepfe', 'schulterplatten', 'knoten']);
    expect(r.base.top).toBe(false);
    // Hemd ohne Mantel zeigt das Hemd der Grundfigur, mit Mantel ein enges Hemd
    expect(resolveLoadout(loadoutFromLook({ ...defaultLook('pirat'), outfit: 'hemd', coat: 'keiner' })).base.top).toBe(true);
    const slim = resolveLoadout(loadoutFromLook({ ...defaultLook('pirat'), outfit: 'hemd', coat: 'lang' }));
    expect(slim.base.top).toBe(false);
    expect(slim.shells.some((s) => s.kind === 'hemd')).toBe(true);
  });
});
