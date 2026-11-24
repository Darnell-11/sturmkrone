// Nur lateinische Zeichen (inkl. ä, ö, ü, ß) – spart Download
import '@fontsource/im-fell-english-sc/latin-400.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import '@fontsource/alegreya-sans/latin-800.css';
// Scharfe Ziffern für Anzeigen und Zahlen
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-700.css';
// Oberfläche: Designsystem in Modulen (Reihenfolge zählt: Werte, Grundlagen, Bausteine, HUD, Bildschirme, Touch)
import './ui/css/tokens.css';
import './ui/css/base.css';
import './ui/css/panels.css';
import './ui/css/hud.css';
import './ui/css/screens.css';
import './ui/css/yard.css';
import './ui/css/touch.css';
import { Game } from './core/game';
import { WebGLUnavailableError } from './render/renderer';
import { loadArchModels, loadEnvModels } from './world/envModels';
import { loadWorldProps } from './world/worldProps';
import { loadFigureheads } from './entities/ship/figureheads';
import { LoadingScreen } from './ui/loadingScreen';
import { preload } from './core/preload';
import { tick } from './core/yield';
import { forgeSizeForTier, forgeStart } from './graphics/pbrMaterialForge';
import { SETTINGS_KEY } from './core/settings';

/**
 * Größe der PBR-Sätze schon vor dem Spiel schätzen (die Grafikstufe erkennt erst `Game`): gespeicherte Stufe, sonst Desktop mit vielen Kernen → Ultra.
 * Die Schmiede rechnet damit parallel zum Laden der Modelle in Web Workern (Phase 4.4A).
 */
function forgeGuess(): number {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as { quality?: string; qualityAuto?: boolean } | null;
    if (s?.quality && !s.qualityAuto) return forgeSizeForTier(s.quality);
    if (s?.quality) return forgeSizeForTier(s.quality);
  } catch { /* keine Einstellungen */ }
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return forgeSizeForTier(mobile ? 'mid' : (navigator.hardwareConcurrency ?? 4) >= 8 ? 'ultra' : 'high');
}

function fail(message: string) {
  const el = document.createElement('div');
  el.className = 'err';
  el.innerHTML = `<p>${message}</p>`;
  document.body.appendChild(el);
}

/**
 * Die Welt (Inseln, Städte, Burgen, Pflanzen) wird schon im Konstruktor des Spiels gebaut. Die Blender-Modelle dafür müssen
 * deshalb vorher geladen sein – sonst bleiben alle Inseln bei den einfachen Eigenbau-Formen (Palmen als Sterne, Kistenhäuser).
 */
