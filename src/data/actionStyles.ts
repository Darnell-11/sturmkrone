// Phase 4.6A/4.6B – die sechs physischen Kampfstile (plus Faji-Wirken) als reine Daten und das Verzeichnis aller Stile, Faji-Künste und
// Ultimates. Baukasten (Typen, Konstanten, Helfer): `actionKit.ts`; Faji-Künste: `fajiArts.ts`; Kataklysmus-Ultimates: `cataclysms.ts`.
//
// Bedienung (für alle Stile gleich):
//   Leicht ×5 (Doppelklinge ×7)  → Kette mit Flächen-Finisher, der schwache Truppen wegschleudert
//   L → S        Schildbrecher-Stoß        L → L → S        Orkan-Launcher (bis 12 Gegner in die Luft, Luft-Kombo)
//   L ×3 → S     360°-Massenschlacht-Feger L ×4 → S         Langstrecken-Schockwelle
//   in der Luft: Leicht ×3/4, Schwer = Meteor-Sturzangriff · Tasten 1–4: die vier Signatur-Techniken des Stils
//   Willenskraft voll → Sturm-Erwachen (18 s), darin einmal das Kataklysmus-Ultimate des Stils
import type { StyleId } from './animations';
import {
  ACTION_STYLE_IDS, ACTION_TUNING, AIR, ROUND, awakenWave, move, shot, skill, ticks,
  type ActionMove, type ActionStyleDef, type ActionStyleId,
} from './actionKit';
import { FAJI_STYLES } from './fajiArts';
import { SKYFALL_ULTIMATE, ULTIMATES } from './cataclysms';

export * from './actionKit';

// ---------- Zweihänder ----------

const ZW: ActionStyleDef = {
  id: 'zweihaender', label: 'Zweihänder', title: 'Großschwert', color: '#FFD8A8', accent: '#FF9A4A', visual: 'zweihaender', idleClip: 'Melee_2H_Idle',
  desc: 'Wuchtige, weitreichende Bogenhiebe. Schwere Finisher laufen mit Hyper-Armor, kein Stil bricht die Haltung schneller.',
  light: [
    move({ id: 'zweihaender.l1', label: 'Breitschwung', clip: 'Melee_2H_Attack_Slice', dur: 0.6, hits: [{ range: 3.4, arc: 3.0, dmg: 0.54, poise: 20, knock: 4, hitstop: 0.07, shake: 0.25 }] }),
    move({ id: 'zweihaender.l2', label: 'Scheitelhieb', clip: 'Melee_2H_Attack_Chop', dur: 0.66, hits: [{ range: 3.4, arc: 1.9, dmg: 0.59, poise: 26, knock: 5, fx: 'heavy', hitstop: 0.08, shake: 0.32 }] }),
    move({ id: 'zweihaender.l3', label: 'Wirbelhieb', clip: 'Melee_2H_Attack_Spinning', dur: 0.56, hits: [{ shape: 'arc', arc: ROUND, range: 3.3, dmg: 0.52, poise: 18, knock: 5, fx: 'spin' }] }),
    move({ id: 'zweihaender.l4', label: 'Klingenramme', clip: 'Melee_2H_Attack_Stab', dur: 0.6, lunge: 4, hits: [{ range: 3.9, arc: 0.9, dmg: 0.64, poise: 30, knock: 6, fx: 'stab', hitstop: 0.08 }] }),
    move({ id: 'zweihaender.l5', label: 'Bergsturz', clip: 'Melee_2H_Attack_Chop', dur: 0.95, hyper: true, finisher: true, hits: [{ shape: 'circle', offset: 1.8, range: 4.6, dmg: 1.26, poise: 60, knock: 10, fling: 13, fx: 'heavy', hitstop: 0.14, shake: 0.8 }] }),
  ],
  branch: [
    move({ id: 'zweihaender.b1', label: 'Schildbrecher-Stoß', clip: 'Melee_2H_Attack_Stab', dur: 0.62, lunge: 5, hits: [{ range: 3.8, arc: 1.2, dmg: 0.87, poise: 55, knock: 7, breakGuard: true, fx: 'stab', hitstop: 0.11, shake: 0.45 }] }),
    move({ id: 'zweihaender.b2', label: 'Orkan-Launcher', clip: 'Melee_2H_Attack_Slice', dur: 0.62, rise: 10.2, hits: [{ shape: 'circle', offset: 1.3, range: 3.1, dmg: 0.78, poise: 30, knock: 1, launch: 10.4, maxTargets: 12, fx: 'heavy', hitstop: 0.09, shake: 0.4 }] }),
    move({ id: 'zweihaender.b3', label: '360°-Massenschlacht-Feger', clip: 'Melee_2H_Attack_Spin', dur: 1.0, hyper: true, hits: ticks(2, 0.18, 0.72, { shape: 'arc', arc: ROUND, range: 4.9, dmg: 0.61, poise: 26, knock: 9, fling: 10, fx: 'spin', hitstop: 0.07, shake: 0.35 }) }),
    move({ id: 'zweihaender.b4', label: 'Langstrecken-Schockwelle', clip: 'Melee_2H_Attack_Chop', dur: 0.85, hyper: true, hits: [{ shape: 'line', range: 15, width: 3.2, dmg: 1.13, poise: 40, knock: 8, fling: 10, fx: 'heavy', hitstop: 0.1, shake: 0.6 }] }),
  ],
  heavy: move({ id: 'zweihaender.s', label: 'Gipfelhieb', clip: 'Melee_2H_Attack_Chop', dur: 0.9, hyper: true, hits: [{ range: 3.7, arc: 2.2, dmg: 1.3, poise: 55, knock: 9, fx: 'heavy', hitstop: 0.13, shake: 0.7 }] }),
  air: [
    move({ id: 'zweihaender.a1', label: 'Luftschwung', clip: 'Melee_2H_Attack_Slice', dur: 0.46, air: true, hits: [{ ...AIR, range: 3.3, arc: 3.0, dmg: 0.52, poise: 16 }] }),
    move({ id: 'zweihaender.a2', label: 'Luftscheitel', clip: 'Melee_2H_Attack_Chop', dur: 0.5, air: true, hits: [{ ...AIR, range: 3.3, arc: 2.0, dmg: 0.57, poise: 20, fx: 'heavy' }] }),
    move({ id: 'zweihaender.a3', label: 'Luftwirbel', clip: 'Melee_2H_Attack_Spinning', dur: 0.48, air: true, hits: [{ ...AIR, arc: ROUND, range: 3.3, dmg: 0.54, poise: 18, fx: 'spin', juggle: 4.2 }] }),
  ],
  meteor: move({ id: 'zweihaender.m', label: 'Meteor-Sturzangriff', clip: 'Melee_1H_Attack_Jump_Chop', dur: 1.2, meteor: true, air: true, hyper: true, hits: [{ shape: 'circle', range: 4.6, dmg: 1.3, poise: 45, knock: 9, launch: 4, fling: 12, fx: 'heavy', hitstop: 0.13, shake: 0.85 }] }),
  finisher: move({ id: 'zweihaender.f', label: 'Himmelsspalter', clip: 'Melee_2H_Attack_Chop', dur: 1.25, hyper: true, iframes: 1.25, cutin: 'Himmelsspalter!', hits: [{ range: 4.2, arc: 2.4, dmg: 1, poise: 0, knock: 10, fx: 'heavy', hitstop: 0.3, shake: 1.1 }] }),
  skills: [
    skill({ id: 'zweihaender.k1', slot: 1, label: 'Bergbrecher', short: 'Berg', icon: '⛰', cd: 9, desc: 'Sprung nach vorn und Erdbeben-Hieb mit Druckwelle.', clip: 'Melee_1H_Attack_Jump_Chop', dur: 1.05, dashTo: 6, dashTime: 0.42, hyper: true, hits: [{ shape: 'circle', offset: 1.2, range: 4.6, dmg: 3.77, poise: 70, knock: 10, launch: 5, fling: 12, fx: 'heavy', hitstop: 0.14, shake: 0.9 }] }),
    skill({ id: 'zweihaender.k2', slot: 2, label: 'Sturmrad', short: 'Rad', icon: '⟲', cd: 12, desc: 'Wirbelnder Klingensturm mit Hyper-Armor, zieht durch ganze Truppen.', clip: 'Melee_2H_Attack_Spinning', dur: 1.5, from: 0, to: 1, lunge: 4.5, magnet: false, hyper: true, hits: ticks(5, 0.04, 0.96, { shape: 'arc', arc: ROUND, range: 3.7, dmg: 1.05, poise: 14, knock: 5, fling: 7, fx: 'spin', hitstop: 0.04 }) }),
    skill({ id: 'zweihaender.k3', slot: 3, label: 'Unbeugsam', short: 'Wille', icon: '⛨', cd: 18, desc: '6 s Hyper-Armor und anderthalbfacher Haltungsschaden.', clip: 'Ranged_Magic_Raise', dur: 0.8, magnet: false, buff: { kind: 'hyper', dur: 6 }, hits: [{ shape: 'circle', range: 3.6, dmg: 0.5, poise: 30, knock: 7, fling: 6, fx: 'magic', at: [0.45, 0.6] }] }),
    skill({ id: 'zweihaender.k4', slot: 4, label: 'Titanenspalter', short: 'Titan', icon: '⚔', cd: 14, desc: 'Gewaltiger Scheitelhieb, dessen Schockwelle 16 m weit trägt.', clip: 'Melee_2H_Attack_Chop', dur: 1.1, hyper: true, cutin: 'Titanenspalter!', hits: [{ shape: 'line', range: 16, width: 3.6, dmg: 4.58, poise: 90, knock: 10, fling: 14, pen: 1, fx: 'heavy', hitstop: 0.16, shake: 1.0 }] }),
  ],
  jumps: 2, airDashes: 1, dashSpeed: 14, dashTime: 0.28, perfectWindow: ACTION_TUNING.perfectWindow,
  critMult: 1.6, critBonus: 0, penBonus: 0, postureK: 1.35, physical: true,
  faji: false, element: 'klinge', awakenWave: awakenWave({ range: 11, width: 3, dmg: 0.36, poise: 10, vfx: 'klinge' }), ultimate: ULTIMATES['zweihaender'] ?? null,
};

