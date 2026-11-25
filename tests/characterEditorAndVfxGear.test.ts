// Phase 4.6G: Charakter-Editor (Reiter, Vorlagen, deutsche Beschriftungen), Kopfteile und Rückenwaffen an den Sockets ohne Clipping-Ausreißer,
// leere Ärmel des Schultermantels an eigenen Feder-Ketten, Endgame-Ausrüstung mit Effekten ohne neue Shader, Spielstände aus Version 22.
import { Group, Matrix4, Object3D, Quaternion, ShaderLib, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ACCESSORY_SOCKET, ARM_RELAX, BUILDS, CHAIN_LAYOUT, CLOTH, ROT_BUDGET, SHEATH, SHEATH_LEN, SOCKET_BOUNDS, SOCKET_DEFS, SOCKET_IDS,
  sheathPose, type CharacterSocketId,
} from '../src/data/characterRig';
import {
  BEARD_STYLES, BODY_TYPES, COATS, COSMETIC_HATS, GLASSES, HATS, HAIR_STYLES, OUTFITS, defaultLook, randomLook, sanitizeLook, type CharacterLook,
} from '../src/data/characterParts';
import { EQUIP_BY_ID, GLASSES_ITEM, PATTERN_NO, TRIM_STYLES, loadoutFromLook, resolveLoadout } from '../src/data/equipment';
import { ENDGAME_SETS, GEAR_SET_BY_ID, SETS, WARLORD_LEVELS, endgameEarned, endgamePieces, gearForNpc, tierOfSet } from '../src/data/gear';
import { rollGearByTier, rollLootGear } from '../src/core/gearBag';
import {
  ARMOR_SUBS, BLADES, BODY_INFO, CAM_FOCUS, EDITOR_LABEL_MAX, EDITOR_TABS, MOOD_PREVIEW, STAGE_LIGHTS, STAGE_POSES, STYLES, armorySets,
} from '../src/ui/editor';
import { STAGE_FOCUS, STAGE_LIGHTING } from '../src/data/editorStudio';
import { attachHeadgear, buildHeadgear, CAPPED } from '../src/entities/character/animeHats';
import type { Anchors } from '../src/entities/character/vroid';
import { capeCutLift } from '../src/entities/character/vroid';
import { SpringChains, addCapsule } from '../src/entities/character/rig/springChain';
import { GearAura, GEAR_AURA, type AuraHost } from '../src/graphics/gearAura';
import { toon, toonShared } from '../src/render/toon';
import { migrateSave } from '../src/core/save/migrations';
import { createSave, SAVE_VERSION } from '../src/core/save/types';
import { sanitizeSettings } from '../src/core/settings';
import { EXPRESSIONS } from '../src/data/characterRig';

/** Shader-Quelltext eines Toon-Materials wie beim Übersetzen */
function compiled(mat: ReturnType<typeof toon>) {
  const sh = { uniforms: {} as Record<string, unknown>, vertexShader: ShaderLib.toon.vertexShader, fragmentShader: ShaderLib.toon.fragmentShader };
  mat.onBeforeCompile(sh as never, undefined as never);
  return sh;
}

/** Deutsche Beschriftung: nicht leer, keine Umlaut-Ersatzschreibung, kein Kennungs-Stil, beginnt groß, kurz genug für einen Knopf */
const BAD_SPELLING = /(Koerper|Huete|Baerte|Maentel|Ruestung|Muetze|Suedwester|Zweihaender|Faust(ae|ae)|Gesicht_|Kaempf|_)/;
function germanLabel(l: string, where: string) {
  expect(l.trim(), where).toBe(l);
  expect(l.length, where).toBeGreaterThan(1);
  expect(l.length, `${where}: „${l}“ zu lang`).toBeLessThanOrEqual(EDITOR_LABEL_MAX);
  expect(BAD_SPELLING.test(l), `${where}: „${l}“`).toBe(false);
  expect(/^[A-ZÄÖÜ0-9⟳🎲]/.test(l), `${where}: „${l}“ beginnt klein`).toBe(true);
}

