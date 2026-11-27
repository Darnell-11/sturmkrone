// Phase 4.9 – Kampf-Aktionen der Mitspieler darstellen (CombatActionBroadcast, Empfänger-Seite): Standard-Angriffe, Formen 1 – 10, Geistes-Faji
// Q/R/T/G, Priester-Heilungen und Ultimates – nur mit den Bausteinen der `AnimeVfxForge` (gleiche Pools, keine neuen Shader-Programme) und den
// vorhandenen Klängen. Wirkung hat nichts davon: Schaden läuft über den Shard (Treffer-Pakete), die Zahlen zeigt der Rückgang des Lebens.
//
// 4.93A: jede Aktion ist von außen KOMPLETT sichtbar und hörbar. Sie geht einmal beim Start hinaus; die reine Bühne
// (`world/remoteActionStage.ts`) führt je Mitspieler Zeitachse, Phase, Clip-Stand und Kampfpose (die Figur zeigt `world/mmoLive.ts`), hier
// folgen im Takt dieser Zeitachse die Effekte und der Klang:
//   - Aktionen der Kino-Endgame-Regie (Faustkämpfer, Himmelssturz): dieselbe 4-Phasen-Zeitachse wie beim Auslöser – Aufbau mit Aura, Entladung
//     und Einschlag aus den Blender-Netzen (`KinoFx.formBuild/formRelease/formImpact`, Ultimates je Bild über `KinoFx.remoteUlt`), Faust-Glut,
//     der 4-Schichten-Klang der Kino-DSP am Ort der Aktion (Panorama und Entfernungs-Dämpfung);
//   - alle anderen Klassen: Clip an der Figur, im Treffermoment die Darstellung aus der Effekt-Schmiede und der Klang der Klasse.
// **Kamera und Impact-Frame gehören allein dem Ausführenden** – hier entsteht nichts davon. Die Bühne meldet nur die Himmelsverdunkelung am
// Ort des Betrachters und den Kamera-Stoß (spürbar näher als 90 m); beides reicht die Welt an Himmel und Kamera weiter.
import { Color } from 'three';
import type { AnimeVfxForge } from '../graphics/animeVfxForge';
import { ACTION_STYLES } from '../data/actionStyles';
import type { ActNet } from '../net/mmoProtocol';
import { audio, type Sfx } from '../audio/audio';
import { elementVoice, formVoiceLayer } from '../audio/classVoices';
import { isBrawlerStyle } from '../graphics/endgameDirector';
import { SEA_CINE_SCALE } from '../graphics/formCinema';
import { chainStage } from '../combat/actionBroadcast';
import type { KinoFx } from './kinoFx';
import { RemoteActionStage, type RemoteCast } from './remoteActionStage';

const _core = new Color(), _acc = new Color(), _ink = new Color(), _heal = new Color(0.45, 2.2, 0.9), _white = new Color(2.4, 2.4, 2.6);
const _at = { x: 0, y: 0, z: 0 };

/** Farben eines Stils (Kern leuchtend für das Überstrahlen, Akzent, Tusche) */
function styleColors(vfx: AnimeVfxForge, style: string) {
  const st = (ACTION_STYLES as Record<string, { color: string; accent: string } | undefined>)[style];
  _core.set(st?.color ?? '#9fe8ff').multiplyScalar(1.7);
  _acc.set(st?.accent ?? '#ffffff').multiplyScalar(1.4);
  vfx.inkOf(_core, _ink);
}

export class RemoteActionFx {
  /** Zähler für Prüfungen */
  readonly stats = { swing: 0, art: 0, geist: 0, heal: 0, ult: 0, kino: 0, builds: 0, releases: 0, impacts: 0 };
  /** Bühne der Mitspieler-Aktionen: Zeitachsen, Posen, Verdunkelung und Kamera-Stoß für den Betrachter */
  readonly stage = new RemoteActionStage();
  private readonly times = { t1: 0, t2: 0, total: 0, silenceMs: 0 };

  constructor(private readonly vfx: AnimeVfxForge, private readonly kino: KinoFx | null = null) {}

