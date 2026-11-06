/**
 * Installieren und Teilen: Sturmkrone ist eine Web-App (PWA). Einmal installiert, startet sie wie eine normale App
 * vom Startbildschirm, im Vollbild, auch ohne Internet, und aktualisiert sich selbst.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let listeners: (() => void)[] = [];

// Chrome, Edge und Samsung Internet melden, dass die App installierbar ist – das Ereignis merken wir uns für den Knopf
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  listeners.forEach((f) => f());
});
addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });

/** Läuft das Spiel schon als installierte App? */
export function isInstalled(): boolean {
  return matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type InstallWay = 'prompt' | 'ios' | 'manual' | 'done';

/** Wie lässt sich das Spiel auf diesem Gerät installieren? */
export function installWay(): InstallWay {
  if (isInstalled()) return 'done';
  if (deferred) return 'prompt';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'manual';
}

export function onInstallChange(f: () => void) { listeners.push(f); return () => { listeners = listeners.filter((x) => x !== f); }; }

/** Installationsdialog des Browsers öffnen. true = installiert */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const r = await e.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
  listeners.forEach((f) => f());
  return r.outcome === 'accepted';
}

/** Anleitung, wenn der Browser keinen Installationsknopf anbietet */
export function installHelp(way: InstallWay): string {
  if (way === 'ios') return 'Auf dem iPhone/iPad in Safari: unten auf das Teilen-Symbol (Quadrat mit Pfeil) tippen → „Zum Home-Bildschirm“ → „Hinzufügen“. Danach startet Sturmkrone wie eine App.';
  if (/Firefox/i.test(navigator.userAgent) && !/Android/i.test(navigator.userAgent)) return 'Firefox am PC kann Web-Apps nicht installieren. Öffne den Link in Chrome oder Edge und klicke dort oben in der Adressleiste auf das Installieren-Symbol – oder spiel einfach hier im Browser weiter.';
  return 'Im Browser-Menü (⋮ oder …) auf „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ tippen. Danach startet Sturmkrone wie eine App – im Vollbild und auch ohne Internet.';
}

/** Link zum Spiel (ohne Entwicklungs-Parameter) */
export function gameUrl(): string {
  return location.origin + location.pathname;
}

/** Spiel teilen: Teilen-Menü des Geräts (WhatsApp, Telegram …) oder Link in die Zwischenablage */
export async function shareGame(): Promise<'shared' | 'copied' | 'failed'> {
  const url = gameUrl();
  const data = { title: 'Sturmkrone', text: 'Spiel Sturmkrone – ein Anime-Piratenabenteuer, direkt im Browser oder als App auf Handy und PC:', url };
  try {
    if (navigator.share) { await navigator.share(data); return 'shared'; }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed';
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'failed'; }
}
