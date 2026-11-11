import { setConsoleFunction } from 'three';

/**
 * Saubere Konsole: three.js meldet jede Notiz des Shader-Übersetzers als Warnung („WebGLProgram: Program Info Log").
 * Unsere eigenen Shader übersetzen ohne Notizen. Übrig bleibt ein Hinweis aus three.js' eigenem Shader für die
 * Umgebungskarte (PMREM): Direct3D meldet dort X4122, weil eine fest ausgerechnete Konstante minimal gerundet wird.
 * Das ist harmlos und in der Bibliothek nicht abstellbar – nur genau diese Notiz wird ausgefiltert.
 * Alle anderen Meldungen (auch jede andere Shader-Warnung) erscheinen unverändert.
 */
const HARMLOS = /warning X4122:/;

function nurHarmlos(log: string): boolean {
  const lines = log.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((l) => HARMLOS.test(l));
}

let installed = false;
export function installShaderLogFilter() {
  if (installed) return;
  installed = true;
  setConsoleFunction((type, message, ...params) => {
    if (type === 'warn' && message.includes('Program Info Log') && typeof params[0] === 'string' && nurHarmlos(params[0])) return;
    // wie three.js selbst: Meldungen mit Aufrufspur als Fehlerobjekt ausgeben
    const first = params[0] as { isStackTrace?: boolean; getError?: (m: string) => unknown } | undefined;
    if (first && first.isStackTrace && first.getError) console[type](first.getError(message));
    else console[type](message, ...params);
  });
}