describe('Charakter-Editor 4.6G: Reiter, Vorlagen und Beschriftungen', () => {
  it('sechs Reiter in der vorgegebenen Reihenfolge, Kamera-Fokus, Haltungen und Licht', () => {
    expect(EDITOR_TABS.map((t) => t.label)).toEqual(['Körper & Statur', 'Gesicht & Augen', 'Haare & Bärte', 'Kleidung & Mäntel', 'Hüte & Accessoires', 'Rüstung & Waffen-Optik']);
    expect(CAM_FOCUS.map((c) => c.label)).toEqual(['Gesicht (Nahaufnahme)', 'Oberkörper & Mantel', 'Ganzkörper']);
    expect(STAGE_POSES.map((p) => p.label)).toEqual(['Entspannte Hafen-Haltung', 'Kampfbereitschaft', 'Sturm-Erwachen']);
    expect(STAGE_LIGHTS.map((l) => l.label)).toEqual(['Hafen-Sonne', 'Nacht-Laterne']);
    // jeder Kamera-Fokus hat Werte im Studio
    for (const c of CAM_FOCUS) expect(STAGE_FOCUS[c.id], c.id).toBeTruthy();
    for (const f of Object.values(STAGE_FOCUS)) { expect(f.zoom).toBeGreaterThan(0.1); expect(f.zoom).toBeLessThanOrEqual(1.3); }
    // Nahaufnahme folgt dem Kopf, Ganzkörper nicht
    expect(STAGE_FOCUS.gesicht.follow && STAGE_FOCUS.gesicht.fromHead !== null).toBe(true);
    expect(STAGE_FOCUS.ganz.fromHead).toBeNull();
  });

  it('alle Beschriftungen sind deutsch, eindeutig und passen auf ihre Knöpfe', () => {
    const maps: [string, Record<string, string>][] = [
      ['Statur', BODY_TYPES], ['Frisur', HAIR_STYLES], ['Bart', BEARD_STYLES], ['Oberteil', OUTFITS], ['Mantel', COATS],
      ['Hut', COSMETIC_HATS as unknown as Record<string, string>], ['Brille', GLASSES as unknown as Record<string, string>], ['Klinge', BLADES], ['Kampfstil', STYLES],
    ];
    for (const [name, m] of maps) {
      const labels = Object.values(m);
      expect(new Set(labels).size, `${name}: doppelte Beschriftung`).toBe(labels.length);
      for (const l of labels) germanLabel(l, name);
    }
    for (const list of [EDITOR_TABS, CAM_FOCUS, STAGE_POSES, STAGE_LIGHTS, MOOD_PREVIEW, ARMOR_SUBS]) {
      expect(new Set(list.map((x) => x.label)).size).toBe(list.length);
      for (const x of list) germanLabel(x.label, 'Editor');
    }
    // Statur-Beschreibungen für jede Statur, Mimik-Vorschau nur mit vorhandenen Ausdrücken
    for (const k of Object.keys(BODY_TYPES)) expect(BODY_INFO[k], k).toBeTruthy();
    for (const m of MOOD_PREVIEW) expect(EXPRESSIONS[m.id], m.id).toBeTruthy();
    // vertauschte Bezeichnung von früher: der Oberkörper-Knopf hieß „Rüstung“
    expect(CAM_FOCUS.find((c) => c.id === 'oberkoerper')!.label).not.toMatch(/Rüstung/);
  });

  it('jede Kopfbedeckung des Editors lässt sich bauen; die Brille ist keine Kopfbedeckung mehr', () => {
    const base = defaultLook('pirat');
    for (const hat of Object.keys(COSMETIC_HATS)) {
      if (hat === 'keiner') continue;
      const g = buildHeadgear({ ...base, hat: hat as CharacterLook['hat'] }, 0.12, false);
      expect(g.children.length, hat).toBeGreaterThan(0);
    }
    expect('brille' in HATS).toBe(false);
    for (const k of Object.keys(GLASSES)) {
      if (k === 'keine') continue;
      const id = GLASSES_ITEM[k as keyof typeof GLASSES_ITEM];
      expect(EQUIP_BY_ID[id], k).toBeTruthy();
      const R = resolveLoadout(loadoutFromLook({ ...base, glasses: k as CharacterLook['glasses'] }));
      expect(R.glasses?.kind, k).toBe(k);
    }
    // Brille und Hut zusammen (vorher schloss die Fliegerbrille als „Hut“ jeden Hut aus)
    const both = resolveLoadout(loadoutFromLook({ ...base, hat: 'dreispitz', glasses: 'rund' }));
    expect(both.hat).toBe('dreispitz');
    expect(both.glasses?.kind).toBe('rund');
  });

  it('Hutfarbe wirkt bei jeder färbbaren Kopfbedeckung (Marine- und Kochmütze waren fest weiß)', () => {
    const colorOf = (hat: string, color: string) => {
      const g = buildHeadgear({ ...defaultLook('pirat'), hat: hat as CharacterLook['hat'], hatColor: color }, 0.12, false);
      const cols = new Set<string>();
      g.traverse((o) => { const m = (o as unknown as { material?: { color?: { getHexString(): string } } }).material; if (m?.color) cols.add(m.color.getHexString()); });
      return cols;
    };
    for (const hat of ['marine', 'kochmuetze', 'dreispitz', 'bandana', 'muetze', 'suedwester']) expect(colorOf(hat, '#2f6e4f').has('2f6e4f'), hat).toBe(true);
  });

  it('Zufallsfiguren und alte Werte ergeben immer gültige Kategorien', () => {
    let seed = 7;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 200; i++) {
      const l = randomLook(rng, (['buerger', 'fischer', 'haendler', 'pirat', 'marine', 'offizier', 'koch', 'schmied', 'wirt'] as const)[i % 9]);
      expect(Object.keys(COSMETIC_HATS)).toContain(l.hat);
      if (l.glasses) expect(Object.keys(GLASSES)).toContain(l.glasses);
      const s = sanitizeLook(l, 'pirat');
      expect(s.hat).toBe(l.hat);
    }
    const old = sanitizeLook({ ...defaultLook('pirat'), hat: 'brille', glasses: 'unsinn' }, 'pirat');
    expect(old.hat).toBe('keiner');
    expect(old.glasses).toBe('flieger');
    expect(sanitizeLook({ ...defaultLook('pirat'), glasses: 'keine' }, 'pirat').glasses).toBeUndefined();
  });

  it('Rüstkammer zeigt verborgene Sets erst mit einem Stück im Besitz; Lichtstimmungen ändern nur Stärken', () => {
    expect(armorySets([]).some((s) => s.id === 'kosmos')).toBe(false);
    expect(armorySets(['kosmos_cloak']).some((s) => s.id === 'kosmos')).toBe(true);
    expect(armorySets([]).some((s) => s.id === 'kaiser_regalia')).toBe(true);
    const keys = (o: object) => Object.keys(o).sort().join(',');
    expect(keys(STAGE_LIGHTING.sonne)).toBe(keys(STAGE_LIGHTING.laterne));
    expect(STAGE_LIGHTING.sonne.lantern).toBe(0);
    expect(STAGE_LIGHTING.laterne.lantern).toBeGreaterThan(0);
    expect(STAGE_LIGHTING.laterne.key[1]).toBeLessThan(STAGE_LIGHTING.sonne.key[1]);
  });
});