// ---------- Säbel ----------

const SA: ActionStyleDef = {
  id: 'saebel', label: 'Säbel', title: 'Korsaren-Souverän', color: '#FFE3B0', accent: '#FF4A3A', visual: 'saebel', idleClip: 'Idle_A',
  desc: 'Schnelle, elegante Hiebketten mit golden-roten Sturm-Blitzen und den höchsten Krit-Multiplikatoren.',
  light: [
    move({ id: 'saebel.l1', label: 'Diagonalhieb', clip: 'Melee_1H_Attack_Slice_Diagonal', dur: 0.4, hits: [{ range: 2.6, arc: 2.4, dmg: 0.44, poise: 9 }] }),
    move({ id: 'saebel.l2', label: 'Querhieb', clip: 'Melee_1H_Attack_Slice_Horizontal', dur: 0.42, hits: [{ range: 2.7, arc: 2.8, dmg: 0.46, poise: 9 }] }),
    move({ id: 'saebel.l3', label: 'Rückhandschnitt', clip: 'Melee_1H_Attack_Chop', dur: 0.4, hits: [{ range: 2.6, arc: 2.0, dmg: 0.49, poise: 10 }] }),
    move({ id: 'saebel.l4', label: 'Degenstoß', clip: 'Melee_1H_Attack_Stab', dur: 0.46, lunge: 4, hits: [{ range: 3.1, arc: 0.9, dmg: 0.6, poise: 14, knock: 5, fx: 'stab', hitstop: 0.07 }] }),
    move({ id: 'saebel.l5', label: 'Sturmkronen-Wirbel', clip: 'Melee_2H_Attack_Spin', dur: 0.82, finisher: true, color: '#FF5A3A', hits: ticks(2, 0.2, 0.72, { shape: 'arc', arc: ROUND, range: 3.7, dmg: 0.53, poise: 18, knock: 8, fling: 9, fx: 'spin', hitstop: 0.08, shake: 0.4 }, { fling: 11, hitstop: 0.12, shake: 0.55 }) }),
  ],
  branch: [
    move({ id: 'saebel.b1', label: 'Schildbrecher-Stoß', clip: 'Melee_1H_Attack_Stab', dur: 0.5, lunge: 5.5, hits: [{ range: 3.2, arc: 1.1, dmg: 0.75, poise: 42, knock: 6, breakGuard: true, fx: 'stab', hitstop: 0.1, shake: 0.4 }] }),
    move({ id: 'saebel.b2', label: 'Orkan-Launcher', clip: 'Melee_1H_Attack_Slice_Diagonal', dur: 0.5, rise: 10.4, hits: [{ shape: 'circle', offset: 1.2, range: 2.9, dmg: 0.67, poise: 22, knock: 1, launch: 10.6, maxTargets: 12, fx: 'heavy', hitstop: 0.08, shake: 0.35 }] }),
    move({ id: 'saebel.b3', label: '360°-Massenschlacht-Feger', clip: 'Melee_2H_Attack_Spin', dur: 0.86, hits: ticks(2, 0.2, 0.74, { shape: 'arc', arc: ROUND, range: 4.4, dmg: 0.49, poise: 18, knock: 9, fling: 9, fx: 'spin', hitstop: 0.06, shake: 0.3 }) }),
    move({ id: 'saebel.b4', label: 'Langstrecken-Schockwelle', clip: 'Melee_1H_Attack_Jump_Chop', dur: 0.72, color: '#FF5A3A', hits: [{ shape: 'line', range: 14, width: 2.8, dmg: 0.93, poise: 28, knock: 7, fling: 9, fx: 'heavy', hitstop: 0.09, shake: 0.5 }] }),
  ],
  heavy: move({ id: 'saebel.s', label: 'Sprunghieb', clip: 'Melee_1H_Attack_Jump_Chop', dur: 0.72, lunge: 4, hits: [{ range: 2.9, arc: 2.2, dmg: 1.07, poise: 34, knock: 7, fx: 'heavy', hitstop: 0.12, shake: 0.55 }] }),
  air: [
    move({ id: 'saebel.a1', label: 'Luftdiagonale', clip: 'Melee_1H_Attack_Slice_Diagonal', dur: 0.36, air: true, hits: [{ ...AIR, range: 2.7, arc: 2.6, dmg: 0.43, poise: 9 }] }),
    move({ id: 'saebel.a2', label: 'Luftquerhieb', clip: 'Melee_1H_Attack_Slice_Horizontal', dur: 0.38, air: true, hits: [{ ...AIR, range: 2.8, arc: 2.8, dmg: 0.44, poise: 9 }] }),
    move({ id: 'saebel.a3', label: 'Blitzspalter', clip: 'Melee_1H_Attack_Chop', dur: 0.4, air: true, color: '#FF5A3A', hits: [{ ...AIR, range: 2.8, arc: 2.2, dmg: 0.51, poise: 12, juggle: 4.2 }] }),
  ],
  meteor: move({ id: 'saebel.m', label: 'Meteor-Sturzangriff', clip: 'Melee_1H_Attack_Jump_Chop', dur: 1.05, meteor: true, air: true, color: '#FF5A3A', hits: [{ shape: 'circle', range: 4.0, dmg: 1.07, poise: 30, knock: 8, launch: 4, fling: 10, fx: 'heavy', hitstop: 0.11, shake: 0.7 }] }),
  finisher: move({ id: 'saebel.f', label: 'Kronenblitz', clip: 'Melee_1H_Attack_Stab', dur: 1.05, hyper: true, iframes: 1.05, cutin: 'Kronenblitz!', color: '#FF4A3A', hits: [{ range: 3.4, arc: 1.4, dmg: 1, poise: 0, knock: 10, fx: 'stab', hitstop: 0.3, shake: 1.0 }] }),
  skills: [
    skill({ id: 'saebel.k1', through: true, slot: 1, label: 'Kronenblitz-Sprint', short: 'Blitz', icon: 'ϟ', cd: 7, desc: 'Golden-roter Blitzschnitt quer durch alle Gegner auf 7 m.', clip: 'Melee_1H_Attack_Slice_Horizontal', dur: 0.62, dashTo: 7, dashTime: 0.16, iframes: 0.3, afterimage: true, color: '#FF4A3A', hits: [{ shape: 'line', range: 3.4, width: 2.6, dmg: 2.32, poise: 26, knock: 6, fx: 'slash', hitstop: 0.1, shake: 0.4, at: [0.3, 0.55], up: 2.6 }] }),
    skill({ id: 'saebel.k2', slot: 2, label: 'Donnerfächer', short: 'Fächer', icon: '✦', cd: 10, desc: 'Drei Sturm-Blitze im Fächer, 9 m weit.', clip: 'Ranged_Magic_Shoot', dur: 0.75, magnet: false, lunge: 0, color: '#FF5A3A', hits: ticks(3, 0.3, 0.7, { shape: 'arc', range: 9, arc: 1.25, dmg: 1, poise: 12, knock: 4, fx: 'magic', hitstop: 0.05 }) }),
    skill({ id: 'saebel.k3', slot: 3, label: 'Freibeuter-Tanz', short: 'Tanz', icon: '❖', cd: 11, desc: 'Sechs blitzschnelle Hiebe im Halbkreis.', clip: 'Melee_1H_Attack_Slice_Horizontal', dur: 1.0, from: 0.1, to: 0.9, hits: ticks(6, 0.08, 0.92, { range: 3.0, arc: 3.0, dmg: 0.62, poise: 7, knock: 2, hitstop: 0.03 }) }),
    skill({ id: 'saebel.k4', slot: 4, label: 'Sturmkrone', short: 'Krone', icon: '♛', cd: 20, desc: 'Blitzring und 8 s Sturm: +25 % Krit-Chance.', clip: 'Ranged_Magic_Raise', dur: 0.85, magnet: false, buff: { kind: 'crit', dur: 8 }, cutin: 'Sturmkrone!', color: '#FF4A3A', airOk: true, hits: [{ shape: 'circle', range: 4.2, dmg: 0.8, poise: 20, knock: 7, fling: 6, fx: 'magic', at: [0.45, 0.62], down: 2.6 }] }),
  ],
  jumps: 2, airDashes: 1, dashSpeed: 16, dashTime: 0.26, perfectWindow: ACTION_TUNING.perfectWindow,
  critMult: 2.1, critBonus: 0.08, penBonus: 0, postureK: 0.9, physical: true,
  faji: false, element: 'blitz', awakenWave: awakenWave({ range: 10, width: 2.4, vfx: 'blitz', status: 'shock', statusDur: 1 }), ultimate: ULTIMATES['saebel'] ?? null,
};

