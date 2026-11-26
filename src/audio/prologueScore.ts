// Phase 4.7D – der mehrsätzige Prolog-Soundtrack: Klavier, Kriegstrommeln, Untergangs-Blech, Chor, Engelsgesang.
//
// 1. Partitur (rein, prüfbar): `compose(cue)` schreibt jedes Stück als Notenliste – deterministisch, ohne Web Audio. Die Zeiten hängen an
//    `SCORE_SYNC` (data/prologue.ts), dieselben Zahlen, nach denen die Regie Untertitel und Bilder setzt: das Klavier fadet genau beim
//    „Doch wenn der Wind sich dreht …“ aus, der Endkampf-Soundtrack bricht genau auf „Tod“ los.
// 2. Klangerzeugung: `renderScore` rechnet jedes Stück EINMAL im Ladescreen mit einem OfflineAudioContext in einen Audio-Puffer (Mono,
//    24 kHz – rund 11 MB für alle Sätze). Während des Prologs entsteht kein einziger Oszillator: nur Puffer-Wiedergabe.
// 3. Wiedergabe: `PrologueScorePlayer` spielt die Puffer über einen eigenen Bus mit großem Hall in den Musik-Bus; die Regie (Echtzeit) ist
//    die Uhr – weicht die Musik ab (Pause, versteckter Tab), setzt `sync` sie auf die Regie-Zeit zurück. Der Heldentrack der Sturmjagd hat
//    einen nahtlosen Endlos-Teil (der Nachhall des Schleifenendes ist an den Anfang gefaltet), weil die Deck-Szene beliebig lange dauert.
import { SCORE_SYNC, type ScoreCue } from '../data/prologue';

export type Instr =
  | 'piano' | 'taiko' | 'timpani' | 'lowBrass' | 'horn' | 'trumpet' | 'strings' | 'cello' | 'spiccato'
  | 'choir' | 'angel' | 'celesta' | 'cymbal' | 'swell' | 'sub' | 'thunder';

/** Eine Note: Instrument, Start und Dauer (s), Tonhöhe(n) als MIDI-Nummer, Stärke 0 … 1, `p` = Tonhöhenfaktor (Trommeln) */
export interface Note { i: Instr; t: number; d: number; m: readonly number[]; v: number; p?: number }

export interface Movement {
  id: ScoreCue | 'gegenangriff_loop';
  /** Länge des Puffers (s) */
  len: number;
  notes: Note[];
  /** Endlos-Teil: Länge der Schleife (der Nachhall danach wird an den Anfang gefaltet) */
  loop?: number;
  /** harter Schluss am Pufferende (Szene 1: absolute Stille), sonst klingt das Stück aus */
  hardEnd?: boolean;
}

/** Was je Stück gerendert wird: der Heldentrack besteht aus Auftakt und Endlos-Teil */
export const SCORE_PARTS: readonly Movement['id'][] = ['hafen', 'untergang', 'gegenangriff', 'gegenangriff_loop', 'engel', 'schwur', 'hoffnung'];
export const SCORE_RATE = 24000;

// ---------------------------------------------------------------------------------------------------------------
// Partitur
// ---------------------------------------------------------------------------------------------------------------

/** fester Zufall für menschliche Unschärfe (Anschlag ±, Timing ±) */
function lcg(seed: number) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));