describe('Sockets 4.6G: Kopfteile und Rückenwaffen ohne Clipping-Ausreißer', () => {
  it('Grenzen für alle zwölf Sockets, Zubehör nur an vorhandenen Sockets', () => {
    for (const id of SOCKET_IDS) {
      const b = SOCKET_BOUNDS[id];
      for (let a = 0; a < 3; a++) expect(b.min[a], `${id}[${a}]`).toBeLessThan(b.max[a]);
    }
    for (const [k, id] of Object.entries(ACCESSORY_SOCKET)) expect(SOCKET_IDS as readonly string[], k).toContain(id);
    // Bart und Ohrring teilen den Kiefer-Socket, Brillen das Gesicht, Monokel und Augenklappe das Auge
    expect(ACCESSORY_SOCKET.ohrring).toBe('beardJaw');
    expect(SOCKET_DEFS.beardJaw.label).toMatch(/Ohrring/);
  });

  /** Kopf mit gemessenen Werten der männlichen Grundfigur (4.6G, Kopfraum: das Gesicht schaut nach −Z) und Socket-Knoten wie im Spiel */
  function headRig() {
    const head = new Object3D();
    const eyeL = new Object3D(); eyeL.position.set(-0.0217, 0.0625, -0.0312);
    const eyeR = new Object3D(); eyeR.position.set(0.0217, 0.0625, -0.0312);
    head.add(eyeL, eyeR);
    const an: Anchors = { earLobe: new Vector3(0.0825, 0.0227, -0.0132), eyeY: 0.0625, shoulders: [new Vector3(), new Vector3()], faceZ: -0.109, templeX: 0.068 };
    // Socket-Raum: +Z vorn (Kopfraum −Z), +X links – also 180° um Y gedreht
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    const at: Partial<Record<CharacterSocketId, [number, number, number]>> = {
      headTop: [0, 0.19, 0.0], faceFront: [0, 0.0625, -0.124], eyeLeft: [-0.0217, 0.0625, -0.112], eyeRight: [0.0217, 0.0625, -0.112], beardJaw: [0, -0.035, -0.09],
    };
    const nodes = new Map<CharacterSocketId, Object3D>();
    for (const [id, p] of Object.entries(at) as [CharacterSocketId, [number, number, number]][]) {
      const n = new Object3D();
      n.position.set(...p);
      n.quaternion.copy(turn);
      head.add(n);
      nodes.set(id, n);
    }
    return { head, eyeL, eyeR, an, sockets: { get: (id: CharacterSocketId) => nodes.get(id) ?? null }, nodes };
  }

  /** Hülle eines Teils im Raum seines Sockets */
  function boxIn(part: Object3D, node: Object3D) {
    node.parent!.updateMatrixWorld(true);
    const inv = new Matrix4().copy(node.matrixWorld).invert();
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    part.traverse((o) => {
      const g = (o as unknown as { geometry?: { boundingBox: { min: Vector3; max: Vector3 } | null; computeBoundingBox(): void } }).geometry;
      if (!g) return;
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      for (let k = 0; k < 8; k++) {
        const v = new Vector3(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        mn[0] = Math.min(mn[0], v.x); mn[1] = Math.min(mn[1], v.y); mn[2] = Math.min(mn[2], v.z);
        mx[0] = Math.max(mx[0], v.x); mx[1] = Math.max(mx[1], v.y); mx[2] = Math.max(mx[2], v.z);
      }
    });
    return { mn, mx };
  }

  it('Brille, Monokel, Augenklappe, Ohrring sitzen an ihren Sockets, innerhalb der Grenzen und vor der Gesichtshaut', () => {
    for (const look of [
      { glasses: 'rund' as const, eyepatch: false }, { glasses: 'monokel' as const, eyepatch: false }, { glasses: 'monokel' as const, eyepatch: true }, { glasses: 'keine' as const, eyepatch: true },
    ]) {
      const { head, eyeL, eyeR, an, sockets, nodes } = headRig();
      const parts = attachHeadgear(head, eyeL, eyeR, { ...defaultLook('pirat'), hat: 'keiner', earring: true, beard: 'keiner', scar: false, ...look }, false, null, an, null, sockets);
      expect(parts.length, JSON.stringify(look)).toBeGreaterThan(0);
      head.updateMatrixWorld(true);
      for (const p of parts) {
        const id = p.userData.socket as CharacterSocketId;
        expect(SOCKET_IDS as readonly string[]).toContain(id);
        const node = nodes.get(id)!;
        expect(p.parent, `${id} hängt am Socket`).toBe(node);
        const { mn, mx } = boxIn(p, node);
        const B = SOCKET_BOUNDS[id];
        for (let a = 0; a < 3; a++) {
          expect(mn[a], `${JSON.stringify(look)} ${id} min[${a}]`).toBeGreaterThanOrEqual(B.min[a] - 1e-4);
          expect(mx[a], `${JSON.stringify(look)} ${id} max[${a}]`).toBeLessThanOrEqual(B.max[a] + 1e-4);
        }
      }
      // Kein Clipping ins Gesicht (Kopfraum: vorn = kleineres z): jedes Teil ragt sichtbar vor die gemessene Haut, und die Fassungen von Brille
      // und Monokel liegen ganz davor (vorher steckten sie 2 – 3 cm im Gesicht)
      const toHead = new Matrix4().copy(head.matrixWorld).invert();
      for (const p of parts.filter((q) => q.userData.socket !== 'beardJaw')) {
        let front = Infinity;
        p.traverse((o) => {
          const g = (o as unknown as { geometry?: { boundingBox: { min: Vector3; max: Vector3 } | null; computeBoundingBox(): void; type?: string } }).geometry;
          if (!g) return;
          g.computeBoundingBox();
          const bb = g.boundingBox!;
          for (let k = 0; k < 8; k++) front = Math.min(front, new Vector3(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld).applyMatrix4(toHead).z);
          // Fassungen (Ringe ab 1 cm Halbmesser, nicht die Kettenglieder des Monokels) ganz vor der Haut
          const tg = (o as unknown as { geometry: { type: string; parameters?: { radius?: number } } }).geometry;
          if (tg.type === 'TorusGeometry' && (tg.parameters?.radius ?? 0) > 0.01 && (tg.parameters?.radius ?? 1) < 0.05) {
            const c = new Vector3().addVectors(bb.min, bb.max).multiplyScalar(0.5).applyMatrix4(o.matrixWorld).applyMatrix4(toHead);
            expect(c.z, `${JSON.stringify(look)} Fassung vor der Haut`).toBeLessThan(an.faceZ - 0.003);
          }
        });
        expect(front, `${JSON.stringify(look)} ${p.userData.socket} sichtbar vor der Haut`).toBeLessThan(an.faceZ - 0.003);
      }
    }
  });

  it('Ohrring hängt am Ohrläppchen (Kiefer-Socket), Bügel der Brille enden am Ohr', () => {
    const { head, eyeL, eyeR, an, sockets } = headRig();
    const parts = attachHeadgear(head, eyeL, eyeR, { ...defaultLook('pirat'), hat: 'keiner', earring: true, glasses: 'rund', beard: 'keiner', scar: false, eyepatch: false }, false, null, an, null, sockets);
    head.updateMatrixWorld(true);
    const toHead = new Matrix4().copy(head.matrixWorld).invert();
    const ring = parts.find((p) => p.userData.socket === 'beardJaw')!;
    const rp = new Vector3().setFromMatrixPosition(ring.matrixWorld).applyMatrix4(toHead);
    expect(rp.distanceTo(an.earLobe)).toBeLessThan(0.012);
    const glasses = parts.find((p) => p.userData.socket === 'faceFront')!;
    let maxX = 0, backZ = -Infinity;
    glasses.traverse((o) => { if ((o as unknown as { geometry?: unknown }).geometry) { const v = new Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(toHead); maxX = Math.max(maxX, Math.abs(v.x)); backZ = Math.max(backZ, v.z); } });
    // Bügel reichen bis an die Ohren, nicht weiter hinaus
    expect(maxX).toBeLessThan(Math.abs(an.earLobe.x) + 0.02);
    expect(backZ).toBeGreaterThan(an.faceZ + 0.03);
  });

  it('Rückenwaffen: jede Klinge sitzt im Rücken-Socket, über dem Boden, nie im Körper; lange Klingen steiler', () => {
    // Socket in Höhe des oberen Brustkorbs der Grundfigur (gut 1,3 m über dem Boden)
    const socketY = 1.3;
    const B = SOCKET_BOUNDS.backWeapon;
    for (const [kind, len] of Object.entries(SHEATH_LEN)) for (const double of [false, true]) for (const side of ['r', 'l'] as const) for (const clear of Object.values(SHEATH.clear)) {
      const p = sheathPose(len, side, double, clear);
      const w = `${kind} ${side}${double ? ' doppelt' : ''}`;
      for (const [x, y] of [[p.hx, p.hy], [p.tipX, p.tipY]]) {
        expect(x, w).toBeGreaterThanOrEqual(B.min[0]); expect(x, w).toBeLessThanOrEqual(B.max[0]);
        expect(y, w).toBeGreaterThanOrEqual(B.min[1]); expect(y, w).toBeLessThanOrEqual(B.max[1]);
      }
      expect(p.z, w).toBeLessThanOrEqual(-SHEATH.clear.haut + 1e-9);
      expect(socketY + p.tipY, `${w}: Spitze über dem Boden`).toBeGreaterThan(0.15);
      // Griff über der Schulter der Waffenhand (rechts = −X), Doppelklingen gekreuzt
      if (!double) expect(Math.sign(p.hx), w).toBe(side === 'r' ? -1 : 1);
      else expect(Math.sign(p.tipX), w).toBe(-Math.sign(p.hx));
    }
    const steep = (len: number) => Math.atan2(Math.abs(sheathPose(len, 'r', false, 0.02).tipX - sheathPose(len, 'r', false, 0.02).hx), Math.abs(sheathPose(len, 'r', false, 0.02).tipY - sheathPose(len, 'r', false, 0.02).hy));
    expect(steep(SHEATH_LEN.zweihaender)).toBeLessThan(steep(SHEATH_LEN.saebel));
    // unter dem Mantel liegt die Klinge weiter außen als auf dem Hemd
    expect(SHEATH.clear.mantelLang).toBeGreaterThan(SHEATH.clear.hemd);
  });

  it('Hüte mit gemessener Kappe oder Sitzhöhe: jede Kopfbedeckung ist erfasst', () => {
    const measured = new Set([...Object.keys(CAPPED), 'dreispitz', 'zweispitz', 'marine', 'kochmuetze', 'suedwester', 'helm', 'bandana', 'muetze']);
    for (const hat of Object.keys(COSMETIC_HATS)) if (hat !== 'keiner') expect(measured.has(hat), hat).toBe(true);
  });
});

describe('Haltung 4.6G: entspannte Arme und begrenzte Zusatz-Drehungen', () => {
  it('Ziel-Abspreizung je Statur, Budgets kleiner als die alten Grenzen', () => {
    for (const b of Object.keys(BUILDS)) {
      const t = ARM_RELAX.target[b as keyof typeof BUILDS];
      expect(t, b).toBeGreaterThan(0.08);
      expect(t, b).toBeLessThan(0.3);
    }
    // breitere Staturen brauchen mehr Luft zwischen Arm und Rumpf
    expect(ARM_RELAX.target.wuchtig).toBeGreaterThan(ARM_RELAX.target.schlank);
    expect(ARM_RELAX.armed).toBeLessThan(1);
    // Kurvenneigen: höchstens rund 7° (vorher bis 17°), Kopf nicht auf den Rücken
    expect(ROT_BUDGET.bankRoll).toBeLessThan(0.13);
    expect(ROT_BUDGET.headYaw + ROT_BUDGET.neckYaw + ROT_BUDGET.chestYaw + ROT_BUDGET.spineYaw + ROT_BUDGET.upperChestYaw).toBeLessThan(1.5);
    for (const v of Object.values(ROT_BUDGET)) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(0.6); }
  });
});

