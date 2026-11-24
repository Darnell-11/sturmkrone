// Phase 4.4B: Helden-Look der Figuren (ein Figuren-Programm, Cel-Stufen, Augen, Haar, Kantenlicht, Mantelwind), Waffenmodelle und feste Lichtzahl.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Object3D, Scene, ShaderLib } from 'three';
import { describe, expect, it } from 'vitest';
import { extendToon, toon, toonFx, CEL, type Surface } from '../src/render/toon';
import { LightAnchor, ShipLightRig } from '../src/render/shipLights';
import { VROID_BONES } from '../src/entities/character/vroid';
import { RAID_BOSSES } from '../src/raid/raidBosses';
import { SOLDIER_JOINTS } from '../src/entities/troops/soldierGeometry';

/** Shader-Quelltext eines Toon-Materials wie beim Übersetzen (onBeforeCompile auf die three.js-Vorlage angewandt) */
function compiled(mat: ReturnType<typeof toon>) {
  const sh = { uniforms: {} as Record<string, unknown>, vertexShader: ShaderLib.toon.vertexShader, fragmentShader: ShaderLib.toon.fragmentShader };
  mat.onBeforeCompile(sh as never, undefined as never);
  return sh;
}

/** Materialnamen (= Rollen) eines .glb-Modells aus dem JSON-Block der Datei */
function glbRoles(file: string): string[] {
  const buf = readFileSync(resolve(__dirname, '..', 'public', 'models', file));
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as { materials?: { name?: string }[] };
  return (json.materials ?? []).map((m) => m.name ?? '');
}

// Oberflächen ohne Schmiede-Satz (Stoff und Leder holen ihren Satz erst beim Übersetzen in der Grafikkarte)
const SURFS: Surface[] = ['skin', 'hair', 'eye', 'plain', 'steel'];