// ---------- Doppelklinge ----------

const DO: ActionStyleDef = {
  id: 'doppel', label: 'Doppelklinge', title: 'Wirbelsturm-Tänzer', color: '#C8FFE8', accent: '#3AE0A8', visual: 'doppel', idleClip: 'Idle_A',
  desc: 'Rasante Sieben-Treffer-Wirbel, die größte Luft-Beweglichkeit (drei Sprünge, zwei Luft-Dashes) und extrem schnelle Rotations-Dashes.',
  light: [
    move({ id: 'doppel.l1', label: 'Zwillingsschnitt', clip: 'Melee_Dualwield_Attack_Slice', dur: 0.34, hits: [{ range: 2.5, arc: 2.8, dmg: 0.38, poise: 7 }] }),
    move({ id: 'doppel.l2', label: 'Kreuzhieb', clip: 'Melee_Dualwield_Attack_Chop', dur: 0.34, hits: [{ range: 2.5, arc: 2.2, dmg: 0.38, poise: 7 }] }),
    move({ id: 'doppel.l3', label: 'Doppelschnitt', clip: 'Melee_Dualwield_Attack_Slice', dur: 0.34, hits: ticks(2, 0.3, 0.62, { range: 2.5, arc: 2.8, dmg: 0.21, poise: 4, hitstop: 0.03 }) }),
    move({ id: 'doppel.l4', label: 'Drehschnitt', clip: 'Melee_2H_Attack_Spinning', dur: 0.36, hits: [{ arc: ROUND, range: 2.8, dmg: 0.4, poise: 7, knock: 4, fx: 'spin' }] }),
    move({ id: 'doppel.l5', label: 'Zwillingsstich', clip: 'Melee_Dualwield_Attack_Stab', dur: 0.38, lunge: 4, hits: [{ range: 2.9, arc: 1.0, dmg: 0.47, poise: 9, knock: 4, fx: 'stab' }] }),
    move({ id: 'doppel.l6', label: 'Wirbelkreuz', clip: 'Melee_Dualwield_Attack_Chop', dur: 0.34, hits: [{ range: 2.6, arc: 2.4, dmg: 0.4, poise: 8 }] }),
    move({ id: 'doppel.l7', label: 'Klingenorkan', clip: 'Melee_2H_Attack_Spinning', dur: 0.95, from: 0, to: 1, finisher: true, hits: ticks(5, 0.08, 0.9, { arc: ROUND, range: 3.4, dmg: 0.23, poise: 6, knock: 3, fling: 5, fx: 'spin', hitstop: 0.03 }, { dmg: 0.53, knock: 9, fling: 10, hitstop: 0.1, shake: 0.45 }) }),
  ],
  branch: [
    move({ id: 'doppel.b1', label: 'Schildbrecher-Stoß', clip: 'Melee_Dualwield_Attack_Stab', dur: 0.46, lunge: 6, hits: [{ range: 3.0, arc: 1.2, dmg: 0.8, poise: 36, knock: 6, breakGuard: true, fx: 'stab', hitstop: 0.09, shake: 0.35 }] }),
    move({ id: 'doppel.b2', label: 'Orkan-Launcher', clip: 'Melee_2H_Attack_Spinning', dur: 0.48, rise: 10.8, hits: [{ shape: 'circle', offset: 0.9, range: 3.0, dmg: 0.64, poise: 18, knock: 1, launch: 10.8, maxTargets: 12, fx: 'spin', hitstop: 0.07, shake: 0.3 }] }),
    move({ id: 'doppel.b3', label: '360°-Massenschlacht-Feger', clip: 'Melee_2H_Attack_Spin', dur: 0.8, hits: ticks(3, 0.18, 0.76, { arc: ROUND, range: 4.2, dmg: 0.34, poise: 10, knock: 7, fling: 8, fx: 'spin', hitstop: 0.04 }) }),
    move({ id: 'doppel.b4', label: 'Langstrecken-Schockwelle', clip: 'Melee_Dualwield_Attack_Chop', dur: 0.62, hits: [{ shape: 'line', range: 13, width: 2.8, dmg: 1.01, poise: 24, knock: 7, fling: 9, fx: 'heavy', hitstop: 0.08, shake: 0.45 }] }),
  ],
  heavy: move({ id: 'doppel.s', label: 'Sichelwirbel', clip: 'Melee_2H_Attack_Spin', dur: 0.8, hits: ticks(2, 0.2, 0.74, { arc: ROUND, range: 3.2, dmg: 0.64, poise: 16, knock: 7, fx: 'spin', hitstop: 0.07 }) }),
  air: [
    move({ id: 'doppel.a1', label: 'Luftschnitt', clip: 'Melee_Dualwield_Attack_Slice', dur: 0.32, air: true, hits: [{ ...AIR, range: 2.6, arc: 2.8, dmg: 0.38, poise: 7 }] }),
    move({ id: 'doppel.a2', label: 'Luftkreuz', clip: 'Melee_Dualwield_Attack_Chop', dur: 0.32, air: true, hits: [{ ...AIR, range: 2.6, arc: 2.4, dmg: 0.38, poise: 7 }] }),
    move({ id: 'doppel.a3', label: 'Luftwirbel', clip: 'Melee_2H_Attack_Spinning', dur: 0.36, air: true, hits: ticks(2, 0.15, 0.8, { ...AIR, arc: ROUND, range: 2.8, dmg: 0.23, poise: 5, hitstop: 0.03 }) }),
    move({ id: 'doppel.a4', label: 'Sturzstich', clip: 'Melee_Dualwield_Attack_Stab', dur: 0.38, air: true, hits: [{ ...AIR, range: 2.9, arc: 1.2, dmg: 0.49, poise: 9, juggle: 4.4, fx: 'stab' }] }),
  ],
  meteor: move({ id: 'doppel.m', label: 'Meteor-Sturzangriff', clip: 'Melee_2H_Attack_Spinning', dur: 1.0, meteor: true, air: true, hits: [{ shape: 'circle', range: 3.8, dmg: 1.11, poise: 24, knock: 8, launch: 4, fling: 9, fx: 'spin', hitstop: 0.1, shake: 0.6 }] }),
  finisher: move({ id: 'doppel.f', label: 'Schwalbenkreuz', clip: 'Melee_Dualwield_Attack_Stab', dur: 1.05, hyper: true, iframes: 1.05, cutin: 'Schwalbenkreuz!', hits: [{ range: 3.2, arc: 1.4, dmg: 1, poise: 0, knock: 9, fx: 'stab', hitstop: 0.3, shake: 0.9 }] }),
  skills: [
    skill({ id: 'doppel.k1', slot: 1, label: 'Klingenwirbel', short: 'Wirbel', icon: '✺', cd: 9, desc: 'Sieben-Treffer-Wirbel auf der Stelle.', clip: 'Melee_2H_Attack_Spinning', dur: 1.1, from: 0, to: 1, magnet: false, lunge: 1.5, hits: ticks(7, 0.04, 0.96, { arc: ROUND, range: 3.3, dmg: 0.51, poise: 6, knock: 3, fling: 4, fx: 'spin', hitstop: 0.025 }) }),
    skill({ id: 'doppel.k2', slot: 2, label: 'Schwalbensturz', short: 'Schwalbe', icon: '⤴', cd: 8, desc: 'Steigender Wirbel: schleudert alles im Umkreis mit dir in die Luft.', clip: 'Melee_2H_Attack_Spinning', dur: 0.6, rise: 11.5, airOk: true, hits: [{ shape: 'circle', range: 3.2, dmg: 2.34, poise: 20, knock: 1, launch: 11.5, maxTargets: 12, fx: 'spin', hitstop: 0.07, shake: 0.35, down: 1.5 }] }),
    skill({ id: 'doppel.k3', through: true, slot: 3, label: 'Zwillingsschatten', short: 'Schatten', icon: '⇉', cd: 7, desc: 'Rotations-Dash über 8 m mit Nachbildern, trifft alles auf dem Weg.', clip: 'Dodge_Forward', dur: 0.55, from: 0, to: 1, dashTo: 8, dashTime: 0.24, iframes: 0.34, afterimage: true, airOk: true, hits: ticks(3, 0.08, 0.5, { shape: 'circle', range: 2.2, dmg: 0.7, poise: 9, knock: 4, fx: 'spin', hitstop: 0.03, down: 2 }) }),
    skill({ id: 'doppel.k4', slot: 4, label: 'Tausend Schnitte', short: 'Tausend', icon: '✶', cd: 14, desc: 'Zwölf Schnitte in Folge, der letzte bricht durch die Deckung.', clip: 'Melee_Dualwield_Attack_Slice', dur: 1.35, from: 0.1, to: 0.9, cutin: 'Tausend Schnitte!', hits: ticks(12, 0.05, 0.95, { range: 2.9, arc: 2.6, dmg: 0.31, poise: 4, knock: 1, hitstop: 0.02 }, { dmg: 1.41, poise: 30, knock: 8, breakGuard: true, hitstop: 0.12, shake: 0.5 }) }),
  ],
  jumps: 3, airDashes: 2, dashSpeed: 20, dashTime: 0.22, perfectWindow: ACTION_TUNING.perfectWindow,
  critMult: 1.6, critBonus: 0.03, penBonus: 0, postureK: 0.8, physical: true,
  faji: false, element: 'wind', awakenWave: awakenWave({ shape: 'arc', arc: ROUND, range: 4.2, grow: true, dmg: 0.24, vfx: 'wind' }), ultimate: ULTIMATES['doppel'] ?? null,
};

