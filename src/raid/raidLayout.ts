// Entwurf der Raid-Insel: reine Daten, deterministisch aus (Macht, seed, Richtung zum offenen Meer). Die Insel misst rund 700 × 700 m
// und hat zwei Seiten: im Norden (zur See hin gedreht) eine tiefe Bucht mit dem Burghafen, verriegelt von Seetor, Mauerflügeln und
// Küstenbatterien; im Osten ein flacher Strand mit drei Landungsbuchten. Auf dem Hügel in der Mitte thront die Burg.
//   Route A: Seetor und Mauern von See einreißen, im Burghafen anlegen, 100 m bergauf zum Burgtor.
//   Route B: am Strand landen und durch vier Viertel (Strand & Vorposten, Hafen & Kontore, Markt & Kasernen, Burgaufstieg) marschieren.
// Alle Koordinaten sind Inselkoordinaten (Weltkoordinaten minus Inselmitte); „kanonisch“ heißt: vor der Drehung zur Seeseite.
import { FACTIONS, type FactionId } from '../data/factions';
import { coastK } from '../world/islandGround';
import type {
  CaptainPost, EnemyKindId, RaidBarricadeDef, RaidCaptainSpawn, RaidSquadDef, SquadTypeId, RaidBuildingDef, RaidDistrictDef, RaidGuardDef, RaidLayout, RaidPerchDef, RaidSlotDef, RaidStructureDef, RaidWaveDef,
} from './raidTypes';
import { clamp01 } from '../core/mathUtil';

/** Basisradius der Raid-Insel (mit Küstenschwankung rund 350 m: 700 × 700 m) */
export const RAID_R = 310;

type Coast = { a: number; f: number; p: number }[];

export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Schmale Delle (depth > 0) oder Ausbuchtung (depth < 0) der Küste bei Winkel a0, als Summe weniger Sinus-Terme (Fejér-Kern, ohne Wellen) */
function lobe(a0: number, K: number, depth: number): Coast {
  let sum = 0;
  for (let k = 1; k <= K; k++) sum += 1 - k / (K + 1);
  const c = depth / sum;
  const out: Coast = [];
  for (let k = 1; k <= K; k++) out.push({ a: -c * (1 - k / (K + 1)), f: k, p: Math.PI / 2 - k * a0 });
  return out;
}

/** Verbände je Viertel (Typ, Köpfe): Schwertträger vorn, Musketiere dahinter, Schläger als Brecher */
const SQUAD_PLAN: Record<string, [SquadTypeId, number][]> = {
  strand: [['schwert', 10], ['schwert', 10], ['musketier', 8]],
  hafen: [['schwert', 10], ['musketier', 8], ['schlaeger', 6]],
  markt: [['schwert', 12], ['schwert', 10], ['musketier', 10], ['schlaeger', 6]],
  aufstieg: [['schwert', 10], ['musketier', 10], ['schlaeger', 6]],
};
const CASTLE_SQUADS: [SquadTypeId, number][] = [['schwert', 12], ['schwert', 12], ['schwert', 10], ['musketier', 10], ['musketier', 10], ['schlaeger', 8]];
const GATE_SQUADS: [SquadTypeId, number][] = [['schwert', 10], ['musketier', 8]];

const mix = (n: Partial<Record<EnemyKindId, number>>): EnemyKindId[] => {
  const out: EnemyKindId[] = [];
  for (const [k, c] of Object.entries(n)) for (let i = 0; i < (c ?? 0); i++) out.push(k as EnemyKindId);
  return out;
};

/** Länge eines Linienzugs in Metern */
export function pathLength(pts: [number, number][]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

/** Abstand eines Punkts zu einem Linienzug */
function distToPath(x: number, z: number, pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = clamp01(((x - ax) * dx + (z - az) * dz) / l2);
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** Punkt in Anteilen der Länge auf einem Linienzug (Lage und Richtung) */
function pointAt(pts: [number, number][], f: number): { x: number; z: number; dir: number } {
  const total = pathLength(pts);
  let want = total * f;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (want <= l || i === pts.length - 1) {
      const t = l > 0 ? Math.min(1, want / l) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dir: Math.atan2(bx - ax, bz - az) };
    }
    want -= l;
  }
  return { x: pts[0][0], z: pts[0][1], dir: 0 };
}