  /**
   * Aktion eines Mitspielers `from` beginnen (x, y, z = Füße bzw. Deck, `yaw` = Blickrichtung). Die Effekte folgen in `update` im Takt der
   * Zeitachse; Aktionen der Kino-Endgame-Regie starten hier ihren ganzen 4-Schichten-Klang am Ort der Aktion.
   */
  play(a: ActNet, x: number, y: number, z: number, yaw: number, from = '') {
    const c = this.stage.begin(from || `anon:${a.x.toFixed(0)}:${a.z.toFixed(0)}`, a, x, y, z, yaw);
    if (!c) return;
    this.stats[c.kind]++;
    const tl = c.tl;
    if (!tl || !this.kino || !c.action) return;
    this.stats.kino++;
    if (tl.kind === 'auto') return;
    const tm = this.times;
    tm.t1 = tl.t1; tm.t2 = tl.t2; tm.total = tl.total; tm.silenceMs = tl.silenceMs;
    if (tl.kind === 'ultimate') { _at.x = c.tx; _at.y = c.ty; _at.z = c.tz; audio.kinoBegin(c.action, tm, _at, c.sea, 0.9, true); }
    else { _at.x = x; _at.y = y; _at.z = z; audio.kinoBegin(c.action, tm, _at, c.sea, 0.85, true); }
  }

  /**
   * Je gezeichnetem Bild (Echtzeit): Bühne vorrücken (Betrachter am Ort vx, vz) und die Effekte der laufenden Aktionen im Takt ihrer
   * Zeitachsen ausstoßen. Danach stehen `stage.dark` und `stage.shakeNow` für Himmel und Kamera bereit.
   */
  update(realDt: number, vx: number, vz: number) {
    const st = this.stage;
    if (st.active === 0 && realDt >= 0) {
      // nichts läuft: nur prüfen, ob etwas begonnen hat (kein Durchlauf je Bild ohne Aktionen)
      let any = false;
      for (const c of st.casts) if (c.on) { any = true; break; }
      if (!any) { st.dark = 0; st.shakeNow = 0; return; }
    }
    st.update(realDt, vx, vz);
    for (const c of st.casts) {
      // ein eben beendeter Platz hat sein letztes Bild noch vor sich (Einschlag und Ende im selben Schritt)
      if (!c.on && !(c.impactNow || c.releaseNow)) continue;
      if (c.tl && this.kino) this.stepKino(c, this.kino);
      else this.stepPlain(c);
      if (!c.on) { c.impactNow = false; c.releaseNow = false; }
    }
  }