// ---------- Langklinge ----------

const LK: ActionStyleDef = {
  id: 'langklinge', label: 'Langklinge', title: 'Iaijutsu-Meister', color: '#D8F0FF', accent: '#8AC8FF', visual: 'langklinge', idleClip: 'Melee_2H_Idle',
  desc: 'Blitzschnelle Zieh-Schnitte mit hoher Durchschlagskraft und dem längsten Zeitfenster für perfekte Konter.',
  light: [
    move({ id: 'langklinge.l1', label: 'Zieh-Schnitt', clip: 'Melee_1H_Attack_Slice_Horizontal', dur: 0.42, hits: [{ range: 3.4, arc: 2.6, dmg: 0.44, poise: 11, pen: 1 }] }),
    move({ id: 'langklinge.l2', label: 'Fallender Mond', clip: 'Melee_1H_Attack_Chop', dur: 0.44, hits: [{ range: 3.3, arc: 1.7, dmg: 0.47, poise: 13, pen: 1 }] }),
    move({ id: 'langklinge.l3', label: 'Weiter Bogen', clip: 'Melee_2H_Attack_Slice', dur: 0.48, hits: [{ range: 3.5, arc: 2.8, dmg: 0.5, poise: 13, pen: 1 }] }),
    move({ id: 'langklinge.l4', label: 'Nadelstich', clip: 'Melee_2H_Attack_Stab', dur: 0.5, lunge: 5, hits: [{ shape: 'line', range: 4.2, width: 1.2, dmg: 0.6, poise: 18, knock: 6, pen: 2, fx: 'stab', hitstop: 0.08 }] }),
    move({ id: 'langklinge.l5', through: true, label: 'Mondsichel-Schnitt', clip: 'Melee_1H_Attack_Slice_Horizontal', dur: 0.8, dashTo: 5, dashTime: 0.14, iframes: 0.2, afterimage: true, finisher: true, hits: [{ shape: 'arc', arc: ROUND, range: 4.4, dmg: 1.08, poise: 30, knock: 9, fling: 11, pen: 2, fx: 'spin', hitstop: 0.13, shake: 0.6, at: [0.38, 0.55] }] }),
  ],
  branch: [
    move({ id: 'langklinge.b1', label: 'Schildbrecher-Stoß', clip: 'Melee_2H_Attack_Stab', dur: 0.52, lunge: 6, hits: [{ shape: 'line', range: 4.2, width: 1.4, dmg: 0.72, poise: 42, knock: 7, breakGuard: true, pen: 2, fx: 'stab', hitstop: 0.1, shake: 0.4 }] }),
    move({ id: 'langklinge.b2', label: 'Orkan-Launcher', clip: 'Melee_2H_Attack_Slice', dur: 0.54, rise: 10.3, hits: [{ shape: 'circle', offset: 1.4, range: 3.0, dmg: 0.63, poise: 22, knock: 1, launch: 10.5, maxTargets: 12, pen: 1, fx: 'heavy', hitstop: 0.08, shake: 0.35 }] }),
    move({ id: 'langklinge.b3', label: '360°-Massenschlacht-Feger', clip: 'Melee_2H_Attack_Spin', dur: 0.9, hits: ticks(2, 0.2, 0.74, { arc: ROUND, range: 5.0, dmg: 0.47, poise: 18, knock: 9, fling: 9, pen: 1, fx: 'spin', hitstop: 0.06, shake: 0.3 }) }),
    move({ id: 'langklinge.b4', label: 'Langstrecken-Schockwelle', clip: 'Melee_2H_Attack_Slice', dur: 0.66, hits: [{ shape: 'line', range: 16, width: 2.4, dmg: 0.88, poise: 26, knock: 7, fling: 9, pen: 2, fx: 'slash', hitstop: 0.09, shake: 0.45 }] }),
  ],
  heavy: move({ id: 'langklinge.s', through: true, label: 'Iai-Zug', clip: 'Melee_2H_Attack_Chop', dur: 0.75, dashTo: 3, dashTime: 0.12, hits: [{ shape: 'line', range: 4.6, width: 2.0, dmg: 1, poise: 34, knock: 7, pen: 2, fx: 'heavy', hitstop: 0.12, shake: 0.55 }] }),
  air: [
    move({ id: 'langklinge.a1', label: 'Luft-Zieh-Schnitt', clip: 'Melee_1H_Attack_Slice_Horizontal', dur: 0.38, air: true, hits: [{ ...AIR, range: 3.4, arc: 2.6, dmg: 0.42, poise: 10, pen: 1 }] }),
    move({ id: 'langklinge.a2', label: 'Luftbogen', clip: 'Melee_2H_Attack_Slice', dur: 0.42, air: true, hits: [{ ...AIR, range: 3.5, arc: 2.8, dmg: 0.44, poise: 11, pen: 1 }] }),
    move({ id: 'langklinge.a3', label: 'Mondfall', clip: 'Melee_1H_Attack_Chop', dur: 0.42, air: true, hits: [{ ...AIR, range: 3.4, arc: 1.9, dmg: 0.48, poise: 13, pen: 1, juggle: 4.2 }] }),
  ],
  meteor: move({ id: 'langklinge.m', label: 'Meteor-Sturzangriff', clip: 'Melee_1H_Attack_Jump_Chop', dur: 1.05, meteor: true, air: true, hits: [{ shape: 'circle', range: 4.0, dmg: 0.92, poise: 26, knock: 8, launch: 4, fling: 10, pen: 1, fx: 'heavy', hitstop: 0.11, shake: 0.65 }] }),
  finisher: move({ id: 'langklinge.f', label: 'Letzter Mondschein', clip: 'Melee_1H_Attack_Slice_Horizontal', dur: 1.1, hyper: true, iframes: 1.1, cutin: 'Letzter Mondschein!', dashTo: 3, dashTime: 0.12, afterimage: true, hits: [{ shape: 'line', range: 5, width: 2.4, dmg: 1, poise: 0, knock: 9, pen: 2, fx: 'slash', hitstop: 0.3, shake: 1.0, at: [0.35, 0.5] }] }),
  skills: [
    skill({ id: 'langklinge.k1', through: true, slot: 1, label: 'Iai: Blitzzug', short: 'Iai', icon: '⟿', cd: 8, desc: 'Ein einziger Zieh-Schnitt quer durch 6 m – Rüstung zählt kaum.', clip: 'Melee_1H_Attack_Slice_Horizontal', dur: 0.66, dashTo: 6, dashTime: 0.12, iframes: 0.3, afterimage: true, hits: [{ shape: 'line', range: 3.0, width: 2.4, dmg: 2.67, poise: 30, knock: 7, pen: 3, fx: 'slash', hitstop: 0.12, shake: 0.5, at: [0.25, 0.45] }] }),
    skill({ id: 'langklinge.k2', slot: 2, label: 'Mondspiegel', short: 'Spiegel', icon: '◐', cd: 10, desc: 'Konterhaltung: wer jetzt zuschlägt, wird hinterrücks erwidert; am Ende entlädt sich eine Mondsichel-Welle 10 m weit.', clip: 'Melee_Blocking', dur: 1.0, from: 0, to: 1, magnet: false, lunge: 0, counter: 1.0, hits: [{ shape: 'line', range: 10, width: 2.4, grow: true, at: [0.84, 0.96], dmg: 0.7, poise: 16, knock: 6, fx: 'slash', vfx: 'mond' }] }),
    skill({ id: 'langklinge.k3', slot: 3, label: 'Kreuzwind', short: 'Kreuz', icon: '✕', cd: 11, desc: 'Zwei gekreuzte Fernschnitte, je 9 m weit.', clip: 'Melee_2H_Attack_Slice', dur: 0.85, from: 0.1, to: 0.9, hits: [{ shape: 'line', range: 9, width: 2.0, dmg: 1.77, poise: 18, knock: 5, pen: 2, at: [0.25, 0.4] }, { shape: 'line', range: 9, width: 2.0, dmg: 1.77, poise: 18, knock: 7, pen: 2, at: [0.6, 0.75] }] }),
    skill({ id: 'langklinge.k4', slot: 4, label: 'Hundert Monde', short: 'Monde', icon: '☾', cd: 16, desc: 'Gesammelter Rundumschnitt auf 5,5 m mit großem Haltungsschaden.', clip: 'Melee_2H_Attack_Spin', dur: 1.2, hyper: true, cutin: 'Hundert Monde!', hits: [{ arc: ROUND, range: 5.5, dmg: 5.05, poise: 60, knock: 10, fling: 12, pen: 2, fx: 'spin', hitstop: 0.15, shake: 0.8, at: [0.5, 0.7] }] }),
  ],
  jumps: 2, airDashes: 1, dashSpeed: 16, dashTime: 0.26, perfectWindow: 0.27,
  critMult: 1.7, critBonus: 0.03, penBonus: 1, postureK: 1.0, physical: true,
  faji: false, element: 'mond', awakenWave: awakenWave({ range: 12, width: 1.8, pen: 2, vfx: 'mond' }), ultimate: ULTIMATES['langklinge'] ?? null,
};

