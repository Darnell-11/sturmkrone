import { Color, DirectionalLight, Fog, HemisphereLight, Vector3, type PerspectiveCamera, type Scene } from 'three';
import { DAY_MINUTES, WEATHER_IDS, type WeatherId } from '../data/world';
import type { QualityConfig } from '../data/qualityTiers';
import { forEachToon, toonShared } from '../render/toon';
import { csmShared, ensureCsm } from '../render/csm';
import { fogShared } from '../render/atmosphere';
import { aoShared } from '../render/gtao';
import { windShared } from '../render/wind';
import { updateWetness } from '../render/wetness';
import { envShared } from '../render/ibl';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import type { Material, Mesh } from 'three';
import { Ocean, type IslandShape } from './ocean';
import { Sky } from './sky';
import { createPalette, samplePalette } from './timeOfDay';
import { Weather } from './weather';
import { WorldEdge } from './worldEdge';
import { smokeShared } from './smoke';

export interface EnvState { time: number; weather: WeatherId }

const GREY = new Color(0x8a96a4);

/** Himmel, Licht, Meer, Tageszeit, Wetter und Weltrand in einem. */
export class Environment {
  readonly sun = new DirectionalLight(0xffffff, 2.5);
  readonly hemi = new HemisphereLight(0xffffff, 0x334455, 1);
  readonly ocean = new Ocean();
  readonly sky: Sky;
  readonly weather: Weather;
  readonly edge: WorldEdge;
  readonly palette = createPalette();

  /** Uhrzeit 0 … 24 */
  time = 9;
  /** 1 = normaler Tagesablauf, 0 = angehalten, > 1 = Zeitraffer */
  timeSpeed = 1;
  /** Gesamtlaufzeit für Wellen und Animationen */
  clock = 0;
  /** Windrichtung (Bogenmaß, wohin der Wind weht) – dreht langsam */
  windDir = 0.6;

  private viewDistance = 520;
  private fogStart = 0.2;
  /** Größte Texturgröße der Grafikkarte (setzt das Spiel) */
  maxTex = 4096;
  private shadowExtent = 40;
  private tmpCol = new Color();
  private tmpZenith = new Color();
  private tmpGrey = new Color();
  private focus = new Vector3();
  /** Kaskadierte Schatten (ab Stufe Hoch); null = eine Schattenkarte um die Figur */
  private csm: CSM | null = null;
  private csmWant: { cascades: number; mapSize: number; far: number; soft: boolean } | null = null;
  private csmCam = { cam: null as PerspectiveCamera | null, fov: 0, aspect: 0, near: 0, far: 0 };

