// Gespräche: je Person eine Liste von Themen (Auswahl im Hauptmenü des Gesprächs) und Knoten mit Antworten.
// Neues Gespräch = neuer Eintrag hier. Aufträge, Laden und Begrüßung kommen aus data/quests.ts (TownNpcDef) und story/dialog.ts.

export interface DChoice {
  /** Text der Antwort */
  t: string;
  /** Knoten, zu dem sie führt; 'menu' = zurück zur Auswahl, 'bye' = Gespräch beenden */
  to: string;
}

export interface DNode {
  /** Zeilen der Person, nacheinander angezeigt */
  text: string[];
  /** Antworten; fehlen sie, geht es zurück zur Auswahl */
  choices?: DChoice[];
}

export interface NpcTalk {
  /** Themen im Hauptmenü des Gesprächs: Text und Startknoten */
  topics: { t: string; to: string }[];
  nodes: Record<string, DNode>;
}

export const TALKS: Record<string, NpcTalk> = {
  ilse: {
    topics: [{ t: 'Wie steht es um die Bernsteinsee?', to: 'see' }, { t: 'Was weißt du über die Sturmkrone?', to: 'krone' }],
    nodes: {
      see: { text: ['Ruhig ist anders. Piraten an den Riffen, Marine an den Häfen – und dazwischen kleine Händler, die um ihr Leben rudern.'], choices: [{ t: 'Wo ist es am schlimmsten?', to: 'see2' }, { t: 'Das reicht mir.', to: 'menu' }] },
      see2: { text: ['Am Rabenriff und in der Bernsteinbucht. Grete drüben in der Schmiede hat schon Ärger damit. Frag sie.'] },
      krone: { text: ['Ein Märchen, sagen die einen. Der Ursprung allen Fajis, sagen die anderen.', 'Ich sage: Wer sie sucht, braucht ein gutes Schiff und noch bessere Freunde.'], choices: [{ t: 'Und du? Glaubst du daran?', to: 'krone2' }, { t: 'Verstehe.', to: 'menu' }] },
      krone2: { text: ['Ich habe vierzig Jahre Hafen gesehen. Ich glaube an das, was ins Wasser fällt und nicht wieder auftaucht – und das war bei der Krone oft genug.'] },
    },
  },
  wirt: {
    topics: [{ t: 'Gibt es Gerüchte?', to: 'geruecht' }],
    nodes: {
      geruecht: { text: ['Gerüchte? Heute Nacht hat ein Seemann geschworen, im Nebel ein Geisterschiff gesehen zu haben. Segel schwarz wie Pech.'], choices: [{ t: 'Wo war das?', to: 'geruecht2' }, { t: 'Betrunkenes Gerede.', to: 'geruecht3' }] },
      geruecht2: { text: ['Weit im Norden, wo der Nebel dicker ist als meine Suppe. Fahr nicht allein dahin.'] },
      geruecht3: { text: ['Kann sein. Aber er hat bar bezahlt – und das tun nur Leute, die wirklich Angst haben.'] },
    },
  },
  grete: {
    topics: [{ t: 'Warum bist du Schmiedin geworden?', to: 'warum' }],
    nodes: {
      warum: { text: ['Mein Vater hat Anker geschmiedet. Ich wollte etwas, das schneidet.'], choices: [{ t: 'Und? Zufrieden?', to: 'warum2' }, { t: 'Passt zu dir.', to: 'menu' }] },
      warum2: { text: ['Wenn das Eisen singt, wenn man es abschreckt – ja. Das ist der schönste Ton der Welt.'] },
    },
  },
  mara: {
    topics: [{ t: 'Was empfiehlst du?', to: 'tipp' }],
    nodes: {
      tipp: { text: ['Zwieback hält ewig, Honig noch länger. Und nimm immer mehr mit, als du denkst. Die See ist größer als jeder Plan.'] },
    },
  },
  ilyas: {
    topics: [{ t: 'Was ist Faji eigentlich?', to: 'faji' }],
    nodes: {
      faji: { text: ['Faji ist keine Waffe. Es ist die Art, wie du die Welt ansiehst – und wie sie zurückschaut.'], choices: [{ t: 'Wie viele Arten gibt es?', to: 'faji2' }, { t: 'Das klingt schwer.', to: 'menu' }] },
      faji2: { text: ['Drei: Geist, Körper, Effekt. Dazu die Schwertkunst als vierter Weg. Beginne dort, wo es dir leichtfällt – der Rest folgt.'] },
    },
  },
  jasper: {
    topics: [{ t: 'Wie wird ein Schiff besser?', to: 'schiff' }],
    nodes: {
      schiff: { text: ['Erst der Rumpf, dann die Kanonen, zuletzt die Segel. Wer es umgekehrt macht, fährt schnell – und sinkt noch schneller.'] },
    },
  },
  ole: {
    topics: [{ t: 'Beißen die Fische?', to: 'fisch' }],
    nodes: {
      fisch: { text: ['Heute? Schlecht. Seit die Piraten am Riff liegen, trauen sich die Schwärme nicht mehr in die Bucht.'], choices: [{ t: 'Ich kümmere mich darum.', to: 'fisch2' }, { t: 'Pech.', to: 'menu' }] },
      fisch2: { text: ['Du? Na, wenn du sie vertreibst, bekommst du den ersten Fang. Versprochen.'] },
    },
  },
  wanda: {
    topics: [{ t: 'Wie ist das Leben in Weidenbrück?', to: 'leben' }],
    nodes: {
      leben: { text: ['Still. Die Felder geben, was sie geben. Nur manchmal kommt ein Schiff und bringt Neuigkeiten.'], choices: [{ t: 'Welche Neuigkeiten?', to: 'neu' }, { t: 'Klingt friedlich.', to: 'menu' }] },
      neu: { text: ['Von einer Insel mit versunkenen Säulen, weit im Norden. Mein Großvater sagt, dort lag einmal ein Tempel.'] },
    },
  },
  toni: {
    topics: [{ t: 'Alles in Ordnung bei den Schafen?', to: 'schafe' }],
    nodes: {
      schafe: { text: ['Die Schafe schon. Die Wölfe in Menschengestalt nicht – seit ein paar Tagen treiben sich Plünderer an der Küste herum.'], choices: [{ t: 'Ich sehe nach.', to: 'schafe2' }, { t: 'Pass auf dich auf.', to: 'menu' }] },
      schafe2: { text: ['Das wäre ein Segen. Fünf von ihnen weniger, und ich schlafe wieder ruhig.'] },
    },
  },
  kiri: {
    topics: [{ t: 'Was machst du hier am Strand?', to: 'strand' }],
    nodes: {
      strand: { text: ['Ich sammle Muscheln – die schönsten gehen an Mara auf den Markt. Und manchmal findet man Dinge, die die Flut mitgebracht hat.'] },
    },
  },
  sven: {
    topics: [{ t: 'Warum lebt hier jemand?', to: 'klippe' }],
    nodes: {
      klippe: { text: ['Weil hier niemand fragt. Der Sturm kommt, der Sturm geht – und ich bin immer noch da.'] },
    },
  },
  fenna: {
    topics: [{ t: 'Fährst du Leute übers Wasser?', to: 'faehre' }],
    nodes: {
      faehre: { text: ['Wenn jemand bezahlt, schon. Aber die Strömung bei Fährholm hat ihren eigenen Kopf.'] },
    },
  },
};