describe('Schultermantel 4.6G: leere Ärmel an eigenen Feder-Ketten', () => {
  const frame = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z).elements;
  /** zwei Ärmel-Ketten wie in clothRig (links +X, rechts −X), Wurzel an der Schulternaht hinter dem Arm */
  const sleeves = () => {
    const L = CHAIN_LAYOUT.sleeves;
    const c = new SpringChains(2, L.links, CLOTH.sleeve);
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? 1 : -1;
      for (let i = 0; i <= L.links; i++) { const t = i / L.links; c.setRest(k, i, s * (0.2 + 0.03 * t), -L.length * t, -L.back - 0.02 * t); }
    }
    c.finishRest();
    // Arme (Kapseln) neben dem Rumpf, Rumpf in der Mitte – die Ärmel dürfen nicht hineinsinken
    for (const s of [1, -1]) addCapsule(c.colliders, s * 0.17, 1.95, 0, s * 0.19, 1.45, 0.02, 0.045);
    addCapsule(c.colliders, 0, 2.0, 0, 0, 1.2, 0, 0.11);
    return c;
  };
  const tip = (c: SpringChains, k: number) => { const o = (k * (c.links + 1) + c.links) * 3; return new Vector3(c.pos[o], c.pos[o + 1], c.pos[o + 2]); };

  it('im Stand hängen beide Ärmel herab, halten ihre Länge und stecken nie in Arm oder Rumpf', () => {
    const c = sleeves();
    const A = frame(0, 2, 0);
    for (let i = 0; i < 240; i++) {
      c.step(A, 1 / 60);
      for (let k = 0; k < 2; k++) for (let n = 1; n <= c.links; n++) {
        const o = (k * (c.links + 1) + n) * 3;
        const px = c.pos[o], py = c.pos[o + 1], pz = c.pos[o + 2];
        // Abstand zur Arm-Kapsel derselben Seite
        const s = k === 0 ? 1 : -1;
        const t = Math.min(1, Math.max(0, (1.95 - py) / 0.5));
        const ax = s * (0.17 + 0.02 * t), az = 0.02 * t;
        if (py <= 1.95 && py >= 1.45) expect(Math.hypot(px - ax, pz - az), `Arm ${k}/${n}`).toBeGreaterThan(0.045 + CLOTH.sleeve.radius - 0.02);
      }
    }
    for (let k = 0; k < 2; k++) {
      const t = tip(c, k);
      expect(t.y, `Ärmel ${k} hängt`).toBeLessThan(2 - CHAIN_LAYOUT.sleeves.length * 0.8);
      expect(Math.sign(t.x), `Ärmel ${k} bleibt auf seiner Seite`).toBe(k === 0 ? 1 : -1);
    }
    expect(c.maxStretch).toBeLessThanOrEqual(CLOTH.sleeve.stretch + 1e-3);
    expect(c.resets).toBe(0);
  });

  it('beim Laufen schwingen die Ärmel nach hinten und kommen im Stand wieder zur Ruhe', () => {
    const c = sleeves();
    let z = 0;
    for (let i = 0; i < 60; i++) c.step(frame(0, 2, z), 1 / 60);
    for (let i = 0; i < 90; i++) { z += 5 / 60; c.step(frame(0, 2, z), 1 / 60); }
    const trail = z - tip(c, 0).z;
    expect(trail, 'Ärmel weht nach hinten').toBeGreaterThan(CHAIN_LAYOUT.sleeves.back + 0.08);
    for (let i = 0; i < 400; i++) c.step(frame(0, 2, z), 1 / 60);
    const a = tip(c, 0).clone();
    c.step(frame(0, 2, z), 1 / 60);
    expect(tip(c, 0).distanceTo(a), 'zur Ruhe gekommen').toBeLessThan(0.003);
  });

  it('Seewind und Stöße bewegen die Ärmel, ohne sie zu zerreißen', () => {
    const c = sleeves();
    c.wind.x = 8;
    const A = frame(0, 2, 0);
    for (let i = 0; i < 200; i++) c.step(A, 1 / 60);
    expect(tip(c, 1).x).toBeGreaterThan(-0.2);
    c.kick(0, 6, -4);
    for (let i = 0; i < 60; i++) c.step(A, 1 / 60);
    expect(c.maxStretch).toBeLessThanOrEqual(CLOTH.sleeve.stretch + 1e-3);
    for (const v of c.pos) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('Endgame-Ausrüstung 4.6G: Effekte ohne neue Shader', () => {
  it('vier Endgame-Sets, Stufe 5, nie als Beute, nie an Gegnern, nie im Laden', () => {
    expect([...ENDGAME_SETS]).toEqual(['kaiser_regalia', 'kriegsherr', 'souveraen', 'kosmos']);
    for (const id of ENDGAME_SETS) {
      const s = GEAR_SET_BY_ID[id];
      expect(s?.endgame, id).toBe(true);
      expect(tierOfSet(s)).toBe(5);
    }
    expect(GEAR_SET_BY_ID.kaiser_regalia.n).toBe('Kaiser-Regalia');
    expect(GEAR_SET_BY_ID.souveraen.n).toBe('Sturmkrone-Souverän');
    expect(GEAR_SET_BY_ID.kriegsherr.n).toBe('Mythische Kriegsherren-Rüstung');
    expect(GEAR_SET_BY_ID.kosmos.n).toBe('Kosmos-Umhang');
    const endgame = new Set(ENDGAME_SETS.flatMap((id) => endgamePieces(id)));
    let seed = 3;
    const rng = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 300; i++) {
      for (const id of gearForNpc(100, i % 3 ? 'elite' : 'boss', i % 2 === 0, rng)) expect(endgame.has(id), id).toBe(false);
      const d = rollLootGear('legendaer', 100, [], rng, 5);
      if (d) expect(endgame.has(d.id), d.id).toBe(false);
      const t = rollGearByTier(5, [], rng);
      if (t) expect(endgame.has(t.id), t.id).toBe(false);
    }
    // Kosmos bleibt verborgen: keine Stufe über 100 in den Daten
    for (const s of SETS) expect(s.level).toBeLessThanOrEqual(100);
  });

  it('jedes Set trägt Energie-Säume, schimmernde Runen, einen Umhang-Schnitt und Aura-Teilchen', () => {
    const cuts: Record<string, string> = { kaiser_regalia: 'schwalbe', kriegsherr: 'zerrissen', souveraen: 'zacken', kosmos: 'sterne' };
    for (const id of ENDGAME_SETS) {
      const R = resolveLoadout(loadoutFromLook({ ...defaultLook('pirat'), extra: endgamePieces(id) }));
      const specs = [...R.shells.map((s) => s.spec), ...(R.cape ? [R.cape.spec] : [])];
      expect(specs.some((s) => s.trimStyle === TRIM_STYLES.energie), `${id}: Energie-Saum`).toBe(true);
      expect(specs.some((s) => s.pattern === PATTERN_NO.runen), `${id}: Runen`).toBe(true);
      expect(R.cape?.cut, id).toBe(cuts[id]);
      expect(R.aura.length, `${id}: Aura`).toBeGreaterThan(0);
      for (const a of R.aura) {
        expect(['glut', 'funken', 'sterne']).toContain(a.kind);
        expect(['schultern', 'umhang', 'krone', 'waffe']).toContain(a.at);
        expect(a.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(a.rate).toBeGreaterThan(0);
        expect(a.rate).toBeLessThanOrEqual(10);
      }
    }
    // gewöhnliche Kleidung bleibt ohne Aura
    expect(resolveLoadout(loadoutFromLook(defaultLook('marine'))).aura).toEqual([]);
  });

  it('Säume und Runen laufen im bestehenden Borten-Programm (kein neuer Schlüssel), Leuchten über eine gemeinsame Uniform', () => {
    const m = toon({ color: '#ffffff', surface: 'cloth', vertexColors: true, trim: true });
    expect(m.customProgramCacheKey()).toBe('sk-toon-10ct');
    const sh = compiled(m);
    expect(sh.fragmentShader).toContain('vGSet.w > 2.5');
    expect(sh.fragmentShader).toContain('skGpat < 7.5');
    expect(sh.fragmentShader).toContain('totalEmissiveRadiance');
    expect(sh.fragmentShader).toContain('uniform float uSkGearGlow');
    expect(sh.uniforms.uSkGearGlow).toBe(toonShared.gearGlow);
    // Leuchten bleibt im Rahmen des Bloom (Einstellung und Kampf)
    expect(GearAura.glowFor(0, 0)).toBeCloseTo(GEAR_AURA.glowBase, 5);
    expect(GearAura.glowFor(1, 1)).toBeLessThan(1.6);
    expect(GearAura.glowFor(1, 1)).toBeGreaterThan(GearAura.glowFor(1, 0));
  });

  it('Aura-Teilchen über die Effekt-Schmiede: Stärke regelbar, im Kampf mehr, 0 % = aus, nur vorhandene Teilchenarten', () => {
    const R = resolveLoadout(loadoutFromLook({ ...defaultLook('pirat'), extra: endgamePieces('kaiser_regalia') }));
    const node = () => { const n = new Object3D(); n.updateMatrixWorld(); return n; };
    const nodes = new Map<string, Object3D>();
    const rig = new Group();
    const host: AuraHost = { holder: new Group(), rig, auraSpecs: R.aura, charSockets: { get: (id) => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id)!; } } };
    const run = (level: number, combat: number) => {
      const kinds: string[] = [];
      const vfx = { burst: (kind: string) => { kinds.push(kind); } } as unknown as Parameters<GearAura['update']>[2];
      const a = new GearAura();
      a.level = level;
      for (let i = 0; i < 120; i++) a.update(1 / 60, host, vfx, combat);
      return kinds;
    };
    const calm = run(0.7, 0), fight = run(0.7, 1), off = run(0, 1), full = run(1, 0);
    expect(off.length).toBe(0);
    expect(calm.length).toBeGreaterThan(3);
    expect(full.length).toBeGreaterThan(calm.length);
    expect(fight.length).toBeGreaterThan(calm.length);
    for (const k of [...calm, ...fight]) expect(['ember', 'spark']).toContain(k);
    // Einstellung im Spielstand der Einstellungen: begrenzt auf 0 … 1, Standard 70 %
    expect(sanitizeSettings({}).gearAura).toBeCloseTo(0.7, 5);
    expect(sanitizeSettings({ gearAura: 3 }).gearAura).toBe(1);
    expect(sanitizeSettings({ gearAura: -1 }).gearAura).toBe(0);
  });

  it('Umhang-Schnitte: rein, im Rahmen der Länge, glatt bleibt glatt', () => {
    for (const cut of ['zacken', 'schwalbe', 'zerrissen', 'sterne'] as const) {
      let any = false;
      for (let c = 0; c < 19; c++) {
        const u = (2 * c) / 18 - 1;
        const v = capeCutLift(cut, u, c);
        expect(v, cut).toBeGreaterThanOrEqual(0);
        expect(v, cut).toBeLessThanOrEqual(0.31);
        expect(capeCutLift(cut, u, c)).toBe(v);
        if (v > 0.02) any = true;
      }
      expect(any, cut).toBe(true);
    }
    expect(capeCutLift('glatt', 0.3, 5)).toBe(0);
    // Schwalbenschwanz: Mitte gerafft, Enden lang
    expect(capeCutLift('schwalbe', 0, 9)).toBeGreaterThan(capeCutLift('schwalbe', 0.9, 17));
  });

  it('Vergabe: je Kaiser ein Stück, Kriegsherren-Meilensteine, Souverän mit 100, Kosmos nach dem Aufstieg', () => {
    expect(endgameEarned({ level: 79, ascended: false, kaiserDefeated: 0 })).toEqual([]);
    const k2 = endgameEarned({ level: 50, ascended: false, kaiserDefeated: 2 });
    expect(k2).toEqual(endgamePieces('kaiser_regalia').slice(0, 2));
    const lv86 = endgameEarned({ level: 86, ascended: false, kaiserDefeated: 0 });
    expect(lv86).toEqual(endgamePieces('kriegsherr').slice(0, WARLORD_LEVELS.filter((l) => l <= 86).length));
    const all = endgameEarned({ level: 101, ascended: true, kaiserDefeated: 5 });
    for (const id of ENDGAME_SETS) for (const p of endgamePieces(id)) expect(all).toContain(p);
    expect(endgameEarned({ level: 100, ascended: false, kaiserDefeated: 9 }).filter((p) => p.startsWith('kosmos'))).toEqual([]);
    for (const p of all) expect(EQUIP_BY_ID[p], p).toBeTruthy();
  });
});

