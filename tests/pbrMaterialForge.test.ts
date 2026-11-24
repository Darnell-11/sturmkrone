// Phase 4.4A: PBR-Schmiede (Cache, Karten, Freigabe-Schutz), Soldaten-Gelenke, Laufdecks der Brücken und gespeicherte Mega-Ruhezeiten.
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Mesh, MeshBasicMaterial } from 'three';
import {
  FORGE_KINDS, FORGE_RECIPES, forgeDisposeAll, forgeMaps, forgeSet, forgeSizeForTier, forgeStats, hullForgeKind, rockForgeKind, type ForgeKind,
} from '../src/graphics/pbrMaterialForge';
import { disposeObject } from '../src/render/dispose';
import { SOLDIER_JOINTS, buildSoldier, hatFor, nearGeometry, type SoldierPalette } from '../src/entities/troops/soldierGeometry';
import { TROOP_TYPES } from '../src/data/troops';
import {
  MEGA_BY_ID, MEGA_COMBAT, MEGA_IDS, cleanMegaSave, clearDistrict, districtWorld, districtsToWake, megaFromSave, megaToSave, newMegaRuntime,
} from '../src/data/megaIslands';
import { IslandGround, deckHeight, type Deck, type WalkIsland } from '../src/world/islandGround';
import { createSave } from '../src/core/save/types';
import { migrateSave } from '../src/core/save/migrations';

const S = 64;

describe('PBR-Schmiede: Karten', () => {
  it('jede Art erzeugt Normal- und ORMH-Karte in voller Größe, Albedo nur für die Rumpfplanken', () => {
    expect(new Set(FORGE_KINDS).size).toBe(FORGE_KINDS.length);
    for (const k of FORGE_KINDS) {
      const m = forgeMaps(k, S);
      expect(m.normal.length).toBe(S * S * 4);
      expect(m.orm.length).toBe(S * S * 4);
      expect(!!m.albedo).toBe(FORGE_RECIPES[k].albedo);
      if (m.albedo) expect(m.albedo.length).toBe(S * S * 4);
    }
    expect(FORGE_KINDS.filter((k) => FORGE_RECIPES[k].albedo).sort()).toEqual(['rumpf', 'rumpf_alt', 'rumpf_edel']);
  });

  it('deterministisch: gleiche Art und Größe ergeben dieselben Bytes', () => {
    const a = forgeMaps('fels_basalt', S), b = forgeMaps('fels_basalt', S);
    expect(Buffer.from(a.orm).equals(Buffer.from(b.orm))).toBe(true);
    expect(Buffer.from(a.normal).equals(Buffer.from(b.normal))).toBe(true);
  });

  it('Normalkarte: Einheitsvektoren, nach außen gerichtet (z > 0), aus dem Höhenfeld geneigt', { timeout: 30000 }, () => {
    // 256 px: feine Muster (Maserung, Gewebe) sind bei 64 px nicht mehr aufgelöst
    const S2 = 256;
    for (const k of FORGE_KINDS) {
      const { normal } = forgeMaps(k, S2);
      let tilted = 0, worstLen = 0, minZ = 1;
      for (let i = 0; i < S2 * S2; i++) {
        const x = normal[i * 4] / 127.5 - 1, y = normal[i * 4 + 1] / 127.5 - 1, z = normal[i * 4 + 2] / 127.5 - 1;
        worstLen = Math.max(worstLen, Math.abs(Math.sqrt(x * x + y * y + z * z) - 1));
        minZ = Math.min(minZ, z);
        if (z < 0.999) tilted++;
      }
      expect(worstLen, k).toBeLessThan(0.03);
      expect(minZ, k).toBeGreaterThan(0.2);
      // Relief ist vorhanden (keine glatte Fläche)
      expect(tilted / (S2 * S2), k).toBeGreaterThan(0.03);
    }
  });

  it('ORMH: Rauheit um den Rezeptwert, Metall wie im Rezept, Höhe und Verdeckung im Bereich', () => {
    for (const k of FORGE_KINDS) {
      const R = FORGE_RECIPES[k];
      const { orm } = forgeMaps(k, S);
      let rs = 0, minAo = 1;
      let badMetal = 0, minR = 255;
      for (let i = 0; i < S * S; i++) {
        rs += orm[i * 4 + 1] / 255;
        minAo = Math.min(minAo, orm[i * 4] / 255);
        if (orm[i * 4 + 2] !== Math.round(R.metal * 255)) badMetal++;
        minR = Math.min(minR, orm[i * 4 + 1]);
      }
      expect(badMetal).toBe(0);
      expect(minR).toBeGreaterThanOrEqual(Math.round(0.03 * 255));
      expect(Math.abs(rs / (S * S) - R.rough), k).toBeLessThan(0.16);
      expect(minAo).toBeGreaterThanOrEqual(0.24);
    }
    // seidenmattes Holz ist glatter als verwittertes
    const mean = (k: ForgeKind) => { const o = forgeMaps(k, S).orm; let s = 0; for (let i = 0; i < S * S; i++) s += o[i * 4 + 1]; return s / (S * S); };
    expect(mean('rumpf_edel')).toBeLessThan(mean('rumpf'));
    expect(mean('rumpf')).toBeLessThan(mean('rumpf_alt'));
  });

  it('kachelbar: die Höhe läuft über den Rand ohne Sprung (Mittel der Randdifferenzen wie im Inneren)', () => {
    for (const k of ['fels_kalk', 'sand', 'boden', 'stoff', 'kanonenstahl'] as ForgeKind[]) {
      const { orm } = forgeMaps(k, S);
      const h = (x: number, y: number) => orm[(y * S + x) * 4 + 3];
      let edge = 0, inner = 0;
      for (let y = 0; y < S; y++) { edge += Math.abs(h(S - 1, y) - h(0, y)); inner += Math.abs(h(S / 2, y) - h(S / 2 - 1, y)); }
      expect(edge, k).toBeLessThan(inner * 2.5 + S * 2);
    }
  });

  it('Größe nach Grafikstufe und Zuordnungen', () => {
    expect(forgeSizeForTier('ultra')).toBe(1024);
    expect(forgeSizeForTier('max')).toBe(1024);
    expect(forgeSizeForTier('high')).toBe(512);
    expect(forgeSizeForTier('low')).toBe(256);
    expect([1, 2, 3, 4, 5].map(hullForgeKind)).toEqual(['rumpf_alt', 'rumpf_alt', 'rumpf', 'rumpf_edel', 'rumpf_edel']);
    expect(rockForgeKind('glut')).toBe('fels_obsidian');
    expect(rockForgeKind('klippe')).toBe('fels_basalt');
    expect(rockForgeKind('kreide')).toBe('fels_kalk');
  });
});