// ---------- Sturmfaust (schneller Faustkampf) ----------

const SF: ActionStyleDef = {
  id: 'sturmfaust', label: 'Sturmfaust', title: 'Schneller Faustkämpfer', color: '#FFB45A', accent: '#FFE07A', visual: 'faust', idleClip: 'Melee_Unarmed_Idle',
  desc: 'Waffenloser Hochgeschwindigkeits-Stil: rasante Schlagserien, Sprungtritte und Nachbild-Fäuste.',
  light: [
    move({ id: 'sturmfaust.l1', label: 'Linke Gerade', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.28, hits: [{ range: 2.1, arc: 1.7, dmg: 0.39, poise: 7, knock: 1.5, fx: 'punch', hitstop: 0.04 }] }),
    move({ id: 'sturmfaust.l2', label: 'Rechte Gerade', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.28, hits: [{ range: 2.1, arc: 1.7, dmg: 0.39, poise: 7, knock: 1.5, fx: 'punch', hitstop: 0.04 }] }),
    move({ id: 'sturmfaust.l3', label: 'Wirbeltritt', clip: 'Melee_Unarmed_Attack_Kick', dur: 0.32, hits: [{ range: 2.4, arc: 2.0, dmg: 0.48, poise: 10, knock: 3, fx: 'heavy', hitstop: 0.05 }] }),
    move({ id: 'sturmfaust.l4', label: 'Nachbild-Hagel', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.6, from: 0.05, to: 0.75, afterimage: true, hits: ticks(4, 0.15, 0.85, { range: 2.3, arc: 1.8, dmg: 0.2, poise: 4, knock: 0.8, fx: 'punch', hitstop: 0.02 }) }),
    move({ id: 'sturmfaust.l5', label: 'Sturmfaust-Wirbeltritt', clip: 'Melee_2H_Attack_Spinning', dur: 0.66, finisher: true, hits: [{ arc: ROUND, range: 3.3, dmg: 1.21, poise: 26, knock: 9, launch: 3, fling: 11, fx: 'spin', hitstop: 0.12, shake: 0.5 }] }),
  ],
  branch: [
    move({ id: 'sturmfaust.b1', label: 'Schildbrecher-Stoß', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.4, lunge: 6, hits: [{ range: 2.5, arc: 1.3, dmg: 0.81, poise: 36, knock: 7, breakGuard: true, fx: 'punch', hitstop: 0.1, shake: 0.4 }] }),
    move({ id: 'sturmfaust.b2', label: 'Orkan-Launcher', clip: 'Melee_Unarmed_Attack_Kick', dur: 0.44, rise: 11, hits: [{ shape: 'circle', offset: 1.0, range: 2.8, dmg: 0.71, poise: 18, knock: 1, launch: 11, maxTargets: 12, fx: 'heavy', hitstop: 0.08, shake: 0.35 }] }),
    move({ id: 'sturmfaust.b3', label: '360°-Massenschlacht-Feger', clip: 'Melee_2H_Attack_Spinning', dur: 0.62, from: 0, to: 1, hits: ticks(3, 0.1, 0.85, { arc: ROUND, range: 4.0, dmg: 0.38, poise: 9, knock: 7, fling: 8, fx: 'spin', hitstop: 0.04 }) }),
    move({ id: 'sturmfaust.b4', label: 'Langstrecken-Schockwelle', clip: 'Ranged_Magic_Shoot', dur: 0.6, lunge: 0, hits: [{ shape: 'line', range: 13, width: 2.8, dmg: 1.04, poise: 22, knock: 7, fling: 9, fx: 'punch', hitstop: 0.08, shake: 0.45 }] }),
  ],
  heavy: move({ id: 'sturmfaust.s', label: 'Sprungfaust', clip: 'Melee_1H_Attack_Jump_Chop', dur: 0.66, lunge: 4.5, hits: [{ range: 2.6, arc: 2.0, dmg: 1.21, poise: 30, knock: 8, fx: 'heavy', hitstop: 0.11, shake: 0.5 }] }),
  air: [
    move({ id: 'sturmfaust.a1', label: 'Luftgerade', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.28, air: true, hits: [{ ...AIR, range: 2.3, arc: 1.8, dmg: 0.39, poise: 7, fx: 'punch' }] }),
    move({ id: 'sturmfaust.a2', label: 'Lufttritt', clip: 'Melee_Unarmed_Attack_Kick', dur: 0.32, air: true, hits: [{ ...AIR, range: 2.5, arc: 2.0, dmg: 0.44, poise: 8, fx: 'heavy' }] }),
    move({ id: 'sturmfaust.a3', label: 'Nachbild-Faust', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.3, air: true, afterimage: true, hits: [{ ...AIR, range: 2.4, arc: 1.8, dmg: 0.41, poise: 8, fx: 'punch' }] }),
    move({ id: 'sturmfaust.a4', label: 'Donnerabsatz', clip: 'Melee_Unarmed_Attack_Kick', dur: 0.34, air: true, hits: [{ ...AIR, range: 2.5, arc: 2.0, dmg: 0.51, poise: 10, juggle: 4.6, fx: 'heavy' }] }),
  ],
  meteor: move({ id: 'sturmfaust.m', label: 'Meteor-Sturzangriff', clip: 'Melee_Unarmed_Attack_Kick', dur: 0.95, meteor: true, air: true, hits: [{ shape: 'circle', range: 3.6, dmg: 1.15, poise: 24, knock: 8, launch: 4, fling: 10, fx: 'heavy', hitstop: 0.1, shake: 0.6 }] }),
  finisher: move({ id: 'sturmfaust.f', label: 'Tausend Donner', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 1.05, hyper: true, iframes: 1.05, afterimage: true, cutin: 'Tausend Donner!', hits: [{ range: 2.6, arc: 1.6, dmg: 1, poise: 0, knock: 10, fx: 'punch', hitstop: 0.3, shake: 0.9 }] }),
  skills: [
    skill({ id: 'sturmfaust.k1', slot: 1, label: 'Nachbildfäuste', short: 'Hagel', icon: '✊', cd: 8, desc: 'Zehn Faustschläge in einer Sekunde, die Nachbilder schlagen mit.', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 1.0, from: 0.1, to: 0.7, afterimage: true, hits: ticks(10, 0.05, 0.95, { range: 2.5, arc: 1.9, dmg: 0.26, poise: 4, knock: 0.6, fx: 'punch', hitstop: 0.015 }, { dmg: 0.87, knock: 8, poise: 16, hitstop: 0.1, shake: 0.4 }) }),
    skill({ id: 'sturmfaust.k2', slot: 2, label: 'Donnertritt', short: 'Tritt', icon: '⚡', cd: 7, desc: 'Fliegender Sprungtritt über 6 m, schleudert beim Aufprall hoch.', clip: 'Melee_Unarmed_Attack_Kick', dur: 0.7, dashTo: 6, dashTime: 0.3, iframes: 0.2, airOk: true, hits: [{ shape: 'circle', offset: 0.8, range: 2.6, dmg: 2.44, poise: 28, knock: 4, launch: 9, fx: 'heavy', hitstop: 0.11, shake: 0.5, at: [0.45, 0.6], down: 1.8 }] }),
    skill({ id: 'sturmfaust.k3', through: true, slot: 3, label: 'Sturmschritt-Kette', short: 'Kette', icon: '≫', cd: 9, desc: 'Drei Blitz-Dashes mit Faustschlag, unverwundbar dazwischen.', clip: 'Dodge_Forward', dur: 0.9, from: 0, to: 1, dashTo: 7.5, dashTime: 0.7, iframes: 0.75, afterimage: true, hits: ticks(3, 0.1, 0.8, { shape: 'circle', range: 2.3, dmg: 1.05, poise: 10, knock: 4, fx: 'punch', hitstop: 0.03 }) }),
    skill({ id: 'sturmfaust.k4', slot: 4, label: 'Himmelsfaust', short: 'Himmel', icon: '☝', cd: 10, desc: 'Aufwärtshaken, der dich und alle Getroffenen hoch in die Luft trägt.', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.62, rise: 12.5, hits: [{ shape: 'circle', offset: 0.9, range: 2.8, dmg: 2.64, poise: 26, knock: 1, launch: 13, maxTargets: 12, fx: 'heavy', hitstop: 0.1, shake: 0.45 }] }),
  ],
  jumps: 3, airDashes: 1, dashSpeed: 18, dashTime: 0.24, perfectWindow: ACTION_TUNING.perfectWindow,
  critMult: 1.7, critBonus: 0.04, penBonus: 0, postureK: 0.85, physical: true,
  faji: false, element: 'blitz', awakenWave: awakenWave({ shape: 'arc', arc: 1.4, range: 7, dmg: 0.28, vfx: 'blitz' }), ultimate: ULTIMATES['sturmfaust'] ?? null,
};

