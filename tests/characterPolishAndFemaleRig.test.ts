// Phase 4.6G.2: saubere Anime-Haut (keine AO-Flecken), weibliche Charakter-Option (Männlich/Weiblich, Vorlagen, Haltung, Kleidung), Null-Clipping
// an Beinen/Mänteln, Brust/Rüstung und Hüten/Haaren, Strähnen-Bärte, rechtwinklige Brillenbügel, gefaltete Schultermantel-Ärmel, Ornament-Rüstungen,
// keine Welt-Toasts im offenen Editor, abwärtskompatible Spielstände (Version 23).
import { readFileSync } from 'node:fs';
import { Bone, BufferGeometry, Mesh, Object3D, ShaderLib, Skeleton, SkinnedMesh, Vector3, type Group } from 'three';
import { describe, expect, it } from 'vitest';
import {
  BEARD_STYLES, FEMALE_HAIR, FEMALE_SHARE, GENDERS, LEGACY_FEMALE_HAIR, LOOK_OPTIONS, LOOK_PRESETS, MALE_HAIR, defaultLook, genderOf, randomLook, sanitizeLook,
  type CharacterLook, type Gender, type PresetTab,
} from '../src/data/characterParts';
import { CHAIN_LAYOUT, CLOTH, FIGURE_POSE, LEG_CAPS } from '../src/data/characterRig';
import { BASE_CM, EDITOR_LABEL_MAX, GENDER_INFO, lookForGender } from '../src/ui/editor';
import { COAT_FLARE, COAT_VENT, HAIR_CONTRAST, HAT_SQUEEZE, classWeights, garmentOffset, type Anchors, type GarmentCtx, type Region } from '../src/entities/character/vroid';
import {
  BEARD_KINDS, buildBeardGeometry, buildFaceField, fieldRadius, jawFromField, strandLayout, templePath, type FaceField, type FaceMarks,
} from '../src/entities/character/beardStrands';
import { attachHeadgear, CAPPED, EYEPATCH_DEPTH, LENS_GAP, hairSqueezeFor, roundGlasses, templeHinge } from '../src/entities/character/animeHats';
import { sleeveGeo, type ChainGroupLayout } from '../src/entities/character/rig/clothRig';
import { SHOULDERS } from '../src/entities/character/gear/rigid';
import { GEAR_SET_BY_ID, SETS } from '../src/data/gear';
import { PATTERN_NO } from '../src/data/equipment';
import { ORNAMENT_SIZE, RUNE_CELLS, RUNE_KINDS, runeLayout } from '../src/graphics/gearOrnaments';
import { CHAR_ALPHA, CLEAN_ALPHA, toon } from '../src/render/toon';
import { Hud } from '../src/ui/hud';
import { StateMachine } from '../src/core/state';
import { migrateSave } from '../src/core/save/migrations';
import { createSave, SAVE_VERSION } from '../src/core/save/types';

const ROOT = new URL('..', import.meta.url);
const src = (p: string) => readFileSync(new URL(p, ROOT), 'utf8');

/** Shader-Quelltext eines Toon-Materials wie beim Übersetzen */
function compiled(mat: ReturnType<typeof toon>) {
  const sh = { uniforms: {} as Record<string, unknown>, vertexShader: ShaderLib.toon.vertexShader, fragmentShader: ShaderLib.toon.fragmentShader };
  mat.onBeforeCompile(sh as never, undefined as never);
  return sh;
}

