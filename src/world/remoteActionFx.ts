// Phase 4.9 – Kampf-Aktionen der Mitspieler darstellen (CombatActionBroadcast, Empfänger-Seite): Standard-Angriffe, Formen 1 – 10, Geistes-Faji
// Q/R/T/G, Priester-Heilungen und Ultimates – nur mit den Bausteinen der `AnimeVfxForge` (gleiche Pools, keine neuen Shader-Programme) und den
// vorhandenen Klängen. Wirkung hat nichts davon: Schaden läuft über den Shard (Treffer-Pakete), die Zahlen zeigt der Rückgang des Lebens.
import { Color } from 'three';
import type { AnimeVfxForge } from '../graphics/animeVfxForge';
import { ACTION_STYLES } from '../data/actionStyles';
import type { ActNet } from '../net/mmoProtocol';
import { audio, type Sfx } from '../audio/audio';
import { elementVoice } from '../audio/classVoices';

const _core = new Color(), _acc = new Color(), _ink = new Color(), _heal = new Color(0.45, 2.2, 0.9), _white = new Color(2.4, 2.4, 2.6);

/** Farben eines Stils (Kern leuchtend für das Überstrahlen, Akzent, Tusche) */
function styleColors(vfx: AnimeVfxForge, style: string) {
  const st = (ACTION_STYLES as Record<string, { color: string; accent: string } | undefined>)[style];
  _core.set(st?.color ?? '#9fe8ff').multiplyScalar(1.7);
  _acc.set(st?.accent ?? '#ffffff').multiplyScalar(1.4);
  vfx.inkOf(_core, _ink);
}

export class RemoteActionFx {
  /** Zähler für Prüfungen */
  readonly stats = { swing: 0, art: 0, geist: 0, heal: 0, ult: 0 };

  constructor(private readonly vfx: AnimeVfxForge) {}

  /** Eine Aktion am Ort des Auslösers (x, y, z = Füße bzw. Deck, `yaw` = Blickrichtung) darstellen */
  play(a: ActNet, x: number, y: number, z: number, yaw: number) {
    const v = this.vfx;
    styleColors(v, a.style);
    const tx = a.tx || x + Math.sin(yaw) * 8, tz = a.tz || z + Math.cos(yaw) * 8, ty = a.ty || y;
    const at = { x, y, z };
    switch (a.t) {
      case 'swing': {
        this.stats.swing++;
        v.slash(x, y + 1.1, z, yaw, -0.25, (Math.random() - 0.5) * 0.6, 1.7, _core, _ink, { life: 0.18, sparks: 4 });
        audio.play('swing', 0.55, at);
        break;
      }
      case 'art': {
        this.stats.art++;
        const k = 0.65 + Math.min(10, Math.max(1, a.slot)) * 0.075;
        const st = (ACTION_STYLES as Record<string, { faji?: boolean } | undefined>)[a.style];
        if (st?.faji) {
          // Element-Geschoss: Energieader zum Ziel, Einschlag mit Krater bzw. Gischtkrone, Element-Teilchen
          v.bolt(x, y + 1.35, z, tx, ty + 1, tz, _core, 0.35 * k, 0.22, { depth: 4, branches: 2, jitter: 0.08 });
          v.surfaceHit(tx, ty, tz, 2.2 * k, _core, k);
          v.burst(a.el === 'eis' ? 'ice' : a.el === 'wasser' ? 'drop' : a.el === 'feuer' || a.el === 'sonne' ? 'ember' : 'spark', tx, ty + 1, tz, 14, 6 * k, _acc, { up: 4, life: 0.8 });
        } else {
          // Klingen- bzw. Faust-Form: große Sichel, Druckring nach vorn, Bodenreaktion vor dem Kämpfer
          const fx = x + Math.sin(yaw) * 1.6, fz = z + Math.cos(yaw) * 1.6;
          v.slash(x, y + 1.1, z, yaw, -0.2, (Math.random() - 0.5) * 0.8, 2.4 * k, _core, _ink, { life: 0.24, sparks: 8, k });
          v.pressureRing(fx, y + 1, fz, yaw, true, 1.6 * k, _acc, 0.35);
          v.surfaceHit(fx, y, fz, 1.6 * k, _core, k * 0.8);
        }
        audio.play(elementVoice(a.style, a.el, a.slot), 0.75, at);
        break;
      }
      case 'geist': {
        this.stats.geist++;
        if (a.slot === 1) { v.corona(x, y + 1.2, z, yaw, 2.4, _core, _acc, 0.6); v.auraSwirl(x, y, z, _core, _acc, 1.2, 0.5); }
        else if (a.slot === 2) v.spiral(x, y, z, 1.6, 3.4, _core, 0.9, 3, 6);
        else if (a.slot === 3) { v.bolt(tx, ty + 38, tz, tx, ty, tz, _white, 0.6, 0.3, { depth: 5, branches: 3, jitter: 0.12 }); v.surfaceHit(tx, ty, tz, 3.4, _core, 1.2); }
        else { v.pressureRing(x, y + 0.4, z, 0, false, 7, _core, 0.6); v.surfaceHit(x, y, z, 6, _core, 1.4); v.burst('rock', x, y + 0.4, z, 16, 7, _acc, { up: 6, life: 1 }); }
        audio.play((a.slot === 4 ? 'quakeRumble' : a.slot === 3 ? 'thunderClap' : a.slot === 2 ? 'moonChime' : 'cutin') as Sfx, 0.7, at);
        break;
      }
      case 'heal': {
        this.stats.heal++;
        v.spiral(x, y, z, 1.4, 3, _heal, 1, 3, 5);
        v.burst('spark', x, y + 1, z, 18, 2.5, _heal, { up: 3, life: 1, grav: -1 });
        v.pressureRing(x, y + 0.3, z, 0, false, Math.max(3, Math.min(14, a.slot || 6)), _heal, 0.7);
        audio.play('sunChoir', 0.5, at);
        break;
      }
      case 'ult': {
        this.stats.ult++;
        // Himmels-Wirbel, Energiesäule, radiale Druckringe, glühender Krater, Blitze aus der Wolke – am Einschlagsort
        v.skyVortex(tx, ty + 32, tz, 18, _core, _ink, 1.8, 0.6);
        v.spiral(tx, ty, tz, 3.6, 30, _core, 1.4, 4, 9);
        v.pressureRing(tx, ty + 0.5, tz, 0, false, 16, _acc, 0.9);
        v.pressureRing(tx, ty + 0.5, tz, 0, false, 9, _core, 0.6);
        v.surfaceHit(tx, ty, tz, 10, _core, 1.8);
        for (let i = 0; i < 3; i++) { const a2 = i * 2.1, r = 5 + i * 2; v.bolt(tx + Math.sin(a2) * r, ty + 34, tz + Math.cos(a2) * r, tx + Math.sin(a2) * r * 0.3, ty, tz + Math.cos(a2) * r * 0.3, _white, 0.5, 0.4, { depth: 5, branches: 2, jitter: 0.1 }); }
        v.burst('ember', tx, ty + 2, tz, 40, 14, _acc, { up: 10, life: 1.6 });
        audio.play('cineDrop', 0.6, { x: tx, y: ty, z: tz });
        audio.play(a.sea ? 'tidalRoar' : 'eruption', 0.9, { x: tx, y: ty, z: tz });
        break;
      }
      default: break;
    }
  }
}