describe('PBR-Schmiede: geteilter Cache und Schutz vor Freigabe', () => {
  it('Cache: ein Satz je Art, Texturen eindeutig, geteilt zwischen allen Nutzern', () => {
    const a = forgeSet('fels_kalk', S), b = forgeSet('fels_kalk', S);
    expect(a).toBe(b);
    expect(a.orm).toBe(b.orm);
    const sets = (['fels_kalk', 'fels_basalt', 'rumpf', 'segeltuch'] as ForgeKind[]).map((k) => forgeSet(k, S));
    const ids = sets.flatMap((s) => [s.orm.uuid, ...(s.albedo ? [s.albedo.uuid] : []), ...(s.recipe.uvNormal ? [s.normal.uuid] : [])]);
    expect(new Set(ids).size).toBe(ids.length);
    // Filter, Mipmaps, Wiederholung, Farbraum
    const r = forgeSet('rumpf', S);
    expect(r.albedo!.colorSpace).toBe('srgb');
    expect(r.orm.colorSpace).toBe('');
    expect(r.orm.generateMipmaps).toBe(true);
    expect(forgeSet('segeltuch', S).normal.repeat.x).toBe(24);
  });

  it('disposeObject und fremde dispose()-Aufrufe geben Schmiede-Texturen nie frei; die Schmiede selbst genau einmal', () => {
    const set = forgeSet('mauerwerk', S);
    let events = 0;
    set.orm.addEventListener('dispose', () => { events++; });
    // ein Netz, das die Textur benutzt, wird abgebaut (wie beim Entladen einer Insel)
    const mesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ map: set.orm }));
    disposeObject(mesh);
    expect(events).toBe(0);
    // auch ein direkter Aufruf läuft ins Leere
    const before = forgeStats.blockedDisposes;
    set.orm.dispose();
    set.orm.dispose();
    expect(events).toBe(0);
    expect(forgeStats.blockedDisposes).toBe(before + 2);
    // endgültige Freigabe: jede Textur genau einmal, ein zweiter Aufruf ist harmlos
    const n = forgeDisposeAll();
    expect(n).toBeGreaterThan(0);
    expect(events).toBe(1);
    expect(forgeDisposeAll()).toBe(0);
    expect(events).toBe(1);
    // danach entsteht der Satz neu (neue Texturen)
    expect(forgeSet('mauerwerk', S).orm).not.toBe(set.orm);
  });
});