describe('Figuren-Shader zusammengelegt (4.4B)', () => {
  it('alle Figuren-Oberflächen teilen einen Programmschlüssel – auch durchscheinende Teile und Effekt-Kopien', () => {
    const keys = new Set<string>();
    for (const s of SURFS) {
      keys.add(toon({ color: '#c08060', surface: s }).customProgramCacheKey());
      keys.add(toon({ color: '#c08061', surface: s, transparent: true }).customProgramCacheKey());
      const fx = toonFx(toon({ color: '#c08062', surface: s }));
      expect(fx).not.toBeNull();
      keys.add(fx!.mat.customProgramCacheKey());
    }
    keys.add(toon({ color: '#202020', surface: 'cloth' }).customProgramCacheKey());
    keys.add(toon({ color: '#202021', surface: 'leather', metalness: 0.4 }).customProgramCacheKey());
    expect([...keys]).toEqual(['sk-toon-10c']);
    // Borten (eigene Attribute) bleiben ein eigener Schlüssel
    expect(toon({ color: '#c08063', surface: 'cloth', trim: true }).customProgramCacheKey()).toBe('sk-toon-10ct');
  });

  it('Oberfläche, Spiegelung, Maske und Schmiede laufen über Uniforms; die Welt behält feste Konstanten', () => {
    const skin = compiled(toon({ color: '#c08070', surface: 'skin' }));
    expect(skin.fragmentShader).toContain('uniform int uSkSurf;');
    expect((skin.uniforms.uSkSurf as { value: number }).value).toBe(1);
    expect((skin.uniforms.uSkEnvK as { value: number }).value).toBe(1);
    expect((skin.uniforms.uSkForgeOn as { value: number }).value).toBe(0);
    expect((skin.uniforms.uSkMaskK as { value: number }).value).toBe(1);
    const glass = compiled(toon({ color: '#c08071', surface: 'plain', transparent: true }));
    expect((glass.uniforms.uSkMaskK as { value: number }).value).toBe(0);
    expect((glass.uniforms.uSkEnvK as { value: number }).value).toBe(0);
    // Welt-Metall: Oberfläche als Konstante (der Übersetzer faltet die Zweige weg), kein Figuren-Pfad
    const world = compiled(toon({ color: '#888888', metalness: 1, roughness: 0.4 }));
    expect(world.fragmentShader).toMatch(/const int skSurf = \d;/);
    expect(world.fragmentShader).not.toContain('uSkSurf');
    expect(world.fragmentShader).not.toContain('#define SK_CHAR');
  });

  it('Anime-Fighter-Look: dreistufige Cel-Rampe, Augen mit Lidschatten und Iris-Leuchten, Haar-Glanzband, scharfe Lichtkante', () => {
    const eye = compiled(toon({ color: '#ffffff', surface: 'eye' }));
    const f = eye.fragmentShader;
    expect(f).toContain('skCelA');
    expect(f).toContain('skLid');
    expect(f).toContain('skLow');
    expect(f).toContain('skB1');
    expect(f).toContain('skHard');
    expect(f).toContain('uSkHeroK');
    expect((eye.uniforms.uSkCel as { value: number }).value).toBe(CEL.hair);
    expect((compiled(toon({ color: '#c08072', surface: 'skin' })).uniforms.uSkCel as { value: number }).value).toBe(CEL.skin);
    // Cel-Anteile sinnvoll: Haut weicher als Stoff, alles zwischen 0 und 1
    expect(CEL.skin).toBeLessThan(CEL.cloth);
    for (const v of Object.values(CEL)) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(1); }
  });

  it('Bosse tragen stärkeres Kantenlicht je Figur (eigene Effekt-Werte)', () => {
    const fx = toonFx(toon({ color: '#c08073', surface: 'cloth' }))!;
    expect(fx.u.hero.value).toBe(1);
    fx.u.hero.value = 1.9;
    const sh = compiled(fx.mat);
    expect((sh.uniforms.uSkHeroK as { value: number }).value).toBe(1.9);
  });

  it('Zusätze (Umhang- und Mantelwind) überleben die Effekt-Kopie', () => {
    const m = toon({ color: '#c08074', surface: 'cloth', unique: true });
    extendToon(m, '-tail', (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float tailK;'); });
    expect(m.customProgramCacheKey()).toBe('sk-toon-10c-tail');
    const fx = toonFx(m)!;
    expect(fx.mat.customProgramCacheKey()).toBe('sk-toon-10c-tail');
    expect(compiled(fx.mat).vertexShader).toContain('attribute float tailK;');
  });
});

describe('Gelenke und Statur (Animationen laufen unverändert weiter)', () => {
  it('die VRoid-Gelenke für Spielfigur, Offiziere und Bosse sind vollständig', () => {
    for (const k of ['hips', 'spine', 'chest', 'head', 'upperarml', 'lowerarml', 'wristl', 'upperarmr', 'lowerarmr', 'wristr', 'upperlegl', 'lowerlegl', 'footl', 'upperlegr', 'lowerlegr', 'footr']) {
      expect(VROID_BONES[k], k).toMatch(/^J_Bip_[CLR]_/);
    }
    // Massentruppen: Waffenhand unverändert (4.4A)
    expect(SOLDIER_JOINTS.handR).toEqual([0.29, 0.88, 0.28]);
  });

  it('Raid-Bosse sind größer als normale Figuren', () => {
    for (const b of Object.values(RAID_BOSSES)) {
      const def = (b as unknown as { def?: { scale: number } }).def ?? (b as unknown as { scale: number });
      expect(def.scale).toBeGreaterThanOrEqual(1.15);
    }
  });
});

describe('Waffen aus Blender (4.4B)', () => {
  it('jede Klinge hat eine eigene Schneide bis zur Härtungslinie', () => {
    for (const f of ['gear/w_katana.glb', 'gear/w_saebel.glb', 'gear/w_zweihaender.glb', 'gear/w_kurzklinge.glb',
      'bosses/kurogane_katana.glb', 'bosses/kurogane_wakizashi.glb', 'bosses/eisenstein_zweihaender.glb', 'bosses/blackwood_saebel.glb', 'bosses/devalois_rapier.glb']) {
      const roles = glbRoles(f);
      expect(roles, f).toContain('steel');
      expect(roles, f).toContain('edge');
    }
  });

  it('Steinschloss-Muskete: Holzschaft, Messingbeschläge, dunkler Lauf, Stahl-Schloss', () => {
    const roles = glbRoles('gear/w_muskete.glb');
    for (const r of ['wood', 'gold', 'dark', 'steel']) expect(roles).toContain(r);
    // Pistole des Admirals mit Schloss (Hahn, Batterie) und Messing
    const pist = glbRoles('bosses/blackwood_pistole.glb');
    for (const r of ['steel', 'gold', 'dark']) expect(pist).toContain(r);
  });
});

describe('Feste Lichtzahl (Startzeit, 4.4B)', () => {
  it('die Schiffslichter stehen fest in der Szene und folgen nur den Ankern', () => {
    const scene = new Scene();
    const rig = new ShipLightRig(scene);
    const count = () => { let n = 0; scene.traverse((o) => { if ((o as { isLight?: boolean }).isLight) n++; }); return n; };
    expect(count()).toBe(ShipLightRig.COUNT);
    const holder = new Object3D();
    const a = new LightAnchor(0xffa24a, 40, 1.4); a.position.set(1, 2, 3); a.intensity = 12;
    const cab = new LightAnchor(0xffc27a, 12, 1.6); cab.intensity = 3;
    holder.add(a, cab);
    rig.follow({ lights: [a], cabinLight: cab }, true);
    expect(rig.lights[0].intensity).toBe(12);
    expect(rig.lights[0].position.toArray()).toEqual([1, 2, 3]);
    expect(rig.lights[1].intensity).toBe(0);
    expect(rig.lights[2].intensity).toBe(3);
    // Schiff verborgen oder keins: dunkel, aber nie unsichtbar (sonst übersetzt three.js alle Programme neu)
    rig.follow(null, false);
    for (const l of rig.lights) { expect(l.intensity).toBe(0); expect(l.visible).toBe(true); }
    expect(count()).toBe(ShipLightRig.COUNT);
  });
});
