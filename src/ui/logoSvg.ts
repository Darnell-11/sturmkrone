// Sturmkrone-Wappen: Messingmedaillon mit Kompassring, Sturmkrone (Blitz, Saphir und Rubine) über gravierten Wellen.
// Reine Zeichenkette ohne Browser-Zugriff: das Spiel setzt sie ins Hauptmenü, `scripts/build-logo.mjs` schreibt daraus das App-Symbol
// (public/favicon.svg). Jede Zeichnung bekommt eigene Verlaufs-Kennungen, damit mehrere Wappen auf einer Seite sich nicht stören.

let seq = 0;

export interface CrestOptions {
  /** Versionsplakette „3.0“ unten rechts */
  badge?: string | null;
  /** feste Pixelgröße (Standard: füllt den Behälter) */
  size?: number;
  /** ohne Verlaufsfilter und Schriftzug (für das App-Symbol) */
  flat?: boolean;
  /** Kennungs-Vorsatz (für feste Ausgaben wie das App-Symbol) */
  id?: string;
}

const f = (n: number) => +n.toFixed(2);

/** Messingring mit Teilstrichen: 72 Striche (alle 5°), lange Striche alle 30°, Rauten an den vier Himmelsrichtungen */
function ticks(): string {
  let d = '', hi = '';
  for (let i = 0; i < 72; i++) {
    const a = (i * 5 * Math.PI) / 180;
    const len = i % 18 === 0 ? 17 : i % 6 === 0 ? 12 : 6.5;
    const x1 = 200 + Math.sin(a) * 167, y1 = 200 - Math.cos(a) * 167;
    const x2 = 200 + Math.sin(a) * (167 - len), y2 = 200 - Math.cos(a) * (167 - len);
    d += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
    hi += `M${f(x1 + 0.9)} ${f(y1 + 0.9)}L${f(x2 + 0.9)} ${f(y2 + 0.9)}`;
  }
  return `<path d="${hi}" stroke="#fff0bf" stroke-opacity=".5" stroke-width="1.2" fill="none"/><path d="${d}" stroke="#3a2509" stroke-width="1.7" stroke-linecap="round" fill="none"/>`;
}

/** 16 feine Strahlen hinter der Krone */
function rays(): string {
  let d = '';
  for (let i = 0; i < 16; i++) {
    const a = (i * 22.5 * Math.PI) / 180;
    d += `M200 200L${f(200 + Math.sin(a) * 150)} ${f(200 - Math.cos(a) * 150)}`;
  }
  return `<path d="${d}" stroke="#e8c777" stroke-opacity=".11" stroke-width="1.1" fill="none"/>`;
}