describe('Soldaten: Gelenk-Integrität (Massentruppen)', () => {
  const pals: (SoldierPalette | undefined)[] = [
    undefined,
    { id: 'kurogane', cloth: '#0E0E12', pants: '#1A1A1E', hat: '#1A1A1E', trim: '#E03030' },
    { id: 'england', cloth: '#B4202A', pants: '#F4EFE0', hat: '#14284A', trim: '#E3B04B' },
    { id: 'deutschland', cloth: '#1B2F5B', pants: '#2A2A2E', hat: '#3A3A44', trim: '#D4A82A' },
  ];

  it('Waffenhand und Waffenplatz liegen dort, wo die alte Form sie hatte', () => {
    expect(SOLDIER_JOINTS.handR).toEqual([0.29, 0.88, 0.28]);
    expect(SOLDIER_JOINTS.weapon).toEqual([0.3, 0.9, 0.18]);
  });

  it('jeder Typ und jede Uniform: Füße am Boden, Kopf oben, alle Gelenke im Körper, gleiche Attribute für das Instanz-Netz', () => {
    for (const typ of TROOP_TYPES) for (const pal of pals) {
      const g = buildSoldier(typ, pal);
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      expect(bb.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(bb.min.y).toBeLessThan(0.05);
      expect(bb.max.y).toBeGreaterThan(1.7);
      expect(bb.max.y).toBeLessThan(2.1);
      for (const k of ['color', 'aWind', 'normal', 'position']) expect(g.getAttribute(k), k).toBeTruthy();
      expect(g.getAttribute('uv')).toBeFalsy();
      const J = SOLDIER_JOINTS;
      // Gliedmaßen-Gelenke liegen an der Oberfläche (Hand, Fuß, Knie, Ellbogen, Schulter, Waffe), Rumpf-Gelenke im Inneren (Hüfte, Brust, Hals, Kopf)
      const inner = new Set(['hip', 'chest', 'neck', 'head']);
      for (const [name, p] of Object.entries(J)) expect(nearGeometry(g, p, inner.has(name) ? 0.26 : 0.09), `${typ}/${pal?.id}: ${name}`).toBe(true);
      // linke Seite spiegelbildlich (Hand, Schulter, Knie, Fuß)
      for (const p of [J.handR, J.shoulderR, J.kneeR, J.footR]) expect(nearGeometry(g, [-p[0], p[1], p[2]], 0.09)).toBe(true);
      // Wind nur an Rockschößen und Schurz: unterhalb der Taille, höchstens 8 cm Ausschlag
      const w = g.getAttribute('aWind'), pos = g.getAttribute('position');
      let maxW = 0;
      for (let i = 0; i < w.count; i++) { const v = w.getX(i); if (v > 0) expect(pos.getY(i)).toBeLessThan(0.92); maxW = Math.max(maxW, v); }
      expect(maxW).toBeGreaterThan(0);
      expect(maxW).toBeLessThanOrEqual(0.08);
      // Speicher: höchstens 6 000 Eckpunkte je Soldat (150 Instanzen je Typ bleiben im Rahmen)
      expect(pos.count).toBeLessThan(6000);
      g.dispose();
    }
  });

  it('Kopfbedeckungen je Macht und Truppe', () => {
    expect(hatFor('musketier')).toBe('dreispitz');
    expect(hatFor('schwert', pals[2])).toBe('zweispitz');
    expect(hatFor('schlaeger', pals[1])).toBe('kabuto');
    expect(hatFor('musketier', pals[3])).toBe('morion');
  });
});

describe('Freistehende Brücken: Laufdeck über der ausgehobenen Spalte', () => {
  const deck: Deck = { x: 100, z: 50, hw: 2.25, hl: 11, yaw: 0.4, y0: 1.2, y1: 5.8, r2: 15 * 15 };

  it('Deckhöhe innen (geneigt von Ende zu Ende), außen −∞', () => {
    const c = Math.cos(deck.yaw), s = Math.sin(deck.yaw);
    // lokale z-Achse in der Welt: (sin yaw, cos yaw)
    const at = (lx: number, lz: number) => deckHeight(deck, deck.x + lx * c + lz * s, deck.z - lx * s + lz * c);
    expect(at(0, 0)).toBeCloseTo(3.5, 5);
    expect(at(0, -11)).toBeCloseTo(1.2, 5);
    expect(at(0, 11)).toBeCloseTo(5.8, 5);
    expect(at(2.2, 3)).toBeGreaterThan(-Infinity);
    expect(at(2.4, 0)).toBe(-Infinity);
    expect(at(0, 11.5)).toBe(-Infinity);
  });

  it('nur die Laufhöhe trägt das Deck, das Geländenetz (ohne Wiesendecke) sieht die Spalte', () => {
    const walk: WalkIsland = { x: 0, z: 0, r: 200, beachY: 1.3, hillY: 1.3, coast: [], hills: [], shelf: 0.1, blockers: [], pads: [], decks: [deck] };
    const g = new IslandGround();
    g.add(walk);
    // eine Sohle (Spalte) unter dem Deck
    walk.pads!.push({ x: 100, z: 50, hw: 6, hd: 30, yaw: deck.yaw + Math.PI / 2, blend: 0.8, y: -2.8, r2: 40 * 40 });
    expect(g.islandHeight(walk, 100, 50)).toBeCloseTo(3.5, 3);
    expect(g.islandHeight(walk, 100, 50, false, true)).toBeCloseTo(-2.8, 3);
    // natürliche Höhe (ohne Einebnungen, für die Lage der Brücke selbst) sieht das Deck nicht
    expect(g.islandHeight(walk, 100, 50, true, false)).toBeCloseTo(1.3, 3);
  });
});

describe('Mega-Inseln: Ruhezeiten im Spielstand', () => {
  it('geräumter Bezirk und besiegter Kommandant überdauern Speichern und Laden (relativ zur Spieluhr)', () => {
    const id = MEGA_IDS[0];
    const rt = newMegaRuntime(id);
    clearDistrict(rt, 1, 100);
    rt.commander.state = 'besiegt';
    rt.commander.until = 100 + MEGA_COMBAT.commanderCooldown;
    const saved = JSON.parse(JSON.stringify(megaToSave([rt], 400)));
    expect(saved[id]).toEqual({ d: [0, MEGA_COMBAT.districtCooldown - 300, 0], c: MEGA_COMBAT.commanderCooldown - 300 });
    // neue Sitzung: die Spieluhr beginnt bei 5
    const [back] = megaFromSave(saved, 5);
    expect(back.districts[1].state).toBe('geraeumt');
    expect(back.districts[1].until).toBe(5 + 600);
    expect(back.commander.state).toBe('besiegt');
    // direkt nach dem Laden zieht der geräumte Bezirk nicht wieder auf, nach Ablauf schon
    const m = MEGA_BY_ID[id];
    const p = districtWorld(m, m.districts[1], { x: 0, z: 0 });
    const out: number[] = [];
    expect(districtsToWake(back, p.x, p.z, 300, out)).not.toContain(1);
    expect(districtsToWake(back, p.x, p.z, 606, out)).toContain(1);
  });

  it('nur laufende Ruhezeiten werden gespeichert; fremde und kaputte Werte fallen weg', () => {
    expect(megaToSave([newMegaRuntime(MEGA_IDS[1])], 0)).toEqual({});
    const dirty = { kronenklippe: { d: [99999, NaN, 'x'], c: -5 }, atlantis: { d: [1], c: 1 }, goudenstad: 7 };
    const clean = cleanMegaSave(dirty);
    expect(Object.keys(clean)).toEqual(['kronenklippe']);
    expect(clean.kronenklippe).toEqual({ d: [MEGA_COMBAT.districtCooldown, 0, 0], c: 0 });
  });

  it('ältere Spielstände ohne Feld laden mit leeren Ruhezeiten (abwärtskompatibel)', () => {
    const s = createSave('Alt', 'pirat', '4.3.6');
    delete (s.world as { mega?: unknown }).mega;
    const r = migrateSave(JSON.parse(JSON.stringify(s)), '4.4.0');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.world.mega).toEqual({});
  });
});
