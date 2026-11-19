import { describe, expect, it } from 'vitest';
import { CATALOG_CATS, catalog, filterCatalog } from '../src/data/catalog';
import { ARMOR, CONSUMABLES, GEAR, HEADS, WEAPONS } from '../src/data/items';
import { GEAR_CATALOG, SETS } from '../src/data/gear';
import { TRINKETS } from '../src/data/trinkets';
import { AMMO_IDS, FLAGS, SHIP_CLASSES, SHIP_UPGRADE_IDS } from '../src/data/ships';
import { FIGUREHEAD_MODELS } from '../src/data/figureheads';
import { FACTION_IDS } from '../src/data/factions';
import { RAID_BOSSES } from '../src/raid/raidBosses';
import { RARITIES } from '../src/data/rarity';
import { createSave } from '../src/core/save/types';

const all = catalog();

describe('Item-Kompendium', () => {
  it('jede Kennung kommt genau einmal vor, jeder Eintrag ist vollständig', () => {
    const ids = new Set<string>();
    for (const e of all) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      expect(e.name.trim(), e.id).not.toBe('');
      expect(e.desc.trim(), e.id).not.toBe('');
      expect(e.origin.trim(), e.id).not.toBe('');
      expect(e.stats.length, e.id).toBeGreaterThan(0);
      expect(RARITIES, e.id).toContain(e.rarity);
      expect(CATALOG_CATS.map((c) => c.id), e.id).toContain(e.cat);
    }
  });

  it('kein Gegenstand erscheint doppelt: gleicher Name nur mit verschiedener Gruppe oder Art', () => {
    const seen = new Map<string, string>();
    for (const e of all) {
      const key = `${e.name}|${e.group}`;
      expect(seen.has(key), `${e.id} doppelt mit ${seen.get(key)}`).toBe(false);
      seen.set(key, e.id);
    }
    // Sets: innerhalb eines Sets heißt jedes Stück anders
    for (const set of SETS) {
      const names = GEAR_CATALOG.filter((d) => d.set === set.id).map((d) => d.n);
      expect(new Set(names).size, set.id).toBe(names.length);
    }
  });

  it('alles aus den Datenquellen ist im Kompendium: Waffen, Rüstungen, Sets, Talismane, Güter, Schiffe, Figuren, Flaggen, Munition, Boss-Beute', () => {
    const ids = new Set(all.map((e) => e.id));
    for (const style of ['schwert', 'faust', 'effekt']) WEAPONS.forEach((_, i) => expect(ids, `weapon:${style}:${i}`).toContain(`weapon:${style}:${i}`));
    ARMOR.forEach((_, i) => expect(ids).toContain(`armor:${i}`));
    for (const h of HEADS) expect(ids).toContain(`head:${h.id}`);
    for (const g of GEAR) expect(ids).toContain(`piece:${g.id}`);
    for (const d of GEAR_CATALOG) expect(ids, d.id).toContain(`set:${d.id}`);
    for (const t of TRINKETS) expect(ids).toContain(`trinket:${t.id}`);
    for (const c of CONSUMABLES) expect(ids).toContain(`item:${c.id}`);
    for (const c of SHIP_CLASSES) expect(ids).toContain(`ship:${c.id}`);
    for (const u of SHIP_UPGRADE_IDS) expect(ids).toContain(`upgrade:${u}`);
    for (const f of FIGUREHEAD_MODELS) expect(ids).toContain(`figurehead:${f}`);
    for (const f of Object.keys(FLAGS)) expect(ids).toContain(`flag:${f}`);
    for (const a of AMMO_IDS) expect(ids).toContain(`ammo:${a}`);
    // Beute der sechs Endbosse: alle Teile der Boss-Sets plus Segel und Zier
    for (const f of FACTION_IDS) {
      const pieces = all.filter((e) => e.raid && e.id.startsWith(`set:boss_${f}_`));
      expect(pieces.length, `Boss-Set ${f}`).toBeGreaterThanOrEqual(5);
      expect(all.find((e) => e.id === `sail:${f}`)?.raid).toBe(true);
      expect(all.find((e) => e.id === `ornament:${f}`)?.raid).toBe(true);
      expect(RAID_BOSSES[f]).toBeTruthy();
    }
  });

  it('Filter nach Reiter, Seltenheit und Suche (Umlaute und ß werden gleichgesetzt)', () => {
    const waffen = filterCatalog(all, { cat: 'waffen' });
    expect(waffen.length).toBeGreaterThan(18);
    expect(waffen.every((e) => e.cat === 'waffen')).toBe(true);
    const leg = filterCatalog(all, { rarity: 'legendaer' });
    expect(leg.length).toBeGreaterThan(10);
    expect(leg.every((e) => e.rarity === 'legendaer')).toBe(true);
    expect(filterCatalog(all, { cat: 'raid' }).every((e) => e.raid)).toBe(true);
    expect(filterCatalog(all, { query: 'walkure' }).some((e) => e.id === 'figurehead:valkyrie')).toBe(true);
    expect(filterCatalog(all, { query: 'SCHÄDEL' }).some((e) => e.id === 'figurehead:leviathan_skull')).toBe(true);
    expect(filterCatalog(all, { query: 'zzzz-gibt-es-nicht' })).toHaveLength(0);
  });

  it('der Besitz lässt sich für jeden Eintrag aus einem Spielstand lesen', () => {
    const save = createSave('Probe', 'pirat', '3.0.0');
    for (const e of all) {
      const o = e.own?.(save);
      if (o) expect(['owned', 'locked', 'free'], e.id).toContain(o.state);
    }
    // Im neuen Spiel gehört nur Ausgangsausrüstung und das Startschiff
    expect(all.find((e) => e.id === 'weapon:schwert:0')!.own!(save).state).toBe('owned');
    expect(all.find((e) => e.id === 'weapon:schwert:3')!.own!(save).state).toBe('locked');
    expect(all.find((e) => e.id === 'ship:schaluppe')!.own!(save).state).toBe('owned');
    expect(all.find((e) => e.id === 'sail:england')!.own!(save).state).toBe('locked');
  });
});