async function boot() {
try {
  // Ladeplan (Summe 1): alle Modell-Dateien 23 %, Inseln und Städte aufbauen 30 %, Bewohner erzeugen 10 %, Shader vorbereiten 37 %.
  // Der Ladebildschirm steht schon in index.html; hier bekommt er seinen Fortschritt.
  const loading = new LoadingScreen();
  preload.plan(0.23, { world: 0.3, prepare: 0.1, shaders: 0.37 });
  preload.onProgress((p, phase) => loading.set(p, phase));
  preload.setPhase('Karten und Bauwerke werden geladen …');
  await Promise.all([loadEnvModels(), loadArchModels(), loadWorldProps(), loadFigureheads(), forgeStart(forgeGuess())]).catch((e) => console.warn('Welt-Modelle konnten nicht vorab geladen werden', e));
  // Der Browser soll den Ladebildschirm einmal zeichnen, bevor der Aufbau beginnt
  await tick();
  const game = new Game(document.getElementById('game') as HTMLCanvasElement, document.getElementById('ui')!, true);
  // Startfehler (z. B. Netz weg beim Laden der Figuren) freundlich anzeigen statt unbehandelt in der Konsole
  game.start(loading).catch((e) => { console.error(e); fail('Beim Start ist ein Fehler aufgetreten. Bitte lade die Seite neu.'); });
  // Neue Version aktiv (Service Worker hat gewechselt): im Menü sofort neu laden, mitten im Spiel nicht (der nächste Start nimmt sie)
  if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      if (game.state.is('menu', 'boot')) location.reload();
    });
  }
  // Unbehandelte Fehler kurz einblenden (höchstens drei verschiedene je Sitzung), damit sich „es reagiert nicht“ am Handy melden lässt
  const shown = new Set<string>();
  const report = (msg: string) => {
    const m = msg.slice(0, 120);
    if (shown.size >= 3 || shown.has(m)) return;
    shown.add(m);
    try { game.hud.toast(`Fehler: ${m}`, 6); } catch { /* Oberfläche noch nicht bereit */ }
  };
  window.addEventListener('error', (e) => report(`${e.message || 'unbekannt'}${e.lineno ? ` (Zeile ${e.lineno})` : ''}`));
  window.addEventListener('unhandledrejection', (e) => report(String((e.reason && (e.reason.message ?? e.reason)) || 'unbekannt')));
  // Zum Ausprobieren in der Browser-Konsole
  (window as any).sturmkrone = game;
  // Nur in der Entwicklung: Bild an einen lokalen Empfänger schicken (für automatische Sichtprüfungen)
  if (import.meta.env.DEV) {
    // Prüfwerkzeug für Figuren (Durchstiche, Schichtabstände, Hüllkugeln): await __audit.run()
    void import('./entities/character/audit').then((m) => m.installAudit(game));
    (window as any).__shot = async (name: string, w = 560) => {
      (game as any).render(1, 1 / 60);
      const gl = game.renderer.gl.getContext();
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const full = document.createElement('canvas');
      full.width = W; full.height = H;
      const ctx = full.getContext('2d')!;
      const img = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        const sr = (H - 1 - y) * W * 4, dr = y * W * 4;
        for (let x = 0; x < W * 4; x += 4) { img.data[dr + x] = px[sr + x]; img.data[dr + x + 1] = px[sr + x + 1]; img.data[dr + x + 2] = px[sr + x + 2]; img.data[dr + x + 3] = 255; }
      }
      ctx.putImageData(img, 0, 0);
      const c = document.createElement('canvas');
      c.width = w; c.height = Math.round((w * H) / W);
      c.getContext('2d')!.drawImage(full, 0, 0, c.width, c.height);
      return (await fetch(`http://127.0.0.1:5199/?name=${name}`, { method: 'POST', body: c.toDataURL('image/jpeg', 0.85) })).text();
    };
    // Bildfolgen als Raster (zum Prüfen von Animationen): __grab() je Bild, dann __sheet(name)
    const frames: HTMLCanvasElement[] = [];
    (window as any).__grab = (crop = 0.6) => {
      (game as any).render(1, 1 / 60);
      const gl = game.renderer.gl.getContext();
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const full = document.createElement('canvas');
      full.width = W; full.height = H;
      const ctx = full.getContext('2d')!;
      const img = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        const sr = (H - 1 - y) * W * 4, dr = y * W * 4;
        for (let x = 0; x < W * 4; x += 4) { img.data[dr + x] = px[sr + x]; img.data[dr + x + 1] = px[sr + x + 1]; img.data[dr + x + 2] = px[sr + x + 2]; img.data[dr + x + 3] = 255; }
      }
      ctx.putImageData(img, 0, 0);
      const cw = W * crop, ch = H * crop;
      const c = document.createElement('canvas');
      c.width = 240; c.height = Math.round((240 * ch) / cw);
      c.getContext('2d')!.drawImage(full, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, c.width, c.height);
      frames.push(c);
      return frames.length;
    };
    (window as any).__sheet = async (name: string, cols = 4) => {
      if (!frames.length) return 'leer';
      const fw = frames[0].width, fh = frames[0].height, rows = Math.ceil(frames.length / cols);
      const c = document.createElement('canvas');
      c.width = fw * cols; c.height = fh * rows;
      const x = c.getContext('2d')!;
      frames.forEach((im, i) => { x.drawImage(im, (i % cols) * fw, Math.floor(i / cols) * fh); x.fillStyle = '#000'; x.font = '14px sans-serif'; x.fillText(String(i), (i % cols) * fw + 4, Math.floor(i / cols) * fh + 16); });
      frames.length = 0;
      return (await fetch(`http://127.0.0.1:5199/?name=${name}`, { method: 'POST', body: c.toDataURL('image/jpeg', 0.85) })).text();
    };
  }
} catch (e) {
  console.error(e);
  if (e instanceof WebGLUnavailableError) {
    fail('Dein Gerät oder Browser unterstützt kein WebGL – Sturmkrone braucht 3D-Grafik.<br>Probier einen aktuellen Browser wie Chrome, Edge, Firefox oder Safari.');
  } else {
    fail('Beim Start ist ein Fehler aufgetreten. Bitte lade die Seite neu.');
  }
}
}
void boot();
