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
} catch (e) {
  console.error(e);
  if (e instanceof WebGLUnavailableError) {
    fail('Dein Gerät oder Browser unterstützt kein WebGL – Sturmkrone braucht 3D-Grafik.<br>Probier einen aktuellen Browser wie Chrome, Edge, Firefox oder Safari.');
  } else {
    fail('Beim Start ist ein Fehler aufgetreten. Bitte lade die Seite neu.');
  }
}