/** fester Zufall für Stichproben */
function seeded(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ---------- Gesichtsfeld zum Prüfen: ein Kopf als Ellipsoid (Kopfraum, Gesicht nach −Z) ----------
const EYE_Y = 0.06, ZC = 0.0;
/** Hautpunkte eines Kopfes: Gesicht vorn 9 cm vor der Achse, seitlich 7,5 cm, Kinn bei −0,035, darunter ein schmalerer Hals */
function headPoints(): number[] {
  const pts: number[] = [];
  for (let y = -0.16; y <= EYE_Y + 0.03; y += 0.002) {
    const neck = y < -0.04;
    for (let a = -Math.PI; a < Math.PI; a += 0.02) {
      const rx = neck ? 0.045 : 0.075, rz = neck ? 0.045 : 0.09;
      // Kinn: unten etwas schmaler
      const k = neck ? 1 : 1 - Math.max(0, -0.01 - y) * 3;
      pts.push(Math.sin(a) * rx * k, y, ZC - Math.cos(a) * rz * k);
    }
  }
  return pts;
}
const FIELD: FaceField = buildFaceField(headPoints(), ZC, EYE_Y - 0.22, EYE_Y + 0.02);
const MARKS: FaceMarks = {
  eyeY: EYE_Y, mouthY: -0.003, chinY: -0.035, ear: { x: 0.08, y: 0.02, z: 0.0 },
  jawY: (th) => jawFromField(FIELD, th, -0.003, -0.07),
};

const anchors = (): Anchors => ({ earLobe: new Vector3(0.08, 0.02, 0.0), eyeY: EYE_Y, shoulders: [new Vector3(), new Vector3()], faceZ: -0.09, templeX: 0.062, skullX: 0.07, earTopY: 0.07 });

describe('4.6G.2 Geschlechtswahl: Männlich und Weiblich', () => {
  it('zwei Geschlechter mit deutschen Namen; Standard männlich, alte Stände mit langer Grundfrisur bleiben weiblich', () => {
    expect(Object.values(GENDERS)).toEqual(['Männlich', 'Weiblich']);
    expect(genderOf({})).toBe('male');
    expect(genderOf(null)).toBe('male');
    expect(genderOf({ hair: 'kurz' })).toBe('male');
    for (const h of LEGACY_FEMALE_HAIR) expect(genderOf({ hair: h as CharacterLook['hair'] })).toBe('female');
    // eine ausdrückliche Angabe gilt immer
    expect(genderOf({ gender: 'male', hair: 'lang' })).toBe('male');
    expect(genderOf({ gender: 'female', hair: 'kurz' })).toBe('female');
    expect(GENDER_INFO.male.length).toBeLessThanOrEqual(40);
    expect(BASE_CM.female).toBeLessThan(BASE_CM.male);
  });

  it('weibliche Grundaussehen je Fraktion: lange Grundfrisur, kein Bart, eigene Statur', () => {
    for (const f of ['pirat', 'marine'] as const) {
      const l = defaultLook(f, 'female');
      expect(l.gender).toBe('female');
      expect(l.beard).toBe('keiner');
      expect(FEMALE_HAIR as readonly string[]).toContain(l.hair);
      expect(defaultLook(f).gender).toBe('male');
    }
  });

  it('Zufallsfiguren: beide Geschlechter, Frauen ohne Bart und mit langer Grundfrisur, Männer mit kurzer', () => {
    const r = seeded(4242);
    let fem = 0, male = 0;
    for (let i = 0; i < 400; i++) {
      const role = (['buerger', 'pirat', 'marine', 'wirt', 'offizier'] as const)[i % 5];
      const l = randomLook(r, role);
      if (l.gender === 'female') {
        fem++;
        expect(l.beard, role).toBe('keiner');
        expect(FEMALE_HAIR as readonly string[]).toContain(l.hair);
        expect(l.height).toBeLessThanOrEqual(1.02);
      } else {
        male++;
        expect(MALE_HAIR as readonly string[]).toContain(l.hair);
      }
    }
    expect(fem).toBeGreaterThan(60);
    expect(male).toBeGreaterThan(150);
    for (const v of Object.values(FEMALE_SHARE)) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(0.6); }
  });

  it('Vorlagen in allen Kategorien für beide Geschlechter: gültige Werte, kurze deutsche Beschriftungen, Frauen ohne Bart', () => {
    const tabs: PresetTab[] = ['koerper', 'gesicht', 'haare', 'kleidung', 'accessoires'];
    const ids = new Set<string>();
    for (const g of Object.keys(GENDERS) as Gender[]) for (const t of tabs) {
      const list = LOOK_PRESETS[g][t];
      expect(list.length, `${g}/${t}`).toBeGreaterThanOrEqual(3);
      for (const p of list) {
        expect(ids.has(p.id), p.id).toBe(false);
        ids.add(p.id);
        expect(p.label.length, p.label).toBeLessThanOrEqual(EDITOR_LABEL_MAX);
        expect(/^[A-ZÄÖÜ]/.test(p.label), p.label).toBe(true);
        if (g === 'female') expect(p.look.beard ?? 'keiner').toBe('keiner');
        for (const [k, v] of Object.entries(p.look)) {
          const opts = (LOOK_OPTIONS as Record<string, Record<string, string>>)[k];
          if (opts && typeof v === 'string') expect(v in opts, `${p.id}.${k}=${v}`).toBe(true);
          if (k.endsWith('Color') || k === 'skin') expect(/^#[0-9A-F]{6}$/i.test(String(v)), `${p.id}.${k}`).toBe(true);
        }
        // Vorlagen setzen nie das Geschlecht selbst (das wählt der Knopf oben im Reiter)
        expect('gender' in p.look).toBe(false);
      }
    }
  });

  it('Wechsel des Geschlechts im Editor: Grundfrisur und Bart passen sich an, alles andere bleibt', () => {
    const m = { ...defaultLook('pirat'), beard: 'vollbart' as const, coatColor: '#123456' };
    const f = lookForGender(m, 'female');
    expect(f.gender).toBe('female');
    expect(f.beard).toBe('keiner');
    expect(f.hair).toBe('lang');
    expect(f.coatColor).toBe('#123456');
    const back = lookForGender(f, 'male');
    expect(back.gender).toBe('male');
    expect(MALE_HAIR as readonly string[]).toContain(back.hair);
  });

  it('weibliche Haltung: Kontrapost, Hüftschwung, Arme mit Abstand zur Hüfte – männlich neutral, mit jeder Statur kombinierbar', () => {
    const m = FIGURE_POSE.male, f = FIGURE_POSE.female;
    expect(m.contra + m.walkYaw + m.walkRoll + m.walkCounter + m.armIn + m.shoulders + m.chin).toBe(0);
    expect(m.sway).toBe(1);
    expect(f.contra).toBeGreaterThan(0.02);
    expect(f.walkYaw).toBeGreaterThan(0.05);
    expect(f.walkCounter).toBeGreaterThan(0);
    // die breitere Hüfte braucht mehr Abstand der Arme (sonst stachen die Finger durch die Hose)
    expect(f.armIn).toBeLessThan(0);
    // kleine Winkel: höchstens ~8° je Zusatz
    for (const v of [f.contra, f.walkYaw, f.walkRoll, f.walkCounter, Math.abs(f.armIn), Math.abs(f.shoulders), Math.abs(f.chin)]) expect(v).toBeLessThan(0.14);
  });

  it('Kleidung passt sich an: die Brust der weiblichen Grundfigur zählt zum Rumpf, Mantel und Weste mit V-Ausschnitt statt Brust-Öffnung', () => {
    const r: Region = { hipsY: 1.0, kneeY: 0.55, ankleY: 0.1, neckY: 1.42, leg: 0.45, ankleZ: 0, toeZ: 0.1, elbowX: 0.4, wristX: 0.6 };
    const ctx: GarmentCtx = { under: 'eng', coat: 'lang' };
    const bust = classWeights([['J_Sec_L_Bust1', 1]]);
    const P = new Vector3(0.035, 1.27, 0.12), N = new Vector3(0, 0.1, 1).normalize();
    // Brustknochen: der Mantel bedeckt (vorher ein brustförmiges Loch)
    expect(garmentOffset('mantelLang', bust, P, N, { ...r, female: true }, 0.01, -1, -1, ctx)).toBeGreaterThan(0);
    // gleicher Punkt: weiblich bedeckt (schmaler V-Ausschnitt), männlich die breite offene Front
    const chest = classWeights([['J_Bip_C_Chest', 1]]);
    expect(garmentOffset('mantelLang', chest, P, N, { ...r, female: true }, 0.01, -1, -1, ctx)).toBeGreaterThan(0);
    expect(garmentOffset('mantelLang', chest, P, N, r, 0.01, -1, -1, ctx)).toBe(-1);
    // die Öffnung bleibt in der Mitte – auch weiblich
    expect(garmentOffset('mantelLang', chest, new Vector3(0.005, 1.27, 0.12), N, { ...r, female: true }, 0.01, -1, -1, ctx)).toBe(-1);
    // Weste: V-Ausschnitt, an der Taille fast geschlossen
    const waist = new Vector3(0.02, 1.12, 0.1);
    expect(garmentOffset('weste', chest, waist, N, { ...r, female: true }, 0.01, -1, -1, { under: 'eng', coat: 'keiner' })).toBeGreaterThan(0);
  });
});

describe('4.6G.2 Null-Clipping: Beine und Mäntel', () => {
  const r: Region = { hipsY: 1.0, kneeY: 0.55, ankleY: 0.1, neckY: 1.42, leg: 0.45, ankleZ: 0, toeZ: 0.1, elbowX: 0.4, wristX: 0.6 };
  const ctx: GarmentCtx = { under: 'eng', coat: 'lang' };
  const thigh = classWeights([['J_Bip_L_UpperLeg', 1]]);

  it('langer Mantel: hinterer Gehschlitz unten offen, oben geschlossen; Schöße weiter ausgestellt als vorher', () => {
    const back = new Vector3(0, 0, -1);
    expect(garmentOffset('mantelLang', thigh, new Vector3(0.01, r.kneeY + 0.06, -0.1), back, r, 0.01, -1, -1, ctx)).toBe(-1);
    expect(garmentOffset('mantelLang', thigh, new Vector3(0.01, r.hipsY - 0.06, -0.1), back, r, 0.01, -1, -1, ctx)).toBeGreaterThan(0);
    expect(COAT_VENT).toBeGreaterThan(0.02);
    // Ausstellung am Knie mindestens so weit wie Oberschenkel-Kapsel minus Hautradius plus Stiefel-Stulpe
    const atKnee = COAT_FLARE.base + (r.hipsY - r.kneeY) * COAT_FLARE.per;
    expect(atKnee).toBeGreaterThan(0.03 + (r.hipsY - r.kneeY) * 0.16 + 0.02);
    const side = new Vector3(1, 0, 0);
    expect(garmentOffset('mantelLang', thigh, new Vector3(0.1, r.kneeY + 0.06, 0), side, r, 0.01, -1, -1, ctx)).toBeCloseTo(atKnee - 0.06 * COAT_FLARE.per, 3);
  });

  it('Bein-Kapseln samt Hose und Stiefelschaft halten Stoff-Ketten fern', () => {
    // Haut allein war 7,2 bzw. 5,5 cm – Stulpen und Knie stachen durch
    expect(LEG_CAPS.upper).toBeGreaterThanOrEqual(0.08);
    expect(LEG_CAPS.lower).toBeGreaterThanOrEqual(0.07);
    expect(CLOTH.coat.radius).toBeGreaterThanOrEqual(0.05);
  });
});

describe('4.6G.2 Null-Clipping: Brust, Rüstung und Kragen', () => {
  const r: Region = { hipsY: 1.0, kneeY: 0.55, ankleY: 0.1, neckY: 1.42, leg: 0.45, ankleZ: 0, toeZ: 0.1, elbowX: 0.4, wristX: 0.6 };
  it('Hüftplatten liegen klar über dem Saum eines eigenen Oberteils (kein Flackern) und sind vorn oben geschlossen', () => {
    const hips = classWeights([['J_Bip_C_Hips', 1]]);
    const P = new Vector3(0.02, r.hipsY - 0.02, 0.12), N = new Vector3(0, 0, 1);
    for (const under of ['jacke', 'uniform', 'tunika'] as const) {
      const ctx: GarmentCtx = { under, coat: 'keiner' };
      const top = garmentOffset(under, hips, P, N, r, 0.01, -1, -1, ctx);
      const kilt = garmentOffset('kilt', hips, P, N, r, 0.01, -1, -1, ctx);
      expect(top, under).toBeGreaterThan(0);
      expect(kilt - top, under).toBeGreaterThanOrEqual(0.006);
    }
    // vorn an der Innenseite knapp unter dem Gürtel: geschlossen (vorher gezacktes Loch)
    const inner = new Vector3(0.012, r.hipsY - 0.03, 0.1), inN = new Vector3(-0.6, 0, 0.8).normalize();
    expect(garmentOffset('kilt', classWeights([['J_Bip_L_UpperLeg', 1]]), inner, inN, r, -1, -1, -1, { under: 'eng', coat: 'keiner' })).toBeGreaterThan(0);
  });

  it('Energie-Saum ohne Zickzack (die weiße Zackennaht oben am Mantelrücken)', () => {
    const fs = compiled(toon({ color: '#ffffff', surface: 'cloth', trim: true, vertexColors: true })).fragmentShader;
    expect(fs).toContain('vGSet.w > 1.5 && vGSet.w < 2.5');
    expect(fs).not.toMatch(/if \(vGSet\.w > 1\.5\) rimD \+=/);
  });

  it('Haut, Haar, Augen und Gesichtsteile sind für die Umgebungsverdeckung tabu (keine Schmutzflecken), in 8 Bit unterscheidbar', () => {
    expect(Math.round(CLEAN_ALPHA * 255)).not.toBe(Math.round(CHAR_ALPHA * 255));
    const fs = compiled(toon({ color: '#ffffff', surface: 'skin' })).fragmentShader;
    expect(fs).toContain(CLEAN_ALPHA.toFixed(3));
    const gtao = src('src/render/gtao.ts');
    expect(gtao).toMatch(/srcA > 0\.9843 && srcA < 0\.995 \? 0\.0/);
    // Haar ohne Zebrastreifen: weicher Kontrast der Grundtextur
    expect(HAIR_CONTRAST).toBeLessThan(0.8);
  });
});

describe('4.6G.2 Null-Clipping: Hüte und Haare', () => {
  it('Haar unter aufgesetzten Hüten wird gestaucht, Kappen schneiden wie bisher ab', () => {
    expect(HAT_SQUEEZE.radius).toBeLessThan(1);
    expect(HAT_SQUEEZE.radius).toBeGreaterThan(0.85);
    expect(HAT_SQUEEZE.flat).toBeLessThan(1);
    expect(HAT_SQUEEZE.flat).toBeGreaterThan(0.4);
    expect(hairSqueezeFor('dreispitz')).not.toBeNull();
    expect(hairSqueezeFor('marine')).not.toBeNull();
    expect(hairSqueezeFor('keiner')).toBeNull();
    // Kappen aus der Frisurform (Kopftuch, Mütze …) behalten ihr Abschneiden
    for (const k of ['bandana', 'muetze', 'kochmuetze', 'suedwester']) expect(CAPPED[k], k).toBeTruthy();
  });
});

describe('4.6G.2 Brillenbügel und Augenklappe', () => {
  it('Scharnier knapp außen an Glas und Schläfe, Bügel laufen im rechten Winkel nach hinten an der Kopfseite entlang', () => {
    const an = anchors();
    expect(templeHinge(0.034, an, 0.042)).toBeCloseTo(Math.max(0.037, an.templeX + 0.002), 6);
    const path = templePath(FIELD, EYE_Y + 0.004, an.faceZ - 0.002, an.earLobe.z + 0.006, 0.0025);
    for (let i = 1; i < path.length; i++) {
      expect(path[i][1]).toBeGreaterThan(path[i - 1][1]);
      expect(path[i][0]).toBeGreaterThanOrEqual(path[i - 1][0]);
    }
    // nie im Kopf: jeder Punkt liegt außerhalb der Haut
    for (const [x, z] of path) {
      const th = Math.atan2(x, -(z - FIELD.zc));
      expect(Math.hypot(x, z - FIELD.zc)).toBeGreaterThanOrEqual(fieldRadius(FIELD, th, EYE_Y + 0.004, false) - 1e-3);
    }
  });

  it('runde Brille: kein Teil steht seitlich weit über den Kopf hinaus, Bügel zeigen nach hinten', () => {
    const l = new Vector3(-0.021, EYE_Y, -0.028), r = new Vector3(0.021, EYE_Y, -0.028);
    const g = roundGlasses(l, r, anchors(), -0.09, false, 0, FIELD);
    let maxX = 0, minZ = Infinity, maxZ = -Infinity;
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
      maxX = Math.max(maxX, Math.abs(bb.min.x), Math.abs(bb.max.x));
      minZ = Math.min(minZ, bb.min.z); maxZ = Math.max(maxZ, bb.max.z);
    });
    // seitlich höchstens gut 1 cm über die Kopfbreite (Schädel 7,5 cm) – vorher standen Stangen bis über die Frisur hinaus
    expect(maxX).toBeLessThan(0.075 + 0.015);
    // Bügel reichen von den Gläsern bis hinter das Ohr
    expect(minZ).toBeLessThan(-0.09);
    expect(maxZ).toBeGreaterThan(0.0);
  });

  it('Augenklappe und Brille zusammen: die Brille rückt vor die Klappe statt sie zu schneiden', () => {
    const head = new Object3D();
    const eyeL = new Object3D(), eyeR = new Object3D();
    eyeL.position.set(-0.021, EYE_Y, -0.028); eyeR.position.set(0.021, EYE_Y, -0.028);
    const look = { ...defaultLook('pirat'), hat: 'keiner' as const, eyepatch: true, glasses: 'rund' as const, earring: false, beard: 'keiner' as const };
    const parts = attachHeadgear(head, eyeL, eyeR, look, false, null, anchors());
    head.updateMatrixWorld(true);
    let patchFront = Infinity, lensZ = Infinity;
    for (const p of parts) p.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
      const type = m.geometry.type;
      if (p.userData.socket === 'eyeRight' && type === 'SphereGeometry') patchFront = Math.min(patchFront, bb.min.z);
      if (p.userData.socket === 'faceFront' && type === 'TorusGeometry' && Math.abs((bb.min.x + bb.max.x) / 2 - 0.021) < 0.004) lensZ = Math.min(lensZ, (bb.min.z + bb.max.z) / 2);
    });
    expect(Number.isFinite(patchFront)).toBe(true);
    expect(Number.isFinite(lensZ)).toBe(true);
    // Glas liegt vor der Klappe (Gesicht schaut nach −Z)
    expect(lensZ).toBeLessThan(patchFront - 0.0015);
    expect(EYEPATCH_DEPTH).toBeLessThan(0.012);
    expect(LENS_GAP).toBeGreaterThan(0);
  });
});

