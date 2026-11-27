// Phase 4.93A – Kino-Endgame-Regie: Legacy-Purge ohne Doppel-Auslöser, Blender-VFX-Netze, Trennung Steuerrad/Fuß, Kino-DSP mit Sättigung und
// Stille vor dem Einschlag, beide Faustkämpfer-Pfade, Himmelssturz in vier Stufen, Impact-Frames 70 – 180 ms und die Außenansicht der
// Mitspieler (zwei Clients über einen Shard, Entfernungs-Shake < 90 m, keine fremde Kamera, kein fremder Impact-Frame).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DIRECTOR, DIRECTOR_TIMELINES, EndgameDirector, LEGACY_PURGED, directorActionOfAct, engineDuration, phaseAt, stageAt, type DirectorActionId,
} from '../src/graphics/endgameDirector';
import { AnimeImpactRig, IMPACT_FLIP } from '../src/graphics/animeImpactRig';
import { VFX_MESH_FILES } from '../src/graphics/vfxMeshes';
import { bearingTo, canImpact, cannonStationFor, combatModeOf, deflectsOffHull, modeDamage, stationSide } from '../src/combat/combatModes';
import { KINO, KINO_MASTER_CHAIN, KinoDsp, saturationCurve } from '../src/audio/kinoDsp';
import { KINO_CUES, KINO_SPEC } from '../src/audio/kinoCues';
import { ACTION_STYLES } from '../src/data/actionStyles';
import { SKYFALL_COLOSSUS, SKYFALL_TIMES } from '../src/data/cataclysms';
import { SWING_CODE, swingCode, swingMove } from '../src/combat/actionBroadcast';
import { REMOTE_ACT, RemoteActionStage, remoteDark, remoteShake } from '../src/world/remoteActionStage';
import { MmoAuthority } from '../src/net/mmoAuthority';
import { newPlayerState, newProfile, type ActNet, type ServerMsg } from '../src/net/mmoProtocol';
import { stanceOf } from '../src/net/partyRules';

const src = (p: string) => readFileSync(`src/${p}`, 'utf8');

describe('Legacy-Purge: eine Kennung, nie zwei Auslöser', () => {
  it('jede Regie-Aktion sperrt alte Standard-Effekte; neue Aktion beendet die laufende', () => {
    const d = new EndgameDirector();
    for (const id of Object.keys(DIRECTOR_TIMELINES)) expect(d.legacyAllowed(id), id).toBe(false);
    expect(d.legacyAllowed('saebel.l1')).toBe(true);
    d.begin('sturmfaust.k5', 'foot');
    d.begin('sturmfaust.k7', 'foot');
    expect(d.stats.preempted).toBe(1);
    expect(d.id).toBe('sturmfaust.k7');
    expect(LEGACY_PURGED.length).toBeGreaterThanOrEqual(10);
    expect(src('combat/cataclysmFx.ts')).not.toMatch(/\bfistGeo\b/);
    const sfx = src('audio/audio.ts'); expect(sfx.slice(sfx.indexOf('export type Sfx'), sfx.indexOf('export const ANIME_SFX'))).not.toContain('fistBarrage');
  });

  it('der Treffermoment kommt von der Welt (Rückfall nach overrun), Impact-Frame hält die Zeit mit 0,04', () => {
    const d = new EndgameDirector();
    const tl = d.begin('erdspalter.k9', 'foot')!;
    let t = 0;
    while (t < tl.t2 - 0.02) { d.update(1 / 60); t += 1 / 60; }
    expect(d.phase).toBe('entladung');
    expect(d.impactNow()).toBe(true);
    expect(d.impactNow()).toBe(false);
    expect(d.timeScale).toBe(DIRECTOR.hitStop);
    const late = new EndgameDirector();
    late.begin('sturmfaust.k10', 'foot');
    for (let i = 0; i < 200 && !late.impacted; i++) late.update(1 / 60);
    expect(late.late).toBe(true);
  });
});