/** Satz 1 „Hafen“: ruhiges Klavier in D-Dur, ab dem zweiten Satz leise Trommeln, beim Winddreh Beschleunigung, Crescendo, harter Stopp */
function hafen(): Movement {
  const S = SCORE_SYNC, t0 = S.hafenStart;
  const end = S.stop - t0;
  const drumsIn = S.drumsIn - t0, turn = S.windTurn - t0, gone = S.pianoGone - t0, cresc = S.crescendo - t0;
  const notes: Note[] = [];
  const rnd = lcg(0x4af3);
  const beat = 60 / 66, bar = beat * 4, e8 = beat / 2;
  // Akkorde: D – A/C# – Bm – G – Em7 – A – D (Bass, dann vier Töne für das gebrochene Akkord-Muster der linken Hand)
  const chords = [[38, 45, 50, 54, 57], [37, 45, 49, 52, 57], [35, 42, 47, 50, 54], [31, 38, 43, 47, 50], [40, 47, 50, 55, 59], [33, 40, 45, 49, 52], [38, 45, 50, 54, 57]];
  const pattern = [0, 1, 2, 3, 4, 3, 2, 1];
  // Lautstärke des Klaviers: warm, ab dem zweiten Satz immer leiser, beim Winddreh fadet es ganz aus
  const pv = (t: number) => (t < drumsIn ? 0.82 : t < drumsIn + 5 ? lerp(0.82, 0.55, (t - drumsIn) / 5) : t < turn ? lerp(0.55, 0.42, (t - drumsIn - 5) / (turn - drumsIn - 5)) : lerp(0.42, 0, (t - turn) / (gone - turn)));
  for (let bi = 0; bi < chords.length; bi++) {
    const c = chords[bi];
    for (let k = 0; k < 8; k++) {
      const t = 0.05 + bi * bar + k * e8 + (rnd() - 0.5) * 0.012;
      const v = pv(t) * (k === 0 ? 0.62 : 0.4 + rnd() * 0.08);
      if (t < gone && v > 0.01) notes.push({ i: 'piano', t, d: e8 * (k === 0 ? 4 : 2.2), m: [c[pattern[k]]], v });
    }
  }
  // rechte Hand: schlichte, singende Melodie (Viertel = 1)
  const mel: [number, number][][] = [
    [[66, 2], [69, 1], [74, 1]], [[73, 2], [71, 1], [69, 1]], [[71, 1.5], [69, 0.5], [66, 2]], [[67, 1], [69, 1], [71, 1], [74, 1]],
    [[76, 2], [74, 1], [71, 1]], [[73, 2], [69, 2]], [[69, 4]],
  ];
  for (let bi = 0; bi < mel.length; bi++) {
    let b = 0;
    for (const [m, len] of mel[bi]) {
      const t = 0.05 + bi * bar + b * beat + 0.01 + (rnd() - 0.5) * 0.01;
      const v = pv(t) * 0.78;
      if (t < gone && v > 0.01) notes.push({ i: 'piano', t, d: len * beat * 1.05, m: [m, m - 12], v });
      b += len;
    }
  }
  // Trommeln: erst alle zwei Schläge, dann jeder Schlag, beim Winddreh immer schneller und lauter, am Ende ein Wirbel bis zum Stopp
  let t = drumsIn;
  let n = 0;
  while (t < end - 0.04) {
    let gap: number, v: number;
    if (t < drumsIn + 5) { gap = beat * 2; v = 0.17 + 0.06 * ((t - drumsIn) / 5); }
    else if (t < turn) { gap = beat; v = 0.24 + 0.06 * ((t - drumsIn - 5) / Math.max(0.1, turn - drumsIn - 5)); }
    else if (t < cresc) { const k = (t - turn) / (cresc - turn); gap = beat * Math.pow(0.34, k); v = lerp(0.3, 0.55, k); }
    else { const k = (t - cresc) / (end - cresc); gap = Math.max(0.075, 0.31 * Math.pow(0.24, k)); v = lerp(0.55, 1, k); }
    notes.push({ i: 'taiko', t, d: 0.7, m: [0], v, p: n % 2 && t > turn ? 0.92 : 0.62 });
    t += gap;
    n++;
  }
  // Crescendo: Paukenwirbel, Becken- und Sub-Anschwellen bis zum harten Stopp
  for (let tt = cresc + 1.6; tt < end - 0.03; tt += 0.085) notes.push({ i: 'timpani', t: tt, d: 0.5, m: [38], v: lerp(0.15, 0.7, (tt - cresc - 1.6) / (end - cresc - 1.6)) });
  notes.push({ i: 'swell', t: cresc + 1.8, d: end - cresc - 1.8, m: [0], v: 0.55 });
  notes.push({ i: 'sub', t: cresc + 1.2, d: end - cresc - 1.2, m: [26], v: 0.5 });
  return { id: 'hafen', len: end, notes, hardEnd: true };
}

/** Satz 2 „Untergang“: der Endkampf – Schlag genau auf „Tod“, dann Kriegstrommeln, Untergangs-Blech, vielstimmiger Chor, Sub-Bass-Donner */
function untergang(): Movement {
  const notes: Note[] = [];
  const h = 0.05;
  // der Schlag
  notes.push({ i: 'timpani', t: h, d: 1.4, m: [38], v: 1 }, { i: 'taiko', t: h, d: 0.8, m: [0], v: 1, p: 0.78 }, { i: 'taiko', t: h + 0.01, d: 0.8, m: [0], v: 0.9, p: 1.05 });
  notes.push({ i: 'sub', t: h, d: 3.2, m: [26], v: 1 }, { i: 'thunder', t: h, d: 3.6, m: [0], v: 0.85 }, { i: 'cymbal', t: h, d: 3.2, m: [0], v: 0.7 });
  notes.push({ i: 'lowBrass', t: h, d: 2.4, m: [38, 45, 50], v: 1 }, { i: 'choir', t: h, d: 3.0, m: [50, 53, 57, 62], v: 0.95 }, { i: 'horn', t: h + 0.02, d: 2.3, m: [62, 65, 69], v: 0.75 });
  const beat = 0.6, bar = beat * 4, e8 = beat / 2;
  const t0 = 2.45;
  const roots = [38, 34, 31, 33];
  const choirs = [[50, 53, 57, 62], [50, 53, 58, 62], [50, 55, 58, 62], [49, 52, 57, 61]];
  const ost = [50, 50, 53, 50, 50, 55, 50, 52];
  const taiko = [1, 0, 0.55, 0, 0.9, 0.45, 0.6, 0.4];
  const motif: [number, number][] = [[62, 1], [65, 1], [64, 1], [62, 0.5], [61, 0.5]];
  for (let bi = 0; bi < 10; bi++) {
    const bt = t0 + bi * bar;
    if (bt > 25.5) break;
    const k = bi < 4 ? 0.75 : bi < 8 ? 0.9 : 1;
    const ci = Math.floor(bi / 2) % 4;
    for (let s = 0; s < 8; s++) {
      const t = bt + s * e8;
      if (taiko[s] > 0) notes.push({ i: 'taiko', t, d: 0.7, m: [0], v: taiko[s] * 0.62 * k, p: s % 4 === 0 ? 0.8 : 1.15 });
      notes.push({ i: 'spiccato', t, d: 0.13, m: [ost[s] + (ci === 1 ? -4 : ci === 2 ? -7 : ci === 3 ? -5 : 0)], v: (s === 0 ? 0.5 : 0.34) * k });
    }
    notes.push({ i: 'lowBrass', t: bt, d: 1.1, m: [roots[ci], roots[ci] + 7], v: 0.78 * k }, { i: 'lowBrass', t: bt + beat * 2, d: 0.5, m: [roots[ci]], v: 0.6 * k });
    notes.push({ i: 'timpani', t: bt, d: 1, m: [roots[ci] + 12], v: 0.6 * k });
    notes.push({ i: 'cello', t: bt, d: bar * 0.98, m: [roots[ci]], v: 0.42 * k });
    if (bi % 2 === 0) notes.push({ i: 'choir', t: bt, d: bar * 2 - 0.1, m: choirs[ci], v: 0.62 * k + (bi >= 6 ? 0.15 : 0) });
    // Untergangs-Motiv in den Hörnern (jede zweite Phrase), Trompeten-Stöße am Ende
    if (bi % 4 === 1) { let b = 0; for (const [m, l] of motif) { notes.push({ i: 'horn', t: bt + b * beat, d: l * beat * 0.95, m: [m, m - 12], v: 0.7 * k }); b += l; } }
    if (bi >= 6) for (const s of [0, 3, 6]) notes.push({ i: 'trumpet', t: bt + s * e8, d: 0.22, m: [74, 77], v: 0.4 });
    if (bi % 4 === 3) notes.push({ i: 'swell', t: bt + bar * 0.5, d: bar * 0.5, m: [0], v: 0.5 });
    if (bi % 4 === 0) { notes.push({ i: 'sub', t: bt, d: 2.4, m: [26], v: 0.65 * k }, { i: 'thunder', t: bt + 0.1, d: 3, m: [0], v: 0.5 * k }); }
  }
  return { id: 'untergang', len: 26, notes };
}