describe('4.6G.2 Bärte aus Strähnen', () => {
  it('jede Bartform hat Strähnen (Stoppeln als Feld), alle Punkte liegen außen auf dem Gesicht', () => {
    for (const k of BEARD_KINDS) {
      expect(k in BEARD_STYLES, k).toBe(true);
      const geo = buildBeardGeometry(k, FIELD, MARKS)!;
      expect(geo, k).toBeTruthy();
      const p = geo.attributes.position;
      expect(p.count, k).toBeGreaterThan(30);
      let inside = 0;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const th = Math.atan2(x, -(z - FIELD.zc));
        if (Math.hypot(x, z - FIELD.zc) < fieldRadius(FIELD, th, y, true) - 0.0015) inside++;
      }
      // höchstens die Unterseite einzelner Ringe berührt die Haut
      expect(inside / p.count, k).toBeLessThan(0.3);
      // keine Ecken ohne Normale (weich schattiert)
      const n = geo.attributes.normal;
      for (let i = 0; i < n.count; i += 7) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 3);
    }
  });

  it('Strähnen folgen Lippe und Kiefer: Schnurrbart über dem Mund, Kinnbart unter der Unterlippe, Lippen frei; Spitzen verjüngt', () => {
    const my = MARKS.mouthY;
    for (const s of strandLayout('schnurrbart', MARKS, FIELD.zc)) { expect(s.a[1]).toBeGreaterThan(my); expect(s.b[1]).toBeGreaterThan(my - 0.004); }
    for (const s of strandLayout('kinnbart', MARKS, FIELD.zc)) expect(s.a[1]).toBeLessThan(my - 0.01);
    // Vollbart: keine Wurzel mitten auf den Lippen
    for (const s of strandLayout('vollbart', MARKS, FIELD.zc)) {
      const u = Math.abs(s.a[0]) * 0.075;
      if (u < 0.018) expect(s.a[1] < my - 0.008 || s.a[1] > my + 0.009, `Wurzel bei u=${u.toFixed(3)} y=${s.a[1].toFixed(3)}`).toBe(true);
    }
    // Koteletten vor den Ohren
    for (const s of strandLayout('koteletten', MARKS, FIELD.zc)) expect(Math.abs(s.a[0])).toBeGreaterThan(0.8);
  });
});