// ---------- Erdspalter (starker Faustkampf) ----------

const ES: ActionStyleDef = {
  id: 'erdspalter', label: 'Erdspalter', title: 'Starker Faustkämpfer', color: '#E0B88A', accent: '#C8783A', visual: 'faust', idleClip: 'Melee_Unarmed_Idle',
  desc: 'Waffenloser Schwergewichts-Stil: seismische Bodenstöße, Greifwürfe und gewaltige Druckwellen.',
  light: [
    move({ id: 'erdspalter.l1', label: 'Hammerfaust', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.48, hits: [{ range: 2.3, arc: 1.7, dmg: 0.51, poise: 16, knock: 4, fx: 'punch', hitstop: 0.07, shake: 0.25 }] }),
    move({ id: 'erdspalter.l2', label: 'Rammtritt', clip: 'Melee_Unarmed_Attack_Kick', dur: 0.5, hits: [{ range: 2.5, arc: 1.9, dmg: 0.56, poise: 18, knock: 6, fx: 'heavy', hitstop: 0.08, shake: 0.3 }] }),
    move({ id: 'erdspalter.l3', label: 'Felsschmetterer', clip: 'Melee_1H_Attack_Jump_Chop', dur: 0.6, hits: [{ shape: 'circle', offset: 1.4, range: 2.6, dmg: 0.66, poise: 24, knock: 5, fx: 'heavy', hitstop: 0.09, shake: 0.4 }] }),
    move({ id: 'erdspalter.l4', label: 'Schulterramme', clip: 'Melee_Block_Attack', dur: 0.5, lunge: 6, hits: [{ range: 2.6, arc: 1.6, dmg: 0.6, poise: 26, knock: 9, fx: 'heavy', hitstop: 0.08, shake: 0.35 }] }),
    move({ id: 'erdspalter.l5', label: 'Erdspalter', clip: 'Melee_2H_Attack_Chop', dur: 0.95, hyper: true, finisher: true, hits: [{ shape: 'circle', offset: 1.2, range: 5.0, dmg: 1.24, poise: 55, knock: 10, launch: 6, fling: 14, fx: 'heavy', hitstop: 0.15, shake: 0.9 }] }),
  ],
  branch: [
    move({ id: 'erdspalter.b1', label: 'Schildbrecher-Stoß', clip: 'Melee_Block_Attack', dur: 0.52, lunge: 6, hits: [{ range: 2.7, arc: 1.4, dmg: 0.85, poise: 60, knock: 9, breakGuard: true, fx: 'heavy', hitstop: 0.12, shake: 0.5 }] }),
    move({ id: 'erdspalter.b2', label: 'Orkan-Launcher', clip: 'Melee_Unarmed_Attack_Kick', dur: 0.56, rise: 10, hits: [{ shape: 'circle', offset: 1.0, range: 3.0, dmg: 0.72, poise: 30, knock: 1, launch: 10.4, maxTargets: 12, fx: 'heavy', hitstop: 0.1, shake: 0.45 }] }),
    move({ id: 'erdspalter.b3', label: '360°-Massenschlacht-Feger', clip: 'Melee_2H_Attack_Spin', dur: 0.95, hyper: true, hits: ticks(2, 0.2, 0.74, { arc: ROUND, range: 4.8, dmg: 0.58, poise: 26, knock: 10, fling: 12, fx: 'spin', hitstop: 0.07, shake: 0.4 }) }),
    move({ id: 'erdspalter.b4', label: 'Langstrecken-Schockwelle', clip: 'Melee_2H_Attack_Chop', dur: 0.85, hyper: true, hits: [{ shape: 'line', range: 14, width: 3.6, dmg: 1.11, poise: 42, knock: 9, fling: 13, fx: 'heavy', hitstop: 0.11, shake: 0.65 }] }),
  ],
  heavy: move({ id: 'erdspalter.s', label: 'Bodenstoß', clip: 'Melee_2H_Attack_Chop', dur: 0.85, hyper: true, hits: [{ shape: 'circle', offset: 1.1, range: 3.6, dmg: 1.19, poise: 50, knock: 9, launch: 3, fling: 9, fx: 'heavy', hitstop: 0.13, shake: 0.7 }] }),
  air: [
    move({ id: 'erdspalter.a1', label: 'Luftramme', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.4, air: true, hits: [{ ...AIR, range: 2.4, arc: 1.8, dmg: 0.49, poise: 14, fx: 'punch' }] }),
    move({ id: 'erdspalter.a2', label: 'Luftstampfer', clip: 'Melee_Unarmed_Attack_Kick', dur: 0.42, air: true, hits: [{ ...AIR, range: 2.6, arc: 2.0, dmg: 0.53, poise: 16, fx: 'heavy' }] }),
    move({ id: 'erdspalter.a3', label: 'Lufthammer', clip: 'Melee_1H_Attack_Jump_Chop', dur: 0.46, air: true, hits: [{ ...AIR, range: 2.6, arc: 2.0, dmg: 0.6, poise: 20, juggle: 3.8, fx: 'heavy' }] }),
  ],
  meteor: move({ id: 'erdspalter.m', label: 'Meteor-Sturzangriff', clip: 'Melee_1H_Attack_Jump_Chop', dur: 1.25, meteor: true, air: true, hyper: true, hits: [{ shape: 'circle', range: 5.2, dmg: 1.36, poise: 50, knock: 10, launch: 5, fling: 14, fx: 'heavy', hitstop: 0.14, shake: 0.95 }] }),
  finisher: move({ id: 'erdspalter.f', label: 'Weltenbeben', clip: 'Throw', dur: 1.3, hyper: true, iframes: 1.3, cutin: 'Weltenbeben!', hits: [{ range: 2.8, arc: 1.8, dmg: 1, poise: 0, knock: 11, pull: true, fx: 'heavy', hitstop: 0.32, shake: 1.2 }] }),
  skills: [
    skill({ id: 'erdspalter.k1', slot: 1, label: 'Bebenstampfer', short: 'Beben', icon: '◎', cd: 8, desc: 'Zwei seismische Ringe: nah und weit, schleudern hoch.', clip: 'Melee_2H_Attack_Chop', dur: 1.1, magnet: false, lunge: 0, hyper: true, hits: [{ shape: 'circle', range: 3.2, dmg: 2.16, poise: 34, knock: 6, launch: 5, fling: 9, fx: 'heavy', hitstop: 0.1, shake: 0.6, at: [0.36, 0.5] }, { shape: 'circle', range: 6.0, inner: 2.6, dmg: 1.59, poise: 26, knock: 9, launch: 3, fling: 11, fx: 'heavy', hitstop: 0.07, shake: 0.5, at: [0.62, 0.74] }] }),
    skill({ id: 'erdspalter.k2', slot: 2, label: 'Titanengriff', short: 'Griff', icon: '✋', cd: 9, desc: 'Packt den nächsten Gegner und schmettert ihn in den Boden.', clip: 'Throw', dur: 1.05, hyper: true, hits: [{ range: 2.8, arc: 1.6, dmg: 0.57, poise: 10, knock: 0, pull: true, maxTargets: 1, at: [0.22, 0.32] }, { shape: 'circle', offset: 1.4, range: 2.8, dmg: 3.2, poise: 55, knock: 6, launch: 8, fling: 10, fx: 'heavy', hitstop: 0.14, shake: 0.7, at: [0.58, 0.7] }] }),
    skill({ id: 'erdspalter.k3', slot: 3, label: 'Felsbrecher-Welle', short: 'Welle', icon: '≋', cd: 11, desc: 'Druckwelle durch den Boden, 15 m weit und 3,5 m breit.', clip: 'Ranged_Magic_Shoot', dur: 0.8, lunge: 0, hyper: true, hits: [{ shape: 'line', range: 15, width: 3.6, dmg: 3.44, poise: 40, knock: 10, fling: 13, fx: 'heavy', hitstop: 0.11, shake: 0.6 }] }),
    skill({ id: 'erdspalter.k4', slot: 4, label: 'Weltenspalter', short: 'Welt', icon: '☄', cd: 16, desc: 'Sprung hoch in die Luft und Einschlag mit 6,5 m Druckwelle.', clip: 'Melee_1H_Attack_Jump_Chop', dur: 1.3, rise: 11, hyper: true, cutin: 'Weltenspalter!', airOk: true, hits: [{ shape: 'circle', range: 6.5, dmg: 5.34, poise: 90, knock: 11, launch: 6, fling: 16, fx: 'heavy', hitstop: 0.16, shake: 1.1, at: [0.7, 0.85], down: 3 }] }),
  ],
  jumps: 2, airDashes: 1, dashSpeed: 13, dashTime: 0.3, perfectWindow: ACTION_TUNING.perfectWindow,
  critMult: 1.55, critBonus: 0, penBonus: 0, postureK: 1.3, physical: true,
  faji: false, element: 'erde', awakenWave: awakenWave({ shape: 'circle', range: 4.5, offset: 1.2, grow: true, dmg: 0.34, poise: 12, launch: 3, vfx: 'erde' }), ultimate: ULTIMATES['erdspalter'] ?? null,
};

