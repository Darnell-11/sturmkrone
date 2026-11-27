// Phase 4.8A – Mehrkanal-Chat (rein: kein DOM): Kanäle mit Farben, Slash-Befehle, Namensauflösung (Namen dürfen Leerzeichen haben),
// Verlauf als Ringpuffer. Die Oberfläche (`ui/chatWindow.ts`) zeigt nur an; geroutet wird autoritativ im Shard (`MmoAuthority`).
//
// Kanäle: **/s** Sagen (weiß, Umkreis 80 m an Land / 350 m auf See), **/p** Gruppe (hellblau), **/w Name Text** Flüstern (magenta, Antwort
// mit **/r** oder Taste R), **/1** bzw. **/welt** Welt (gold, ganzer Shard). Dazu Gruppenbefehle (/einladen, /verlassen, /entfernen,
// /anführer), /betrachten, /anbord, /vonbord und /hilfe.
import { MMO, type ChatChannel, type ChatMessage } from '../net/mmoProtocol';

export interface ChatChannelDef { id: ChatChannel; label: string; color: string; cmd: string }

export const CHAT_DEF: Readonly<Record<ChatChannel, ChatChannelDef>> = {
  sagen: { id: 'sagen', label: 'Sagen', color: '#F4F1EA', cmd: '/s' },
  gruppe: { id: 'gruppe', label: 'Gruppe', color: '#8FD6FF', cmd: '/p' },
  fluestern: { id: 'fluestern', label: 'Flüstern', color: '#F27BE8', cmd: '/w' },
  welt: { id: 'welt', label: 'Welt', color: '#EBC35A', cmd: '/1' },
  system: { id: 'system', label: 'System', color: '#F0D9A0', cmd: '' },
};

/** Kanal einer Zeile ohne Befehl (bleibt nach /s, /p, /1, /w hängen – wie in klassischen MMOs) */
export type StickyChannel = { ch: 'sagen' | 'gruppe' | 'welt' } | { ch: 'fluestern'; to: string };

export type ChatCommand =
  | { kind: 'say'; ch: 'sagen' | 'gruppe' | 'welt'; text: string }
  | { kind: 'whisper'; to: string; text: string }
  | { kind: 'reply'; text: string }
  | { kind: 'invite'; who: string }
  | { kind: 'leave' }
  | { kind: 'kick'; who: string }
  | { kind: 'promote'; who: string }
  | { kind: 'inspect'; who: string }
  | { kind: 'ride' }
  | { kind: 'unride' }
  | { kind: 'help' }
  | { kind: 'channel'; sticky: StickyChannel }
  | { kind: 'error'; text: string }
  | { kind: 'none' };

const CMD: Readonly<Record<string, string>> = {
  s: 'sagen', sagen: 'sagen', say: 'sagen',
  p: 'gruppe', gruppe: 'gruppe', party: 'gruppe',
  w: 'whisper', 'flüstern': 'whisper', fluestern: 'whisper', whisper: 'whisper', t: 'whisper', tell: 'whisper',
  r: 'reply', antworten: 'reply', antwort: 'reply', reply: 'reply',
  '1': 'welt', welt: 'welt', world: 'welt',
  einladen: 'invite', invite: 'invite', inv: 'invite',
  verlassen: 'leave', leave: 'leave',
  entfernen: 'kick', kick: 'kick', rauswerfen: 'kick',
  'anführer': 'promote', anfuehrer: 'promote', promote: 'promote', krone: 'promote',
  betrachten: 'inspect', inspect: 'inspect',
  anbord: 'ride', ride: 'ride', mitfahren: 'ride',
  vonbord: 'unride', unride: 'unride', aussteigen: 'unride',
  hilfe: 'help', help: 'help', '?': 'help',
};

/** Hilfe-Zeilen (/hilfe) */
export const CHAT_HELP: readonly string[] = [
  '/s Text – Sagen (Umkreis 80 m an Land, 350 m auf See)',
  '/p Text – an deine Gruppe',
  '/w Name Text – Flüstern · /r Text oder Taste R – Antworten',
  '/1 Text oder /welt Text – Welt-Chat (ganzer Shard)',
  '/einladen Name · /verlassen · /entfernen Name · /anführer Name',
  '/betrachten Name · /anbord (zum Anführer an Bord) · /vonbord',
];

const lower = (s: string) => s.toLocaleLowerCase('de-DE');

/**
 * Namen am Anfang von `rest` auflösen (Namen dürfen Leerzeichen haben): 1. in Anführungszeichen, 2. längster bekannter Name, 3. eindeutiges
 * Namenswort („Ragna“ für „Ragna Sturmhut“), 4. sonst das erste Wort. Liefert Name und den Rest der Zeile.
 */