describe('4.6G.2 Schultermantel-Ärmel', () => {
  it('gefaltete, konisch verjüngte Röhren mit runder Schulterkappe, flach gedrückt', () => {
    const anchor = new Bone(); anchor.name = 'J_Bip_C_UpperChest';
    const bones = [anchor];
    const names: string[] = [];
    for (let c = 0; c < 2; c++) for (let i = 1; i <= 4; i++) { const b = new Bone(); b.name = `K_sleeves_${c}_${i}`; bones.push(b); names.push(b.name); }
    const body = new SkinnedMesh(new BufferGeometry());
    body.bind(new Skeleton(bones));
    body.updateMatrixWorld(true);
    anchor.updateMatrixWorld(true);
    const L = CHAIN_LAYOUT.sleeves.links;
    const rest = new Float32Array(2 * (L + 1) * 3);
    for (let c = 0; c < 2; c++) for (let i = 0; i <= L; i++) rest.set([c ? -0.2 : 0.2, 1.5 - i * 0.14, -0.07], (c * (L + 1) + i) * 3);
    const g: ChainGroupLayout = { kind: 'sleeves', anchor: anchor.name, chains: 2, links: L, rest, names, active: new Uint8Array(2).fill(1) };
    const sl = sleeveGeo(g, anchor, body, CHAIN_LAYOUT.sleeves.radius, CHAIN_LAYOUT.sleeves.cuff);
    const p = sl.geo.attributes.position;
    // Breite (x) und Tiefe (z) eines Rings um die Kette bei Höhe y
    const ring = (y: number) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < sl.capFrom; i++) {
        if (p.getX(i) < 0 || Math.abs(p.getY(i) - y) > 0.004) continue;
        x0 = Math.min(x0, p.getX(i)); x1 = Math.max(x1, p.getX(i)); z0 = Math.min(z0, p.getZ(i)); z1 = Math.max(z1, p.getZ(i));
      }
      return { w: x1 - x0, d: z1 - z0 };
    };
    // Ringe liegen alle 0,14 / 3 m entlang der Kette (Wurzel bei 1,5 m)
    const row = (k: number) => 1.5 - (k * 0.14) / 3;
    const top = ring(row(1)), mid = ring(row(6)), low = ring(row(11));
    // konisch verjüngt
    expect(mid.w).toBeLessThan(top.w);
    expect(low.w).toBeLessThan(top.w);
    // flach gedrückt (leerer Stoff): tiefer als breit ist er nirgends
    expect(mid.d).toBeLessThan(mid.w);
    // runde Schulterkappe: Punkte über dem ersten Kettenglied (geschlossen oben)
    let above = 0;
    for (let i = 0; i < sl.capFrom; i++) if (p.getY(i) > 1.505) above++;
    expect(above).toBeGreaterThan(8);
  });
});

