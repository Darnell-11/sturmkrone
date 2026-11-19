import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONSUMABLES, GEAR, HEADS, PROVIANT, ARMOR, WEAPONS, WEAPON_LINES } from '../src/data/items';
import { TRINKETS } from '../src/data/trinkets';
import { EQUIP_BY_ID } from '../src/data/equipment';
import { GEAR_CATALOG, SETS } from '../src/data/gear';
import { SKILLS } from '../src/data/skills';
import { QUESTS, TOWN_NPCS } from '../src/data/quests';
import { CREW } from '../src/data/crew';
import { LEGENDS } from '../src/data/legends';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { REGIONS } from '../src/data/regions';
import { FACTIONS, FACTION_IDS } from '../src/data/factions';
import { DEFAULT_SHIP_LOOK, SHIP_CLASSES, SHIP_UPGRADES } from '../src/data/ships';
import { figureheadModel } from '../src/data/figureheads';
import { RARITIES, RARITY } from '../src/data/rarity';
import { clamp01, angleDiff, smoothstep, wrapAngle } from '../src/core/mathUtil';

const unique = (label: string, ids: string[]) => {
  const seen = new Set<string>();
  for (const id of ids) { expect(seen.has(id), `${label}: Kennung „${id}“ doppelt`).toBe(false); seen.add(id); }
};

describe('Datenquellen: eine Quelle, keine Doppelungen', () => {
  it('Kennungen sind je Liste eindeutig', () => {
    unique('Verbrauchsgüter', CONSUMABLES.map((c) => c.id));
    unique('Kopfbedeckungen', HEADS.map((h) => h.id));
    unique('Schienen und Schilde', GEAR.map((g) => g.id));
    unique('Talismane', TRINKETS.map((t) => t.id));
    unique('Sets', SETS.map((s) => s.id));
    unique('Setstücke', GEAR_CATALOG.map((d) => d.id));
    unique('Fähigkeiten', SKILLS.map((s) => s.id));
    unique('Aufträge', QUESTS.map((q) => q.id));
    unique('Stadtbewohner', TOWN_NPCS.map((n) => n.id));
    unique('Crew', CREW.map((c) => c.id));
    unique('Legenden', LEGENDS.map((l) => l.id));
    unique('Erfolge', ACHIEVEMENTS.map((a) => a.id));
    unique('Inseln', REGIONS.flatMap((r) => r.islands.map((i) => i.id)));
    unique('Schiffsklassen', SHIP_CLASSES.map((c) => c.id));
  });

  it('Seltenheiten: eine Tabelle mit vier Stufen, jedes Stück nutzt eine davon', () => {
    expect(RARITIES.length).toBe(4);
    expect(Object.keys(RARITY).sort()).toEqual([...RARITIES].sort());
    for (const list of [CONSUMABLES, HEADS, GEAR, TRINKETS, SETS]) for (const x of list) expect(RARITIES, x.id).toContain(x.rarity);
  });

  it('die Seltenheitsfarben im Stylesheet entsprechen data/rarity.ts', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'ui', 'css', 'tokens.css'), 'utf8').toLowerCase();
    for (const r of RARITIES) expect(css, `--rar-${r}`).toContain(`--rar-${r}: ${RARITY[r].col.toLowerCase()}`);
  });

  it('Proviant hat nur eine Definition: Preis, Heilung und Höchstzahl kommen aus den Verbrauchsgütern', () => {
    expect(PROVIANT.id).toBe('proviant');
    expect(PROVIANT.heal).toBeGreaterThan(0);
    expect(CONSUMABLES.filter((c) => c.id === 'proviant')).toHaveLength(1);
  });

  it('Waffenlinien haben für jede Waffenstufe einen Namen und ein Symbol; Rüstungsstufen ein Symbol', () => {
    for (const line of Object.values(WEAPON_LINES)) { expect(line.icon).toBeTruthy(); expect(line.names.length).toBe(WEAPONS.length); }
    for (const a of ARMOR) expect(a.icon).toBeTruthy();
  });

  it('Verweise stimmen: Ausrüstungsteile der Schienen und Galionsfiguren der Mächte existieren', () => {
    for (const g of GEAR) if (g.equip) expect(EQUIP_BY_ID[g.equip], g.id).toBeTruthy();
    for (const f of FACTION_IDS) expect(figureheadModel(FACTIONS[f].ship.figurehead), f).not.toBeNull();
    for (const faction of ['pirat', 'marine'] as const) expect(figureheadModel(DEFAULT_SHIP_LOOK(faction).figurehead)).not.toBeNull();
  });

  it('Schiffs-Ausbauten stehen mit Namen und Wirkung nur in einer Tabelle', () => {
    for (const u of Object.values(SHIP_UPGRADES)) { expect(u.n).toBeTruthy(); expect(u.perLevel).toBeGreaterThan(0); }
  });
});

describe('Rechenhelfer (core/mathUtil.ts)', () => {
  it('begrenzt, dreht und glättet wie erwartet', () => {
    expect(clamp01(-1)).toBe(0); expect(clamp01(2)).toBe(1); expect(clamp01(0.4)).toBe(0.4);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 6);
    expect(angleDiff(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2, 6);
    expect(smoothstep(0, 10, -5)).toBe(0); expect(smoothstep(0, 10, 15)).toBe(1); expect(smoothstep(0, 10, 5)).toBeCloseTo(0.5, 6);
    // umgekehrte Spanne (a > b) wie bei den Rumpfkurven
    expect(smoothstep(0, -1, -0.5)).toBeCloseTo(0.5, 6);
  });
});