/** Satz 3 „Gegenangriff“: hoffnungsvoll und gewaltig – Auftakt (Schrei) und ein nahtloser Endlos-Teil für die Sturmjagd */
const HERO_BEAT = 60 / 104, HERO_BAR = HERO_BEAT * 4;
export const HERO_INTRO = 4.6;
export const HERO_LOOP = HERO_BAR * 8;

function gegenangriff(): Movement {
  const notes: Note[] = [];
  notes.push({ i: 'timpani', t: 0.02, d: 1.3, m: [38], v: 1 }, { i: 'taiko', t: 0.02, d: 0.8, m: [0], v: 0.95, p: 0.82 }, { i: 'cymbal', t: 0.02, d: 2.6, m: [0], v: 0.6 });
  notes.push({ i: 'horn', t: 0.04, d: 2.2, m: [62, 66, 69], v: 0.85 }, { i: 'choir', t: 0.04, d: 2.6, m: [50, 57, 62, 66], v: 0.8 }, { i: 'lowBrass', t: 0.03, d: 2, m: [38, 45], v: 0.9 });
  notes.push({ i: 'strings', t: 1.2, d: HERO_INTRO - 1.2, m: [62, 66, 69, 74], v: 0.6 });
  for (let t = 2.3, k = 0; t < HERO_INTRO - 0.05; t += HERO_BEAT / 2, k++) notes.push({ i: 'taiko', t, d: 0.6, m: [0], v: 0.25 + 0.5 * (t - 2.3) / (HERO_INTRO - 2.3), p: k % 2 ? 1.1 : 0.85 });
  notes.push({ i: 'swell', t: 3.0, d: HERO_INTRO - 3.0, m: [0], v: 0.55 });
  return { id: 'gegenangriff', len: HERO_INTRO, notes };
}

function gegenangriffLoop(): Movement {
  const notes: Note[] = [];
  const beat = HERO_BEAT, bar = HERO_BAR, e8 = beat / 2;
  // D – Bm – G – A – D – F#m – G – A
  const chords = [[38, 62, 66, 69], [35, 62, 66, 71], [31, 62, 67, 71], [33, 61, 64, 69], [38, 62, 66, 69], [42, 61, 66, 69], [31, 62, 67, 71], [33, 61, 64, 69]];
  const mel: [number, number][][] = [
    [[62, 1], [69, 1.5], [67, 0.5], [66, 1]], [[64, 1], [66, 1], [62, 2]], [[67, 1.5], [66, 0.5], [64, 1], [62, 1]], [[64, 3], [61, 1]],
    [[62, 1], [69, 1.5], [71, 0.5], [74, 1]], [[73, 2], [69, 2]], [[71, 1], [74, 1], [76, 1], [74, 1]], [[73, 3], [69, 1]],
  ];
  for (let bi = 0; bi < 8; bi++) {
    const bt = bi * bar, c = chords[bi];
    const root = c[0];
    // treibende Spiccato-Achtel auf den Akkordtönen
    const sp = [root + 12, c[2] - 12, root + 12, c[3] - 12, root + 24, c[2] - 12, root + 12, c[3] - 12];
    for (let s = 0; s < 8; s++) notes.push({ i: 'spiccato', t: bt + s * e8, d: 0.12, m: [sp[s]], v: s % 4 === 0 ? 0.46 : 0.32 });
    notes.push({ i: 'cello', t: bt, d: bar * 0.98, m: [root], v: 0.4 });
    notes.push({ i: 'timpani', t: bt, d: 1, m: [root + (root < 36 ? 12 : 0)], v: 0.55 });
    notes.push({ i: 'taiko', t: bt, d: 0.7, m: [0], v: 0.62, p: 0.82 }, { i: 'taiko', t: bt + beat * 2, d: 0.7, m: [0], v: 0.5, p: 0.95 });
    if (bi === 3 || bi === 7) for (let s = 0; s < 4; s++) notes.push({ i: 'taiko', t: bt + beat * 3 + s * beat / 4, d: 0.5, m: [0], v: 0.3 + s * 0.1, p: 1.15 });
    notes.push({ i: 'choir', t: bt, d: bar - 0.05, m: c.slice(1), v: 0.42 + (bi >= 4 ? 0.1 : 0) });
    notes.push({ i: 'strings', t: bt, d: bar, m: c.slice(1).map((m) => m + 12), v: 0.28 });
    // Heldenmelodie in den Hörnern, in der zweiten Hälfte von Trompeten verdoppelt
    let b = 0;
    for (const [m, l] of mel[bi]) {
      notes.push({ i: 'horn', t: bt + b * beat, d: l * beat * 0.96, m: [m], v: 0.7 });
      if (bi >= 4) notes.push({ i: 'trumpet', t: bt + b * beat, d: l * beat * 0.9, m: [m], v: 0.36 });
      b += l;
    }
    if (bi === 3 || bi === 7) notes.push({ i: 'swell', t: bt + bar * 0.5, d: bar * 0.5, m: [0], v: 0.42 });
    if (bi === 0 || bi === 4) notes.push({ i: 'cymbal', t: bt, d: 2.2, m: [0], v: 0.4 });
  }
  return { id: 'gegenangriff_loop', len: HERO_LOOP + 2.6, loop: HERO_LOOP, notes };
}

