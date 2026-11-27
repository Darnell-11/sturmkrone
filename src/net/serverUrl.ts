// 4.8.1 – Adresse des MMO-Servers (rein bis auf die übergebenen Speicher): Ein geteilter Link `…/sturmkrone/?server=wss://…` verbindet jeden
// Mitspieler ohne Einstellungen mit demselben Server. Reihenfolge: `?server=` in der Adresse (wird gemerkt) > gemerkte Adresse
// (`localStorage`) > `VITE_MMO_SERVER_URL` aus dem Build > keine (lokaler Shard über BroadcastChannel). `?server=lokal` (oder `off`/`aus`)
// vergisst die gemerkte Adresse wieder.

/** Schlüssel im localStorage */
export const SERVER_STORE_KEY = 'sk-mmo-server';
/** Wert von `?server=`, der den lokalen Shard erzwingt und die gemerkte Adresse löscht */
export const LOCAL_WORDS: readonly string[] = ['lokal', 'local', 'off', 'aus', 'none'];

export type ServerSource = 'url' | 'stored' | 'env' | 'none';
export interface ServerChoice { url: string; source: ServerSource }

/** Minimaler Speicher (localStorage oder Attrappe) */
export interface KeyStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

/** Gültige Server-Adresse: nur ws:// oder wss://, mit Rechnername, höchstens 300 Zeichen; sonst '' */
export function validServerUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s || s.length > 300) return '';
  let u: URL;
  try { u = new URL(s); } catch { return ''; }
  if ((u.protocol !== 'ws:' && u.protocol !== 'wss:') || !u.hostname || u.username || u.password) return '';
  return u.href.replace(/\/$/, u.pathname === '/' ? '' : '/');
}

/** `?server=` aus einer Such-Zeichenkette: Adresse, 'lokal' (vergessen) oder null (nicht angegeben bzw. ungültig) */
export function parseServerParam(search: string): string | 'lokal' | null {
  let v: string | null;
  try { v = new URLSearchParams(search).get('server'); } catch { return null; }
  if (v === null) return null;
  if (LOCAL_WORDS.includes(v.trim().toLowerCase())) return 'lokal';
  return validServerUrl(v) || null;
}

/** Server-Adresse für dieses Spiel bestimmen; `?server=` wird gemerkt bzw. vergessen */
export function resolveServerUrl(search: string, store: KeyStore | null, env: string | undefined): ServerChoice {
  const param = parseServerParam(search);
  if (param === 'lokal') {
    try { store?.removeItem(SERVER_STORE_KEY); } catch { /* privater Modus */ }
    return { url: '', source: 'none' };
  }
  if (param) {
    try { store?.setItem(SERVER_STORE_KEY, param); } catch { /* privater Modus */ }
    return { url: param, source: 'url' };
  }
  let stored = '';
  try { stored = validServerUrl(store?.getItem(SERVER_STORE_KEY) ?? ''); } catch { stored = ''; }
  if (stored) return { url: stored, source: 'stored' };
  const e = validServerUrl(env ?? '');
  return e ? { url: e, source: 'env' } : { url: '', source: 'none' };
}

/** Link zum Weiterschicken: mit Server-Adresse, damit Mitspieler auf demselben Server landen */
export function shareLink(base: string, server: string): string {
  const url = validServerUrl(server);
  if (!url) return base;
  try {
    const u = new URL(base);
    u.searchParams.set('server', url);
    return u.href;
  } catch { return base; }
}

/** Server-Wahl im Browser (einmal je Seite bestimmt) */
let chosen: ServerChoice | null = null;
export function serverChoice(): ServerChoice {
  if (chosen) return chosen;
  let store: KeyStore | null = null;
  try { store = typeof localStorage !== 'undefined' ? localStorage : null; } catch { store = null; }
  const search = typeof location !== 'undefined' ? location.search : '';
  chosen = resolveServerUrl(search, store, import.meta.env?.VITE_MMO_SERVER_URL as string | undefined);
  return chosen;
}