export function buildRaidLayout(factionId: FactionId, seed: number, seaAngle: number): RaidLayout {
  const rnd = mulberry32(seed ^ hashString(factionId));
  const F = FACTIONS[factionId];
  // Drehung der ganzen Anlage: die Bucht (kanonisch bei +z, Winkel π/2) zeigt zur See (Winkel seaAngle)
  const theta = seaAngle - Math.PI / 2;
  const ct = Math.cos(theta), st = Math.sin(theta);
  const P = (x: number, z: number): [number, number] => [Math.round((x * ct - z * st) * 100) / 100, Math.round((x * st + z * ct) * 100) / 100];
  const R = RAID_R;

  // ---------- Küste ----------
  const base: Coast = [
    { a: 0.03, f: 3, p: rnd() * 6.28 }, { a: 0.02, f: 5, p: rnd() * 6.28 }, { a: 0.01, f: 9, p: rnd() * 6.28 },
  ];
  // tiefe Bucht nach +z (Burghafen), breiter Strand nach +x (Ausbuchtung)
  const cc: Coast = [...base, ...lobe(Math.PI / 2, 9, 0.6), ...lobe(0, 5, -0.07)];
  const coast: Coast = cc.map((t) => ({ ...t, p: t.p - t.f * theta }));
  const isWater = (x: number, z: number) => Math.hypot(x, z) > R * coastK(cc, Math.atan2(z, x));
  /** Land mit Abstand m zur Küste (kanonisch) */
  const land = (x: number, z: number, m = 0) => Math.hypot(x, z) < R * coastK(cc, Math.atan2(z, x)) - m;
  const headZ = R * coastK(cc, Math.PI / 2);
  /** Halbe Breite der Bucht auf Höhe z: erster Landpunkt von der Mittelachse nach außen */
  const halfWidth = (z: number) => {
    for (let x = 0; x < R * 1.3; x += 1) if (!isWater(x, z)) return x;
    return Infinity;
  };
  let zg = headZ + 60;
  for (let z = headZ + 8; z < R * 1.3; z += 1) { if (halfWidth(z) >= 54) { zg = z; break; } }
  const hwG = Math.min(halfWidth(zg), 90);

  // ---------- Bauwerke an der Bucht ----------
  const structures: RaidStructureDef[] = [];
  const S = (s: Omit<RaidStructureDef, 'x' | 'z' | 'yaw'> & { x: number; z: number; yaw?: number }): void => {
    const [x, z] = P(s.x, s.z);
    structures.push({ ...s, x, z, yaw: (s.yaw ?? 0) - theta });
  };
  S({ structureId: 'seagate', kind: 'seagate', label: 'Seetor', x: 0, z: zg, w: 26, d: 7, h: 9, maxHp: 3000, required: true });
  const wallW = hwG + 7 - 13, wallX = (13 + hwG + 7) / 2;
  S({ structureId: 'wall_l', kind: 'wall', label: 'Mauerflügel West', x: -wallX, z: zg, w: wallW, d: 5, h: 7, maxHp: 2200, required: true });
  S({ structureId: 'wall_r', kind: 'wall', label: 'Mauerflügel Ost', x: wallX, z: zg, w: wallW, d: 5, h: 7, maxHp: 2200, required: true });
  S({ structureId: 'tower_l', kind: 'tower', label: 'Torturm West', x: -(hwG + 8), z: zg, w: 10, d: 10, h: 14, maxHp: 2600, required: false });
  S({ structureId: 'tower_r', kind: 'tower', label: 'Torturm Ost', x: hwG + 8, z: zg, w: 10, d: 10, h: 14, maxHp: 2600, required: false });
  // Küstenbatterien auf den Landzungen vor dem Tor und am Strand
  const zb = zg + 50;
  const hwb = Math.min(halfWidth(zb), 120);
  const onLand = (x: number, z: number): [number, number] => { let xx = x; for (let i = 0; i < 40 && !land(xx, z, 8); i++) xx += Math.sign(x) * 4; return [xx, z]; };
  const bl = onLand(-(hwb + 22), zb), br = onLand(hwb + 22, zb);
  S({ structureId: 'battery_w', kind: 'battery', label: 'Küstenbatterie West', x: bl[0], z: bl[1], w: 13, d: 13, h: 6, maxHp: 1300, required: false, fire: { range: 250, dmg: 22, reload: 4.2 } });
  S({ structureId: 'battery_o', kind: 'battery', label: 'Küstenbatterie Ost', x: br[0], z: br[1], w: 13, d: 13, h: 6, maxHp: 1300, required: false, fire: { range: 250, dmg: 22, reload: 4.6 } });
  const ab = (30 * Math.PI) / 180, eb = R * coastK(cc, ab) * 0.82;
  S({ structureId: 'battery_s', kind: 'battery', label: 'Strandbatterie', x: Math.cos(ab) * eb, z: Math.sin(ab) * eb, w: 13, d: 13, h: 6, maxHp: 1100, required: false, fire: { range: 230, dmg: 20, reload: 4.8 } });

  // ---------- Burghafen: zwei Stege am Ende der Bucht, vier Liegeplätze ----------
  const shoreZ = (x: number) => { for (let z = zg - 10; z > headZ - 40; z -= 0.5) if (!isWater(x, z)) return z; return headZ; };
  const piers: RaidLayout['piers'] = [];
  const slots: RaidSlotDef[] = [];
  for (const [i, px] of [-18, 18].entries()) {
    const zs = shoreZ(px);
    const a = P(px, zs - 1.5), b = P(px, Math.min(zs + 46, zg - 16));
    piers.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], hw: 2.6, y: 1.65 });
    const mid = zs + 26;
    for (const side of [-1, 1]) {
      const [sx, sz] = P(px + side * 8, mid);
      slots.push({ slotId: `harbor-${i * 2 + (side > 0 ? 2 : 1)}`, zone: 'harbor', route: 'A', label: `Burgsteg ${i + 1}${side > 0 ? ' Ost' : ' West'}`, x: sx, z: sz, approach: Math.PI / 2 + theta });
    }
  }
  // ---------- Strand: drei Landungsbuchten ----------
  [-17, 3, 22].forEach((deg, i) => {
    const a = (deg * Math.PI) / 180, e = R * coastK(cc, a) * 0.985;
    const [sx, sz] = P(Math.cos(a) * e, Math.sin(a) * e);
    slots.push({ slotId: `beach-${i + 1}`, zone: 'beach', route: 'B', label: `Landungsbucht ${i + 1}`, x: sx, z: sz, approach: a + theta });
  });

  // ---------- Burg auf dem Hügel ----------
  const cz = -45, ringR = 52;
  const castle = {
    x: 0, z: cz, ringR,
    gateN: { x: 0, z: cz + ringR }, gateE: { x: ringR, z: cz },
    keep: { x: 0, z: cz - 40 }, arena: { x: 0, z: cz + 3, r: 14 },
  };
  const hills = [
    { x: 0, z: cz, r: 150, h: 0.32 },
    { x: -175, z: 70, r: 70, h: 0.12 },
    { x: 150, z: -165, r: 80, h: 0.14 },
  ];

  // ---------- Wege ----------
  const snapLand = (pts: [number, number][], margin: number): [number, number][] => pts.map(([x, z]) => {
    let xx = x, zz = z;
    for (let i = 0; i < 60 && !land(xx, zz, margin); i++) { xx *= 0.96; zz *= 0.96; }
    return [xx, zz];
  });
  const zq = shoreZ(0);
  const pathAc: [number, number][] = [[0, zq + 4], [0, zq - 45], [0, castle.gateN.z + 12], [castle.gateN.x, castle.gateN.z]];
  const bayMid = (() => { const a = (3 * Math.PI) / 180, e = R * coastK(cc, a) * 0.985; return [Math.cos(a) * e, Math.sin(a) * e] as [number, number]; })();
  const pathBc = snapLand([
    bayMid, [270, -8], [226, 36], [172, 84], [130, 116], [120, 72], [118, 24], [108, -8], [92, -34], [104, -56], [82, -49], [64, -45], [castle.gateE.x, castle.gateE.z],
  ], 12);
  const paths = { A: pathAc.map(([x, z]) => P(x, z)), B: pathBc.map(([x, z]) => P(x, z)) };

  // ---------- Viertel (Route B) ----------
  const special: Record<string, { hall: string; extra: string[] }> = {
    england: { hall: 'lagerhaus', extra: ['mod:bastion_stern'] },
    niederlande: { hall: 'mod:kontor_giebel', extra: ['mod:kran_rad'] },
    deutschland: { hall: 'lagerhaus', extra: ['mod:bastion_granit'] },
    frankreich: { hall: 'lagerhaus', extra: ['mod:pavillon_barock'] },
    kurogane: { hall: 'mod:haus_kuro', extra: ['mod:haus_kuro'] },
    marine: { hall: 'lagerhaus', extra: ['mod:zellenblock_marine'] },
  };
  const sp = special[factionId];
  const taken: { x: number; z: number; r: number }[] = [{ x: castle.x, z: castle.z, r: ringR + 14 }];
  /** Freier Platz in einem Viertel: Land mit Abstand, abseits der Wege und anderer Bauten */
  const spot = (cx: number, cz2: number, rad: number, clearR: number, pathMargin = 8): [number, number] | null => {
    for (let t = 0; t < 80; t++) {
      const a = rnd() * Math.PI * 2, d = rad * Math.sqrt(rnd());
      const x = cx + Math.cos(a) * d, z = cz2 + Math.sin(a) * d;
      if (!land(x, z, 18)) continue;
      if (distToPath(x, z, pathBc) < pathMargin + clearR || distToPath(x, z, pathAc) < pathMargin + clearR) continue;
      if (taken.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + clearR)) continue;
      taken.push({ x, z, r: clearR });
      return [x, z];
    }
    return null;
  };

  const DEF: { id: RaidDistrictDef['districtId']; label: string; cx: number; cz: number; rad: number; houses: [string, number][]; perches: number }[] = [
    { id: 'strand', label: 'Flachland-Strand & Vorposten', cx: 268, cz: -6, rad: 66, houses: [['holzhuette', 5], ['wachturm', 3]], perches: 2 },
    { id: 'hafen', label: 'Hafen- & Kontorviertel', cx: 150, cz: 100, rad: 64, houses: [[sp.hall, 4], ['kran', 2], ['steinhaus', 3], ...sp.extra.map((t): [string, number] => [t, 1])], perches: 3 },
    { id: 'markt', label: 'Marktplatz & Kasernen-Barrikaden', cx: 115, cz: 25, rad: 50, houses: [['marktstand', 6], ['steinhaus', 5], ['kapelle', 1], ['lagerhaus', 3], ...sp.extra.map((t): [string, number] => [t, 1])], perches: 4 },
    { id: 'aufstieg', label: 'Steiler Burgaufstieg', cx: 88, cz: -40, rad: 44, houses: [['wachturm', 3], ['steinhaus', 2]], perches: 2 },
  ];
  const districts: RaidDistrictDef[] = DEF.map((d, i) => {
    const buildings: RaidBuildingDef[] = [];
    for (const [t, n] of d.houses) {
      for (let k = 0; k < n; k++) {
        const clearR = t === 'wachturm' ? 5 : t.startsWith('mod:') ? 10 : t === 'marktstand' ? 3 : 7;
        const s = spot(d.cx, d.cz, d.rad, clearR);
        if (!s) continue;
        const [x, z] = P(s[0], s[1]);
        // Türen zum nächsten Wegpunkt: Gebäude schauen zur Straße
        buildings.push({ t, x, z, yaw: Math.atan2(-(s[0] - d.cx), -(s[1] - d.cz)) - theta + (rnd() - 0.5) * 0.4 });
      }
    }
    const perches: RaidPerchDef[] = [];
    for (let k = 0; k < d.perches; k++) {
      const s = spot(d.cx, d.cz, d.rad, 6);
      if (!s) continue;
      const [x, z] = P(s[0], s[1]);
      perches.push({ perchId: `${d.id}-dach-${k + 1}`, x, z, yaw: -theta + Math.round(rnd() * 3) * (Math.PI / 2), w: 6.4, d: 6.4, h: 4.6 });
    }
    // Einzelkämpfer: wenige, zähe Figuren je Welle (Schläger, Faji-Wirker, Schildträger) – die Masse stellen die Verbände
    const lvlMix: Record<string, Partial<Record<EnemyKindId, number>>[]> = {
      strand: [{ matrose: 2, schlaeger: 1 }, { schildtraeger: 2, fajiwirker: 1 }],
      hafen: [{ schildtraeger: 2, schlaeger: 1 }, { fajiwirker: 2, schlaeger: 1 }],
      markt: [{ schildtraeger: 2, schlaeger: 1 }, { fajiwirker: 2, schlaeger: 2 }, { schildtraeger: 2, fajiwirker: 2, schlaeger: 1 }],
      aufstieg: [{ schildtraeger: 2, fajiwirker: 2 }, { schlaeger: 2, fajiwirker: 1, schildtraeger: 1 }],
    };
    // Verbände: jeder steht als geschlossene Formation (6 bis 12 Soldaten), blickt zur Landungsseite und rückt erst vor, wenn jemand nah kommt
    const squads: RaidSquadDef[] = [];
    SQUAD_PLAN[d.id].forEach(([typ, heads], k) => {
      const s2 = spot(d.cx, d.cz, d.rad * 0.92, 5.5, 3);
      if (!s2) return;
      const [x, z] = P(s2[0], s2[1]);
      squads.push({ squadId: `${d.id}-verband-${k + 1}`, typ, heads, x, z, yaw: Math.atan2(bayMid[0] - s2[0], bayMid[1] - s2[1]) - theta });
    });
    const waves: RaidWaveDef[] = lvlMix[d.id].map((m, w) => {
      const s = spot(d.cx, d.cz, d.rad * 0.7, 3, 2) ?? [d.cx, d.cz];
      const [x, z] = P(s[0], s[1]);
      return { waveId: `${d.id}-welle-${w + 1}`, kinds: mix(m), x, z, spread: 9 };
    });
    const [cx, cz3] = P(d.cx, d.cz);
    return { districtId: d.id, label: d.label, order: i + 1, x: cx, z: cz3, radius: d.rad, buildings, barricades: [], perches, waves, squads };
  });
  // Straßensperren: quer zum Weg, mit Lücke, verteilt auf die Viertel (Engstellen und Deckung für die Verteidiger)
  const owner = (x: number, z: number) => { let bi = 0, bd = Infinity; DEF.forEach((d, i) => { const dd = Math.hypot(x - d.cx, z - d.cz) / d.rad; if (dd < bd) { bd = dd; bi = i; } }); return bi; };
  [0.1, 0.22, 0.34, 0.44, 0.55, 0.64, 0.74, 0.86].forEach((f, i) => {
    const q = pointAt(pathBc, f);
    const di = owner(q.x, q.z);
    const [x, z] = P(q.x, q.z);
    districts[di].barricades.push({ barricadeId: `sperre-${i + 1}`, x, z, yaw: q.dir + Math.PI / 2 - theta, w: 9.5 } satisfies RaidBarricadeDef);
  });

  // ---------- Burg: Besatzung ----------
  const [ax, az] = P(castle.arena.x, castle.arena.z);
  // wenige Einzelkämpfer im Hof: die Masse stellen sechs Verbände, die Führung zwei Hauptmänner (Route A) bzw. einer (Route B)
  const castleWaves: RaidWaveDef[] = [
    { waveId: 'burg-welle-1', kinds: mix({ schildtraeger: 3, schlaeger: 2, fajiwirker: 2 }), x: ax, z: az, spread: 12 },
  ];
  // Verbände im Hof: auf zwei Ringen um die Arena (die Mitte bleibt dem Endboss), Blick zur Mitte
  const castleSquads: RaidSquadDef[] = CASTLE_SQUADS.map(([typ, heads], k) => {
    const a2 = (k / CASTLE_SQUADS.length) * Math.PI * 2 + 0.4, rr = k % 2 ? 31 : 24;
    const [x, z] = P(castle.arena.x + Math.cos(a2) * rr, castle.arena.z + Math.sin(a2) * rr);
    return { squadId: `burg-verband-${k + 1}`, typ, heads, x, z, yaw: Math.atan2(ax - x, az - z) };
  });
  const gateSquads: RaidSquadDef[] = GATE_SQUADS.map(([typ, heads], k) => {
    const [x, z] = P(castle.gateN.x + (k ? 9 : -9), castle.gateN.z - 16);
    return { squadId: `tor-verband-${k + 1}`, typ, heads, x, z, yaw: Math.PI - theta };
  });
  // Hauptmänner: vier Posten mit je einer Aura (Index in CAPTAINS[macht]); Route B: Hafen, Markt, Aufstieg und Burghof, Route A: Tor und zwei im Burghof
  const captains: RaidCaptainSpawn[] = [];
  const cap = (post: CaptainPost, index: number, route: RaidCaptainSpawn['route'], at: [number, number]) => {
    const [x, z] = P(at[0], at[1]);
    captains.push({ captainId: `${factionId}-hauptmann-${post}`, index, post, route, x, z, yaw: Math.atan2(bayMid[0] - at[0], bayMid[1] - at[1]) - theta });
  };
  const nearOf = (d: (typeof DEF)[number]): [number, number] => spot(d.cx, d.cz, d.rad * 0.6, 4, 2) ?? [d.cx, d.cz];
  cap('hafen', 1, 'B', nearOf(DEF[1]));
  cap('markt', 0, 'B', nearOf(DEF[2]));
  cap('aufstieg', 2, 'B', nearOf(DEF[3]));
  cap('tor', 0, 'A', [castle.gateN.x, castle.gateN.z - 26]);
  cap('burg1', 3, 'both', [castle.arena.x + 15, castle.arena.z - 8]);
  cap('burg2', 1, 'A', [castle.arena.x - 15, castle.arena.z - 8]);

  // ---------- Wachflotte vor der Küste ----------
  const guard: RaidGuardDef[] = [];
  const gx = [-190, -95, 0, 95, 190], tiers = [4, 4, 6, 5, 4];
  gx.forEach((x, i) => {
    const z = zg + 230 + Math.abs(x) * 0.3 + (rnd() - 0.5) * 20;
    const [wx, wz] = P(x, z);
    guard.push({
      guardId: `wache-${i + 1}`, tier: tiers[i], x: wx, z: wz, heading: Math.atan2(-wx, -wz),
      hull: i === 2 ? 3.4 : 2.6, sail: i === 2 ? 2.6 : 2, crew: i === 2 ? 1.8 : 1.5,
      name: i === 2 ? `${F.name}-Flaggschiff` : `${F.name}-Wachschiff ${i < 2 ? i + 1 : i}`,
    });
  });
  const [stx, stz] = P(0, zg + 640);
  const [gxw, gzw] = P(0, zg);

  return {
    factionId, seed, r: R, coast, hills: hills.map((h) => { const [x, z] = P(h.x, h.z); return { ...h, x, z }; }), rot: theta,
    structures, slots, piers, districts, castle: {
      x: P(castle.x, castle.z)[0], z: P(castle.x, castle.z)[1], ringR,
      gateN: { x: P(castle.gateN.x, castle.gateN.z)[0], z: P(castle.gateN.x, castle.gateN.z)[1] },
      gateE: { x: P(castle.gateE.x, castle.gateE.z)[0], z: P(castle.gateE.x, castle.gateE.z)[1] },
      keep: { x: P(castle.keep.x, castle.keep.z)[0], z: P(castle.keep.x, castle.keep.z)[1] },
      arena: { x: ax, z: az, r: castle.arena.r }, waves: castleWaves, squads: castleSquads,
    },
    gateSquads, captains,
    guard, paths,
    staging: { x: stx, z: stz, heading: Math.atan2(-stx, -stz) },
    gate: { x: gxw, z: gzw },
  };
}
