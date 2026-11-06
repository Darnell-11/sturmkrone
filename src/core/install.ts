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

/** Brücke der Android-App (nur dort vorhanden): Dateien speichern und Teilen über Android selbst */
interface AppBridge { saveFile?(name: string, text: string): void; share?(text: string): void }
export const appBridge = (): AppBridge | undefined => (window as Window & { SturmApp?: AppBridge }).SturmApp;

/** Läuft das Spiel in der heruntergeladenen App (PC oder Android)? */
export function isApp(): boolean {
  return /SturmkroneApp/.test(navigator.userAgent);
}

/** Läuft das Spiel schon als installierte App? */
export function isInstalled(): boolean {
  return isApp() || matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches
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

const RELEASES = 'https://github.com/Darnell-11/sturmkrone/releases/latest/download/';

export interface AppDownload { label: string; url: string; help: string }

/** Passende App-Datei für dieses Gerät: Windows-PC → Setup.exe, Android → .apk, sonst keine */
export function appDownload(): AppDownload | null {
  if (isApp()) return null;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return {
    label: '⬇️ Android-App laden',
    url: RELEASES + 'Sturmkrone.apk',
    help: 'Die Datei „Sturmkrone.apk“ wird geladen. Öffne sie danach (z. B. in den Downloads) und tippe auf „Installieren“. Fragt dein Handy nach, erlaube einmal „Apps aus dieser Quelle installieren“ – das ist bei Apps außerhalb des Play Stores normal.',
  };
  if (/Windows/i.test(ua) && !/Phone/i.test(ua)) return {
    label: '⬇️ PC-App laden',
    url: RELEASES + 'Sturmkrone-Setup.exe',
    help: 'Die Datei „Sturmkrone-Setup.exe“ wird geladen. Doppelklicke sie danach – Sturmkrone installiert sich in Sekunden und legt ein Symbol auf den Desktop. Zeigt Windows „Der Computer wurde durch Windows geschützt“, klicke auf „Weitere Informationen“ → „Trotzdem ausführen“.',
  };
  return null;
}

/** Link zum Spiel (ohne Entwicklungs-Parameter) */
export function gameUrl(): string {
  if (isApp()) return 'https://darnell-11.github.io/sturmkrone/';
  return location.origin + location.pathname;
}

/** Spiel teilen: Teilen-Menü des Geräts (WhatsApp, Telegram …) oder Link in die Zwischenablage */
export async function shareGame(): Promise<'shared' | 'copied' | 'failed'> {
  const url = isApp() ? 'https://darnell-11.github.io/sturmkrone/' : gameUrl();
  const bridge = appBridge();
  if (bridge?.share) { bridge.share(`Spiel Sturmkrone – ein Anime-Piratenabenteuer, direkt im Browser oder als App auf Handy und PC: ${url}`); return 'shared'; }
  const data = { title: 'Sturmkrone', text: 'Spiel Sturmkrone – ein Anime-Piratenabenteuer, direkt im Browser oder als App auf Handy und PC:', url };
  try {
    if (navigator.share) { await navigator.share(data); return 'shared'; }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed';
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'failed'; }
}