/** Satz 4 „Engel“: traurig, aber leicht hoffnungsvoll – Engelsgesang (Sopran „u“), hohe Streicher, Celesta, h-Moll mit Dur-Licht */
function engel(): Movement {
  const notes: Note[] = [];
  const beat = 60 / 56, bar = beat * 4;
  const chords = [[59, 66, 71, 74], [55, 67, 71, 74], [50, 66, 69, 74], [57, 64, 69, 73], [59, 66, 71, 74], [55, 67, 71, 74]];
  const mel: [number, number][][] = [[[74, 2], [73, 1], [71, 1]], [[74, 2], [76, 2]], [[78, 3], [76, 1]], [[76, 2], [73, 2]], [[74, 2], [71, 2]], [[74, 3], [78, 1]]];
  for (let bi = 0; bi < chords.length; bi++) {
    const bt = 0.1 + bi * bar, c = chords[bi];
    notes.push({ i: 'angel', t: bt, d: bar + 0.4, m: c.slice(1), v: 0.62 });
    notes.push({ i: 'cello', t: bt, d: bar, m: [c[0] - 12], v: 0.22 });
    notes.push({ i: 'strings', t: bt, d: bar + 0.3, m: c.slice(1).map((m) => m + 12), v: 0.2 });
    for (let s = 0; s < 8; s++) notes.push({ i: 'celesta', t: bt + s * beat / 2, d: 0.9, m: [c[1 + (s % 3)] + 12], v: 0.16 + (s === 0 ? 0.06 : 0) });
    let b = 0;
    for (const [m, l] of mel[bi]) { notes.push({ i: 'angel', t: bt + b * beat, d: l * beat * 1.02, m: [m], v: 0.5 }); b += l; }
  }
  return { id: 'engel', len: 0.1 + chords.length * bar + 2.5, notes };
}

/** Satz 5 „Schwur“: Gänsehaut – Wirbel, wuchtiger Trommel- und Chor-Einsatz auf den Aufschrei, je Admirals-Schnitt ein Schlag */
function schwur(): Movement {
  const S = SCORE_SYNC, t0 = S.oathIn;
  const notes: Note[] = [];
  const hit = S.oath - t0;
  for (let k = 0; k < 8; k++) notes.push({ i: 'taiko', t: k * (hit / 8), d: 0.5, m: [0], v: 0.2 + k * 0.08, p: 1.05 });
  notes.push({ i: 'swell', t: 0, d: hit, m: [0], v: 0.6 });
  notes.push({ i: 'timpani', t: hit, d: 1.4, m: [38], v: 1 }, { i: 'taiko', t: hit, d: 0.8, m: [0], v: 1, p: 0.75 }, { i: 'taiko', t: hit + 0.015, d: 0.8, m: [0], v: 0.85, p: 1.0 });
  notes.push({ i: 'sub', t: hit, d: 3, m: [26], v: 0.95 }, { i: 'cymbal', t: hit, d: 3, m: [0], v: 0.65 }, { i: 'lowBrass', t: hit, d: 3, m: [38, 45, 50], v: 0.95 });
  notes.push({ i: 'choir', t: hit, d: 4.0, m: [50, 53, 57, 62, 65], v: 1 }, { i: 'horn', t: hit + 0.03, d: 3, m: [62, 65, 69], v: 0.7 });
  // die sieben Schnitte über die Admirale: je ein Schlag mit Blech-Stoß, der Chor wechselt auf B-Dur und A-Dur
  for (let i = 0; i < 7; i++) {
    const t = S.reactFrom + i * S.reactGap - t0;
    notes.push({ i: 'taiko', t, d: 0.7, m: [0], v: 0.75, p: i % 2 ? 1.1 : 0.85 }, { i: 'lowBrass', t, d: 0.34, m: [i < 3 ? 38 : i < 6 ? 34 : 33], v: 0.65 }, { i: 'timpani', t, d: 0.9, m: [i < 3 ? 50 : i < 6 ? 46 : 45], v: 0.5 });
  }
  notes.push({ i: 'choir', t: S.reactFrom + 3 * S.reactGap - t0, d: 2.6, m: [50, 53, 58, 62], v: 0.85 }, { i: 'choir', t: S.reactFrom + 6 * S.reactGap - t0, d: 2.4, m: [49, 52, 57, 61], v: 0.85 });
  return { id: 'schwur', len: 9.5, notes };
}