describe('Impact-Frames: 70 – 180 ms als Doppelbild', () => {
  it('Formen IV – X und Ultimates liegen in den Grenzen, das zweite Halbbild ist das Gegenbild', () => {
    for (const tl of Object.values(DIRECTOR_TIMELINES)) {
      if (tl.impactMs === 0) { expect(tl.kind === 'auto' || tl.slot <= 3, tl.id).toBe(true); continue; }
      expect(tl.impactMs, tl.id).toBeGreaterThanOrEqual(DIRECTOR.impactMin);
      expect(tl.impactMs, tl.id).toBeLessThanOrEqual(DIRECTOR.impactMax);
    }
    const rig = new AnimeImpactRig();
    rig.impactFor(120, 'inkInv');
    const modes: string[] = [];
    for (let i = 0; i < 12; i++) modes.push(rig.frame(1 / 60));
    expect(modes[0]).toBe('inkInv');
    expect(modes).toContain(IMPACT_FLIP.inkInv);
    expect(rig.shownMs).toBeGreaterThanOrEqual(110);
    expect(rig.timedSeq).toBe(1);
  });
});

describe('Blender-Netze', () => {
  it('fünf .glb-Dateien unter public/models/vfx/ mit Vertex-Farben', () => {
    expect(VFX_MESH_FILES).toHaveLength(5);
    for (const f of ['vfx_fist_shockcone', 'vfx_fist_rapid_barrage', 'vfx_trench_fissure', 'vfx_meteor_colossus', 'vfx_meteor_shards']) {
      const p = `public/models/vfx/${f}.glb`;
      expect(existsSync(p), p).toBe(true);
      expect(statSync(p).size, p).toBeGreaterThan(2000);
      expect(readFileSync(p).toString('latin1'), p).toContain('COLOR_0');
    }
    expect(existsSync('scripts/blender/buildBrawlerAndMeteorVfx.py')).toBe(true);
  });
});

describe('Kampfmodi: Steuerrad gegen Schiffe, zu Fuß gegen Fußgegner', () => {
  it('Treffer, Abprallen und Kanonen-Stellungen', () => {
    expect(combatModeOf({ sailing: true, helmCast: false })).toBe('helm');
    expect(combatModeOf({ sailing: false, helmCast: false })).toBe('foot');
    expect(canImpact('helm', 'ship')).toBe(true);
    expect(canImpact('foot', 'ship')).toBe(false);
    expect(canImpact('helm', 'footEnemy')).toBe(false);
    expect(modeDamage('foot', 'ship', 500)).toBe(0);
    expect(deflectsOffHull('foot')).toBe(true);
    expect(cannonStationFor(null)).toBe('bugjagd');
    expect(cannonStationFor(0)).toBe('bugjagd');
    expect(stationSide(cannonStationFor(1.4))).toBe(1);
    expect(stationSide(cannonStationFor(-1.4))).toBe(-1);
    expect(bearingTo(0, 0, 0, 10, 0)).toBeGreaterThan(0);
  });
});

/** Attrappe eines AudioContext: zählt die Knoten */
function fakeCtx() {
  const made: string[] = [];
  const param = () => ({ value: 0, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; }, setTargetAtTime() { return this; }, cancelScheduledValues() { return this; } });
  const node = (kind: string) => {
    made.push(kind);
    return { connect() { return this; }, disconnect() {}, gain: param(), pan: param(), frequency: param(), Q: param(), detune: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), curve: null, oversample: 'none', buffer: null, loop: false, normalize: false, type: '', start() {}, stop() {}, playbackRate: param() };
  };
  const ctx = {
    currentTime: 0, sampleRate: 8000,
    createGain: () => node('GainNode'), createWaveShaper: () => node('WaveShaperNode'), createDynamicsCompressor: () => node('DynamicsCompressorNode'),
    createStereoPanner: () => node('StereoPannerNode'), createConvolver: () => node('ConvolverNode'), createBiquadFilter: () => node('BiquadFilterNode'),
    createOscillator: () => node('OscillatorNode'), createBufferSource: () => node('AudioBufferSourceNode'),
    createBuffer: (ch: number, len: number) => { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { getChannelData: (i: number) => d[i], length: len, numberOfChannels: ch }; },
  };
  return { ctx: ctx as unknown as AudioContext, made };
}