// ---------- Faji-Wirken (Fernkampf; Faji-Künste folgen in Phase 4.6B) ----------

const FJ: ActionStyleDef = {
  id: 'effekt', label: 'Faji-Wirken', title: 'Elementar-Wirker', color: '#D8A8FF', accent: '#9F7DFF', visual: 'effekt', idleClip: 'Idle_B',
  desc: 'Fernkampf mit Faji-Geschossen und Flächenstößen. Die großen Faji-Künste folgen mit Phase 4.6B.',
  light: [
    move({ id: 'effekt.l1', label: 'Faji-Funke', clip: 'Ranged_Magic_Shoot', dur: 0.46, magnet: false, lunge: 0, hits: [{ range: 22, dmg: 0.46, poise: 8, knock: 2, fx: 'magic', projectile: shot('#C77DFF') }] }),
    move({ id: 'effekt.l2', label: 'Faji-Funke', clip: 'Ranged_Magic_Spellcasting', dur: 0.44, magnet: false, lunge: 0, hits: [{ range: 22, dmg: 0.46, poise: 8, knock: 2, fx: 'magic', projectile: shot('#9F7DFF') }] }),
    move({ id: 'effekt.l3', label: 'Doppelfunke', clip: 'Ranged_Magic_Shoot', dur: 0.48, magnet: false, lunge: 0, hits: [{ range: 22, dmg: 0.3, poise: 6, knock: 2, fx: 'magic', projectile: shot('#B07DFF', 30, 0.55, false, 2, 0.12) }] }),
    move({ id: 'effekt.l4', label: 'Lichtlanze', clip: 'Ranged_Magic_Shoot', dur: 0.5, magnet: false, lunge: 0, hits: [{ range: 24, dmg: 0.63, poise: 14, knock: 5, fx: 'magic', projectile: shot('#E0A0FF', 34, 0.9, true) }] }),
    move({ id: 'effekt.l5', label: 'Faji-Nova', clip: 'Ranged_Magic_Raise', dur: 0.9, magnet: false, lunge: 0, finisher: true, hits: [{ shape: 'circle', range: 5.5, dmg: 1.01, poise: 34, knock: 10, launch: 5, fling: 10, fx: 'magic', hitstop: 0.12, shake: 0.55 }] }),
  ],
  branch: [
    move({ id: 'effekt.b1', label: 'Bannstoß', clip: 'Ranged_Magic_Shoot', dur: 0.5, lunge: 0, magnet: false, hits: [{ shape: 'arc', range: 4.2, arc: 1.4, dmg: 0.63, poise: 40, knock: 8, breakGuard: true, fx: 'magic', hitstop: 0.09 }] }),
    move({ id: 'effekt.b2', label: 'Orkan-Launcher', clip: 'Ranged_Magic_Raise', dur: 0.62, rise: 10, lunge: 0, hits: [{ shape: 'circle', offset: 1.5, range: 3.4, dmg: 0.56, poise: 22, knock: 1, launch: 10.4, maxTargets: 12, fx: 'magic', hitstop: 0.08 }] }),
    move({ id: 'effekt.b3', label: '360°-Faji-Ring', clip: 'Ranged_Magic_Raise', dur: 0.85, lunge: 0, magnet: false, hits: [{ shape: 'circle', range: 5.2, dmg: 0.78, poise: 24, knock: 9, fling: 10, fx: 'magic', hitstop: 0.08, shake: 0.4 }] }),
    move({ id: 'effekt.b4', label: 'Langstrecken-Schockwelle', clip: 'Ranged_Magic_Shoot', dur: 0.62, lunge: 0, magnet: false, hits: [{ shape: 'line', range: 18, width: 3, dmg: 0.78, poise: 24, knock: 7, fling: 9, fx: 'magic', hitstop: 0.08, shake: 0.4 }] }),
  ],
  heavy: move({ id: 'effekt.s', label: 'Faji-Stoß', clip: 'Ranged_Magic_Raise', dur: 0.8, lunge: 0, magnet: false, hits: [{ shape: 'circle', offset: 1.5, range: 4.0, dmg: 0.89, poise: 36, knock: 10, launch: 5, fx: 'magic', hitstop: 0.11, shake: 0.5 }] }),
  air: [
    move({ id: 'effekt.a1', label: 'Luftfunke', clip: 'Ranged_Magic_Shoot', dur: 0.4, air: true, magnet: false, hits: [{ ...AIR, range: 22, dmg: 0.41, poise: 7, fx: 'magic', projectile: shot('#C77DFF') }] }),
    move({ id: 'effekt.a2', label: 'Luftfunke', clip: 'Ranged_Magic_Spellcasting', dur: 0.4, air: true, magnet: false, hits: [{ ...AIR, range: 22, dmg: 0.41, poise: 7, fx: 'magic', projectile: shot('#9F7DFF') }] }),
    move({ id: 'effekt.a3', label: 'Luftnova', clip: 'Ranged_Magic_Raise', dur: 0.5, air: true, magnet: false, hits: [{ ...AIR, shape: 'circle', range: 3.6, dmg: 0.52, poise: 12, juggle: 4, fx: 'magic' }] }),
  ],
  meteor: move({ id: 'effekt.m', label: 'Sternensturz', clip: 'Ranged_Magic_Raise', dur: 1.0, meteor: true, air: true, hits: [{ shape: 'circle', range: 4.6, dmg: 0.89, poise: 26, knock: 9, launch: 4, fling: 10, fx: 'magic', hitstop: 0.11, shake: 0.6 }] }),
  finisher: move({ id: 'effekt.f', label: 'Sternenbann', clip: 'Ranged_Magic_Raise', dur: 1.2, hyper: true, iframes: 1.2, cutin: 'Sternenbann!', magnet: true, hits: [{ shape: 'circle', offset: 1.5, range: 3.4, dmg: 1, poise: 0, knock: 10, fx: 'magic', hitstop: 0.3, shake: 1.0 }] }),
  skills: [
    skill({ id: 'effekt.k1', slot: 1, label: 'Funkenfächer', short: 'Fächer', icon: '✧', cd: 7, desc: 'Fünf Faji-Funken im Fächer.', clip: 'Ranged_Magic_Shoot', dur: 0.6, magnet: false, lunge: 0, hits: [{ range: 22, dmg: 2.16, poise: 8, knock: 3, fx: 'magic', projectile: shot('#C77DFF', 30, 0.6, false, 5, 0.22) }] }),
    skill({ id: 'effekt.k2', slot: 2, label: 'Bannkreis', short: 'Bann', icon: '◍', cd: 10, desc: 'Faji-Ring stößt alles im Umkreis von 5 m fort.', clip: 'Ranged_Magic_Raise', dur: 0.85, magnet: false, lunge: 0, hits: [{ shape: 'circle', range: 5.2, dmg: 3.07, poise: 30, knock: 12, fling: 12, fx: 'magic', hitstop: 0.09, shake: 0.5 }] }),
    skill({ id: 'effekt.k3', slot: 3, label: 'Schwebeschritt', short: 'Schweben', icon: '☁', cd: 8, desc: 'Steigt mit einer Faji-Entladung in die Luft und sammelt Kraft für Luftangriffe.', clip: 'Ranged_Magic_Spellcasting', dur: 0.5, rise: 9.5, magnet: false, lunge: 0, airOk: true, hits: [{ shape: 'circle', range: 3.6, at: [0.05, 0.25], dmg: 0.5, poise: 12, knock: 5, launch: 4, fx: 'magic', down: 2 }] }),
    skill({ id: 'effekt.k4', slot: 4, label: 'Leuchtlanze', short: 'Lanze', icon: '➶', cd: 12, desc: 'Durchschlagende Lanze aus reinem Faji.', clip: 'Ranged_Magic_Shoot', dur: 0.75, magnet: false, lunge: 0, cutin: 'Leuchtlanze!', hits: [{ range: 30, dmg: 3.1, poise: 40, knock: 9, fx: 'magic', projectile: shot('#FF8AFF', 40, 1.5, true) }] }),
  ],
  jumps: 2, airDashes: 1, dashSpeed: 15, dashTime: 0.26, perfectWindow: ACTION_TUNING.perfectWindow,
  critMult: 1.6, critBonus: 0, penBonus: 0, postureK: 0.8, physical: false,
  faji: false, element: 'faji', awakenWave: awakenWave({ range: 12, width: 2.2, vfx: 'faji' }), ultimate: ULTIMATES['effekt'] ?? null,
};