/** Satz 6 „Hoffnung“: der Engelsgesang, wärmer – D-Dur, Chor „o“, warme Streicher, Celesta, am Ende ein leises Horn */
function hoffnung(): Movement {
  const notes: Note[] = [];
  const beat = 60 / 70, bar = beat * 4;
  const chords = [[50, 62, 66, 69], [43, 62, 67, 71], [47, 62, 66, 71], [45, 61, 64, 69]];
  const mel: [number, number][][] = [[[74, 2], [78, 2]], [[79, 3], [78, 1]], [[78, 2], [74, 2]], [[76, 4]]];
  for (let bi = 0; bi < chords.length; bi++) {
    const bt = 0.1 + bi * bar, c = chords[bi];
    notes.push({ i: 'choir', t: bt, d: bar + 0.5, m: c.slice(1), v: 0.45 });
    notes.push({ i: 'angel', t: bt, d: bar + 0.5, m: c.slice(1).map((m) => m + 12), v: 0.36 });
    notes.push({ i: 'strings', t: bt, d: bar + 0.4, m: [c[0] + 12, ...c.slice(1)], v: 0.32 });
    notes.push({ i: 'cello', t: bt, d: bar, m: [c[0]], v: 0.3 });
    for (let s = 0; s < 8; s++) notes.push({ i: 'celesta', t: bt + s * beat / 2, d: 1.1, m: [c[1 + (s % 3)] + 12], v: 0.15 });
    let b = 0;
    for (const [m, l] of mel[bi]) { notes.push({ i: 'angel', t: bt + b * beat, d: l * beat * 1.02, m: [m], v: 0.42 }); b += l; }
  }
  notes.push({ i: 'horn', t: 0.1 + 3 * bar, d: bar, m: [62, 69], v: 0.3 });
  return { id: 'hoffnung', len: 0.1 + chords.length * bar + 2.4, notes };
}

const COMPOSERS: Record<Movement['id'], () => Movement> = {
  hafen, untergang, gegenangriff, gegenangriff_loop: gegenangriffLoop, engel, schwur, hoffnung,
};

/** Ein Stück als Notenliste (rein, deterministisch) */
export function compose(id: Movement['id']): Movement { return COMPOSERS[id](); }

/** Stimmen eines Stücks: die Anzahl der Oszillatoren, die die Klangerzeugung anlegt (Prüfungen: Rechenaufwand im Ladescreen) */
export function voiceCount(mv: Movement): number {
  let n = 0;
  for (const no of mv.notes) {
    const k = no.i === 'choir' || no.i === 'angel' ? 2 : no.i === 'strings' ? 2 : no.i === 'lowBrass' ? 2 : no.i === 'piano' ? 2 : 1;
    n += k * Math.max(1, no.m.length);
  }
  return n;
}

// ---------------------------------------------------------------------------------------------------------------
// Klangerzeugung (OfflineAudioContext, nur im Browser)
// ---------------------------------------------------------------------------------------------------------------

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Kit { c: BaseAudioContext; out: AudioNode; noise: AudioBuffer; piano: PeriodicWave; celesta: PeriodicWave }

function makeKit(c: BaseAudioContext, out: AudioNode): Kit {
  const n = c.sampleRate * 2;
  const noise = c.createBuffer(1, n, c.sampleRate);
  const d = noise.getChannelData(0);
  const r = lcg(0x51e7);
  for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  // Klavier: Grundton mit abnehmenden Obertönen; Celesta: Glockenklang (hoher, fast unharmonischer vierter Teilton)
  const piano = c.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.42, 0.18, 0.09, 0.045, 0.02]));
  const celesta = c.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.05, 0.02, 0.32]));
  return { c, out, noise, piano, celesta };
}

function env(g: GainNode, t: number, peak: number, atk: number, hold: number, rel: number) {
  const p = Math.max(0.0002, peak);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(p, t + Math.max(0.002, atk));
  if (hold > atk) g.gain.setValueAtTime(p, t + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(hold, atk) + rel);
}

function osc(k: Kit, type: OscillatorType | PeriodicWave, f: number, t: number, stop: number, dst: AudioNode, det = 0): OscillatorNode {
  const o = k.c.createOscillator();
  if (type instanceof PeriodicWave) o.setPeriodicWave(type); else o.type = type as OscillatorType;
  o.frequency.value = f; o.detune.value = det;
  o.connect(dst); o.start(t); o.stop(stop);
  return o;
}

function noiseSrc(k: Kit, t: number, d: number, dst: AudioNode, seed: number) {
  const s = k.c.createBufferSource();
  s.buffer = k.noise; s.loop = true;
  s.connect(dst); s.start(t, (seed * 0.137) % 1.8); s.stop(t + d);
}

function filt(k: Kit, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = k.c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
}