describe('Kino-DSP', () => {
  it('Master-Kette WaveShaper → Kompressor → Panorama → Hall; Knoten nur beim Aufbau; Stille vor dem Einschlag', () => {
    expect(KINO_MASTER_CHAIN).toEqual(['WaveShaperNode', 'DynamicsCompressorNode', 'StereoPannerNode', 'ConvolverNode']);
    const curve = saturationCurve(256);
    expect(curve[255]).toBeLessThan(1.01);
    expect(Math.abs(curve[0])).toBeGreaterThan(0.5);
    const { ctx, made } = fakeCtx();
    const dsp = new KinoDsp();
    dsp.init(ctx, { connect() {} } as unknown as AudioNode, KINO.voices);
    expect(dsp.ready).toBe(true);
    for (const k of KINO_MASTER_CHAIN) expect(made, k).toContain(k);
    const n = made.length;
    const tl = DIRECTOR_TIMELINES['sturmfaust.u'];
    const v = dsp.charge(KINO_CUES['sturmfaust.u'], { t1: tl.t1, t2: tl.t2, total: tl.total, silenceMs: tl.silenceMs }, 0.3, 0, 1);
    dsp.impact(KINO_CUES['sturmfaust.u'], v, 0.3, 0, 1);
    expect(made.length).toBe(n);
    expect(KINO_SPEC.silenceMs).toBe(45);
    expect(KINO_SPEC.subDrop).toEqual([90, 22]);
    expect(KINO_CUES['kosmos.u'].subTo).toBe(22);
    expect(tl.silenceMs).toBe(45);
  });
});

describe('Faustkämpfer und Himmelssturz', () => {
  it('beide Pfade: 4er-Kombo, zehn Formen 0,55 – 1,50 s, Ultimates 3,4 / 3,6 s', () => {
    for (const st of ['sturmfaust', 'erdspalter'] as const) {
      expect(ACTION_STYLES[st].light).toHaveLength(4);
      expect(ACTION_STYLES[st].skills).toHaveLength(10);
      for (let k = 1; k <= 10; k++) {
        const tl = DIRECTOR_TIMELINES[`${st}.k${k}` as DirectorActionId];
        expect(tl.total).toBeGreaterThanOrEqual(0.55);
        expect(tl.total).toBeLessThanOrEqual(1.5);
        expect(ACTION_STYLES[st].skills[k - 1].dur).toBeCloseTo(engineDuration(tl), 3);
        expect(phaseAt(tl, tl.t2 + 1e-4)).toBe('einschlag');
      }
    }
    expect(DIRECTOR_TIMELINES['sturmfaust.u'].total).toBe(3.4);
    expect(DIRECTOR_TIMELINES['erdspalter.u'].total).toBe(3.6);
  });

  it('Himmelssturz: 4,2 s in vier Stufen, 45-m-Koloss, 120-m-Fontäne', () => {
    const tl = DIRECTOR_TIMELINES['kosmos.u'];
    expect(tl.total).toBe(4.2);
    expect([0.5, 1.2, 2.2, 3.5].map((t) => stageAt(tl, t))).toEqual([0, 1, 2, 3]);
    expect(SKYFALL_TIMES.shards).toHaveLength(5);
    expect(SKYFALL_COLOSSUS).toMatchObject({ size: 45, fountain: 120 });
  });
});

