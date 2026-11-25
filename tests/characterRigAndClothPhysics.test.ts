// Phase 4.6F: organisches Anime-Rig – Sockets über alle Animationen, Blinzeln und Mimik, Feder-Ketten (Mantel, Haar) bei Wind und Sprint,
// Lebendigkeit der Stadtleute, Präsenz der Endbosse, Abwärtskompatibilität alter Spielstände (Version 22).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AnimationClip, AnimationMixer, Bone, Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { ANIM_FILES } from '../src/data/animations';
import {
  BLINK, BOSS_PRESENCE, BOSS_PRESENCE_DEFAULT, BOSS_SCALE, BUILDS, CLOTH, EXPRESSIONS, FACE_CHANNELS, FACE_MORPH, HAND_POSES, NPC_LIFE, SOCKET_DEFS,
  SOCKET_IDS, STANCES, type CharacterSocketId,
} from '../src/data/characterRig';
import { BODY_TYPES, BROW_STYLES, EYE_STYLES, MOUTH_STYLES, defaultLook, randomLook, sanitizeLook, type NpcRole } from '../src/data/characterParts';
import { loadoutFromLook, resolveLoadout } from '../src/data/equipment';
import { BodyLife, type LifeInput } from '../src/entities/character/rig/bodyLife';
import { CharacterRig } from '../src/entities/character/rig/characterRig';
import { BlinkScheduler, FaceMixer, NCH, channelIndex, morphMap, traitWeights } from '../src/entities/character/rig/faceRig';
import { rigProfile } from '../src/entities/character/rig/rigProfile';
import { SpringChains, addCapsule } from '../src/entities/character/rig/springChain';
import { boneCorrections, retargetClip, type RetargetCtx } from '../src/entities/character/vroid';
import { RAID_BOSSES } from '../src/raid/raidBosses';
import { kaiserBossDef } from '../src/data/kaiserBattle';
import { KAISER_SPECS } from '../src/data/kaiserIslands';
import { migrateSave } from '../src/core/save/migrations';
import { createSave } from '../src/core/save/types';

const ROOT = resolve(__dirname, '..', 'public', 'assets', 'characters');