export const ACTION_STYLES: Record<ActionStyleId, ActionStyleDef> = {
  zweihaender: ZW, saebel: SA, doppel: DO, langklinge: LK, sturmfaust: SF, erdspalter: ES, effekt: FJ,
  ...FAJI_STYLES,
};

// ---------- Vorwärts-Momentum (4.6C) ----------

/**
 * Schub je Schlagstufe (m, `ActionMove.push`): die Kette steigt bis zum Finisher-Schlag an, Verzweigungen und Schwer sind wuchtig,
 * Luftschläge kurz; Techniken ohne eigenen Vorstoß gleiten beim Wirken vor (mehrtreffrige über die ganze Dauer). Der Stil-Faktor macht
 * Zweihänder und Langklinge (Zieh-Schnitte) weiter, Doppelklinge und Sturmfaust (viele Treffer) kürzer; Faji-Künste etwas kürzer.
 */
export const MOMENTUM = {
  chainFirst: 1.0,
  chainLast: 1.5,
  chainFinisher: 2.1,
  branch: 1.6,
  heavy: 1.8,
  air: 0.7,
  finisher: 1.2,
  skillFlow: 2.6,
  skillStep: 1.5,
  styleK: { zweihaender: 1.15, saebel: 1.0, doppel: 0.9, langklinge: 1.3, sturmfaust: 0.9, erdspalter: 1.05, effekt: 0.75 } as Readonly<Partial<Record<ActionStyleId, number>>>,
  fajiK: 0.85,
} as const;

/** Schub eintragen, wo ein Angriff noch keinen eigenen hat (Launcher und Meteor steigen bzw. stürzen und bekommen keinen) */
function applyMomentum(s: ActionStyleDef) {
  const k = s.faji ? MOMENTUM.fajiK : MOMENTUM.styleK[s.id] ?? 1;
  const n = s.light.length;
  s.light.forEach((m, i) => {
    if (m.push) return;
    m.push = (i === n - 1 ? MOMENTUM.chainFinisher : MOMENTUM.chainFirst + (MOMENTUM.chainLast - MOMENTUM.chainFirst) * (i / Math.max(1, n - 2))) * k;
  });
  for (const m of s.branch) if (!m.push && !m.rise) m.push = MOMENTUM.branch * k;
  if (!s.heavy.push) s.heavy.push = MOMENTUM.heavy * k;
  for (const m of s.air) if (!m.push) m.push = MOMENTUM.air * k;
  if (!s.finisher.push) s.finisher.push = MOMENTUM.finisher * k;
  for (const m of s.skills) {
    if (m.push || m.dashTo > 0 || m.rise > 0 || m.counter > 0 || !m.hits.length) continue;
    m.push = (m.hits.length >= 3 ? MOMENTUM.skillFlow : MOMENTUM.skillStep) * k;
  }
}
for (const id of Object.keys(ACTION_STYLES) as ActionStyleId[]) applyMomentum(ACTION_STYLES[id]);

// ---------- Nachschlagen ----------

/** Alle Angriffe in einer flachen Liste (Index = `FighterState.moveIdx`): Ketten, Verzweigungen, Luft, Meteor, Finisher, Techniken */
export const ALL_MOVES: readonly ActionMove[] = (() => {
  const out: ActionMove[] = [];
  for (const id of ACTION_STYLE_IDS) {
    const s = ACTION_STYLES[id];
    out.push(...s.light, ...s.branch, s.heavy, ...s.air, s.meteor, s.finisher, ...s.skills);
    if (s.ultimate) out.push(s.ultimate);
  }
  // 4.6E: das 15. Ultimate (Kosmos) gehört keinem Stil, braucht aber einen festen Platz in der Liste
  out.push(SKYFALL_ULTIMATE);
  return out;
})();

const MOVE_INDEX = new Map<string, number>(ALL_MOVES.map((m, i) => [m.id, i]));
/** Index eines Angriffs über seine Kennung (−1 = unbekannt) */
export const moveIndex = (id: string): number => MOVE_INDEX.get(id) ?? -1;

/** Darstellungs-Stil (Waffe, Ruhehaltung) zu einem Action-Stil */
export const visualStyleOf = (id: ActionStyleId): StyleId => ACTION_STYLES[id].visual;

/** Action-Stil zu einem alten Kampfstil (Spielstand, Editor): Faust wird zur Sturmfaust */
export function actionStyleOf(style: StyleId): ActionStyleId {
  return style === 'faust' ? 'sturmfaust' : style;
}

/** Ist das ein gültiger Action-Stil? (Spielstand prüfen) */
export const isActionStyle = (v: unknown): v is ActionStyleId => typeof v === 'string' && (ACTION_STYLE_IDS as readonly string[]).includes(v);

/** Letzter Zeitpunkt eines Treffers in einem Angriff (s) – danach darf Laufen den Ausschwung abbrechen */
export const lastHitEnd = (m: ActionMove): number => (m.hits.length ? m.hits[m.hits.length - 1].t1 : 0);