function play(k: Kit, n: Note, idx: number) {
  const c = k.c, t = n.t, v = n.v;
  switch (n.i) {
    case 'piano': {
      for (const m of n.m) {
        const f = mtof(m), g = c.createGain(), lp = filt(k, 'lowpass', Math.min(9000, f * 9), 0.5);
        const decay = 1.6 + Math.max(0, 70 - m) * 0.05;
        lp.frequency.setValueAtTime(Math.min(9000, f * 10), t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2.5), t + decay);
        env(g, t, 0.22 * v, 0.004, 0.004, n.d + decay * 0.6);
        lp.connect(g); g.connect(k.out);
        const end = t + n.d + decay * 0.65 + 0.05;
        osc(k, k.piano, f, t, end, lp, -2); osc(k, k.piano, f, t, end, lp, 2.5);
      }
      break;
    }
    case 'taiko': {
      const p = n.p ?? 1, g = c.createGain(), o = c.createOscillator();
      o.type = 'sine'; o.frequency.setValueAtTime(95 * p, t); o.frequency.exponentialRampToValueAtTime(38 * p, t + 0.42);
      env(g, t, 0.75 * v, 0.004, 0.004, 0.75);
      o.connect(g); g.connect(k.out); o.start(t); o.stop(t + 0.85);
      const ng = c.createGain(), lp = filt(k, 'lowpass', 340 * p);
      env(ng, t, 0.5 * v, 0.002, 0.002, 0.18);
      lp.connect(ng); ng.connect(k.out);
      noiseSrc(k, t, 0.22, lp, idx);
      break;
    }
    case 'timpani': {
      const f = mtof(n.m[0]), g = c.createGain(), o = c.createOscillator();
      o.type = 'sine'; o.frequency.setValueAtTime(f * 1.05, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      env(g, t, 0.55 * v, 0.004, 0.004, Math.max(0.6, n.d));
      o.connect(g); g.connect(k.out); o.start(t); o.stop(t + Math.max(0.6, n.d) + 0.05);
      const ng = c.createGain(), bp = filt(k, 'bandpass', f * 3, 1.2);
      env(ng, t, 0.3 * v, 0.002, 0.002, 0.12);
      bp.connect(ng); ng.connect(k.out); noiseSrc(k, t, 0.15, bp, idx);
      break;
    }
    case 'lowBrass': case 'horn': case 'trumpet': {
      const brass = n.i === 'lowBrass', tr = n.i === 'trumpet';
      for (const m of n.m) {
        const f = mtof(m), g = c.createGain(), lp = filt(k, 'lowpass', 400, brass ? 3 : tr ? 1.5 : 1.2);
        const top = brass ? 1300 : tr ? 4200 : 1600, rest = brass ? 560 : tr ? 2200 : 900;
        lp.frequency.setValueAtTime(brass ? 260 : tr ? 900 : 380, t); lp.frequency.exponentialRampToValueAtTime(top, t + (brass ? 0.07 : tr ? 0.05 : 0.12));
        lp.frequency.exponentialRampToValueAtTime(rest, t + Math.max(0.15, n.d));
        const amp = (brass ? 0.16 : tr ? 0.09 : 0.11) * v / Math.sqrt(n.m.length);
        env(g, t, amp, brass ? 0.03 : tr ? 0.03 : 0.08, n.d * 0.7, n.d * 0.3 + 0.25);
        lp.connect(g); g.connect(k.out);
        const end = t + n.d + 0.3;
        osc(k, 'sawtooth', f, t, end, lp, -6); osc(k, brass ? 'sawtooth' : 'triangle', brass ? f / 2 : f, t, end, lp, 5);
      }
      break;
    }
    case 'strings': {
      const g = c.createGain(), lp = filt(k, 'lowpass', 1500, 0.4);
      env(g, t, 0.07 * v / Math.sqrt(n.m.length), Math.min(1.2, n.d * 0.4), n.d * 0.85, 1.4);
      lp.connect(g); g.connect(k.out);
      for (const m of n.m) { osc(k, 'sawtooth', mtof(m), t, t + n.d + 1.5, lp, -8); osc(k, 'sawtooth', mtof(m), t, t + n.d + 1.5, lp, 7); }
      break;
    }
    case 'cello': {
      const g = c.createGain(), lp = filt(k, 'lowpass', 620, 0.8);
      env(g, t, 0.13 * v, 0.12, n.d * 0.8, n.d * 0.25 + 0.2);
      lp.connect(g); g.connect(k.out);
      for (const m of n.m) { osc(k, 'sawtooth', mtof(m), t, t + n.d + 0.3, lp, -6); }
      break;
    }
    case 'spiccato': {
      const f = mtof(n.m[0]), g = c.createGain(), bp = filt(k, 'bandpass', Math.min(3200, f * 3.2), 0.7);
      env(g, t, 0.2 * v, 0.005, 0.005, n.d);
      bp.connect(g); g.connect(k.out);
      osc(k, 'sawtooth', f, t, t + n.d + 0.04, bp);
      break;
    }
    case 'choir': case 'angel': {
      // Chor: Sägezähne durch zwei Vokal-Formanten („a“ – bzw. Engel: hell „u“ mit Oktav-Glanz), langsames Vibrato
      const angel = n.i === 'angel';
      const g = c.createGain();
      const per = (angel ? 0.11 : 0.16) * v / Math.sqrt(n.m.length * 2);
      env(g, t, per, Math.min(angel ? 1.3 : 1.0, n.d * 0.45), n.d * 0.82, angel ? 1.8 : 1.5);
      const f1 = filt(k, 'bandpass', angel ? 420 : 720, angel ? 6 : 5), f2 = filt(k, 'bandpass', angel ? 1050 : 1180, angel ? 8 : 7);
      f1.connect(g); f2.connect(g); g.connect(k.out);
      const vib = c.createOscillator(); vib.frequency.value = angel ? 5.2 : 4.6;
      const end = t + n.d + 1.9;
      for (const m of n.m) {
        const f = mtof(m), vg = c.createGain(); vg.gain.value = f * (angel ? 0.008 : 0.006);
        vib.connect(vg);
        for (const det of [-10, 9]) { const o = osc(k, 'sawtooth', f, t, end, f1, det); o.connect(f2); vg.connect(o.frequency); }
        if (angel) { const sg = c.createGain(); sg.gain.value = 0.35; sg.connect(g); osc(k, 'sine', f * 2, t, end, sg); }
      }
      vib.start(t); vib.stop(end);
      break;
    }
    case 'celesta': {
      const f = mtof(n.m[0]), g = c.createGain();
      env(g, t, 0.12 * v, 0.003, 0.003, n.d);
      g.connect(k.out); osc(k, k.celesta, f, t, t + n.d + 0.05, g);
      break;
    }
    case 'cymbal': case 'swell': {
      const g = c.createGain(), hp = filt(k, 'highpass', n.i === 'swell' ? 4200 : 5200);
      if (n.i === 'swell') { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * v, t + n.d); g.gain.exponentialRampToValueAtTime(0.0001, t + n.d + 0.06); }
      else env(g, t, 0.2 * v, 0.002, 0.002, n.d);
      hp.connect(g); g.connect(k.out); noiseSrc(k, t, n.d + 0.1, hp, idx);
      break;
    }
    case 'sub': {
      // Sub-Bass-Donner: tiefer Sinus, der nach unten gleitet und lange ausrollt
      const f = mtof(n.m[0] || 26), g = c.createGain(), o = c.createOscillator();
      o.type = 'sine'; o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + Math.min(1.2, n.d));
      env(g, t, 0.55 * v, 0.02, n.d * 0.4, n.d * 0.6 + 0.3);
      o.connect(g); g.connect(k.out); o.start(t); o.stop(t + n.d + 0.4);
      break;
    }
    case 'thunder': {
      const g = c.createGain(), lp = filt(k, 'lowpass', 300);
      lp.frequency.setValueAtTime(320, t); lp.frequency.exponentialRampToValueAtTime(60, t + n.d);
      env(g, t, 0.4 * v, 0.06, 0.2, n.d);
      lp.connect(g); g.connect(k.out); noiseSrc(k, t, n.d + 0.2, lp, idx);
      break;
    }
  }
}