describe('Außenansicht der Mitspieler (CombatActionBroadcast)', () => {
  it('Kennzahlen jeder Kettenstufe überleben die Übertragung; der vierte Schlag ist eine Regie-Aktion', () => {
    for (const st of ['sturmfaust', 'erdspalter', 'saebel'] as const) {
      ACTION_STYLES[st].light.forEach((m, i) => { expect(swingCode(st, m.id)).toBe(SWING_CODE.light + i); expect(swingMove(st, SWING_CODE.light + i)).toBe(m); });
    }
    expect(directorActionOfAct({ t: 'swing', style: 'sturmfaust', slot: 0, el: '', n: 4 })).toBe('sturmfaust.l4');
    expect(directorActionOfAct({ t: 'ult', style: 'saebel', slot: 0, el: 'skyfall' })).toBe('kosmos.u');
  });

  it('Shake nur < 90 m und mit der Entfernung abnehmend, Verdunkelung nach Abstand', () => {
    expect(remoteShake(REMOTE_ACT.shakeRange, 1)).toBe(0);
    expect(remoteShake(89, 1)).toBeGreaterThan(0.2);
    expect(remoteShake(10, 1)).toBeGreaterThan(remoteShake(60, 1));
    expect(remoteDark(0, 0.7)).toBeCloseTo(0.7, 6);
    expect(remoteDark(400, 0.7)).toBe(0);
  });

  it('zwei Clients über einen Shard: B sieht A komplett (Pose, Phasen, Einschlag), spürt den Shake – ohne fremde Kamera oder Impact-Frame', () => {
    const inbox = new Map<string, ServerMsg[]>();
    const auth = new MmoAuthority({ stance: (a, b) => stanceOf(a, b, () => 'neutral') }, { safeAt: () => '' }, (to, msg) => { const l = inbox.get(to) ?? []; l.push(structuredClone(msg)); inbox.set(to, l); });
    auth.tick(0);
    const join = (id: string, x: number) => { const p = newProfile(id); p.name = id; p.team = 'deutschland'; const s = newPlayerState(); s.x = x; s.z = 3000; s.dom = 'land'; s.hp = s.mhp = 100; auth.join(p, s, 0); };
    join('p:a', 3000); join('p:b', 3040); join('p:c', 3600);
    const a: ActNet = { t: 'ult', ent: '', x: 3000, y: 0, z: 3000, yaw: 0, side: 0, n: 0, style: 'sturmfaust', el: 'fistStorm', slot: 0, tx: 3000, ty: 0, tz: 3012, sea: false };
    auth.handle('p:a', { k: 'act', a }, 1);
    const got = (inbox.get('p:b') ?? []).filter((m): m is Extract<ServerMsg, { k: 'act' }> => m.k === 'act');
    expect(got).toHaveLength(1);
    expect((inbox.get('p:a') ?? []).some((m) => m.k === 'act')).toBe(false);
    // Client B: Bühne der Mitspieler-Aktionen (Betrachter 40 m entfernt)
    const stage = new RemoteActionStage();
    const c = stage.begin(got[0].from, got[0].a, a.x, a.y, a.z, a.yaw)!;
    expect(c.action).toBe('sturmfaust.u');
    expect(c.pose?.id).toBe('stormCrown');
    const phases = new Set<string>();
    let shake = 0, dark = 0;
    for (let i = 0; i < 300 && c.on; i++) { stage.update(1 / 60, 3040, 3000); phases.add(c.phase); shake = Math.max(shake, stage.shakeNow); dark = Math.max(dark, stage.dark); }
    expect([...phases]).toEqual(['aufbau', 'entladung', 'einschlag', 'nachbeben']);
    expect(shake).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(0.3);
    // ein Betrachter jenseits von 90 m spürt nichts
    const far = new RemoteActionStage();
    far.begin('p:a', a, a.x, a.y, a.z, a.yaw);
    let fs = 0;
    for (let i = 0; i < 300; i++) { far.update(1 / 60, 3200, 3000); fs = Math.max(fs, far.shakeNow); }
    expect(fs).toBe(0);
    // die Bühne kennt weder Kamera noch Impact-Frame noch Hit-Stop
    const stageSrc = src('world/remoteActionStage.ts') + src('world/remoteActionFx.ts');
    for (const bad of ['impactFor(', 'animeRig', 'hitstop', 'camera.', 'cine.start']) expect(stageSrc, bad).not.toContain(bad);
  });
});