export function resolveName(rest: string, names: readonly string[]): { name: string; text: string } {
  const r = rest.trim();
  if (!r) return { name: '', text: '' };
  const q = /^["„“»«']([^"„“»«']+)["„“»«']\s*(.*)$/.exec(r);
  if (q) return { name: q[1].trim(), text: q[2] };
  const lr = lower(r);
  let best = '';
  for (const n of names) {
    const ln = lower(n);
    if (ln.length > best.length && lr.startsWith(ln) && (lr.length === ln.length || lr[ln.length] === ' ')) best = n;
  }
  if (best) return { name: best, text: r.slice(best.length).trim() };
  const sp = r.indexOf(' ');
  const first = sp < 0 ? r : r.slice(0, sp), tail = sp < 0 ? '' : r.slice(sp + 1).trim();
  const lf = lower(first);
  let hit = '', count = 0;
  for (const n of names) if (lower(n).split(/\s+/).includes(lf)) { if (hit !== n) { hit = n; count++; } }
  if (count === 1) return { name: hit, text: tail };
  return { name: first, text: tail };
}

/** Eine Zeile der Eingabe lesen. `names` = bekannte Kapitäne (für Flüstern, Einladen, Betrachten) */
export function parseChatLine(line: string, sticky: StickyChannel, names: readonly string[] = []): ChatCommand {
  const raw = line.replace(/\s+/g, ' ').trim();
  if (!raw) return { kind: 'none' };
  if (!raw.startsWith('/')) {
    const text = raw.slice(0, MMO.chatMax);
    return sticky.ch === 'fluestern' ? { kind: 'whisper', to: sticky.to, text } : { kind: 'say', ch: sticky.ch, text };
  }
  const sp = raw.indexOf(' ');
  const word = lower(sp < 0 ? raw.slice(1) : raw.slice(1, sp));
  const rest = sp < 0 ? '' : raw.slice(sp + 1).trim();
  const what = CMD[word];
  switch (what) {
    case 'sagen': case 'gruppe': case 'welt': {
      const ch = what as 'sagen' | 'gruppe' | 'welt';
      return rest ? { kind: 'say', ch, text: rest.slice(0, MMO.chatMax) } : { kind: 'channel', sticky: { ch } };
    }
    case 'whisper': {
      const { name, text } = resolveName(rest, names);
      if (!name) return { kind: 'error', text: 'Flüstern: /w Name Text' };
      return text ? { kind: 'whisper', to: name, text: text.slice(0, MMO.chatMax) } : { kind: 'channel', sticky: { ch: 'fluestern', to: name } };
    }
    case 'reply': return rest ? { kind: 'reply', text: rest.slice(0, MMO.chatMax) } : { kind: 'error', text: 'Antworten: /r Text' };
    case 'invite': case 'kick': case 'promote': case 'inspect': {
      const { name } = resolveName(rest, names);
      if (!name) return { kind: 'error', text: `/${word} Name` };
      return { kind: what, who: name } as ChatCommand;
    }
    case 'leave': return { kind: 'leave' };
    case 'ride': return { kind: 'ride' };
    case 'unride': return { kind: 'unride' };
    case 'help': return { kind: 'help' };
    default: return { kind: 'error', text: `Unbekannter Befehl „/${word}“ – /hilfe zeigt alle Befehle.` };
  }
}

/** Eine Zeile im Verlauf */
export interface ChatLine extends ChatMessage { n: number; mine: boolean }

/** Verlauf als Ringpuffer (älteste fallen heraus); `n` zählt durch, damit die Oberfläche nur Neues anhängt */
export class ChatLog {
  private readonly lines: ChatLine[] = [];
  private seq = 0;
  constructor(readonly max: number = MMO.chatLog) {}
  push(m: ChatMessage, mine: boolean): ChatLine {
    const l: ChatLine = { ...m, n: ++this.seq, mine };
    this.lines.push(l);
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
    return l;
  }
  get last(): number { return this.seq; }
  /** Zeilen nach Nummer `n` (für die Oberfläche) */
  since(n: number, out: ChatLine[]): ChatLine[] {
    out.length = 0;
    for (const l of this.lines) if (l.n > n) out.push(l);
    return out;
  }
  all(): readonly ChatLine[] { return this.lines; }
  clear() { this.lines.length = 0; }
}

/** Anzeige-Präfix einer Zeile: „[Welt] Name: “, „[Gruppe] Name: “, „Name flüstert: “, „An Name: “, „Name sagt: “ */
export function linePrefix(l: Pick<ChatLine, 'ch' | 'name' | 'toName' | 'mine'>): string {
  switch (l.ch) {
    case 'welt': return `[Welt] ${l.name}: `;
    case 'gruppe': return `[Gruppe] ${l.name}: `;
    case 'fluestern': return l.mine ? `An ${l.toName}: ` : `${l.name} flüstert: `;
    case 'sagen': return `${l.name} sagt: `;
    default: return '';
  }
}

/** Kanal-Hinweis vor der Eingabe („Sagen:“, „Gruppe:“, „An Ragna Sturmhut:“) */
export function stickyLabel(s: StickyChannel): string {
  return s.ch === 'fluestern' ? `An ${s.to}:` : `${CHAT_DEF[s.ch].label}:`;
}