  /** Aktion der Kino-Endgame-Regie: Aufbau, Entladung, Einschlag aus den Blender-Netzen – dieselbe Zeitachse wie beim Auslöser */
  private stepKino(c: RemoteCast, K: KinoFx) {
    const tl = c.tl!;
    if (tl.kind === 'ultimate') { K.remoteUlt(tl, c.x, c.y, c.z, c.tx, c.ty, c.tz, c.yaw, c.sea, c.t0, c.t); if (c.t0 <= 0) this.stats.builds++; if (c.impactNow) this.stats.impacts++; return; }
    const scale = c.helm ? SEA_CINE_SCALE : 1;
    // vom Steuerrad: die Kraft löst sich an der Bugreling (rund eine halbe Schiffslänge vor der Schiffsmitte)
    let ox = c.x, oz = c.z;
    if (c.helm) { const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz) || 1, bow = Math.min(18, d * 0.4); ox += (dx / d) * bow; oz += (dz / d) * bow; }
    if (tl.kind === 'auto') {
      // vierter Schlag der Kette: Vakuum-Stoß bzw. Erd-Schmetterschlag lösen sich im Schwung
      if (c.releaseNow) { K.formRelease(tl, ox, c.y, oz, c.tx, c.ty, c.tz, c.yaw, 1, c.sea); this.stats.releases++; }
      if (c.impactNow) {
        if (tl.style === 'erdspalter') K.formImpact(tl, c.tx, c.ty, c.tz, c.yaw, 1, false);
        else { styleColors(this.vfx, c.style); this.vfx.surfaceHit(c.tx, c.ty, c.tz, 1.4, _core, 0.9); }
        _at.x = c.x; _at.y = c.y; _at.z = c.z;
        audio.kinoImpact(c.action!, -1, _at, c.sea, 0.6);
        this.stats.impacts++;
      }
      return;
    }
    if (c.t0 <= 0) { K.formBuild(tl, ox, c.y + (c.helm ? 0.3 : 0), oz, c.yaw, scale, c.sea); this.stats.builds++; }
    if (c.releaseNow) { K.formRelease(tl, ox, c.y, oz, c.tx, c.ty, c.tz, c.yaw, scale, c.sea); this.stats.releases++; }
    if (c.impactNow) { K.formImpact(tl, c.tx, c.ty, c.tz, c.yaw, scale, c.sea); this.stats.impacts++; }
  }

  /** Aktion einer Klasse ohne Kino-Regie: im Treffermoment die Darstellung aus der Effekt-Schmiede und der Klang der Klasse */
  private stepPlain(c: RemoteCast) {
    const v = this.vfx;
    const x = c.x, y = c.y, z = c.z, yaw = c.yaw, tx = c.tx, ty = c.ty, tz = c.tz;
    if (c.t0 <= 0 && (c.kind === 'geist' || c.kind === 'ult' || (c.kind === 'art' && c.slot >= 5))) {
      // Aufladung: Aura um die Figur (Spirale und Wirbel in den Farben des Stils)
      styleColors(v, c.style);
      v.auraSwirl(x, y, z, _core, _acc, c.kind === 'ult' ? 1.6 : 1.1, Math.max(0.2, c.t2));
      if (c.kind === 'ult') v.spiral(x, y, z, 1.3, 3.2, _core, Math.max(0.3, c.t2), 3, 8);
      this.stats.builds++;
    }
    if (!c.impactNow) return;
    this.stats.impacts++;
    styleColors(v, c.style);
    _at.x = x; _at.y = y; _at.z = z;
    switch (c.kind) {
      case 'swing': {
        const fx = x + Math.sin(yaw) * 1.3, fz = z + Math.cos(yaw) * 1.3;
        if (isBrawlerStyle(c.style)) {
          // Faustschlag bzw. Tritt: Druckring am Treffpunkt und Funken – kein Klingenbogen
          const st = chainStage(c.n);
          v.pressureRing(fx, y + 1.15, fz, yaw, true, 0.55 + st * 0.12, _acc, 0.2);
          v.burst('spark', fx, y + 1.15, fz, 4 + st, 4, _core, { up: 1, life: 0.25, size: 0.16 });
          audio.play('swing', 0.5, _at);
        } else {
          const st = (ACTION_STYLES as Record<string, { faji?: boolean } | undefined>)[c.style];
          if (st?.faji) { v.bolt(x, y + 1.35, z, tx, ty + 1, tz, _core, 0.18, 0.16, { depth: 3, branches: 0, jitter: 0.1 }); v.burst('spark', tx, ty + 1, tz, 5, 3, _acc, { up: 2, life: 0.4 }); }
          else v.slash(x, y + 1.1, z, yaw, -0.25, (Math.random() - 0.5) * 0.6, 1.7, _core, _ink, { life: 0.18, sparks: 4 });
          audio.play('swing', 0.55, _at);
        }
        break;
      }
      case 'art': {
        const k = 0.65 + Math.min(10, Math.max(1, c.slot)) * 0.075;
        const st = (ACTION_STYLES as Record<string, { faji?: boolean } | undefined>)[c.style];
        if (st?.faji) {
          // Element-Geschoss: Energieader zum Ziel, Einschlag mit Krater bzw. Gischtkrone, Element-Teilchen
          v.bolt(x, y + 1.35, z, tx, ty + 1, tz, _core, 0.35 * k, 0.22, { depth: 4, branches: 2, jitter: 0.08 });
          v.surfaceHit(tx, ty, tz, 2.2 * k, _core, k);
          v.burst(c.el === 'eis' ? 'ice' : c.el === 'wasser' ? 'drop' : c.el === 'feuer' || c.el === 'sonne' ? 'ember' : 'spark', tx, ty + 1, tz, 14, 6 * k, _acc, { up: 4, life: 0.8 });
        } else {
          // Klingen- bzw. Faust-Form: große Sichel, Druckring nach vorn, Bodenreaktion vor dem Kämpfer
          const fx = x + Math.sin(yaw) * 1.6, fz = z + Math.cos(yaw) * 1.6;
          v.slash(x, y + 1.1, z, yaw, -0.2, (Math.random() - 0.5) * 0.8, 2.4 * k, _core, _ink, { life: 0.24, sparks: 8, k });
          v.pressureRing(fx, y + 1, fz, yaw, true, 1.6 * k, _acc, 0.35);
          v.surfaceHit(fx, y, fz, 1.6 * k, _core, k * 0.8);
        }
        audio.play(elementVoice(c.style, c.el, c.slot), 0.75, _at);
        { const layer = formVoiceLayer(c.slot); if (layer) audio.play(layer, 0.4, _at); }
        break;
      }
      case 'geist': {
        if (c.slot === 1) { v.corona(x, y + 1.2, z, yaw, 2.4, _core, _acc, 0.6); v.auraSwirl(x, y, z, _core, _acc, 1.2, 0.5); }
        else if (c.slot === 2) v.spiral(x, y, z, 1.6, 3.4, _core, 0.9, 3, 6);
        else if (c.slot === 3) { v.bolt(tx, ty + 38, tz, tx, ty, tz, _white, 0.6, 0.3, { depth: 5, branches: 3, jitter: 0.12 }); v.surfaceHit(tx, ty, tz, 3.4, _core, 1.2); }
        else { v.pressureRing(x, y + 0.4, z, 0, false, 7, _core, 0.6); v.surfaceHit(x, y, z, 6, _core, 1.4); v.burst('rock', x, y + 0.4, z, 16, 7, _acc, { up: 6, life: 1 }); }
        audio.play((c.slot === 4 ? 'quakeRumble' : c.slot === 3 ? 'thunderClap' : c.slot === 2 ? 'moonChime' : 'cutin') as Sfx, 0.7, _at);
        break;
      }
      case 'heal': {
        v.spiral(x, y, z, 1.4, 3, _heal, 1, 3, 5);
        v.burst('spark', x, y + 1, z, 18, 2.5, _heal, { up: 3, life: 1, grav: -1 });
        v.pressureRing(x, y + 0.3, z, 0, false, Math.max(3, Math.min(14, c.slot || 6)), _heal, 0.7);
        audio.play('sunChoir', 0.5, _at);
        break;
      }
      case 'ult': {
        // Himmels-Wirbel, Energiesäule, radiale Druckringe, glühender Krater, Blitze aus der Wolke – am Einschlagsort
        v.skyVortex(tx, ty + 32, tz, 18, _core, _ink, 1.8, 0.6);
        v.spiral(tx, ty, tz, 3.6, 30, _core, 1.4, 4, 9);
        v.pressureRing(tx, ty + 0.5, tz, 0, false, 16, _acc, 0.9);
        v.pressureRing(tx, ty + 0.5, tz, 0, false, 9, _core, 0.6);
        v.surfaceHit(tx, ty, tz, 10, _core, 1.8);
        for (let i = 0; i < 3; i++) { const a2 = i * 2.1, r = 5 + i * 2; v.bolt(tx + Math.sin(a2) * r, ty + 34, tz + Math.cos(a2) * r, tx + Math.sin(a2) * r * 0.3, ty, tz + Math.cos(a2) * r * 0.3, _white, 0.5, 0.4, { depth: 5, branches: 2, jitter: 0.1 }); }
        v.burst('ember', tx, ty + 2, tz, 40, 14, _acc, { up: 10, life: 1.6 });
        _at.x = tx; _at.y = ty; _at.z = tz;
        audio.play('cineDrop', 0.6, _at);
        audio.play(c.sea ? 'tidalRoar' : 'eruption', 0.9, _at);
        break;
      }
      default: break;
    }
  }

  /** Alles Laufende beenden (Instanz verlassen, Szenenwechsel) */
  reset() { this.stage.reset(); }
}