  constructor(private scene: Scene) {
    scene.fog = new Fog(0xbfe8ff, 100, 520);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target, this.hemi, this.ocean.mesh);
    this.sky = new Sky(scene);
    this.weather = new Weather(scene);
    this.edge = new WorldEdge(scene, this.sky.cloudU.uMap.value);
  }

  get sunMesh() { return this.sky.sunMesh; }

  applyQuality(c: QualityConfig) {
    this.viewDistance = c.viewDistance;
    this.fogStart = c.fogStart;
    this.setupCsm(c);
    const sh = this.sun.shadow;
    // mit Kaskaden übernehmen deren Lichter Licht und Schatten der Sonne
    this.sun.castShadow = c.shadows.enabled && !this.csmWant;
    this.sun.visible = !this.csmWant;
    if (this.csmWant && sh.map) { sh.map.dispose(); (sh as any).map = null; }
    // nicht größer als die Grafikkarte erlaubt (8192 bei Ultra)
    const mapSize = Math.min(c.shadows.mapSize, this.maxTex);
    if (c.shadows.enabled && sh.mapSize.x !== mapSize) {
      sh.mapSize.set(mapSize, mapSize);
      sh.map?.dispose();
      (sh as any).map = null;
    }
    this.shadowExtent = mapSize >= 8192 ? 120 : mapSize >= 4096 ? 80 : mapSize >= 2048 ? 55 : 38;
    const cam = sh.camera;
    cam.left = -this.shadowExtent; cam.right = this.shadowExtent; cam.top = this.shadowExtent; cam.bottom = -this.shadowExtent;
    cam.near = 1; cam.far = 400;
    cam.updateProjectionMatrix();
    sh.radius = c.shadows.soft ? 4 : 1.5;

    this.ocean.setDetail(c.detail, Math.round(8 + 24 * Math.min(1, c.detail)));
    this.sky.setCloudCount(Math.round(36 * c.detail + 12) + (c.detail >= 1 ? 30 : 0));
    this.weather.setMaxDrops(Math.round(2600 * c.particles));
    this.sky.cloudU.uRange.value = Math.max(900, c.viewDistance * 1.6);
  }

  /** Kaskaden je nach Stufe ein-, um- oder ausschalten und alle beleuchteten Materialien umstellen */
  private setupCsm(c: QualityConfig) {
    const n = c.shadows.enabled ? c.shadows.cascades : 0;
    const want = n >= 2 ? { cascades: n, mapSize: Math.min(c.shadows.mapSize, this.maxTex), far: c.shadows.far, soft: c.shadows.soft } : null;
    const same = JSON.stringify(want) === JSON.stringify(this.csmWant);
    if (same) return;
    this.disposeCsm();
    this.csmWant = want;
    csmShared.cascades = want ? want.cascades : 0;
    const fix = (m: Material) => { if (ensureCsm(m)) m.needsUpdate = true; };
    forEachToon(fix);
    this.scene.traverse((o) => {
      const m = (o as Mesh).material as Material | Material[] | undefined;
      if (m) for (const x of Array.isArray(m) ? m : [m]) fix(x);
    });
  }

  private createCsm(camera: PerspectiveCamera) {
    const w = this.csmWant!;
    const csm = new CSM({
      camera, parent: this.scene, cascades: w.cascades, maxFar: w.far, mode: 'practical',
      shadowMapSize: w.mapSize, shadowBias: -0.00012, lightDirection: new Vector3(0, -1, 0),
      lightIntensity: 1, lightNear: 1, lightFar: 1000, lightMargin: 250,
    });
    csm.fade = true;
    this.csm = csm;
    this.csmCam.cam = null;
  }

  private disposeCsm() {
    if (!this.csm) return;
    this.csm.remove();
    for (const l of this.csm.lights) l.dispose();
    this.csm.dispose();
    this.csm = null;
  }

  /** Jedes Bild: Kaskaden der Kamera folgen lassen, Sonnenlicht übernehmen */
  private updateCsm(camera: PerspectiveCamera, lightDir: Vector3) {
    if (this.csmWant && !this.csm) this.createCsm(camera);
    const csm = this.csm;
    if (!csm) return;
    const k = this.csmCam;
    if (k.cam !== camera || k.fov !== camera.fov || k.aspect !== camera.aspect || k.near !== camera.near || k.far !== camera.far) {
      k.cam = camera; k.fov = camera.fov; k.aspect = camera.aspect; k.near = camera.near; k.far = camera.far;
      csm.camera = camera;
      csm.updateFrustums();
      // Weichheit je Kaskade: nah knackig, in der Ferne weich auslaufend; Normalen-Versatz passend zur Texelgröße
      csm.lights.forEach((l, i) => {
        const cam = l.shadow.camera;
        const texel = (cam.right - cam.left) / this.csmWant!.mapSize;
        l.shadow.normalBias = texel * 1.6;
        l.shadow.radius = this.csmWant!.soft ? 1.4 + i * 1.3 : 1;
      });
    }
    csm.lightDirection.copy(lightDir).negate();
    for (const l of csm.lights) { l.color.copy(this.sun.color); l.intensity = this.sun.intensity; }
    camera.updateMatrixWorld();
    csm.update();
    const u = csmShared.uniforms;
    (csm as unknown as { _getExtendedBreaks(t: unknown[]): void })._getExtendedBreaks(u.CSM_cascades.value);
    u.cameraNear.value = camera.near;
    u.shadowFar.value = Math.min(camera.far, csm.maxFar);
  }

  setIslands(list: IslandShape[]) { this.ocean.setIslands(list); }

  getState(): EnvState { return { time: this.time, weather: this.weather.target }; }

  setState(s: Partial<EnvState>) {
    if (typeof s.time === 'number' && isFinite(s.time)) this.time = ((s.time % 24) + 24) % 24;
    if (s.weather && WEATHER_IDS.includes(s.weather)) this.weather.setWeather(s.weather, true);
  }

  heightAt(x: number, z: number) { return this.ocean.heightAt(x, z, this.clock, this.ocean.uniforms.uWaveScale.value); }

  /** Logik (feste Schritte) */
  update(dt: number, focus: Vector3) {
    this.clock += dt;
    this.time = (this.time + (dt * this.timeSpeed * 24) / (DAY_MINUTES * 60)) % 24;
    this.focus.copy(focus);
    this.weather.update(dt, focus);
    // Nässe und Pfützen folgen dem Regen (trocknen in der Sonne schneller)
    updateWetness(dt, this.weather.p.rain, this.palette.sunVis * (1 - this.weather.p.grey * 0.6));
    this.windDir += Math.sin(this.clock * 0.004) * dt * 0.01 * (1 + this.weather.p.wind * 3);
    // Wellenhöhe folgt dem Wetter (in der Logik, damit Schiffe und Darstellung übereinstimmen)
    this.ocean.uniforms.uWaveScale.value = this.weather.p.waves;
    this.ocean.uniforms.uTime.value = this.clock;
  }

  /** Darstellung (jeder Frame) */
  render(camera: PerspectiveCamera, focus: Vector3) {
    const pal = samplePalette(this.time, this.palette);
    const w = this.weather.p;
    const flash = this.weather.flash;

    // Wetter graut Himmel und Nebel ein
    const greyK = w.grey;
    const gloom = 0.35 + 0.65 * w.light; // Sturm: deutlich dunkler
    const g2 = gloom * gloom;
    const mixK = Math.min(1, greyK * 1.15);
    const grey = this.tmpGrey;
    const horizon = this.tmpCol.copy(pal.horizon).lerp(grey.copy(GREY).multiplyScalar((0.4 + 0.6 * pal.ambientI) * g2), mixK);
    const zenith = this.tmpZenith.copy(pal.zenith).lerp(grey.copy(GREY).multiplyScalar((0.25 + 0.55 * pal.ambientI) * g2 * 0.75), mixK);

    const su = this.sky.skyU;
    su.uZenith.value.copy(zenith);
    su.uHorizon.value.copy(horizon);
    su.uSunDir.value.copy(pal.sunDir);
    su.uSunCol.value.copy(pal.light);
    su.uMoonDir.value.copy(pal.moonDir);
    su.uGlow.value.copy(pal.light).multiplyScalar(0.35 * pal.sunVis * (1 - greyK));
    su.uStars.value = pal.stars * (1 - w.clouds * 0.6);
    su.uTime.value = this.clock;
    su.uFlash.value = flash * 0.6;
    su.uSunVis.value = pal.sunVis * (1 - greyK * 0.9);
    su.uMoonVis.value = pal.moonVis * (1 - greyK);
    su.uGrey.value = greyK;

    const cu = this.sky.cloudU;
    cu.uTime.value = this.clock;
    cu.uCover.value = w.clouds;
    cu.uDark.value = w.cloudDark;
    cu.uLit.value.copy(pal.cloudLit);
    cu.uShade.value.copy(pal.cloudShade);
    cu.uHorizon.value.copy(horizon);
    cu.uFlash.value = flash;
    cu.uWind.value.set(2 + 10 * w.wind, 1 + 3 * w.wind);
    // Rauch wird wie die Wolken beleuchtet (Abendrot, Nacht, Sturm), Blitze hellen ihn auf
    smokeShared.uLit.value.copy(pal.cloudLit).multiplyScalar(0.55 + 0.45 * gloom).lerp(horizon, 0.15).addScalar(flash * 0.5);
    smokeShared.uShade.value.copy(pal.cloudShade).multiplyScalar(0.5 + 0.4 * gloom).addScalar(flash * 0.3);

    const fog = this.scene.fog as Fog;
    fog.color.copy(horizon);
    fog.far = this.viewDistance * w.visibility;
    fog.near = fog.far * (w.visibility < 0.5 ? 0.05 : this.fogStart);

    // Licht
    const light = w.light;
    this.sun.color.copy(pal.light);
    this.sun.intensity = pal.lightI * light * light * Math.max(pal.sunVis, pal.moonVis * 0.9 + 0.1) * pal.lightK + flash * 2;
    this.hemi.color.copy(pal.ambientSky).lerp(GREY, greyK * 0.5);
    this.hemi.groundColor.copy(pal.ambientGround);
    this.hemi.intensity = pal.ambientI * (0.3 + 0.7 * light) + flash * 1.5;
    this.sun.position.copy(focus).addScaledVector(pal.lightDir, 200);
    this.sun.target.position.copy(focus);
    // Schattenkarte am Texel-Raster ausrichten, damit Schatten beim Fahren nicht flimmern
    const texel = (this.shadowExtent * 2) / Math.max(1, this.sun.shadow.mapSize.x);
    this.sun.target.position.x = Math.round(this.sun.target.position.x / texel) * texel;
    this.sun.target.position.z = Math.round(this.sun.target.position.z / texel) * texel;
    this.sun.position.x = this.sun.target.position.x + pal.lightDir.x * 200;
    this.sun.position.z = this.sun.target.position.z + pal.lightDir.z * 200;
    this.updateCsm(camera, pal.lightDir);

    // Wind für Pflanzen: Zeit, Richtung (wohin er weht) und Stärke nach Wetter
    windShared.uSkTime.value = this.clock;
    windShared.uSkWindDir.value.set(Math.sin(this.windDir), Math.cos(this.windDir));
    windShared.uSkWindK.value = 0.3 + w.wind * 1.1;
    // Atmosphäre: Dunst nimmt in Sonnenrichtung die Lichtfarbe auf (nachts und bei Sturm kaum)
    fogShared.skFogSunDir.value.copy(pal.lightDir).normalize();
    fogShared.skFogSunCol.value.copy(pal.light).multiplyScalar(0.9 + 0.3 * pal.sunVis);
    fogShared.skFogHaze.value = Math.max(pal.sunVis * (1 - greyK * 0.8) * 0.6, pal.moonVis * (1 - greyK) * 0.22);
    {
      // Bodennebel dichter in der Dämmerung, nachts und im Unwetter; die Nebelfarbe folgt dem Horizont (golden, tiefblau, graublau)
      const hh = this.time;
      const twi = Math.max(0, 1 - Math.min(Math.abs(hh - 18.6), Math.abs(hh - 6.4)) / 1.8);
      fogShared.skFogGround.value = Math.min(1, 0.18 + twi * 0.5 + (1 - pal.sunVis) * 0.3 + greyK * 0.5);
      aoShared.boost = 0.85 + 0.45 * pal.noon + greyK * 0.1;
    }
    // Spiegelungen: Ersatz-Himmelsverlauf (ohne Umgebungskarte) und Stärke nach Helligkeit
    toonShared.envLow.value.copy(horizon).multiplyScalar(0.8);
    toonShared.envHigh.value.copy(zenith);
    envShared.intensity.value = 0.55 + 0.45 * light;

    toonShared.rimColor.value.copy(pal.rim);
    // Schattenfarbe: tags kühles Blau, im Abendrot Violett, nachts tiefes Blau
    {
      const h = this.time;
      const dusk = Math.max(0, 1 - Math.min(Math.abs(h - 18.6), Math.abs(h - 6.4)) / 1.6);
      const night = h < 5.5 || h > 20 ? 1 : 0;
      toonShared.shadowTint.value.setRGB(0.74 + dusk * 0.14 - night * 0.06, 0.8 - dusk * 0.1, 1.12 + dusk * 0.04 + night * 0.08);
    }
    toonShared.shadowTint.value.multiplyScalar(1 - 0.08 * pal.noon);
    toonShared.rimStrength.value = 0.55 * (1 - greyK * 0.6) * (0.35 + 0.65 * pal.sunVis);

    // Meer
    const ou = this.ocean.uniforms;
    ou.uDeep.value.copy(pal.seaDeep).lerp(this.tmpGrey.copy(GREY).multiplyScalar(0.3), greyK * 0.5);
    ou.uShallow.value.copy(pal.seaShallow).lerp(this.tmpGrey.copy(GREY).multiplyScalar(0.55), greyK * 0.4);
    ou.uDeep.value.multiplyScalar(0.55 + 0.45 * gloom);
    ou.uShallow.value.multiplyScalar(0.55 + 0.45 * gloom);
    ou.uZenith.value.copy(zenith);
    ou.uHorizon.value.copy(horizon);
    ou.uSunDir.value.copy(pal.sunVis > 0.1 ? pal.sunDir : pal.moonDir);
    ou.uSunCol.value.copy(pal.light);
    ou.uSpecK.value = Math.max(pal.sunVis, pal.moonVis * 0.5) * (1 - greyK);
    ou.uWindDir.value = this.windDir;
    ou.uWindK.value = w.wind;
    this.ocean.follow(camera.position.x, camera.position.z, camera.position);

    this.sky.follow(camera.position, pal.sunDir, pal.sunVis * (1 - greyK * 0.95));
    this.weather.render(this.clock, camera);
    this.edge.setWaterColors(ou.uShallow.value, ou.uDeep.value);
    this.edge.render(this.clock, focus, camera.position, pal.sunDir, pal.sunVis, 1 - greyK, cu.uLit.value, cu.uShade.value);
  }

  /** Name der Tageszeit für Anzeigen */
  get timeName() { return this.palette.name; }
}
