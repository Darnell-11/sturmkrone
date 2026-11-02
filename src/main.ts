// Nur lateinische Zeichen (inkl. ä, ö, ü, ß) – spart Download
import '@fontsource/im-fell-english-sc/latin-400.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import '@fontsource/alegreya-sans/latin-800.css';
import './ui/styles.css';
import { Game } from './core/game';
import { WebGLUnavailableError } from './render/renderer';

function fail(message: string) {
  const el = document.createElement('div');
  el.className = 'err';
  el.innerHTML = `<p>${message}</p>`;
  document.body.appendChild(el);
}

try {
  const game = new Game(document.getElementById('game') as HTMLCanvasElement, document.getElementById('ui')!);
  game.start();
  // Zum Ausprobieren in der Browser-Konsole
  (window as any).sturmkrone = game;
  // Nur in der Entwicklung: Bild an einen lokalen Empfänger schicken (für automatische Sichtprüfungen)
  if (import.meta.env.DEV) {
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
  }
} catch (e) {
  console.error(e);
  if (e instanceof WebGLUnavailableError) {
    fail('Dein Gerät oder Browser unterstützt kein WebGL – Sturmkrone braucht 3D-Grafik.<br>Probier einen aktuellen Browser wie Chrome, Edge, Firefox oder Safari.');
  } else {
    fail('Beim Start ist ein Fehler aufgetreten. Bitte lade die Seite neu.');
  }
}
