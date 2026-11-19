#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Offline-Musikrenderer für Sturmkrone: erzeugt die Orchester-Stems nach public/audio/music/ (44,1 kHz Stereo, Ogg Vorbis, nahtlos loopbar).

Aufruf:   python scripts/generate_music.py [--only <Teil des Namens>] [--list] [--emit-ts] [--wav]
Braucht:  numpy, soundfile   (pip install numpy soundfile)   – ohne soundfile werden WAV-Dateien geschrieben (groß).
Bausteine (Synthese, Hall, Komposition): scripts/music_synth.py.

Jedes Stück ist ein Satz Stems (ruhig, Spannung, Kampf bzw. Phase 1 und 2), die taktgenau gleich lang sind: der MusicDirector
(src/audio/musicDirector.ts) startet sie zusammen und blendet sie nach der Lage im Spiel. Alle Pegel sind je Stem auf einen Zielpegel
(RMS) normiert und gegen Übersteuern gesichert (weiche Begrenzung unter −1 dBFS).
public/audio/music/manifest.json hält Dauer, BPM und Loop-Punkte; `--emit-ts` druckt die Einträge für src/data/musicTracks.ts.
Eigene Aufnahmen: Datei als .ogg/.mp3 nach public/audio/music/ legen und in src/data/musicTracks.ts das Feld `file` (und bei Bedarf
loopStart/loopEnd) anpassen – ohne Code-Änderung.
"""
import json, math, os, sys, time
import numpy as np
from music_synth import *  # noqa: F401,F403
import music_synth as ms


def harmonize(mel, key, steps, tones):
    out = []
    for (st, du, m) in mel:
        idx = min(range(len(tones)), key=lambda k: abs(tones[k] - m))
        out.append((st, du, tones[max(0, min(len(tones) - 1, idx + steps))]))
    return out


def phrase_notes(mel, spb, phrases):
    """Töne aus den gewählten Phrasen (Nummer ab 0) behalten."""
    return [n for n in mel if int(n[0] // (4 * spb)) in phrases]


# ============================================================ Regionale Zusatzstimmen
def x_sub(piece, G, bars, mel):
    for b, (deg, q) in enumerate(bars):
        if b % 2 == 0:
            m = piece.key.tonic + deg - 24
            while m < 36:
                m += 12
            put(G, subdrone(float(mtof(m)), piece.step * piece.spb * 2, 0.8, piece.rg), piece.t(b * piece.spb), 0.0)


def x_shaku(piece, G, bars, mel):
    notes = [n for n in mel if n[0] % piece.spb == 0 and (n[0] // piece.spb) % 2 == 0]
    for (st, du, m) in notes:
        put(G, shakuhachi(float(mtof(m)), max(2.0, du * piece.step * 3), 0.75, piece.rg), piece.t(st), 0.1)


def x_chains_bells(piece, G, bars, mel):
    for b in range(0, len(bars), 2):
        put(G, bell(float(mtof(piece.key.tonic + 12 + (7 if b % 4 == 2 else 0))), 0.55, piece.rg, 6.0, True), piece.t(b * piece.spb), 0.2)
    for b in range(1, len(bars), 2):
        put(G, chains(piece.step * 4, 0.35, piece.rg), piece.t(b * piece.spb + piece.spb // 2), -0.1)


def x_shamisen_ost(piece, G, bars, mel):
    for b, (deg, q) in enumerate(bars):
        root = piece.key.tonic + deg
        while root < 52:
            root += 12
        while root >= 64:
            root -= 12
        for s in range(piece.spb):
            m = root + (0 if s % 4 == 0 else 7 if s % 4 == 2 else 5 if s % 4 == 1 else 12)
            put(G, shamisen(float(mtof(m)), 0.5, 0.7 if s % 4 == 0 else 0.45, piece.rg), piece.t(b * piece.spb + s), -0.3 + 0.6 * (s % 2))


def x_harpsi(piece, G, bars, mel):
    arp_part(piece, G, bars, harpsichord, pat_arp_16 if piece.spb == 8 else pat_arp_6, vel=0.5, base=57, spread=0.4)


def x_hurdy_mand(piece, G, bars, mel):
    for b, (deg, q) in enumerate(bars):
        root = piece.key.tonic + deg
        while root < 41:
            root += 12
        while root >= 53:
            root -= 12
        put(G, hurdy(float(mtof(root)), piece.step * piece.spb, 0.5, piece.rg), piece.t(b * piece.spb), -0.2)
        for s in (1, 4):
            for i, m in enumerate(chord_voicing(piece.key, deg, q, 60, 3)):
                put(G, mandolin(float(mtof(m)), piece.step * 1.6, 0.4, piece.rg), piece.t(b * piece.spb + s) + i * 0.012, 0.35)


def x_horns_march(piece, G, bars, mel):
    for b, (deg, q) in enumerate(bars):
        for i, m in enumerate(chord_voicing(piece.key, deg, q, 55, 3)):
            put(G, brass(float(mtof(m)), piece.step * piece.spb * 0.9, 0.35, piece.rg, bright=0.45, att=0.2), piece.t(b * piece.spb), -0.4 + 0.4 * i)


def x_strum_guitar(piece, G, bars, mel):
    for b, (deg, q) in enumerate(bars):
        ch = chord_voicing(piece.key, deg, q, 50, 4)
        for s in range(0, piece.spb, 1 if piece.spb == 6 else 2):
            for i, m in enumerate(ch):
                put(G, guitar(float(mtof(m)), 0.5, (0.55 if s % 3 == 0 else 0.4), piece.rg), piece.t(b * piece.spb + s) + i * 0.007, -0.3)


def x_fiddle_frenzy(piece, G, bars, mel):
    runs_part(piece, G, bars, fiddle, 0.5, per_step=2, base=64)


# ============================================================ Regionen (die fünf Kuchenstücke, Marine, Ankerglück)
def region_stems(name, c):
    key = Key(c['tonic'], c['scale'])
    P = Piece(name, c['bpm'], c['spb'], 4 * len(c['plan']), key)
    rg = P.rg
    mel, bars = build_melody(rg, key, c['plan'], c['progs'], P.spb, c['lo'], c['hi'])
    tones = key.tones(c['lo'] - 5, c['hi'] + 12)
    out = {}
    rt, wet = c.get('rt60', 2.8), c.get('wet', 0.38)

    # ---- ruhig: Melodie, Gegenstimme, Streicherfläche, Bass, Zupfbegleitung, leises Schlagwerk, Meeresbrise
    g = []
    G = P.new(); play_notes(P, G, mel, c['lead'], vel=c['lead_vel'], pan=c.get('lead_pan', 0.0), **c.get('lead_kw', {})); g.append((G, c['lead_eq'], 0.5, 1.0))
    if c.get('counter'):
        G = P.new()
        odd = set(range(1, len(c['plan']), 2))
        play_notes(P, G, harmonize(phrase_notes(mel, P.spb, odd), key, c.get('counter_steps', 2), tones), c['counter'], vel=c['lead_vel'] * 0.6, pan=0.35, trans=c.get('counter_trans', 0), **c.get('counter_kw', {}))
        g.append((G, c['counter_eq'], 0.5, 1.0))
    G = P.new(); pad_part(P, G, bars, strings, base=c.get('pad_base', 50), vel=c.get('pad_vel', 0.5), bright=c.get('pad_bright', 12)); g.append((G, EQ_STR, 0.6, 1.0))
    G = P.new(); bass_part(P, G, bars, c['bass'], c['bass_pat'], vel=c.get('bass_vel', 0.7)); g.append((G, EQ_WARM, 0.15, 1.0))
    if c.get('pluck'):
        G = P.new(); arp_part(P, G, bars, c['pluck'], c['pluck_pat'], vel=c.get('pluck_vel', 0.45), base=c.get('pluck_base', 55)); g.append((G, EQ_PLUCK, 0.35, 1.0))
    if c.get('calm_perc'):
        G = P.new(); drum_pattern(P, G, c['calm_perc'], vel=0.5); g.append((G, EQ_DRUM, 0.3, 1.0))
    if c.get('calm_extra'):
        G = P.new(); c['calm_extra'](P, G, bars, mel); g.append((G, c.get('calm_extra_eq', EQ_BREATH), 0.5, 1.0))
    if c.get('bed'):
        G = P.new(); b = noise_bed(P.N, rg, 150, 2500 if c['bed'] == 'sea' else 1500); G[0] += b * 0.12; G[1] += np.roll(b, 977) * 0.12; g.append((G, EQ_BED, 0.1, 1.0))
    out['calm'] = render_stem(P, g, rt, wet)

    # ---- Spannung: Ostinato, Pauken/Trommeln, Blech-Schwellungen, tiefe Streicher
    g = []
    G = P.new(); pulse_part(P, G, bars, c['pulse'], c.get('pulse_vel', 0.5), base=c.get('pulse_base', 48)); g.append((G, c.get('pulse_eq', EQ_PLUCK), 0.3, 1.0))
    G = P.new(); drum_pattern(P, G, c['tension_perc'], vel=0.85); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); brass_part(P, G, bars, 0.34, base=c.get('brass_base', 43), every=2, bright=0.55); g.append((G, EQ_BRASS, 0.45, 1.0))
    G = P.new(); pad_part(P, G, bars, strings, base=38, vel=0.55, n=2, bright=8, att=0.3); g.append((G, EQ_STR, 0.5, 1.0))
    if c.get('tension_extra'):
        G = P.new(); c['tension_extra'](P, G, bars, mel); g.append((G, c.get('tension_extra_eq', EQ_BREATH), 0.4, 1.0))
    out['tension'] = render_stem(P, g, rt, wet * 0.9)

    # ---- Kampf: schwere Trommeln, Blech-Thema, treibende Läufe, tiefer Bass, Chor, Becken
    g = []
    G = P.new(); drum_pattern(P, G, c['combat_perc'], vel=1.0); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); play_notes(P, G, mel, brass, vel=0.5, pan=-0.1, trans=c.get('hero_trans', -12), bright=0.95); g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new(); brass_part(P, G, bars, 0.5, base=c.get('brass_base', 43), every=1, bright=1.0, voices=2, hold=0.8); g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new(); runs_part(P, G, bars, c['runs'], c.get('runs_vel', 0.5), per_step=2, base=c.get('runs_base', 60)); g.append((G, c.get('runs_eq', EQ_STR), 0.35, 1.0))
    G = P.new(); bass_part(P, G, bars, c['combat_bass'], pat_bass_pulse8 if P.spb == 8 else pat_bass_pulse6, vel=0.75, oct_base=33); g.append((G, EQ_WARM, 0.15, 1.0))
    G = P.new(); choir_part(P, G, bars, 0.55, base=c.get('choir_base', 52)); g.append((G, EQ_CHOIR, 0.7, 1.0))
    if c.get('combat_extra'):
        G = P.new(); c['combat_extra'](P, G, bars, mel); g.append((G, c.get('combat_extra_eq', EQ_PLUCK), 0.35, 1.0))
    out['combat'] = render_stem(P, g, rt, wet * 0.85)
    return P, out


PR_MAJ_A = [(0, 'maj'), (5, 'maj'), (0, 'maj'), (7, 'maj')]
PR_MAJ_B = [(9, 'min'), (5, 'maj'), (7, 'maj'), (0, 'maj')]
PR_MIN_A = [(0, 'min'), (8, 'maj'), (3, 'maj'), (7, 'maj')]
PR_MIN_B = [(8, 'maj'), (0, 'min'), (7, 'maj'), (0, 'min')]

REGIONS = {
    # Ankerglück: warm und abenteuerlich – Akkordeon, Fidel, Gitarre, Rahmentrommel, Meeresbrise (6/8)
    'ankergluck': dict(title='Ankerglück – Sonnenhafen', tonic=62, scale='major', bpm=84, spb=6, plan=['A', 'A2', 'B', 'A', 'B2', 'A3'], progs={'A': PR_MAJ_A, 'B': PR_MAJ_B},
                       lo=66, hi=83, lead=accordion, lead_vel=0.55, lead_eq=EQ_WARM, counter=fiddle, counter_eq=EQ_WARM, bass=upright, bass_pat=pat_bass_6_jig,
                       pluck=guitar, pluck_pat=pat_arp_6, pad_vel=0.35, calm_perc='jig', bed='sea', pulse=guitar, tension_perc='jig_hard', combat_perc='jig_hard',
                       runs=fiddle, runs_eq=EQ_WARM, combat_bass=upright, combat_extra=x_fiddle_frenzy, combat_extra_eq=EQ_WARM, tension_extra=x_strum_guitar, tension_extra_eq=EQ_PLUCK, hero_trans=-12),
    # England: stolze Streicher, Waldhörner, präzise Marschtrommel (4/4)
    'england': dict(title='England – Königliche Flotte', tonic=55, scale='major', bpm=104, spb=8, plan=['A', 'A2', 'B', 'A3'],
                    progs={'A': [(0, 'maj'), (5, 'maj'), (7, 'maj'), (0, 'maj')], 'B': [(9, 'min'), (2, 'min'), (7, 'maj'), (0, 'maj')]},
                    lo=64, hi=84, lead=strings, lead_vel=0.7, lead_kw=dict(voices=5, bright=18, att=0.12), lead_eq=EQ_STR, counter=brass, counter_eq=EQ_BRASS, counter_trans=-12,
                    counter_kw=dict(bright=0.5, att=0.15), bass=upright, bass_pat=pat_bass_8_march, pad_vel=0.5, calm_extra=x_horns_march, calm_extra_eq=EQ_BRASS,
                    pulse=spiccato, pulse_vel=0.5, pulse_eq=EQ_STR, tension_perc='march', combat_perc='march_roll', runs=spiccato, runs_vel=0.45, combat_bass=upright, bed='sea'),
    # Niederlande: lebhafte Hafen-Shantys – Akkordeon, Drehleier, Mandoline, Holzbläser (6/8)
    'niederlande': dict(title='Niederlande – Hafenshanty', tonic=53, scale='major', bpm=96, spb=6, plan=['A', 'A2', 'B', 'A', 'B2', 'A3'],
                        progs={'A': [(0, 'maj'), (7, 'maj'), (0, 'maj'), (5, 'maj')], 'B': [(2, 'min'), (7, 'maj'), (0, 'maj'), (0, 'maj')]},
                        lo=65, hi=84, lead=accordion, lead_vel=0.55, lead_eq=EQ_WARM, counter=clarinet, counter_eq=EQ_WARM, counter_steps=-2, bass=upright, bass_pat=pat_bass_6_jig,
                        pluck=mandolin, pluck_pat=pat_arp_6, pluck_vel=0.35, pad_vel=0.3, calm_perc='jig', calm_extra=x_hurdy_mand, calm_extra_eq=EQ_WARM, bed='sea',
                        pulse=mandolin, tension_perc='jig_hard', combat_perc='jig_hard', runs=accordion, runs_vel=0.4, runs_eq=EQ_WARM, combat_bass=upright, hero_trans=-12),
    # Deutschland (Nordwacht, Hanse): wuchtiges tiefes Blech, schwere Pauken, stoische Motive (4/4, langsam)
    'deutschland': dict(title='Deutschland – Nordwacht', tonic=50, scale='minor', bpm=72, spb=8, plan=['A', 'B', 'A3'],
                        progs={'A': [(0, 'pow'), (8, 'pow'), (3, 'pow'), (0, 'pow')], 'B': [(8, 'pow'), (7, 'pow'), (0, 'pow'), (0, 'pow')]},
                        lo=48, hi=67, lead=brass, lead_vel=0.65, lead_kw=dict(bright=0.6, att=0.14), lead_eq=EQ_BRASS, counter=brass, counter_eq=EQ_BRASS, counter_steps=-2, counter_kw=dict(bright=0.45),
                        bass=brass, bass_pat=pat_bass_8, bass_vel=0.55, pad_vel=0.55, pad_base=43, calm_perc='heavy', calm_extra=x_sub, calm_extra_eq=EQ_SUB, bed='wind',
                        pulse=spiccato, pulse_vel=0.45, pulse_eq=EQ_STR, tension_perc='heavy', combat_perc='siege', runs=spiccato, runs_vel=0.4, combat_bass=brass, brass_base=36, hero_trans=0, choir_base=45),
    # Frankreich (Armada Royale): elegante Barock-Streicher, Cembalo, Flöten, Fecht-Motive (4/4)
    'frankreich': dict(title='Frankreich – Armada Royale', tonic=52, scale='harm', bpm=96, spb=8, plan=['A', 'A2', 'B', 'A3'],
                       progs={'A': [(0, 'min'), (8, 'maj'), (7, 'maj'), (0, 'min')], 'B': [(3, 'maj'), (10, 'maj'), (7, 'maj'), (0, 'min')]},
                       lo=64, hi=88, lead=strings, lead_vel=0.65, lead_kw=dict(voices=3, bright=30, att=0.06), lead_eq=EQ_STR, counter=flute, counter_eq=EQ_BREATH, counter_trans=12, counter_steps=0,
                       bass=pizz, bass_pat=pat_bass_8_walk, bass_vel=0.8, pluck=harpsichord, pluck_pat=pat_arp_8, pluck_vel=0.5, pluck_base=57, pad_vel=0.35, bed='sea',
                       pulse=pizz, pulse_vel=0.6, tension_perc='march', combat_perc='march_roll', runs=spiccato, runs_vel=0.5, combat_bass=upright, combat_extra=x_harpsi, combat_extra_eq=EQ_PLUCK,
                       tension_extra=x_harpsi, tension_extra_eq=EQ_PLUCK, hero_trans=0),
    # Kurogane (Glutring, Dark Pirates): Taiko, Shamisen/Koto, Shakuhachi, Sub-Bass-Drohnen (In-Skala)
    'kurogane': dict(title='Kurogane – Glutring', tonic=52, scale='in', bpm=68, spb=8, plan=['A', 'B', 'A3'],
                     progs={'A': [(0, 'sus'), (0, 'pow'), (8, 'pow'), (0, 'sus')], 'B': [(5, 'pow'), (0, 'pow'), (8, 'pow'), (0, 'sus')]},
                     lo=64, hi=84, lead=koto, lead_vel=0.6, lead_eq=EQ_PLUCK, counter=shakuhachi, counter_eq=EQ_BREATH, counter_steps=2, bass=subdrone, bass_pat=pat_bass_8, bass_vel=0.6,
                     pluck=koto, pluck_pat=pat_arp_8_slow, pluck_base=52, pad_vel=0.3, pad_bright=6, calm_perc='taiko', calm_extra=x_shaku, calm_extra_eq=EQ_BREATH, bed='wind',
                     pulse=shamisen, pulse_vel=0.5, tension_perc='taiko', tension_extra=x_sub, tension_extra_eq=EQ_SUB, combat_perc='taiko_war', runs=shamisen, runs_vel=0.45, runs_eq=EQ_PLUCK,
                     combat_bass=subdrone, combat_extra=x_shamisen_ost, combat_extra_eq=EQ_PLUCK, hero_trans=-12, choir_base=45, brass_base=38),
    # Marine (Grenzfestungen, Weißwacht): tiefe Bläser, Gefängnisglocken und Ketten, unerbittlicher Marsch (4/4)
    'marine': dict(title='Marine – Ordnung und Eisen', tonic=48, scale='minor', bpm=88, spb=8, plan=['A', 'B', 'A3'],
                   progs={'A': [(0, 'min'), (0, 'min'), (8, 'maj'), (7, 'maj')], 'B': [(3, 'maj'), (8, 'maj'), (7, 'maj'), (0, 'min')]},
                   lo=48, hi=70, lead=clarinet, lead_vel=0.7, lead_eq=EQ_WARM, counter=brass, counter_eq=EQ_BRASS, counter_steps=-2, counter_kw=dict(bright=0.35), counter_trans=-12,
                   bass=brass, bass_pat=pat_bass_8, bass_vel=0.5, pad_vel=0.5, pad_base=43, calm_perc='march', calm_extra=x_chains_bells, calm_extra_eq=EQ_BELL, bed='wind',
                   pulse=spiccato, pulse_vel=0.45, pulse_eq=EQ_STR, tension_perc='march', tension_extra=x_chains_bells, tension_extra_eq=EQ_BELL, combat_perc='bell_chain', runs=spiccato, runs_vel=0.4,
                   combat_bass=brass, brass_base=36, hero_trans=-12, choir_base=45),
}

# Hafen und Taverne (je Region ein gemütlicher Satz, ein Stem)
HARBORS = {
    'ankergluck': dict(title='Ankerglück – Zur Müden Möwe', base='ankergluck', bpm=96, plan=['A', 'A2', 'B', 'A3'], lead=accordion, counter=fiddle),
    'england': dict(title='England – Hafenmeister', base='england', bpm=108, plan=['A', 'A2', 'B', 'A3'], lead=fiddle, counter=flute),
    'niederlande': dict(title='Niederlande – Grachtenschenke', base='niederlande', bpm=108, plan=['A', 'A2', 'B', 'A3'], lead=accordion, counter=clarinet),
    'deutschland': dict(title='Deutschland – Hansekontor', base='deutschland', bpm=84, plan=['A', 'B', 'A3'], lead=accordion, counter=brass),
    'frankreich': dict(title='Frankreich – Salon am Kai', base='frankreich', bpm=100, plan=['A', 'A2', 'B', 'A3'], lead=flute, counter=strings),
    'kurogane': dict(title='Kurogane – Teehaus am Glutring', base='kurogane', bpm=72, plan=['A', 'B', 'A3'], lead=shakuhachi, counter=koto),
    'marine': dict(title='Marine – Wachstube', base='marine', bpm=92, plan=['A', 'B', 'A3'], lead=clarinet, counter=guitar),
}


def harbor_stem(name, h):
    c = REGIONS[h['base']]
    key = Key(c['tonic'], c['scale'])
    P = Piece(name, h['bpm'], c['spb'], 4 * len(h['plan']), key)
    rg = P.rg
    mel, bars = build_melody(rg, key, h['plan'], c['progs'], P.spb, c['lo'], c['hi'] + 2)
    tones = key.tones(c['lo'] - 5, c['hi'] + 14)
    g = []
    G = P.new(); play_notes(P, G, mel, h['lead'], vel=0.6, **({'bright': 24} if h['lead'] is strings else {})); g.append((G, EQ_WARM, 0.35, 1.0))
    G = P.new(); play_notes(P, G, harmonize(phrase_notes(mel, P.spb, set(range(1, len(h['plan']), 2))), key, 2, tones), h['counter'], vel=0.4, pan=0.4, **({'bright': 24} if h['counter'] is strings else {})); g.append((G, EQ_WARM, 0.35, 1.0))
    G = P.new(); x_strum_guitar(P, G, bars, mel); g.append((G, EQ_PLUCK, 0.3, 1.0))
    G = P.new(); bass_part(P, G, bars, upright, pat_bass_6_jig if P.spb == 6 else pat_bass_8_walk, vel=0.75); g.append((G, EQ_WARM, 0.12, 1.0))
    G = P.new(); drum_pattern(P, G, 'tavern', vel=0.9); g.append((G, EQ_DRUM, 0.2, 1.0))
    G = P.new(); b = noise_bed(P.N, rg, 200, 1200); G[0] += b * 0.05; G[1] += np.roll(b, 1301) * 0.05; g.append((G, EQ_BED, 0.0, 1.0))
    return P, {'main': render_stem(P, g, 1.7, 0.28)}


# ============================================================ Situationsstücke: Sturm, Seeschlacht, Entern, Belagerung (A und B), Bosse
def situ_piece(name, bpm, spb, plan, tonic, scale, progs, lo, hi):
    key = Key(tonic, scale)
    P = Piece(name, bpm, spb, 4 * len(plan), key)
    mel, bars = build_melody(P.rg, key, plan, progs, spb, lo, hi)
    return P, mel, bars


def storm_stems(name):
    P, mel, bars = situ_piece(name, 150, 8, ['A', 'A2', 'B', 'A3'], 57, 'minor', {'A': PR_MIN_A, 'B': PR_MIN_B}, 62, 86)
    g = []
    G = P.new(); runs_part(P, G, bars, spiccato, 0.4, per_step=2, base=57); g.append((G, EQ_STR, 0.4, 1.0))
    G = P.new(); play_notes(P, G, mel, strings, vel=0.65, voices=4, bright=30, att=0.05); g.append((G, EQ_STR, 0.45, 1.0))
    G = P.new(); pulse_part(P, G, bars, upright, 0.7, base=33); g.append((G, EQ_WARM, 0.15, 1.0))
    G = P.new(); drum_pattern(P, G, 'storm', vel=1.0); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); pad_part(P, G, bars, strings, base=38, vel=0.55, n=3, bright=10); g.append((G, EQ_STR, 0.5, 1.0))
    base = render_stem(P, g, 3.0, 0.4)
    g = []
    G = P.new(); play_notes(P, G, mel, brass, vel=0.6, trans=-12, bright=1.0); g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new(); brass_part(P, G, bars, 0.55, base=36, every=1, bright=1.0, voices=2, hold=0.9); g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new(); choir_part(P, G, bars, 0.6, base=48, every=1); g.append((G, EQ_CHOIR, 0.7, 1.0))
    G = P.new(); drum_pattern(P, G, 'taiko_war', vel=0.9); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); runs_part(P, G, bars, spiccato, 0.35, per_step=2, base=69); g.append((G, EQ_STR, 0.4, 1.0))
    return P, {'base': base, 'intense': render_stem(P, g, 3.0, 0.4)}


def battle_stems(name):
    P, mel, bars = situ_piece(name, 144, 8, ['A', 'A2', 'B', 'A3'], 52, 'minor', {'A': [(0, 'min'), (8, 'maj'), (3, 'maj'), (7, 'maj')], 'B': [(8, 'maj'), (7, 'maj'), (0, 'min'), (7, 'maj')]}, 59, 83)
    g = []
    G = P.new(); pulse_part(P, G, bars, spiccato, 0.6, base=40); g.append((G, EQ_STR, 0.35, 1.0))
    G = P.new(); drum_pattern(P, G, 'taiko_war', vel=1.0); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); brass_part(P, G, bars, 0.5, base=38, every=1, bright=0.95, voices=2, hold=0.45, stab=True); g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new(); play_notes(P, G, mel, brass, vel=0.45, trans=-12, bright=0.9); g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new(); bass_part(P, G, bars, upright, pat_bass_pulse8, vel=0.8, oct_base=33); g.append((G, EQ_WARM, 0.12, 1.0))
    base = render_stem(P, g, 2.6, 0.36)
    g = []
    G = P.new(); runs_part(P, G, bars, spiccato, 0.5, per_step=2, base=64); g.append((G, EQ_STR, 0.35, 1.0))
    G = P.new(); choir_part(P, G, bars, 0.6, base=52, every=1); g.append((G, EQ_CHOIR, 0.7, 1.0))
    G = P.new(); drum_pattern(P, G, 'march_roll', vel=0.9); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); play_notes(P, G, mel, strings, vel=0.6, voices=4, bright=40, att=0.05, trans=12); g.append((G, EQ_STR, 0.4, 1.0))
    G = P.new(); drum_pattern(P, G, 'heavy', vel=0.8); g.append((G, EQ_DRUM, 0.3, 1.0))
    return P, {'base': base, 'intense': render_stem(P, g, 2.6, 0.36)}


def boarding_stems(name):
    P, mel, bars = situ_piece(name, 150, 6, ['A', 'A2', 'B', 'A', 'B2', 'A2', 'B', 'A3'], 52, 'phryg', {'A': [(0, 'min'), (1, 'maj'), (0, 'min'), (7, 'maj')], 'B': [(8, 'maj'), (7, 'maj'), (1, 'maj'), (0, 'min')]}, 64, 86)
    g = []
    G = P.new(); play_notes(P, G, mel, fiddle, vel=0.65, pan=-0.1); g.append((G, EQ_WARM, 0.35, 1.0))
    G = P.new(); play_notes(P, G, harmonize(phrase_notes(mel, 6, {1, 3, 5, 7}), P.key, 2, P.key.tones(60, 100)), accordion, vel=0.45, pan=0.3); g.append((G, EQ_WARM, 0.35, 1.0))
    G = P.new(); drum_pattern(P, G, 'boarding', vel=1.0); g.append((G, EQ_DRUM, 0.25, 1.0))
    G = P.new(); bass_part(P, G, bars, upright, pat_bass_pulse6, vel=0.8, oct_base=33); g.append((G, EQ_WARM, 0.1, 1.0))
    G = P.new(); brass_part(P, G, bars, 0.5, base=40, every=2, bright=1.0, voices=2, hold=0.5); g.append((G, EQ_BRASS, 0.45, 1.0))
    G = P.new(); runs_part(P, G, bars, fiddle, 0.4, per_step=2, base=69); g.append((G, EQ_WARM, 0.3, 1.0))
    G = P.new(); x_strum_guitar(P, G, bars, mel); g.append((G, EQ_PLUCK, 0.2, 1.0))
    return P, {'main': render_stem(P, g, 1.9, 0.3)}


def siege_a_stems(name):
    P, mel, bars = situ_piece(name, 108, 8, ['A', 'A2', 'B', 'A3'], 48, 'minor', {'A': [(0, 'pow'), (0, 'min'), (8, 'pow'), (7, 'maj')], 'B': [(3, 'pow'), (8, 'pow'), (7, 'maj'), (0, 'min')]}, 48, 72)
    g = []
    G = P.new(); drum_pattern(P, G, 'siege', vel=1.0); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); pulse_part(P, G, bars, spiccato, 0.5, base=36); g.append((G, EQ_STR, 0.35, 1.0))
    G = P.new(); pad_part(P, G, bars, strings, base=38, vel=0.6, n=3, bright=8); g.append((G, EQ_STR, 0.55, 1.0))
    G = P.new(); choir_part(P, G, bars, 0.5, base=45, every=2); g.append((G, EQ_CHOIR, 0.7, 1.0))
    G = P.new(); play_notes(P, G, mel, brass, vel=0.5, trans=-12, bright=0.7); g.append((G, EQ_BRASS, 0.5, 1.0))
    base = render_stem(P, g, 3.0, 0.4)
    g = []
    G = P.new(); brass_part(P, G, bars, 0.6, base=36, every=1, bright=1.0, voices=3, hold=0.85); g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new(); play_notes(P, G, mel, brass, vel=0.6, trans=0, bright=1.0); g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new(); runs_part(P, G, bars, spiccato, 0.45, per_step=2, base=57); g.append((G, EQ_STR, 0.35, 1.0))
    G = P.new(); drum_pattern(P, G, 'taiko_war', vel=0.9); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); choir_part(P, G, bars, 0.6, base=52, every=1); g.append((G, EQ_CHOIR, 0.7, 1.0))
    return P, {'base': base, 'intense': render_stem(P, g, 3.0, 0.4)}


def siege_b_stems(name):
    P, mel, bars = situ_piece(name, 96, 8, ['A', 'A2', 'B', 'A3'], 45, 'minor', {'A': [(0, 'min'), (7, 'maj'), (8, 'maj'), (7, 'maj')], 'B': [(3, 'maj'), (8, 'maj'), (7, 'maj'), (0, 'min')]}, 52, 76)
    g = []
    G = P.new(); drum_pattern(P, G, 'march_roll', vel=0.9); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); pulse_part(P, G, bars, spiccato, 0.5, base=38); g.append((G, EQ_STR, 0.35, 1.0))
    G = P.new(); bass_part(P, G, bars, brass, pat_bass_8_march, vel=0.45, oct_base=33); g.append((G, EQ_BRASS, 0.3, 1.0))
    G = P.new(); play_notes(P, G, mel, brass, vel=0.45, trans=-12, bright=0.6); g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new(); pad_part(P, G, bars, strings, base=40, vel=0.5, n=3, bright=10); g.append((G, EQ_STR, 0.5, 1.0))
    base = render_stem(P, g, 2.8, 0.38)
    g = []
    G = P.new(); drum_pattern(P, G, 'siege', vel=1.0); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); brass_part(P, G, bars, 0.55, base=38, every=1, bright=1.0, voices=3, hold=0.8); g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new(); choir_part(P, G, bars, 0.6, base=48, every=1); g.append((G, EQ_CHOIR, 0.7, 1.0))
    G = P.new(); play_notes(P, G, mel, strings, vel=0.6, trans=12, voices=4, bright=40, att=0.08); g.append((G, EQ_STR, 0.4, 1.0))
    return P, {'base': base, 'intense': render_stem(P, g, 2.8, 0.38)}


BOSSES = {
    'england': dict(title='Lord-Admiral Blackwood', tonic=55, scale='harm', bpm=132, hero=brass, hero_kw=dict(bright=1.0), perc='march_roll', run=spiccato, p2_run=spiccato, extra=None,
                    progs={'A': [(0, 'min'), (8, 'maj'), (7, 'maj'), (0, 'min')], 'B': [(3, 'maj'), (10, 'maj'), (7, 'maj'), (0, 'min')]}),
    'niederlande': dict(title='Generalgouverneur Van Der Berg', tonic=57, scale='harm', bpm=140, hero=accordion, hero_kw={}, perc='siege', run=accordion, p2_run=fiddle, extra=x_hurdy_mand,
                        progs={'A': [(0, 'min'), (5, 'min'), (7, 'maj'), (0, 'min')], 'B': [(8, 'maj'), (7, 'maj'), (0, 'min'), (7, 'maj')]}),
    'deutschland': dict(title='Großkomtur von Eisenstein', tonic=50, scale='minor', bpm=112, hero=brass, hero_kw=dict(bright=0.7), perc='heavy', run=spiccato, p2_run=spiccato, extra=x_sub,
                        progs={'A': [(0, 'pow'), (8, 'pow'), (3, 'pow'), (0, 'pow')], 'B': [(8, 'pow'), (7, 'pow'), (0, 'pow'), (7, 'pow')]}),
    'frankreich': dict(title='Marquis-Amiral De Valois', tonic=52, scale='harm', bpm=138, hero=strings, hero_kw=dict(voices=4, bright=40, att=0.05), perc='march_roll', run=spiccato, p2_run=spiccato, extra=x_harpsi,
                       progs={'A': [(0, 'min'), (8, 'maj'), (7, 'maj'), (0, 'min')], 'B': [(3, 'maj'), (10, 'maj'), (7, 'maj'), (0, 'min')]}),
    'kurogane': dict(title='Schattenfürst Kurogane', tonic=52, scale='in', bpm=120, hero=shakuhachi, hero_kw={}, perc='taiko_war', run=shamisen, p2_run=shamisen, extra=x_shamisen_ost,
                     progs={'A': [(0, 'pow'), (0, 'sus'), (8, 'pow'), (0, 'pow')], 'B': [(5, 'pow'), (0, 'pow'), (8, 'pow'), (7, 'pow')]}),
    'marine': dict(title='Großadmiral Valken', tonic=48, scale='minor', bpm=100, hero=brass, hero_kw=dict(bright=0.9), perc='bell_chain', run=spiccato, p2_run=spiccato, extra=x_chains_bells,
                   progs={'A': [(0, 'min'), (8, 'maj'), (3, 'maj'), (7, 'maj')], 'B': [(8, 'maj'), (7, 'maj'), (0, 'min'), (0, 'min')]}),
}


def boss_stems(name, b):
    P, mel, bars = situ_piece(name, b['bpm'], 8, ['A', 'A2', 'B', 'A3'], b['tonic'], b['scale'], b['progs'], b['tonic'] + 12, b['tonic'] + 34)
    g = []
    G = P.new(); drum_pattern(P, G, b['perc'], vel=1.0); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); play_notes(P, G, mel, b['hero'], vel=0.65, trans=-12 if b['hero'] is brass else 0, **b['hero_kw']); g.append((G, EQ_BRASS if b['hero'] is brass else EQ_WARM, 0.5, 1.0))
    G = P.new(); brass_part(P, G, bars, 0.5, base=36, every=2, bright=1.0, voices=2, hold=0.9); g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new(); pulse_part(P, G, bars, b['run'], 0.5, base=40); g.append((G, EQ_PLUCK if b['run'] is shamisen else EQ_STR, 0.35, 1.0))
    G = P.new(); bass_part(P, G, bars, subdrone if b['scale'] == 'in' else upright, pat_bass_pulse8, vel=0.7, oct_base=33); g.append((G, EQ_WARM, 0.12, 1.0))
    G = P.new(); pad_part(P, G, bars, strings, base=40, vel=0.5, n=3, bright=10); g.append((G, EQ_STR, 0.5, 1.0))
    if b['extra']:
        G = P.new(); b['extra'](P, G, bars, mel); g.append((G, EQ_BELL if b['extra'] is x_chains_bells else EQ_PLUCK, 0.35, 1.0))
    p1 = render_stem(P, g, 3.0, 0.4)
    # Phase 2: Chor, schwere Trommeln, hohes Blech, Läufe – kommt ab 50 % Boss-Leben dazu
    g = []
    G = P.new(); choir_part(P, G, bars, 0.75, base=52, every=1); g.append((G, EQ_CHOIR, 0.7, 1.0))
    G = P.new(); drum_pattern(P, G, 'taiko_war', vel=1.0); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); drum_pattern(P, G, 'siege', vel=0.8); g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new(); play_notes(P, G, mel, brass, vel=0.6, trans=0 if b['hero'] is brass else 12, bright=1.0); g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new(); runs_part(P, G, bars, b['p2_run'], 0.5, per_step=2, base=b['tonic'] + 14); g.append((G, EQ_PLUCK if b['p2_run'] is shamisen else EQ_STR, 0.35, 1.0))
    G = P.new(); brass_part(P, G, bars, 0.6, base=34, every=1, bright=1.0, voices=3, hold=0.75); g.append((G, EQ_BRASS, 0.5, 1.0))
    return P, {'p1': p1, 'p2': render_stem(P, g, 3.0, 0.4)}


def sting_piece(name, bars, bpm):
    # nicht loopend: Stille am Ende lässt den Nachhall verklingen (der zirkuläre Hall läuft in die Stille hinein)
    return Piece(name, bpm, 8, bars, Key(55, 'major'))


def conquest_stem(name):
    P = sting_piece(name, 7, 120)
    rg = P.rg
    g = []
    G = P.new()
    for (m, beat, d) in [(67, 0, 0.5), (72, 1, 0.5), (76, 2, 0.5), (79, 3, 1.0), (76, 4.5, 0.5), (79, 5, 0.5), (84, 6, 2.5)]:
        put(G, brass(float(mtof(m)), d * 0.5 + 0.2, 0.8, rg, bright=1.0, att=0.04), beat * 0.5, -0.1)
        put(G, brass(float(mtof(m - 12)), d * 0.5 + 0.2, 0.6, rg, bright=0.9, att=0.05), beat * 0.5, 0.2)
    for m in (55, 59, 62, 67):
        put(G, brass(float(mtof(m)), 3.4, 0.6, rg, bright=1.0, att=0.12), 3.5, -0.3 + 0.2 * (m % 3))
    g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new()
    for m in (55, 62, 67, 71, 74):
        put(G, strings(float(mtof(m)), 5.0, 0.6, rg, bright=30, voices=5, att=0.6), 0.0, (m % 5 - 2) * 0.25)
    for m in (79, 83, 86):
        put(G, strings(float(mtof(m)), 3.0, 0.45, rg, bright=40, voices=4, att=0.3), 3.4, (m % 3 - 1) * 0.3)
    g.append((G, EQ_STR, 0.6, 1.0))
    G = P.new()
    for k in range(16):
        put(G, timpani(float(mtof(43)), 0.3 + 0.04 * k, rg, 0.5), k * 0.12, 0.0)
    put(G, timpani(float(mtof(43)), 1.0, rg, 2.2), 2.0, -0.1); put(G, taiko(1.0, 1.1, rg), 2.0, 0.1)
    put(G, timpani(float(mtof(43)), 1.0, rg, 2.4), 3.5, 0.0); put(G, taiko(1.0, 1.2, rg), 3.5, 0.0)
    put(G, cymbal(4.5, 0.8, rg), 3.5, 0.2)
    for k in range(6):
        put(G, snare(0.5, rg, 0.12), k * 0.5, -0.2)
    g.append((G, EQ_DRUM, 0.3, 1.0))
    G = P.new()
    for m in (55, 62, 67, 71):
        put(G, choir(float(mtof(m)), 3.6, 0.8, rg), 3.5, (m % 4 - 1.5) * 0.3)
    g.append((G, EQ_CHOIR, 0.7, 1.0))
    return P, {'main': render_stem(P, g, 3.2, 0.42)}


def alarm_stem(name):
    P = sting_piece(name, 4, 90)
    rg = P.rg
    g = []
    G = P.new()
    for m in (36, 43, 48, 49, 55):
        put(G, brass(float(mtof(m)), 1.8, 0.9, rg, bright=0.8, att=0.05), 0.0, (m % 5 - 2) * 0.2)
    for i, m in enumerate((60, 63, 60, 67)):
        put(G, brass(float(mtof(m)), 0.5, 0.8, rg, bright=1.0, att=0.03), 0.9 + i * 0.45, 0.0)
    g.append((G, EQ_BRASS, 0.5, 1.0))
    G = P.new()
    put(G, bell(float(mtof(60)), 1.0, rg, 5.0, True), 0.0, 0.1); put(G, bell(float(mtof(60)), 0.8, rg, 5.0, True), 1.6, -0.1)
    put(G, taiko(1.0, 1.2, rg), 0.0, 0.0); put(G, taiko(0.8, 1.0, rg), 1.6, 0.0)
    put(G, timpani(float(mtof(36)), 1.0, rg, 2.0), 0.0, 0.0)
    put(G, chains(1.0, 0.7, rg), 0.1, 0.0)
    g.append((G, EQ_BELL, 0.5, 1.0))
    return P, {'main': render_stem(P, g, 3.0, 0.4)}


# ============================================================ Aufträge, Mastering, Ausgabe
def jobs():
    J = []
    for r, c in REGIONS.items():
        J.append(dict(group=f'reg_{r}', category='region', faction=r, title=c['title'], loop=True, fn=lambda r=r, c=c: region_stems(f'reg_{r}', c), target={'calm': -21, 'tension': -22, 'combat': -19}))
    for r, h in HARBORS.items():
        J.append(dict(group=f'harbor_{r}', category='harbor', faction=r, title=h['title'], loop=True, fn=lambda r=r, h=h: harbor_stem(f'harbor_{r}', h), target={'main': -21}))
    J.append(dict(group='storm', category='storm', faction=None, title='Sturmfahrt', loop=True, fn=lambda: storm_stems('storm'), target={'base': -19, 'intense': -18}))
    J.append(dict(group='battle_sea', category='battle', faction=None, title='Seeschlacht', loop=True, fn=lambda: battle_stems('battle_sea'), target={'base': -19, 'intense': -18}))
    J.append(dict(group='boarding', category='boarding', faction=None, title='Black Flag – Entern!', loop=True, fn=lambda: boarding_stems('boarding'), target={'main': -17}))
    J.append(dict(group='siege_a', category='siege', faction=None, title='Belagerung – Die Bresche', loop=True, fn=lambda: siege_a_stems('siege_a'), target={'base': -19, 'intense': -18}))
    J.append(dict(group='siege_b', category='siege', faction=None, title='Belagerung – Marsch durch die Viertel', loop=True, fn=lambda: siege_b_stems('siege_b'), target={'base': -19, 'intense': -18}))
    for r, b in BOSSES.items():
        J.append(dict(group=f'boss_{r}', category='boss', faction=r, title=b['title'], loop=True, fn=lambda r=r, b=b: boss_stems(f'boss_{r}', b), target={'p1': -18, 'p2': -19}))
    J.append(dict(group='sting_conquest', category='sting', faction=None, title='Eroberungs-Fanfare', loop=False, fn=lambda: conquest_stem('sting_conquest'), target={'main': -17}))
    J.append(dict(group='sting_alarm', category='sting', faction=None, title='Alarm: Rückeroberungsflotte', loop=False, fn=lambda: alarm_stem('sting_alarm'), target={'main': -17}))
    return J


def master(x, target_db):
    x = x - x.mean(axis=1, keepdims=True)
    rms = float(np.sqrt((x.astype(np.float64) ** 2).mean()))
    x = x * (10 ** (target_db / 20) / max(rms, 1e-9))
    knee = 0.7
    a = np.abs(x)
    x = np.where(a > knee, np.sign(x) * (knee + (0.93 - knee) * np.tanh((a - knee) / (0.93 - knee))), x)
    return x.astype(np.float32)


def write_audio(path_no_ext, x, force_wav=False):
    os.makedirs(os.path.dirname(path_no_ext), exist_ok=True)
    if not force_wav:
        try:
            import soundfile as sf
            p = path_no_ext + '.ogg'
            # in Blöcken und aus zusammenhängendem Speicher schreiben (ein Aufruf mit der ganzen, transponierten Ansicht brachte libsndfile unter Windows zum Absturz)
            y = np.ascontiguousarray(x.T)
            with sf.SoundFile(p, 'w', samplerate=SR, channels=2, format='OGG', subtype='VORBIS') as f:
                for i in range(0, len(y), SR):
                    f.write(y[i:i + SR])
            return p
        except Exception as e:  # noqa: BLE001
            print('  (soundfile fehlt oder Ogg nicht möglich, schreibe WAV):', e)
    import wave
    p = path_no_ext + '.wav'
    pcm = (np.clip(x.T, -1, 1) * 32767).astype('<i2')
    with wave.open(p, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    return p


def main():
    args = sys.argv[1:]
    only = args[args.index('--only') + 1] if '--only' in args else None
    J = jobs()
    if '--list' in args:
        for j in J:
            print(j['group'], '|', j['title'], '|', j['category'])
        return
    manifest = []
    t_all = time.time()
    for j in J:
        if only and only not in j['group']:
            continue
        t0 = time.time()
        P, stems = j['fn']()
        for layer, x in stems.items():
            y = master(x, j['target'][layer])
            tid = f"{j['group']}_{layer}"
            p = write_audio(os.path.join(OUT, tid), y, '--wav' in args)
            peak = float(np.abs(y).max())
            rms = float(np.sqrt((y.astype(np.float64) ** 2).mean()))
            manifest.append(dict(id=tid, group=j['group'], layer=layer, title=j['title'], category=j['category'], faction=j['faction'], file=os.path.relpath(p, os.path.join(ROOT, 'public', 'audio')).replace('\\', '/'),
                                 bpm=P.bpm, spb=P.spb, bars=P.bars, duration=round(P.dur, 4), loop=j['loop'], loopStart=0.0, loopEnd=round(P.dur, 4), peak=round(peak, 3), rms_db=round(20 * math.log10(max(rms, 1e-9)), 1),
                                 bytes=os.path.getsize(p)))
            print(f"  {tid:28s} {P.dur:6.1f} s  peak {peak:.2f}  rms {20 * math.log10(rms):6.1f} dB  {os.path.getsize(p) / 1024:6.0f} KB", flush=True)
        print(f"{j['group']}: {time.time() - t0:.1f} s", flush=True)
    mp = os.path.join(OUT, 'manifest.json')
    if only and os.path.exists(mp):
        old = {m['id']: m for m in json.load(open(mp, encoding='utf-8'))['tracks']}
        for m in manifest:
            old[m['id']] = m
        manifest = list(old.values())
    os.makedirs(OUT, exist_ok=True)
    json.dump({'version': 1, 'sampleRate': SR, 'tracks': manifest}, open(mp, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{len(manifest)} Dateien, {sum(m["bytes"] for m in manifest) / 1048576:.1f} MB, {time.time() - t_all:.0f} s gesamt')
    if '--emit-ts' in args:
        for m in manifest:
            print(f"  {m['id']}: bpm {m['bpm']} dauer {m['duration']}")


if __name__ == '__main__':
    main()