describe('Spielstand 23: Figuren und Ausrüstung aus Version 22 laden fehlerfrei', () => {
  const v22 = (o: { level?: number; kaiser?: string[]; ascended?: boolean; hat?: string } = {}) => {
    const s = createSave('Alt', 'pirat', '4.6.5', 1) as unknown as Record<string, any>;
    s.version = 22;
    s.player.level = o.level ?? 30;
    s.player.look = { ...s.player.look, hat: o.hat ?? 'brille', body: 'kraeftig', coat: 'schulter' };
    s.gear.loot = ['drache_chest', 'ritter_head'];
    s.gear.outfit = { chest: 'drache_chest', head: 'ritter_head' };
    s.talents = { ...(s.talents ?? {}), kaiserDefeated: o.kaiser ?? [], ascended: !!o.ascended };
    return s;
  };

  it('die Fliegerbrille wird zur Brille, alles andere bleibt (Statur, Mantel, Beute, angelegte Stücke)', () => {
    const r = migrateSave(JSON.parse(JSON.stringify(v22())), '4.6.6');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.data;
    expect(SAVE_VERSION).toBe(23);
    expect(d.version).toBe(23);
    expect(r.migratedFrom).toBe(22);
    expect(d.player.look.hat).toBe('keiner');
    expect(d.player.look.glasses).toBe('flieger');
    expect(d.player.look.body).toBe('kraeftig');
    expect(d.player.look.coat).toBe('schulter');
    expect(d.gear.loot).toEqual(expect.arrayContaining(['drache_chest', 'ritter_head']));
    for (const id of Object.values(d.gear.outfit ?? {})) if (id) expect(EQUIP_BY_ID[id], id).toBeTruthy();
    // das Aussehen ergibt eine gültige Ausrüstung samt Brille
    const R = resolveLoadout(loadoutFromLook(d.player.look));
    expect(R.glasses?.kind).toBe('flieger');
    expect(R.cape?.drape).toBe(true);
  });

  it('schon verdiente Endgame-Stücke landen rückwirkend im Beutel', () => {
    const r = migrateSave(JSON.parse(JSON.stringify(v22({ level: 86, kaiser: ['britannia', 'batavia'], hat: 'dreispitz' }))), '4.6.6');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const loot = r.data.gear.loot ?? [];
    for (const p of endgamePieces('kaiser_regalia').slice(0, 2)) expect(loot).toContain(p);
    for (const p of endgamePieces('kriegsherr').slice(0, 3)) expect(loot).toContain(p);
    expect(loot.some((p) => p.startsWith('souveraen') || p.startsWith('kosmos'))).toBe(false);
    expect(r.data.player.look.hat).toBe('dreispitz');
    expect(r.data.player.look.glasses).toBeUndefined();
  });

  it('ein Stand der Version 23 lädt unverändert, unbekannte Werte fallen auf sichere Vorgaben', () => {
    const r1 = migrateSave(JSON.parse(JSON.stringify(v22({ hat: 'zweispitz' }))), '4.6.6');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const again = migrateSave(JSON.parse(JSON.stringify(r1.data)), '4.6.6');
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.migratedFrom).toBeNull();
    expect(again.data.player.look).toEqual(r1.data.player.look);
    const broken = JSON.parse(JSON.stringify(r1.data));
    broken.player.look.glasses = 'zauberbrille';
    broken.player.look.hat = 42;
    const r2 = migrateSave(broken, '4.6.6');
    expect(r2.ok).toBe(true);
    if (r2.ok) { expect(r2.data.player.look.glasses).toBeUndefined(); expect(Object.keys(HATS)).toContain(r2.data.player.look.hat); }
  });
});
