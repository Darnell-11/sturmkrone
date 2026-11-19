// Musik-Manifest: alle Stücke und ihre Schichten (Stems). Datengetrieben: der MusicDirector (audio/musicDirector.ts) liest nur diese Tabelle.
// Die Dateien in public/audio/music/ rendert `python scripts/generate_music.py` (Dauer und BPM stehen auch in public/audio/music/manifest.json,
// ein Test vergleicht beides). Eigene Aufnahmen einhängen: Datei (.ogg oder .mp3) nach public/audio/music/ legen und hier `file` ändern;
// `loopStart` und `loopEnd` (Sekunden) setzen die Schleife (MP3 hat am Anfang ein kurzes Rauschen aus dem Codec: loopStart etwas später ansetzen).
// Ein Stück (`group`) besteht aus gleich langen Schichten (`layer`), die zusammen starten:
//   region:   reg_<sektor>   calm (Melodie und Bett), tension (Ostinato, Trommeln, Blech), combat (volle Kraft)
//   harbor:   harbor_<sektor>   main (Hafen und Taverne)
//   storm, battle_sea, siege_a, siege_b:   base und intense
//   boarding:   main
//   boss_<macht>:   p1 (Phase 1) und p2 (Chor und Trommeln ab 50 % Boss-Leben)
//   sting_conquest, sting_alarm:   main, spielt einmal

/** Musikalische Färbung eines Ortes: Ankerglück (Kernmeer) und die fünf Mächte plus Marine (`FactionId`) */
export type MusicSector = 'ankergluck' | 'england' | 'niederlande' | 'deutschland' | 'frankreich' | 'kurogane' | 'marine';
export const MUSIC_SECTORS: readonly MusicSector[] = ['ankergluck', 'england', 'niederlande', 'deutschland', 'frankreich', 'kurogane', 'marine'];

export type MusicCategory = 'region' | 'harbor' | 'storm' | 'battle' | 'boarding' | 'siege' | 'boss' | 'sting';
export type MusicLayer = 'calm' | 'tension' | 'combat' | 'base' | 'intense' | 'main' | 'p1' | 'p2';

export interface MusicTrack {
  /** Kennung: `<stück>_<schicht>` */
  trackId: string;
  title: string;
  category: MusicCategory;
  /** Zugehörige Macht oder Region (null: für alle) */
  factionId: MusicSector | null;
  group: string;
  layer: MusicLayer;
  bpm: number;
  /** Schleife in Sekunden (die Datei bleibt bis zum Ende gespielt, danach springt sie auf loopStart) */
  loopStart: number;
  loopEnd: number;
  loop: boolean;
  /** Pfad unter public/audio/ */
  file: string;
}

const t = (group: string, layer: MusicLayer, title: string, category: MusicCategory, factionId: MusicSector | null, bpm: number, loopEnd: number, loop = true): MusicTrack =>
  ({ trackId: `${group}_${layer}`, title, category, factionId, group, layer, bpm, loopStart: 0, loopEnd, loop, file: `music/${group}_${layer}.ogg` });