/** JSON-Block einer .glb-Datei */
function glbJson(file: string): { nodes: { name?: string; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }[]; scenes: { nodes: number[] }[]; meshes?: { name?: string; primitives: { extras?: { targetNames?: string[] } }[] }[] } {
  const buf = readFileSync(file);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

/** Skelett der Anime-Grundfigur aus den Knoten der Datei (ohne Netze – die Lage steht im JSON-Block), aufbereitet wie in VroidBase */
function vroidTemplate(file: string, height: number) {
  const j = glbJson(file);
  const objs = j.nodes.map((n) => {
    const o = (n.name ?? '').startsWith('J_') ? new Bone() : new Object3D();
    o.name = n.name ?? '';
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  j.nodes.forEach((n, i) => { for (const c of n.children ?? []) objs[i].add(objs[c]); });
  const inner = new Group();
  for (const r of j.scenes[0].nodes) inner.add(objs[r]);
  inner.rotation.y = Math.PI;
  const template = new Group();
  template.add(inner);
  template.updateMatrixWorld(true);
  const hy = template.getObjectByName('J_Bip_C_Head')!.getWorldPosition(new Vector3()).y + 0.12;
  const fy = template.getObjectByName('J_Bip_L_Foot')!.getWorldPosition(new Vector3()).y - 0.06;
  template.scale.setScalar(height / (hy - fy));
  template.updateMatrixWorld(true);
  // Waffenhalterungen wie an der Spielfigur
  for (const s of ['l', 'r'] as const) {
    const slot = new Bone();
    slot.name = `handslot${s}`;
    slot.position.set(0, 0.03, 0);
    template.getObjectByName(s === 'l' ? 'J_Bip_L_Hand' : 'J_Bip_R_Hand')!.add(slot);
  }
  template.updateMatrixWorld(true);
  return template;
}

/** Alle KayKit-Animationen (wie CharacterAssets: Positionsspuren nur an der Hüfte) und die Quellfigur */
async function kaykit(): Promise<{ rig: Object3D; clips: AnimationClip[] }> {
  const loader = new GLTFLoader();
  const clips = new Map<string, AnimationClip>();
  let rig: Object3D | null = null;
  for (const f of ANIM_FILES) {
    const buf = readFileSync(resolve(ROOT, 'kaykit', `${f}.glb`));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const g = await new Promise<{ scene: Object3D; animations: AnimationClip[] }>((ok, bad) => loader.parse(ab as ArrayBuffer, '', ok as never, bad));
    rig ??= g.scene;
    for (const c of g.animations) {
      c.tracks = c.tracks.filter((t) => (!t.name.endsWith('.position') || t.name.startsWith('hips.')) && !t.name.endsWith('.scale'));
      if (!clips.has(c.name)) clips.set(c.name, c);
    }
  }
  return { rig: rig!, clips: [...clips.values()] };
}

const finite = (m: Matrix4) => m.elements.every((v) => Number.isFinite(v));

describe('Sockets am bewegten Skelett (4.6F)', () => {
  let template: Group;
  let clips: AnimationClip[] = [];
  let ctx: RetargetCtx;
  beforeAll(async () => {
    template = vroidTemplate(resolve(ROOT, 'vroid', 'base_male.glb'), 1.74);
    const kk = await kaykit();
    const corr = boneCorrections(kk.rig, template);
    const hipH = template.getObjectByName('J_Bip_C_Hips')!.getWorldPosition(new Vector3()).y;
    ctx = { srcRig: kk.rig, template, hipH, srcPose: null, dstPose: null, restWorld: (d, out) => { d.getWorldQuaternion(out); const c = corr.get(d.name); if (c) out.premultiply(c); return out; } };
    clips = kk.clips.map((c) => retargetClip(ctx, c));
  }, 60000);

  it('alle zwölf Sockets sind beschrieben und entstehen am Skelett der Grundfigur', () => {
    expect(SOCKET_IDS.length).toBe(12);
    for (const id of SOCKET_IDS) expect(SOCKET_DEFS[id].label.length).toBeGreaterThan(3);
    const holder = new Group();
    const rig = cloneSkinned(template) as Group;
    holder.add(rig);
    const r = new CharacterRig({ holder, rig }, { seed: 0.3 });
    for (const id of SOCKET_IDS) expect(r.sockets.get(id), id).not.toBeNull();
  });

  it('Socket-Lagen über ALLE Animationen ohne NaN, fest am tragenden Knochen (kein Schweben, kein Verrutschen)', () => {
    expect(clips.length).toBeGreaterThan(60);
    const holder = new Group();
    holder.scale.setScalar(1.4); // Endboss-Maßstab
    holder.rotation.y = 0.7;
    const rig = cloneSkinned(template) as Group;
    holder.add(rig);
    const R = new CharacterRig({ holder, rig }, { seed: 0.77 });
    R.setBuild('koloss');
    R.lookAt(3, 2, 4);
    R.setReady(1);
    R.setMood('kampf');
    const mixer = new AnimationMixer(rig);
    const m = new Matrix4(), inv = new Matrix4();
    const local0 = new Map<CharacterSocketId, Matrix4>();
    let checked = 0;
    for (const clip of clips) {
      const a = mixer.clipAction(clip);
      a.reset().play();
      for (const u of [0, 0.31, 0.66, 0.97]) {
        R.restore();
        a.time = clip.duration * u;
        mixer.update(0);
        R.snapshot();
        R.apply(1 / 60);
        holder.updateMatrixWorld(true);
        for (const id of SOCKET_IDS) {
          const n = R.sockets.get(id)!;
          n.updateWorldMatrix(true, false);
          m.copy(n.matrixWorld);
          expect(finite(m), `${clip.name} ${id}`).toBe(true);
          // Socket-Raum bleibt ein sauberer Rahmen (Drehung, gleichmäßiger Maßstab ≈ Figurengröße)
          const sx = Math.hypot(m.elements[0], m.elements[1], m.elements[2]), sy = Math.hypot(m.elements[4], m.elements[5], m.elements[6]);
          expect(Math.abs(sx - sy) / sx, `${clip.name} ${id} Maßstab`).toBeLessThan(0.02);
          expect(m.determinant(), `${clip.name} ${id} Händigkeit`).toBeGreaterThan(0);
          // fest am Knochen: Lage im Raum des tragenden Knochens bleibt über alle Posen gleich
          const parent = n.parent!;
          inv.copy(parent.matrixWorld).invert();
          const loc = inv.multiply(m);
          const ref = local0.get(id);
          if (!ref) local0.set(id, loc.clone());
          else for (let k = 0; k < 16; k++) expect(Math.abs(loc.elements[k] - ref.elements[k]), `${clip.name} ${id} rutscht`).toBeLessThan(1e-4);
          checked++;
        }
      }
      a.stop();
      mixer.uncacheClip(clip);
    }
    expect(checked).toBe(clips.length * 4 * 12);
    expect(R.nanGuards).toBe(0);
  }, 60000);

  it('Scheitel über den Augen, Augen links/rechts richtig, Hüften auf beiden Seiten, Hände an den Waffenhalterungen', () => {
    const holder = new Group();
    const rig = cloneSkinned(template) as Group;
    holder.add(rig);
    const R = new CharacterRig({ holder, rig }, { seed: 0.1 });
    holder.updateMatrixWorld(true);
    const p = (id: CharacterSocketId) => R.sockets.get(id)!.getWorldPosition(new Vector3());
    expect(p('headTop').y).toBeGreaterThan(p('eyeLeft').y);
    // Figur schaut nach +Z, links liegt bei +X
    expect(p('eyeLeft').x).toBeGreaterThan(p('eyeRight').x);
    expect(p('hipLeft').x).toBeGreaterThan(0.1);
    expect(p('hipRight').x).toBeLessThan(-0.1);
    expect(p('backWeapon').z).toBeLessThan(p('faceFront').z);
    expect(R.sockets.get('handMain')!.name).toBe('handslotr');
    expect(R.sockets.get('handOff')!.name).toBe('handslotl');
  });

  it('Statur: Glieder werden dicker oder dünner, die Gelenke bleiben am Platz (keine Scherung, Knie und Ellbogen wandern nicht)', () => {
    const holder = new Group();
    const rig = cloneSkinned(template) as Group;
    holder.add(rig);
    const R = new CharacterRig({ holder, rig }, { seed: 0.2 });
    const at = (n: string) => rig.getObjectByName(n)!.getWorldPosition(new Vector3());
    holder.updateMatrixWorld(true);
    const knee0 = at('J_Bip_L_LowerLeg'), elbow0 = at('J_Bip_L_LowerArm'), wrist0 = at('J_Bip_L_Hand'), sh0 = at('J_Bip_L_UpperArm');
    for (const b of ['schlank', 'athletisch', 'wuchtig', 'koloss'] as const) {
      R.setBuild(b);
      holder.updateMatrixWorld(true);
      expect(at('J_Bip_L_LowerLeg').distanceTo(knee0), b).toBeLessThan(0.025);
      expect(at('J_Bip_L_Hand').distanceTo(wrist0), b).toBeLessThan(0.04 + Math.abs(BUILDS[b].shoulders - 1) * 0.2);
      // Schulterbreite folgt der Statur
      const dx = at('J_Bip_L_UpperArm').x - sh0.x;
      if (BUILDS[b].shoulders > 1.05) expect(dx, b).toBeGreaterThan(0.004);
      if (BUILDS[b].shoulders < 1) expect(dx, b).toBeLessThan(0);
      // Umfang: der Oberarm ist gleichmäßig skaliert (keine Scherung)
      const s = rig.getObjectByName('J_Bip_L_UpperArm')!.getWorldScale(new Vector3());
      expect(Math.abs(s.x - s.y)).toBeLessThan(1e-6);
      expect(Math.abs(s.y - s.z)).toBeLessThan(1e-6);
    }
    void elbow0;
  });

  it('Hände: offene Hand, Faust und Schwertgriff stellen die Finger verschieden und weich', () => {
    const holder = new Group();
    const rig = cloneSkinned(template) as Group;
    holder.add(rig);
    const R = new CharacterRig({ holder, rig }, { seed: 0.2 });
    const finger = rig.getObjectByName('J_Bip_R_Index2')!;
    const angle = () => 2 * Math.acos(Math.min(1, Math.abs(finger.quaternion.w)));
    const pose = (id: 'offen' | 'faust' | 'griff') => { R.setHand('r', id); for (let i = 0; i < 30; i++) { R.snapshot(); R.apply(1 / 60); } return angle(); };
    const open = pose('offen'), fist = pose('faust'), grip = pose('griff');
    expect(fist).toBeGreaterThan(grip);
    expect(grip).toBeGreaterThan(open + 0.5);
    // weich: ein Schritt nach dem Wechsel liegt zwischen beiden Haltungen
    R.setHand('r', 'offen');
    R.snapshot(); R.apply(1 / 60);
    const mid = angle();
    expect(mid).toBeLessThan(fist);
    expect(mid).toBeGreaterThan(open);
    for (const p of Object.values(HAND_POSES)) for (const f of p.fingers) for (const v of f) expect(Math.abs(v)).toBeLessThan(1.8);
  });
});

describe('Gesicht: Blinzeln und Mimik (4.6F)', () => {
  it('Morph-Ziele beider Grundfiguren tragen Namen: alle Mimik-Kanäle werden gefunden (vorher fand die Figur kein Blinzeln)', () => {
    for (const f of ['base_male', 'base_female']) {
      const j = glbJson(resolve(ROOT, 'vroid', `${f}.glb`));
      const face = j.meshes!.find((m) => /Face/.test(m.name ?? ''))!;
      // am Netz stehen nur Nummern, an den Primitiven die echten Namen
      const names = face.primitives[0].extras!.targetNames!;
      const dict: Record<string, number> = {};
      names.forEach((n, i) => { const k = n.indexOf('Fcl_'); dict[k >= 0 ? n.slice(k) : n] = i; });
      const map = morphMap(dict);
      for (let i = 0; i < NCH; i++) expect(map[i], `${f} ${FACE_CHANNELS[i]}`).toBeGreaterThanOrEqual(0);
      // Fcl_EYE_Close trifft nicht Fcl_EYE_Close_L
      expect(map[channelIndex('eyeClose')]).not.toBe(map[channelIndex('eyeCloseL')]);
      // nur Nummern (alter Zustand): nichts gefunden
      const numeric = Object.fromEntries(names.map((_, i) => [String(i), i]));
      expect([...morphMap(numeric)].every((v) => v === -1)).toBe(true);
    }
    expect(Object.keys(FACE_MORPH).length).toBe(NCH);
  });

  it('Blinzeln in unregelmäßigen Abständen, mal doppelt, mal halb – Lid schließt schneller als es öffnet', () => {
    const b = new BlinkScheduler(1234);
    const dt = 1 / 60;
    let half = 0, full = 0, peak = 0, inBlink = false, closeT = 0, openT = 0, phaseT = 0, last = 0;
    const gaps: number[] = [];
    let since = 0;
    for (let i = 0; i < 60 * 240; i++) {
      const v = b.update(dt);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      since += dt;
      if (!inBlink && v > 0) { inBlink = true; peak = 0; gaps.push(since); since = 0; phaseT = 0; }
      if (inBlink) {
        phaseT += dt;
        if (v > peak) { peak = v; closeT = phaseT; }
        if (v < last && v < peak) openT = phaseT - closeT;
        if (v === 0) { inBlink = false; if (peak < 0.8) half++; else full++; }
      }
      last = v;
    }
    const n = half + full;
    expect(n).toBeGreaterThan(240 / BLINK.max);
    expect(n).toBeLessThan(240 / 0.6);
    expect(half).toBeGreaterThan(0);
    // Doppel-Blinzeln: kurze Abstände unter einer halben Sekunde kommen vor, aber selten
    const doubles = gaps.filter((g) => g < 0.5).length;
    expect(doubles).toBeGreaterThan(0);
    expect(doubles / n).toBeLessThan(0.35);
    // unregelmäßig: deutliche Streuung der langen Abstände
    const long = gaps.filter((g) => g >= 0.5);
    const mean = long.reduce((a, g) => a + g, 0) / long.length;
    const sd = Math.sqrt(long.reduce((a, g) => a + (g - mean) ** 2, 0) / long.length);
    expect(sd).toBeGreaterThan(0.5);
    expect(Math.min(...long)).toBeGreaterThanOrEqual(BLINK.min - 0.05);
    expect(Math.max(...long)).toBeLessThanOrEqual(BLINK.max + 0.4);
    expect(closeT).toBeLessThan(openT + 0.05);
    // gleiche Saat = gleiche Abfolge
    const a1 = new BlinkScheduler(77), a2 = new BlinkScheduler(77);
    for (let i = 0; i < 600; i++) expect(a1.update(dt)).toBe(a2.update(dt));
  });

  it('Kampf-Blick blinzelt seltener; Jubel und K.o. halten die Augen zu ohne Blinzeln', () => {
    const count = (combat: boolean) => { const b = new BlinkScheduler(9); for (let i = 0; i < 60 * 300; i++) b.update(1 / 60, combat); return b.count; };
    expect(count(true)).toBeLessThan(count(false));
    const f = new FaceMixer(5);
    f.setMood('jubel');
    let maxBlink = 0;
    for (let i = 0; i < 600; i++) { f.update(1 / 60); maxBlink = Math.max(maxBlink, f.blink.value); }
    expect(maxBlink).toBe(0);
    expect(f.weights[channelIndex('eyeJoy')]).toBeGreaterThan(0.6);
    expect(f.weights[channelIndex('mouthJoy')]).toBeGreaterThan(0.6);
  });

  it('Mimik wechselt weich: Hafen-Blick entspannt, Kampf-Blick konzentriert, Erwachen grinst entschlossen mit Leuchten', () => {
    const f = new FaceMixer(3);
    f.setTraits('gross', 'normal', 'laecheln');
    const run = (s: number) => { for (let i = 0; i < s * 60; i++) f.update(1 / 60); };
    f.setMood('hafen'); run(2);
    const relaxed = f.weights[channelIndex('mouthFun')];
    expect(relaxed).toBeGreaterThan(0.15);
    expect(f.weights[channelIndex('browAngry')]).toBeLessThan(0.05);
    f.setMood('kampf');
    f.update(1 / 60);
    // weich: nach einem Bild noch nicht am Ziel
    expect(f.weights[channelIndex('browAngry')]).toBeLessThan(0.4);
    run(1.5);
    expect(f.weights[channelIndex('browAngry')]).toBeGreaterThan(0.5);
    expect(f.weights[channelIndex('mouthFun')]).toBeLessThan(relaxed);
    expect(f.glow).toBeLessThan(0.05);
    f.setMood('entschlossen'); run(1);
    expect(f.weights[channelIndex('fang')]).toBeGreaterThan(0.4);
    expect(f.glow).toBeGreaterThan(0.9);
    f.setMood('hafen'); run(3);
    expect(f.glow).toBeLessThan(0.05);
    for (let i = 0; i < NCH; i++) expect(Number.isFinite(f.weights[i])).toBe(true);
  });

  it('Sprechen bewegt den Mund mit wechselnden Lauten und Pausen; danach schließt er sich', () => {
    const f = new FaceMixer(11);
    f.setMood('gespraech');
    f.talk(3);
    const seen = new Set<number>();
    let quiet = 0, loud = 0;
    for (let i = 0; i < 180; i++) {
      const w = f.update(1 / 60);
      const vis = ['mouthA', 'mouthI', 'mouthU', 'mouthE', 'mouthO'] as const;
      let best = -1, bv = 0.12;
      vis.forEach((c, k) => { if (w[channelIndex(c)] > bv) { bv = w[channelIndex(c)]; best = k; } });
      if (best >= 0) { seen.add(best); loud++; } else quiet++;
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(loud).toBeGreaterThan(40);
    expect(quiet).toBeGreaterThan(5);
    for (let i = 0; i < 120; i++) f.update(1 / 60);
    expect(f.talking).toBe(false);
    expect(f.weights[channelIndex('mouthA')]).toBeLessThan(0.05);
  });

  it('Grundzüge aus dem Editor: alle Augen-, Brauen- und Mundformen ergeben gültige Gewichte; Ausdrücke bleiben im Bereich', () => {
    for (const e of Object.keys(EYE_STYLES)) for (const b of Object.keys(BROW_STYLES)) for (const m of Object.keys(MOUTH_STYLES)) {
      const w = traitWeights(e, b, m);
      for (let i = 0; i < NCH; i++) { expect(w[i]).toBeGreaterThanOrEqual(0); expect(w[i]).toBeLessThan(0.5); }
    }
    for (const ex of Object.values(EXPRESSIONS)) for (const v of Object.values(ex.w)) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(1); }
  });
});

describe('Feder-Ketten: Mäntel, Umhänge, Haare (4.6F)', () => {
  /** Rahmen (spaltenweise 4×4) an einer Stelle */
  const frame = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z).elements;
  /** Kette: Wurzel am Rahmen, Glieder senkrecht nach unten */
  const chain = (tune = CLOTH.coat, links = 3, len = 0.5) => {
    const c = new SpringChains(1, links, tune);
    for (let i = 0; i <= links; i++) c.setRest(0, i, 0, -len * (i / links), -0.1);
    c.finishRest();
    return c;
  };
  const tip = (c: SpringChains) => { const o = c.links * 3; return new Vector3(c.pos[o], c.pos[o + 1], c.pos[o + 2]); };

  it('ohne Wind hängt die Kette und hält ihre Länge (höchstens die erlaubte Dehnung)', () => {
    const c = chain();
    const A = frame(0, 2, 0);
    for (let i = 0; i < 240; i++) c.step(A, 1 / 60);
    const t = tip(c);
    expect(t.y).toBeLessThan(2 - 0.45);
    expect(Math.abs(t.x)).toBeLessThan(0.02);
    expect(c.maxStretch).toBeLessThanOrEqual(CLOTH.coat.stretch + 1e-3);
    expect(c.resets).toBe(0);
  });

  it('Seewind weht den Mantel zur Seite – stärkerer Wind weiter', () => {
    const dev = (wind: number) => {
      const c = chain();
      c.wind.x = wind;
      const A = frame(0, 2, 0);
      for (let i = 0; i < 300; i++) c.step(A, 1 / 60);
      return tip(c).x;
    };
    const calm = dev(0), breeze = dev(4), storm = dev(9);
    expect(breeze).toBeGreaterThan(calm + 0.05);
    expect(storm).toBeGreaterThan(breeze + 0.05);
  });

  it('beim Sprint weht der Mantel nach hinten – weiter als beim Gehen', () => {
    const trail = (speed: number) => {
      const c = chain();
      let z = 0;
      for (let i = 0; i < 120; i++) { z += speed / 60; c.step(frame(0, 2, z), 1 / 60); }
      return z - tip(c).z;
    };
    const walk = trail(1.5), sprint = trail(7);
    expect(sprint).toBeGreaterThan(walk + 0.08);
    expect(sprint).toBeGreaterThan(0.15);
  });

  it('kein Durchdringen der Beine (Kapsel) und kein Durchsinken des Decks (Boden)', () => {
    const c = chain(CLOTH.cape, 4, 1.2);
    // Bein direkt unter dem Rahmen, Boden 1 m unter der Wurzel (die Kette ist länger)
    addCapsule(c.colliders, 0, 1.9, -0.1, 0, 1.0, -0.1, 0.07);
    c.colliders.floorY = 1.0;
    const A = frame(0, 2, 0);
    c.wind.z = 6;
    for (let i = 0; i < 300; i++) {
      c.step(A, 1 / 60);
      for (let k = 1; k <= c.links; k++) {
        const o = k * 3;
        expect(c.pos[o + 1], 'Boden').toBeGreaterThanOrEqual(1.0 + c.tune.radius - 1e-4);
        const y = Math.min(1.9, Math.max(1.0, c.pos[o + 1]));
        const d = Math.hypot(c.pos[o] - 0, c.pos[o + 2] + 0.1);
        if (c.pos[o + 1] <= 1.9 && c.pos[o + 1] >= 1.0) expect(d, `Bein (${y.toFixed(2)})`).toBeGreaterThan(0.07 + c.tune.radius - 0.03);
      }
    }
  });

  it('Sturm-Schritt (Teleport): die Kette springt mit und schwingt nach – sie wird nicht quer durch die Welt gezogen', () => {
    const c = chain();
    for (let i = 0; i < 120; i++) c.step(frame(0, 2, 0), 1 / 60);
    c.step(frame(12, 2, 0), 1 / 60);
    const t = tip(c);
    expect(Math.hypot(t.x - 12, t.y - 2, t.z)).toBeLessThan(0.6);
    // Schwung entgegen der Reise
    for (let i = 0; i < 6; i++) c.step(frame(12, 2, 0), 1 / 60);
    expect(tip(c).x).toBeLessThan(12);
    expect(c.resets).toBe(0);
  });

  it('Doppelsprung-Stoß und Ultimate-Druckwelle bewegen Stoff und Haar; danach kehrt er in die Ruheform zurück', () => {
    const c = chain(CLOTH.hair, 2, 0.25);
    const A = frame(0, 2, 0);
    for (let i = 0; i < 120; i++) c.step(A, 1 / 60);
    const rest = tip(c);
    c.blast(-2, 1.8, 0, 8, 7.5);
    for (let i = 0; i < 6; i++) c.step(A, 1 / 60);
    expect(tip(c).x).toBeGreaterThan(rest.x + 0.02);
    c.kick(0, -4, 0);
    for (let i = 0; i < 300; i++) c.step(A, 1 / 60);
    expect(tip(c).distanceTo(rest)).toBeLessThan(0.03);
  });

  it('robust: Zeitschritt 0, riesige Schritte, ungültiger Rahmen – nie NaN', () => {
    const c = chain();
    c.step(frame(0, 2, 0), 0);
    c.step(frame(0, 2, 0), 5);
    c.step([NaN, 0, 0, 0, 0, NaN, 0, 0, 0, 0, NaN, 0, NaN, NaN, NaN, 1], 1 / 60);
    for (let i = 0; i < 60; i++) c.step(frame(Math.sin(i) * 3, 2, Math.cos(i * 7) * 3), 1 / 60);
    for (const v of c.pos) expect(Number.isFinite(v)).toBe(true);
    // Kette ohne Länge ruht
    const z = new SpringChains(1, 2, CLOTH.hair);
    z.finishRest();
    expect(z.active[0]).toBe(0);
  });

  it('Kettendaten: Steifigkeit, Dämpfung und Dehnung in sinnvollen Grenzen', () => {
    for (const [k, t] of Object.entries(CLOTH)) {
      expect(t.stiffness, k).toBeGreaterThan(0);
      expect(t.stiffness, k).toBeLessThan(0.5);
      expect(t.damping, k).toBeGreaterThan(0.8);
      expect(t.damping, k).toBeLessThan(1);
      expect(t.stretch, k).toBeGreaterThanOrEqual(1);
      expect(t.stretch, k).toBeLessThan(1.1);
      // stabil im festen Schritt: Luftwiderstand × Schritt deutlich unter 1
      expect(t.drag / 60, k).toBeLessThan(0.1);
    }
  });
});

describe('Lebendigkeit: Atem, Blick, Landung, Stadtleute (4.6F)', () => {
  const input = (o: Partial<LifeInput> = {}): LifeInput => ({ speed: 0, turn: 0, accel: 0, grounded: true, busy: false, hasLook: false, lookYaw: 0, lookPitch: 0, ready: 0, ...o });

  it('Brustkorb hebt und senkt sich; nach dem Sprint schneller und tiefer', () => {
    const L = new BodyLife(1);
    const span = (s: number) => { let lo = 1, hi = -1, cross = 0, prev = 0; for (let i = 0; i < s * 60; i++) { const o = L.update(1 / 60, input()); lo = Math.min(lo, o.chestLift); hi = Math.max(hi, o.chestLift); if (prev < 0 && o.chestLift >= 0) cross++; prev = o.chestLift; } return { amp: hi - lo, cross }; };
    const calm = span(20);
    expect(calm.amp).toBeGreaterThan(0.005);
    L.addExert(1);
    const after = span(5);
    expect(after.amp).toBeGreaterThan(calm.amp * 0.3);
    expect(after.cross / 5).toBeGreaterThan(calm.cross / 20);
  });

  it('Gewichtsverlagerung nur im Stand; Blick folgt dem Ziel weich und begrenzt, hinter der Figur wieder nach vorn', () => {
    const L = new BodyLife(2);
    let maxHip = 0;
    for (let i = 0; i < 60 * 12; i++) maxHip = Math.max(maxHip, Math.abs(L.update(1 / 60, input()).hipX));
    expect(maxHip).toBeGreaterThan(0.01);
    for (let i = 0; i < 120; i++) L.update(1 / 60, input({ speed: 5 }));
    expect(Math.abs(L.out.hipX)).toBeLessThan(0.004);
    const M = new BodyLife(3);
    M.update(1 / 60, input({ hasLook: true, lookYaw: 0.8 }));
    expect(M.out.lookYaw).toBeLessThan(0.2);
    for (let i = 0; i < 120; i++) M.update(1 / 60, input({ hasLook: true, lookYaw: 0.8 }));
    expect(M.out.lookYaw).toBeGreaterThan(0.7);
    for (let i = 0; i < 120; i++) M.update(1 / 60, input({ hasLook: true, lookYaw: 3 }));
    expect(Math.abs(M.out.lookYaw)).toBeLessThan(0.1);
    for (let i = 0; i < 120; i++) M.update(1 / 60, input({ hasLook: true, lookYaw: 1.5, lookPitch: -2 }));
    expect(M.out.lookYaw).toBeLessThanOrEqual(1.15 + 1e-6);
    expect(M.out.lookPitch).toBeGreaterThanOrEqual(-0.5 - 1e-6);
  });

  it('federndes In-die-Knie-Gehen nach der Landung, stärker bei hohem Aufprall; Kurvenneigen beim Sprint', () => {
    const dip = (v: number) => { const L = new BodyLife(4); L.land(v); let lo = 0; for (let i = 0; i < 90; i++) lo = Math.min(lo, L.update(1 / 60, input()).landDip); return { lo, end: L.out.landDip }; };
    const soft = dip(4), hard = dip(14);
    expect(soft.lo).toBeLessThan(-0.02);
    expect(hard.lo).toBeLessThan(soft.lo - 0.05);
    expect(hard.lo).toBeGreaterThanOrEqual(-0.2 - 1e-6);
    expect(Math.abs(hard.end)).toBeLessThan(0.01);
    const B = new BodyLife(5);
    for (let i = 0; i < 60; i++) B.update(1 / 60, input({ speed: 7, turn: 1.5 }));
    expect(B.out.bankRoll).toBeGreaterThan(0.15);
    expect(B.out.bankPitch).toBeGreaterThan(0.05);
  });

  it('Stadtleute atmen und pendeln nicht im Gleichtakt; jede Rolle hat Haltung und Ausdruck', () => {
    const series = (seed: number) => { const L = new BodyLife(seed); const v: number[] = []; for (let i = 0; i < 600; i++) { const o = L.update(1 / 60, input()); if (i % 60 === 0) v.push(o.chestLift + o.hipX); } return v; };
    const a = series(11), b = series(12), c = series(13);
    const diff = (x: number[], y: number[]) => x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0);
    expect(diff(a, b)).toBeGreaterThan(0.01);
    expect(diff(b, c)).toBeGreaterThan(0.01);
    const roles: NpcRole[] = ['buerger', 'fischer', 'haendler', 'pirat', 'marine', 'offizier', 'koch', 'schmied', 'wirt'];
    for (const r of roles) {
      const l = NPC_LIFE[r];
      expect(STANCES[l.stance], r).toBeTruthy();
      expect(EXPRESSIONS[l.face], r).toBeTruthy();
      expect(l.watch, r).toBeGreaterThan(3);
    }
    // aufrechte Wache gegen gebeugten Fischer: verschiedene Haltung im Stand
    const posture = (st: 'aufrecht' | 'gebeugt') => { const L = new BodyLife(1); L.stance = st; for (let i = 0; i < 300; i++) L.update(1 / 60, input()); return L.out.chestFwd; };
    expect(posture('gebeugt')).toBeGreaterThan(posture('aufrecht') + 0.05);
  });
});

describe('Endbosse und alte Spielstände (4.6F)', () => {
  it('Königs- und Kaiser-Endbosse stehen 1,35×–1,65× groß und haben eine Präsenz', () => {
    const scales: number[] = [];
    for (const b of Object.values(RAID_BOSSES)) {
      scales.push(b.def.scale);
      expect(BOSS_PRESENCE[b.def.kit ?? ''] ?? BOSS_PRESENCE_DEFAULT).toBeTruthy();
      expect(BUILDS[(BOSS_PRESENCE[b.def.kit ?? ''] ?? BOSS_PRESENCE_DEFAULT).build]).toBeTruthy();
    }
    for (const k of KAISER_SPECS) scales.push(kaiserBossDef(k.id).scale);
    for (const s of scales) { expect(s).toBeGreaterThanOrEqual(BOSS_SCALE.min - 1e-9); expect(s).toBeLessThanOrEqual(BOSS_SCALE.max + 1e-9); }
    expect(Math.max(...scales)).toBeGreaterThan(1.55);
  });

  it('Spielstand Version 22 mit altem Aussehen lädt und wird auf das Rig abgebildet (auch kaputte Werte)', () => {
    const save = createSave('Alt', 'pirat', '4.6.4', 0) as unknown as Record<string, any>;
    save.version = 22;
    // so stand es in 4.6.4 im Spielstand: nur CharacterLook, ein Teil davon unvollständig oder unsinnig
    save.player.look = { body: 'kraeftig', height: 1.4, eyes: 'scharf', brows: 'schraeg', mouth: 'grinsen', hair: 'lang', coat: 'kapitaen', scarf: true, outfit: 'weste', skin: 'rot', unknown: 5 };
    const r = migrateSave(JSON.parse(JSON.stringify(save)), '4.6.5');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const look = r.data.player.look;
    const p = rigProfile(look);
    expect(p.build).toBe('wuchtig');
    expect(p.eyes).toBe('scharf');
    expect(p.height).toBeLessThanOrEqual(1.1);
    expect(p.chains.tails).toBe(true);
    expect(p.chains.scarf).toBe(true);
    // ganz leer oder Unsinn: sichere Vorgaben, kein Absturz
    for (const bad of [null, undefined, {}, { body: 'riese', eyes: 7, mouth: null, height: NaN }]) {
      const q = rigProfile(bad as never);
      expect(BUILDS[q.build]).toBeTruthy();
      expect(Number.isFinite(q.height)).toBe(true);
    }
  });

  it('jedes Aussehen aus Editor und NPC-Baukasten lässt sich abbilden; der Schultermantel schwingt an den Umhang-Ketten', () => {
    for (const b of Object.keys(BODY_TYPES)) expect(BUILDS[rigProfile({ ...defaultLook('pirat'), body: b as never }).build]).toBeTruthy();
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const roles: NpcRole[] = ['buerger', 'fischer', 'haendler', 'pirat', 'marine', 'offizier', 'koch', 'schmied', 'wirt'];
    let drapes = 0;
    for (let i = 0; i < 400; i++) {
      const l = randomLook(rng, roles[i % roles.length]);
      const p = rigProfile(sanitizeLook(l, 'pirat'));
      expect(BUILDS[p.build]).toBeTruthy();
      if (p.chains.drape) drapes++;
    }
    expect(drapes).toBeGreaterThan(0);
    const drape = rigProfile({ ...defaultLook('marine'), coat: 'schulter' });
    expect(drape.chains.cape && drape.chains.drape).toBe(true);
    const R = resolveLoadout(loadoutFromLook({ ...defaultLook('marine'), coat: 'schulter' }));
    expect(R.cape?.drape).toBe(true);
    // Editor-Wert bleibt nach dem Speichern erhalten
    expect(sanitizeLook({ ...defaultLook('marine'), coat: 'schulter' }, 'marine').coat).toBe('schulter');
  });

  it('Rig-Daten: Staturen gemäßigt, Sockets mit Knochen, Ausdrücke ohne Lücken', () => {
    for (const [id, b] of Object.entries(BUILDS)) {
      for (const v of Object.values(b.girth)) { expect(v, id).toBeGreaterThan(0.85); expect(v, id).toBeLessThan(1.16); }
      expect(b.head, id).toBeGreaterThan(0.9);
    }
    for (const id of SOCKET_IDS) expect(SOCKET_DEFS[id].bone).toBeTruthy();
    expect(Object.keys(EXPRESSIONS)).toContain('entschlossen');
    // Quaternion-Hilfen der Prüfung selbst: Einheit bleibt Einheit
    expect(new Quaternion().length()).toBe(1);
  });
});