/** Den Nachhall nach dem Schleifenende an den Anfang falten: die Schleife klingt beim Wiederholen nahtlos weiter */
function foldTail(buf: AudioBuffer, loop: number): AudioBuffer {
  const n = Math.round(loop * buf.sampleRate);
  if (n >= buf.length) return buf;
  const d = buf.getChannelData(0);
  for (let i = n; i < buf.length; i++) d[i - n] += d[i];
  const out = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: buf.sampleRate });
  out.copyToChannel(d.subarray(0, n), 0);
  return out;
}

/** Harter Schluss ohne Knacken (12 ms) bzw. weiches Ausklingen der letzten 0,4 s */
function shapeEnd(buf: AudioBuffer, hard: boolean) {
  const d = buf.getChannelData(0), sr = buf.sampleRate;
  const n = Math.min(d.length, Math.round((hard ? 0.012 : 0.4) * sr));
  for (let i = 0; i < n; i++) d[d.length - 1 - i] *= i / n;
}

/** Ein Stück rendern (Browser). Teilt die Arbeit nicht auf: der OfflineAudioContext rechnet auf eigenem Faden. */
export async function renderMovement(mv: Movement, rate = SCORE_RATE): Promise<AudioBuffer | null> {
  const OAC = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!OAC) return null;
  const len = Math.ceil(mv.len * rate);
  const c = new OAC(1, len, rate);
  const bus = c.createGain();
  // leichte Bus-Kompression: viele Stimmen übersteuern sonst im Crescendo
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
  bus.gain.value = 0.9;
  bus.connect(comp); comp.connect(c.destination);
  const k = makeKit(c, bus);
  mv.notes.forEach((n, i) => { if (n.t < mv.len) play(k, n, i); });
  let buf = await c.startRendering();
  if (mv.loop) buf = foldTail(buf, mv.loop);
  else shapeEnd(buf, !!mv.hardEnd);
  return buf;
}