export const MUSIC_TRACKS: MusicTrack[] = [
  // ---- region
  t('reg_ankergluck', 'calm', 'Ankerglück – Sonnenhafen', 'region', 'ankergluck', 84, 34.2857),
  t('reg_ankergluck', 'combat', 'Ankerglück – Sonnenhafen', 'region', 'ankergluck', 84, 34.2857),
  t('reg_ankergluck', 'tension', 'Ankerglück – Sonnenhafen', 'region', 'ankergluck', 84, 34.2857),
  t('reg_deutschland', 'calm', 'Deutschland – Nordwacht', 'region', 'deutschland', 72, 40.0),
  t('reg_deutschland', 'combat', 'Deutschland – Nordwacht', 'region', 'deutschland', 72, 40.0),
  t('reg_deutschland', 'tension', 'Deutschland – Nordwacht', 'region', 'deutschland', 72, 40.0),
  t('reg_england', 'calm', 'England – Königliche Flotte', 'region', 'england', 104, 36.9231),
  t('reg_england', 'combat', 'England – Königliche Flotte', 'region', 'england', 104, 36.9231),
  t('reg_england', 'tension', 'England – Königliche Flotte', 'region', 'england', 104, 36.9231),
  t('reg_frankreich', 'calm', 'Frankreich – Armada Royale', 'region', 'frankreich', 96, 40.0),
  t('reg_frankreich', 'combat', 'Frankreich – Armada Royale', 'region', 'frankreich', 96, 40.0),
  t('reg_frankreich', 'tension', 'Frankreich – Armada Royale', 'region', 'frankreich', 96, 40.0),
  t('reg_kurogane', 'calm', 'Kurogane – Glutring', 'region', 'kurogane', 68, 42.3529),
  t('reg_kurogane', 'combat', 'Kurogane – Glutring', 'region', 'kurogane', 68, 42.3529),
  t('reg_kurogane', 'tension', 'Kurogane – Glutring', 'region', 'kurogane', 68, 42.3529),
  t('reg_marine', 'calm', 'Marine – Ordnung und Eisen', 'region', 'marine', 88, 32.7273),
  t('reg_marine', 'combat', 'Marine – Ordnung und Eisen', 'region', 'marine', 88, 32.7273),
  t('reg_marine', 'tension', 'Marine – Ordnung und Eisen', 'region', 'marine', 88, 32.7273),
  t('reg_niederlande', 'calm', 'Niederlande – Hafenshanty', 'region', 'niederlande', 96, 30.0),
  t('reg_niederlande', 'combat', 'Niederlande – Hafenshanty', 'region', 'niederlande', 96, 30.0),
  t('reg_niederlande', 'tension', 'Niederlande – Hafenshanty', 'region', 'niederlande', 96, 30.0),
  // ---- harbor
  t('harbor_ankergluck', 'main', 'Ankerglück – Zur Müden Möwe', 'harbor', 'ankergluck', 96, 20.0),
  t('harbor_deutschland', 'main', 'Deutschland – Hansekontor', 'harbor', 'deutschland', 84, 34.2857),
  t('harbor_england', 'main', 'England – Hafenmeister', 'harbor', 'england', 108, 35.5556),
  t('harbor_frankreich', 'main', 'Frankreich – Salon am Kai', 'harbor', 'frankreich', 100, 38.4),
  t('harbor_kurogane', 'main', 'Kurogane – Teehaus am Glutring', 'harbor', 'kurogane', 72, 40.0),
  t('harbor_marine', 'main', 'Marine – Wachstube', 'harbor', 'marine', 92, 31.3044),
  t('harbor_niederlande', 'main', 'Niederlande – Grachtenschenke', 'harbor', 'niederlande', 108, 17.7778),
  // ---- storm
  t('storm', 'base', 'Sturmfahrt', 'storm', null, 150, 25.6),
  t('storm', 'intense', 'Sturmfahrt', 'storm', null, 150, 25.6),
  // ---- battle
  t('battle_sea', 'base', 'Seeschlacht', 'battle', null, 144, 26.6667),
  t('battle_sea', 'intense', 'Seeschlacht', 'battle', null, 144, 26.6667),
  // ---- boarding
  t('boarding', 'main', 'Black Flag – Entern!', 'boarding', null, 150, 25.6),
  // ---- siege
  t('siege_a', 'base', 'Belagerung – Die Bresche', 'siege', null, 108, 35.5556),
  t('siege_a', 'intense', 'Belagerung – Die Bresche', 'siege', null, 108, 35.5556),
  t('siege_b', 'base', 'Belagerung – Marsch durch die Viertel', 'siege', null, 96, 40.0),
  t('siege_b', 'intense', 'Belagerung – Marsch durch die Viertel', 'siege', null, 96, 40.0),
  // ---- boss
  t('boss_deutschland', 'p1', 'Großkomtur von Eisenstein', 'boss', 'deutschland', 112, 34.2857),
  t('boss_deutschland', 'p2', 'Großkomtur von Eisenstein', 'boss', 'deutschland', 112, 34.2857),
  t('boss_england', 'p1', 'Lord-Admiral Blackwood', 'boss', 'england', 132, 29.0909),
  t('boss_england', 'p2', 'Lord-Admiral Blackwood', 'boss', 'england', 132, 29.0909),
  t('boss_frankreich', 'p1', 'Marquis-Amiral De Valois', 'boss', 'frankreich', 138, 27.8261),
  t('boss_frankreich', 'p2', 'Marquis-Amiral De Valois', 'boss', 'frankreich', 138, 27.8261),
  t('boss_kurogane', 'p1', 'Schattenfürst Kurogane', 'boss', 'kurogane', 120, 32.0),
  t('boss_kurogane', 'p2', 'Schattenfürst Kurogane', 'boss', 'kurogane', 120, 32.0),
  t('boss_marine', 'p1', 'Großadmiral Valken', 'boss', 'marine', 100, 38.4),
  t('boss_marine', 'p2', 'Großadmiral Valken', 'boss', 'marine', 100, 38.4),
  t('boss_niederlande', 'p1', 'Generalgouverneur Van Der Berg', 'boss', 'niederlande', 140, 27.4286),
  t('boss_niederlande', 'p2', 'Generalgouverneur Van Der Berg', 'boss', 'niederlande', 140, 27.4286),
  // ---- sting
  t('sting_alarm', 'main', 'Alarm: Rückeroberungsflotte', 'sting', null, 90, 10.6667, false),
  t('sting_conquest', 'main', 'Eroberungs-Fanfare', 'sting', null, 120, 14.0, false),
];

const byId = new Map(MUSIC_TRACKS.map((x) => [x.trackId, x]));
const byGroup = new Map<string, MusicTrack[]>();
for (const x of MUSIC_TRACKS) { const l = byGroup.get(x.group); if (l) l.push(x); else byGroup.set(x.group, [x]); }

export const trackById = (id: string): MusicTrack | undefined => byId.get(id);
/** Schichten eines Stücks (leer, wenn es das Stück nicht gibt) */
export const groupTracks = (group: string): MusicTrack[] => byGroup.get(group) ?? [];
export const MUSIC_GROUPS: readonly string[] = [...byGroup.keys()];