export function crestSvg(o: CrestOptions = {}): string {
  const id = o.id ?? `sk${++seq}`;
  const u = (s: string) => `${id}-${s}`;
  const px = o.size ? ` width="${o.size}" height="${o.size}"` : '';
  const shade = o.flat ? '' : ` filter="url(#${u('sh')})"`;
  const badge = o.badge
    ? `<g transform="translate(318 330)"${o.flat ? '' : ` filter="url(#${u('sh')})"`}>
        <circle r="37" fill="url(#${u('ring')})" stroke="#2a1a07" stroke-width="2"/>
        <circle r="30.5" fill="#241508" stroke="#f0d58a" stroke-opacity=".55" stroke-width="1"/>
        <circle r="27" fill="url(#${u('flat')})"/>
        <text x="0" y="9.5" text-anchor="middle" font-family="'Barlow Semi Condensed','Alegreya Sans',sans-serif" font-weight="700" font-size="${o.badge.length > 3 ? 20 : 27}" fill="#2a1a07" stroke="#fff0bf" stroke-opacity=".55" stroke-width=".6" paint-order="stroke">${o.badge}</text>
      </g>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="crest" viewBox="0 0 400 400"${px} role="img" aria-label="Sturmkrone-Wappen">
  <defs>
    <linearGradient id="${u('ring')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c6"/><stop offset=".18" stop-color="#e8c777"/><stop offset=".4" stop-color="#b88a2e"/><stop offset=".55" stop-color="#f0d58a"/><stop offset=".76" stop-color="#9a6f24"/><stop offset="1" stop-color="#5a3e12"/></linearGradient>
    <linearGradient id="${u('flat')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8e09a"/><stop offset=".5" stop-color="#c9a041"/><stop offset="1" stop-color="#7d5a1b"/></linearGradient>
    <radialGradient id="${u('field')}" cx=".5" cy=".36" r=".78"><stop offset="0" stop-color="#2b4760"/><stop offset=".55" stop-color="#15222f"/><stop offset="1" stop-color="#090d13"/></radialGradient>
    <linearGradient id="${u('seaB')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a7d8a"/><stop offset="1" stop-color="#0f2c37"/></linearGradient>
    <linearGradient id="${u('seaF')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a5f6d"/><stop offset="1" stop-color="#0a1f28"/></linearGradient>
    <radialGradient id="${u('blue')}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d4f0ff"/><stop offset=".45" stop-color="#3b8fd0"/><stop offset="1" stop-color="#0f3566"/></radialGradient>
    <radialGradient id="${u('red')}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffd8c8"/><stop offset=".45" stop-color="#d9553f"/><stop offset="1" stop-color="#5f160c"/></radialGradient>
    <radialGradient id="${u('orb')}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff7d8"/><stop offset=".5" stop-color="#e0b650"/><stop offset="1" stop-color="#7a5719"/></radialGradient>
    <clipPath id="${u('clip')}"><circle cx="200" cy="200" r="146"/></clipPath>
    ${o.flat ? '' : `<filter id="${u('sh')}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3.2" flood-color="#000" flood-opacity=".55"/></filter>`}
  </defs>
  <g${shade}>
    <circle cx="200" cy="200" r="190" fill="url(#${u('ring')})" stroke="#2a1a07" stroke-width="2.5"/>
    <circle cx="200" cy="200" r="176" fill="#2a1a07"/>
    <circle cx="200" cy="200" r="172" fill="url(#${u('flat')})"/>
    ${ticks()}
    <circle cx="200" cy="200" r="150" fill="#1d1108" stroke="#f0d58a" stroke-opacity=".5" stroke-width="1.2"/>
    <circle cx="200" cy="200" r="146" fill="url(#${u('field')})"/>
    <path d="M200 4L212 30L200 23L188 30Z M396 200L370 212L377 200L370 188Z M200 396L188 370L200 377L212 370Z M4 200L30 188L23 200L30 212Z" fill="url(#${u('flat')})" stroke="#2a1a07" stroke-width="1.6" stroke-linejoin="round"/>
    <g clip-path="url(#${u('clip')})">
      ${rays()}
      <path d="M0 266C40 248 84 284 126 266S206 250 246 266S326 284 400 258V400H0Z" fill="url(#${u('seaB')})"/>
      <path d="M0 266C40 248 84 284 126 266S206 250 246 266S326 284 400 258" fill="none" stroke="#f0e6c4" stroke-opacity=".6" stroke-width="2"/>
      <path d="M0 292C50 274 92 310 142 292S232 274 282 292S352 308 400 286V400H0Z" fill="url(#${u('seaF')})"/>
      <path d="M0 292C50 274 92 310 142 292S232 274 282 292S352 308 400 286" fill="none" stroke="#e8c777" stroke-opacity=".75" stroke-width="2"/>
      <path d="M30 318C70 306 104 328 150 318M186 330C226 320 262 338 306 326M62 346C98 338 132 354 176 346M230 352C264 346 296 358 336 350" fill="none" stroke="#e8c777" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>
    </g>
    <g${o.flat ? '' : ` filter="url(#${u('sh')})"`}>
      <path d="M108 248V150L131 196L154 124L177 184L200 100L223 184L246 124L269 196L292 150V248Z" fill="url(#${u('ring')})" stroke="#2a1a07" stroke-width="3" stroke-linejoin="round"/>
      <path d="M118 214V172L133 202L154 140L176 196L200 120L224 196L246 140L267 202L282 172V214Z" fill="#241508" fill-opacity=".38"/>
      <path d="M200 132L184 176H197L190 206L216 160H203Z" fill="#fff0bf" stroke="#2a1a07" stroke-width="2" stroke-linejoin="round"/>
      <rect x="104" y="212" width="192" height="40" rx="7" fill="url(#${u('flat')})" stroke="#2a1a07" stroke-width="3"/>
      <rect x="110" y="217" width="180" height="30" rx="4" fill="none" stroke="#fff0bf" stroke-opacity=".5" stroke-width="1.3"/>
      <circle cx="108" cy="150" r="9" fill="url(#${u('orb')})" stroke="#2a1a07" stroke-width="2"/>
      <circle cx="154" cy="124" r="9" fill="url(#${u('orb')})" stroke="#2a1a07" stroke-width="2"/>
      <circle cx="200" cy="100" r="10.5" fill="url(#${u('orb')})" stroke="#2a1a07" stroke-width="2"/>
      <circle cx="246" cy="124" r="9" fill="url(#${u('orb')})" stroke="#2a1a07" stroke-width="2"/>
      <circle cx="292" cy="150" r="9" fill="url(#${u('orb')})" stroke="#2a1a07" stroke-width="2"/>
      <circle cx="200" cy="232" r="11" fill="url(#${u('blue')})" stroke="#2a1a07" stroke-width="2"/>
      <circle cx="166" cy="232" r="6.5" fill="url(#${u('red')})" stroke="#2a1a07" stroke-width="1.6"/>
      <circle cx="234" cy="232" r="6.5" fill="url(#${u('red')})" stroke="#2a1a07" stroke-width="1.6"/>
      <circle cx="136" cy="232" r="4.5" fill="url(#${u('blue')})" stroke="#2a1a07" stroke-width="1.3"/>
      <circle cx="264" cy="232" r="4.5" fill="url(#${u('blue')})" stroke="#2a1a07" stroke-width="1.3"/>
    </g>
    ${badge}
  </g>
</svg>`;
}