/** Alle Sätze rendern (parallel); `onPart` meldet den Fortschritt (0 … 1) */
export async function renderScore(onPart: (k: number) => void = () => {}): Promise<Map<Movement['id'], AudioBuffer>> {
  const out = new Map<Movement['id'], AudioBuffer>();
  let done = 0;
  await Promise.all(SCORE_PARTS.map(async (id) => {
    try {
      const b = await renderMovement(compose(id));
      if (b) out.set(id, b);
    } catch { /* ohne diesen Satz: die Regie läuft trotzdem (dann still) */ }
    onPart(++done / SCORE_PARTS.length);
  }));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Wiedergabe
// ---------------------------------------------------------------------------------------------------------------

interface Voice { src: AudioBufferSourceNode; loop: AudioBufferSourceNode | null; gain: GainNode; startAt: number; offset: number; target: number }

/**
 * Spielt die gerenderten Sätze ab. `out` = Ziel (Musik-Bus der AudioEngine); eigener Hall (Faltung) für die Weite eines Orchesters.
 * Die Regie gibt Lautstärken und Abspielpositionen vor; die Wiedergabe folgt ihr (`sync`).
 */
export class PrologueScorePlayer {
  private readonly bus: GainNode;
  private readonly wet: GainNode;
  private readonly voices = new Map<ScoreCue, Voice>();
  private paused = false;

  constructor(private readonly c: AudioContext, out: AudioNode, private readonly buffers: Map<Movement['id'], AudioBuffer>, impulse: AudioBuffer | null) {
    this.bus = c.createGain();
    this.bus.gain.value = 1.25;
    this.bus.connect(out);
    this.wet = c.createGain();
    this.wet.gain.value = 0.42;
    if (impulse) {
      const conv = c.createConvolver();
      conv.buffer = impulse;
      this.bus.connect(conv); conv.connect(this.wet); this.wet.connect(out);
    }
  }

  get ready(): boolean { return this.buffers.size > 0; }
  has(cue: ScoreCue): boolean { return this.buffers.has(cue); }
  /** Läuft ein Stück? (Prüfungen) */
  playing(cue: ScoreCue): boolean { return this.voices.has(cue); }

  /** Stück starten (bei Abspielposition `offset` s) mit Ziel-Lautstärke `gain` nach `fade` s */
  start(cue: ScoreCue, offset: number, gain: number, fade: number) {
    this.stop(cue, 0);
    const buf = this.buffers.get(cue);
    if (!buf || this.paused) return;
    const c = this.c, now = c.currentTime + 0.01;
    const g = c.createGain();
    g.gain.setValueAtTime(fade > 0 ? 0.0001 : gain, now);
    if (fade > 0) g.gain.linearRampToValueAtTime(gain, now + fade);
    g.connect(this.bus);
    const v: Voice = { src: c.createBufferSource(), loop: null, gain: g, startAt: now - offset, offset, target: gain };
    v.src.buffer = buf; v.src.connect(g);
    const loopBuf = cue === 'gegenangriff' ? this.buffers.get('gegenangriff_loop') : undefined;
    if (loopBuf) {
      // Auftakt, dann die Endlos-Schleife – sample-genau auf der Audio-Uhr angesetzt
      if (offset < buf.duration) {
        v.src.start(now, offset);
        v.loop = c.createBufferSource(); v.loop.buffer = loopBuf; v.loop.loop = true; v.loop.connect(g);
        v.loop.start(now + (buf.duration - offset));
      } else {
        v.src.buffer = loopBuf; v.src.loop = true;
        v.src.start(now, (offset - buf.duration) % loopBuf.duration);
      }
    } else if (offset < buf.duration) v.src.start(now, offset);
    this.voices.set(cue, v);
  }

  /** Lautstärke eines laufenden Stücks über `d` s auf `gain` */
  fade(cue: ScoreCue, gain: number, d: number) {
    const v = this.voices.get(cue);
    if (!v) return;
    const t = this.c.currentTime;
    v.target = gain;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(Math.max(0, gain), t + Math.max(0.01, d));
    if (gain <= 0) { const s = v; setTimeout(() => { if (this.voices.get(cue) === s) this.stop(cue, 0); }, (d + 0.2) * 1000); }
  }

  stop(cue: ScoreCue, fade: number) {
    const v = this.voices.get(cue);
    if (!v) return;
    this.voices.delete(cue);
    const t = this.c.currentTime;
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0, t + Math.max(0.012, fade));
      v.src.stop(t + Math.max(0.012, fade) + 0.02);
      v.loop?.stop(t + Math.max(0.012, fade) + 0.02);
    } catch { /* schon gestoppt */ }
    setTimeout(() => { try { v.gain.disconnect(); } catch { /* weg */ } }, (fade + 0.5) * 1000);
  }

  /** Harter Schnitt: alles sofort still, auch der Hall (absolute Stille) */
  cut() {
    for (const c of [...this.voices.keys()]) this.stop(c, 0);
    const t = this.c.currentTime;
    this.wet.gain.cancelScheduledValues(t);
    this.wet.gain.setValueAtTime(this.wet.gain.value, t);
    this.wet.gain.linearRampToValueAtTime(0, t + 0.05);
    // der Hall kommt mit dem nächsten Stück zurück
    this.wet.gain.setValueAtTime(0, t + 1.0);
    this.wet.gain.linearRampToValueAtTime(0.42, t + 1.1);
  }

  /** Abspielposition eines Stücks (s) */
  position(cue: ScoreCue): number { const v = this.voices.get(cue); return v ? this.c.currentTime - v.startAt : -1; }

  /** Der Regie folgen: weicht die Musik mehr als `tol` s ab (Pause, versteckter Tab, langes Bild), springt sie an die Regie-Zeit */
  sync(cue: ScoreCue, pos: number, gain: number, tol = 0.15) {
    const v = this.voices.get(cue);
    if (!v || this.paused) return;
    if (Math.abs(this.position(cue) - pos) > tol) this.start(cue, Math.max(0, pos), gain, 0.08);
  }

  /** Pausenmenü: alles anhalten bzw. an der alten Stelle fortsetzen */
  pause(on: boolean) {
    if (on === this.paused) return;
    if (on) {
      const keep: [ScoreCue, number, number][] = [];
      for (const [c, v] of this.voices) keep.push([c, this.position(c), v.target]);
      for (const [c] of keep) this.stop(c, 0.05);
      this.resumeList = keep;
      this.paused = true;
      return;
    }
    this.paused = false;
    for (const [c, pos, g] of this.resumeList) this.start(c, pos, g, 0.15);
    this.resumeList = [];
  }
  private resumeList: [ScoreCue, number, number][] = [];

  dispose(fade = 0.8) {
    for (const c of [...this.voices.keys()]) this.stop(c, fade);
    setTimeout(() => { try { this.bus.disconnect(); this.wet.disconnect(); } catch { /* weg */ } }, (fade + 1) * 1000);
  }
}