describe('4.6G.2 Endgame- und Samurai-Rüstungen', () => {
  it('Ornament-Textur 512 × 512 mit 4 × 4 Runenfeldern, acht eigenen Zeichen, verstreut', () => {
    expect(ORNAMENT_SIZE).toBe(512);
    expect(RUNE_KINDS.length).toBe(8);
    const lay = runeLayout();
    expect(lay.length).toBe(RUNE_CELLS * RUNE_CELLS);
    const used = lay.filter((k) => k >= 0);
    expect(used.length).toBeGreaterThan(4);
    expect(used.length).toBeLessThan(lay.length);
    expect(runeLayout()).toEqual(lay);
    for (let i = 1; i < lay.length; i++) if (lay[i] >= 0) expect(lay[i]).not.toBe(lay[i - 1]);
    expect(PATTERN_NO.filigran).toBe(9);
    expect(PATTERN_NO.runen).toBe(8);
  });

  it('geschwungene Schulterpanzer statt flacher Flügel-Spatel an allen Endgame-Sets; Filigran an Kaiser, Souverän und Kurogane', () => {
    for (const id of ['kaiser_regalia', 'souveraen', 'kosmos']) {
      const sh = GEAR_SET_BY_ID[id].pieces.shoulder!;
      const parts = JSON.stringify(sh.parts);
      expect(parts, id).not.toContain('schulter_fluegel3');
      expect(parts, id).toMatch(/"type":"rigid","build":"schulter_(kaiser|souveraen|kosmos)"/);
    }
    for (const b of ['schulter_kaiser', 'schulter_souveraen', 'schulter_kosmos']) {
      const grp = SHOULDERS[b]('#5C1224', '#F2C24A') as Group;
      let tris = 0, meshes = 0;
      grp.traverse((o) => { const m = o as Mesh; if (m.isMesh) { meshes++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
      expect(meshes, b).toBeGreaterThanOrEqual(3);
      // sparsam (Handy): unter 3 000 Dreiecke je Schulterseite
      expect(tris, b).toBeLessThan(3000);
    }
    const flat = SETS.filter((s) => JSON.stringify(s.pieces).includes('schulter_fluegel3'));
    expect(flat.map((s) => s.id)).toEqual([]);
    expect(JSON.stringify(GEAR_SET_BY_ID.kaiser_regalia.pieces.chest)).toContain('filigran');
    expect(JSON.stringify(GEAR_SET_BY_ID.souveraen.pieces.chest)).toContain('filigran');
    expect(JSON.stringify(GEAR_SET_BY_ID.boss_kurogane.pieces.chest)).toContain('filigran');
  });

  it('keine neuen Shader-Programme: Borten, Runen, Filigran und Bart laufen über die vorhandenen Figuren-Programme', () => {
    const trim = toon({ color: '#ffffff', surface: 'steel', trim: true, vertexColors: true, metalness: 0.6 });
    expect(trim.customProgramCacheKey()).toBe('sk-toon-10ct');
    const fs = compiled(trim).fragmentShader;
    expect(fs).toContain('uniform sampler2D uSkOrn');
    expect(fs).toContain('textureGrad(uSkOrn');
    const beard = toon({ color: '#3A2618', surface: 'hair', hairC: [0, 0.08, 0], rim: 0.35, unique: true });
    expect(beard.customProgramCacheKey()).toBe('sk-toon-10c');
    expect(toon({ color: '#3A2618', surface: 'cloth' }).customProgramCacheKey()).toBe('sk-toon-10c');
  });
});

describe('4.6G.2 Editor: keine Welt-Toasts', () => {
  it('solange der Editor offen ist, verwirft das HUD jede Meldung und räumt die sichtbare weg', () => {
    const cls = new Set<string>(['on']);
    const fake = {
      quiet: false, toastTimer: 0, hintTimer: 0,
      toastEl: { textContent: 'Alt', classList: { add: (c: string) => cls.add(c), remove: (c: string) => cls.delete(c), contains: (c: string) => cls.has(c) } },
      hintEl: { textContent: '', hidden: false, style: { opacity: '1' } },
    };
    const hud = Hud.prototype as unknown as { setQuiet(on: boolean): void; toast(t: string, s?: number): void; hint(t: string, s?: number): void };
    // ohne Browser: die Zeitgeber des HUD laufen über window
    const g = globalThis as unknown as { window?: unknown };
    const hadWindow = 'window' in g;
    if (!hadWindow) g.window = { setTimeout, clearTimeout };
    hud.setQuiet.call(fake, true);
    expect(cls.has('on')).toBe(false);
    expect(fake.toastEl.textContent).toBe('');
    expect(fake.hintEl.hidden).toBe(true);
    hud.toast.call(fake, 'Schwarzer Rauch vor Eichenhain', 6);
    hud.hint.call(fake, 'Taste E', 5);
    expect(cls.has('on')).toBe(false);
    expect(fake.toastEl.textContent).toBe('');
    hud.setQuiet.call(fake, false);
    hud.toast.call(fake, 'Wieder da', 0.01);
    expect(cls.has('on')).toBe(true);
    clearTimeout(fake.toastTimer);
    if (!hadWindow) delete g.window;
  });

  it('das Spiel schaltet die Ruhe mit dem Zustand „editor“ ein und wieder aus', () => {
    expect(src('src/core/game.ts')).toContain("this.hud.setQuiet(next === 'editor')");
    const sm = new StateMachine();
    const seen: boolean[] = [];
    sm.onChange((next) => seen.push(next === 'editor'));
    sm.set('play'); sm.set('editor'); sm.set('play');
    expect(seen).toEqual([false, true, false]);
  });
});

describe('4.6G.2 Spielstände (Version 23)', () => {
  it('Version bleibt 23; Stände ohne Geschlecht laden als männlich, mit langer Grundfrisur weiter weiblich', () => {
    expect(SAVE_VERSION).toBe(23);
    const old = (hair: string) => {
      const s = createSave('Alt', 'pirat', '4.6.6', 1) as unknown as Record<string, any>;
      s.player.look = { ...s.player.look, hair, beard: 'vollbart' };
      delete s.player.look.gender;
      return JSON.parse(JSON.stringify(s));
    };
    const m = migrateSave(old('stachel'), '4.6.7');
    expect(m.ok).toBe(true);
    if (m.ok) { expect(m.data.version).toBe(23); expect(m.data.player.look.gender).toBe('male'); expect(m.data.player.look.beard).toBe('vollbart'); }
    const f = migrateSave(old('lang'), '4.6.7');
    expect(f.ok).toBe(true);
    if (f.ok) { expect(f.data.player.look.gender).toBe('female'); expect(f.data.player.look.beard).toBe('keiner'); }
    // Version 22 (vor 4.6G) lädt weiterhin und bekommt ein Geschlecht
    const v22 = old('kurz');
    v22.version = 22;
    const r = migrateSave(v22, '4.6.7');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.player.look.gender).toBe('male');
  });

  it('ausdrückliches Geschlecht bleibt, ungültige Werte fallen auf die Regel zurück, Frauen verlieren einen gespeicherten Bart', () => {
    expect(sanitizeLook({ ...defaultLook('pirat'), gender: 'female', hair: 'kurz', beard: 'vollbart' }, 'pirat').gender).toBe('female');
    expect(sanitizeLook({ ...defaultLook('pirat'), gender: 'female', hair: 'kurz', beard: 'vollbart' }, 'pirat').beard).toBe('keiner');
    expect(sanitizeLook({ ...defaultLook('pirat'), gender: 'robot', hair: 'kurz' }, 'pirat').gender).toBe('male');
    expect(sanitizeLook({ ...defaultLook('pirat'), gender: 'male', hair: 'lang', beard: 'kinnbart' }, 'pirat').beard).toBe('kinnbart');
    expect(sanitizeLook(null, 'marine').gender).toBe('male');
    // neue Bartform aus alten Ständen nie verloren, unbekannte fallen auf den Standard
    expect(sanitizeLook({ ...defaultLook('pirat'), beard: 'stoppeln' }, 'pirat').beard).toBe('stoppeln');
    expect(sanitizeLook({ ...defaultLook('pirat'), beard: 'zopfbart' }, 'pirat').beard).toBe('keiner');
  });
});
