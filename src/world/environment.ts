import { Color, DirectionalLight, Fog, HemisphereLight, Vector3, type PerspectiveCamera, type Scene } from 'three';
import { DAY_MINUTES, WEATHER_IDS, type WeatherId } from '../data/world';
import type { QualityConfig } from '../data/qualityTiers';
import { toonShared } from '../render/toon';
import { Ocean, type IslandShape } from './ocean';
import { Sky } from './sky';
import { createPalette, samplePalette } from './timeOfDay';
import { Weather } from './weather';
import { WorldEdge } from './worldEdge';

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
  private shadowExtent = 40;
  private tmpCol = new Color();
  private focus = new Vector3();

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
    const sh = this.sun.shadow;
    this.sun.castShadow = c.shadows.enabled;
    if (c.shadows.enabled && sh.mapSize.x !== c.shadows.mapSize) {
      sh.mapSize.set(c.shadows.mapSize, c.shadows.mapSize);
      sh.map?.dispose();
      (sh as any).map = null;
    }
    this.shadowExtent = c.shadows.mapSize >= 4096 ? 80 : c.shadows.mapSize >= 2048 ? 55 : 38;
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
    const horizon = this.tmpCol.copy(pal.horizon).lerp(GREY.clone().multiplyScalar((0.4 + 0.6 * pal.ambientI) * g2), mixK);
    const zenith = pal.zenith.clone().lerp(GREY.clone().multiplyScalar((0.25 + 0.55 * pal.ambientI) * g2 * 0.75), mixK);

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

    const fog = this.scene.fog as Fog;
    fog.color.copy(horizon);
    fog.far = this.viewDistance * w.visibility;
    fog.near = fog.far * (w.visibility < 0.5 ? 0.05 : 0.2);

    // Licht
    const light = w.light;
    this.sun.color.copy(pal.light);
    this.sun.intensity = pal.lightI * light * light * Math.max(pal.sunVis, pal.moonVis * 0.9 + 0.1) + flash * 2;
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

    toonShared.rimColor.value.copy(pal.rim);
    toonShared.rimStrength.value = 0.55 * (1 - greyK * 0.6) * (0.35 + 0.65 * pal.sunVis);

    // Meer
    const ou = this.ocean.uniforms;
    ou.uDeep.value.copy(pal.seaDeep).lerp(GREY.clone().multiplyScalar(0.3), greyK * 0.5);
    ou.uShallow.value.copy(pal.seaShallow).lerp(GREY.clone().multiplyScalar(0.55), greyK * 0.4);
    ou.uDeep.value.multiplyScalar(0.55 + 0.45 * gloom);
    ou.uShallow.value.multiplyScalar(0.55 + 0.45 * gloom);
    ou.uZenith.value.copy(zenith);
    ou.uHorizon.value.copy(horizon);
    ou.uSunDir.value.copy(pal.sunVis > 0.1 ? pal.sunDir : pal.moonDir);
    ou.uSunCol.value.copy(pal.light);
    ou.uSpecK.value = Math.max(pal.sunVis, pal.moonVis * 0.5) * (1 - greyK);
    this.ocean.follow(camera.position.x, camera.position.z, camera.position);

    this.sky.follow(camera.position, pal.sunDir, pal.sunVis * (1 - greyK * 0.95));
    this.weather.render(this.clock, camera);
    this.edge.setWaterColors(ou.uShallow.value, ou.uDeep.value);
    this.edge.render(this.clock, focus, camera.position, pal.sunDir, pal.sunVis, 1 - greyK, cu.uLit.value, cu.uShade.value);
  }

  /** Name der Tageszeit für Anzeigen */
  get timeName() { return this.palette.name; }
}
