#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bausteine des Offline-Musikrenderers (siehe generate_music.py): Synthese, Hall, Komposition. Nicht direkt aufrufen.

Offline-Musikrenderer für Sturmkrone: erzeugt die Orchester-Stems nach public/audio/music/ (44,1 kHz Stereo, Ogg Vorbis, nahtlos loopbar).

Aufruf:   python scripts/generate_music.py [--only <Teil des Namens>] [--list] [--emit-ts] [--wav]
Braucht:  numpy, soundfile   (pip install numpy soundfile)   – ohne soundfile werden WAV-Dateien geschrieben (groß).

Wie es klingt: additive Wellentabellen (Streicher-Ensemble mit Vibrato und Verstimmung, Blech mit Helligkeits-Schwellung, Akkordeon mit
Musette-Verstimmung, Fidel, Kehlkopf-Chor mit Formanten), Karplus-Strong-Zupfinstrumente (Gitarre, Mandoline, Cembalo, Koto, Shamisen), Taiko,
Pauken, Marschtrommel, Glocken und Ketten, Shakuhachi, Sub-Bass-Drohnen, dazu ein Konzertsaal-Nachhall (erzeugte Raumantwort, per FFT
zirkulär gefaltet: der Schwanz läuft über die Loop-Naht hinweg, es gibt keinen Knacks).
Jedes Stück ist ein Satz Stems (ruhig, Spannung, Kampf bzw. Phase 1 und 2), die taktgenau gleich lang sind: der MusicDirector
(src/audio/musicDirector.ts) startet sie zusammen und blendet sie nach der Lage im Spiel. Alle Pegel sind je Stem auf einen Zielpegel
(RMS) normiert und gegen Übersteuern gesichert (weiche Begrenzung unter −1 dBFS).
Die Datei public/audio/music/manifest.json hält Dauer, BPM und Loop-Punkte; `--emit-ts` druckt die Einträge für src/data/musicTracks.ts.
Eigene Aufnahmen: Datei als .ogg/.mp3 nach public/audio/music/ legen und in src/data/musicTracks.ts das Feld `file` (und bei Bedarf
loopStart/loopEnd) anpassen – ohne Code-Änderung.
"""
import json, math, os, sys, time, zlib
import numpy as np

SR = 44100
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'public', 'audio', 'music')

# ============================================================ Grundlagen
def mtof(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=np.float64) - 69.0) / 12.0)

NT = 2048
NHS = [3, 6, 12, 24, 48, 96]
KINDS = {
    'saw': lambda k: 1.0 / k,
    'sq': lambda k: (k % 2) / k,
    'reed': lambda k: (1.0 / k ** 0.75) * (1.0 + 0.6 * (k % 2)),
    'brassA': lambda k: 1.0 / k ** 1.7,
    'brassB': lambda k: 1.0 / k ** 0.8,
    'clar': lambda k: (k % 2) * (1.0 / k ** 1.1),
    'str': lambda k: 1.0 / k ** 1.05,
    'soft': lambda k: 1.0 / k ** 2.3,
    'sine': lambda k: (k == 1) * 1.0,
}
TAB = {}
_ph = np.arange(NT) / NT * 2 * np.pi
for _kind, _fn in KINDS.items():
    TAB[_kind] = {}
    for _nh in NHS:
        _k = np.arange(1, _nh + 1)
        _tab = (_fn(_k)[:, None] * np.sin(_k[:, None] * _ph[None, :])).sum(0)
        _tab = _tab / max(1e-9, np.abs(_tab).max())
        TAB[_kind][_nh] = _tab.astype(np.float32)


def osc(kind, freq, n, ph0=0.0, nhcap=96):
    """Wellentabellen-Oszillator, bandbegrenzt (freq darf ein Array sein: Vibrato)."""
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (n,))
    fmax = float(f.max())
    lim = int(min(nhcap, SR * 0.45 / max(fmax, 20.0)))
    nh = max([x for x in NHS if x <= lim] or [NHS[0]])
    ph = ph0 + np.cumsum(f) / SR
    idx = (ph - np.floor(ph)) * NT
    i0 = idx.astype(np.int64)
    fr = (idx - i0).astype(np.float32)
    tab = TAB[kind][nh]
    return tab[i0 % NT] * (1 - fr) + tab[(i0 + 1) % NT] * fr


def env(n, a=0.02, r=0.1, shape=1.0):
    e = np.ones(n, dtype=np.float32)
    na, nr = int(a * SR), int(r * SR)
    if na + nr > n:
        k = n / max(1, na + nr)
        na, nr = int(na * k), int(nr * k)
    if na > 0:
        e[:na] = np.linspace(0, 1, na, dtype=np.float32) ** shape
    if nr > 0:
        e[n - nr:] *= np.linspace(1, 0, nr, dtype=np.float32) ** 1.5
    return e


def expdec(n, tau):
    return np.exp(-np.arange(n, dtype=np.float32) / (tau * SR)).astype(np.float32)


class Rng:
    def __init__(self, name):
        self.r = np.random.default_rng(zlib.crc32(name.encode()))

    def __getattr__(self, k):
        return getattr(self.r, k)


def put(G, x, t, pan=0.0, gain=1.0):
    """Mono-Signal x bei t Sekunden in den Stereo-Puffer G legen (zirkulär: was über das Ende hinausläuft, beginnt wieder vorn)."""
    N = G.shape[1]
    n = len(x)
    if n > N:
        x = x[:N]; n = N
    s = int(round(t * SR)) % N
    ang = (max(-1.0, min(1.0, pan)) + 1.0) * math.pi / 4
    l, r = math.cos(ang) * gain, math.sin(ang) * gain
    e = s + n
    if e <= N:
        G[0, s:e] += x * l; G[1, s:e] += x * r
    else:
        k = N - s
        G[0, s:] += x[:k] * l; G[1, s:] += x[:k] * r
        G[0, :e - N] += x[k:] * l; G[1, :e - N] += x[k:] * r


def eq(G, pts):
    """Zero-Phase-Klangfilter im Frequenzbereich: pts = [(Hz, dB), ...] (log-Interpolation)."""
    N = G.shape[1]
    f = np.fft.rfftfreq(N, 1 / SR)
    fx = np.log10(np.maximum(f, 15.0))
    xs = np.log10([p[0] for p in pts]); ys = np.array([p[1] for p in pts], dtype=np.float64)
    g = 10 ** (np.interp(fx, xs, ys) / 20)
    for c in (0, 1):
        G[c] = np.fft.irfft(np.fft.rfft(G[c].astype(np.float64)) * g, n=N).astype(np.float32)


_IR = {}


def make_ir(rt60, seed=7):
    key = (rt60, seed)
    if key in _IR:
        return _IR[key]
    n = int(rt60 * 1.15 * SR)
    t = np.arange(n) / SR
    rg = np.random.default_rng(seed)
    ir = np.zeros((2, n))
    for c in range(2):
        w = rg.standard_normal(n)
        F = np.fft.rfft(w)
        f = np.fft.rfftfreq(n, 1 / SR)
        low = np.fft.irfft(F / (1 + (f / 900.0) ** 2), n=n)
        hi = w - np.fft.irfft(F / (1 + (f / 900.0) ** 2), n=n)
        # Höhen klingen schneller ab als Tiefen (Luft und Holz schlucken sie): warmer Saal
        sig = low * np.exp(-6.91 * t / (rt60 * 1.15)) * 2.2 + hi * np.exp(-6.91 * t / (rt60 * 0.4)) * 0.55
        sig[: int(0.022 * SR)] = 0
        # frühe Reflexionen (Wände, Decke)
        for _ in range(16):
            p = int((0.022 + rg.random() * 0.075) * SR)
            sig[p] += (rg.random() * 2 - 1) * 1.4
        ir[c] = sig
    ir /= np.sqrt((ir ** 2).sum() / 2)
    _IR[key] = ir.astype(np.float32)
    return _IR[key]


def reverb(wet, rt60=2.8, seed=7):
    N = wet.shape[1]
    ir = make_ir(rt60, seed)
    m = min(ir.shape[1], N)
    out = np.zeros_like(wet)
    for c in range(2):
        out[c] = np.fft.irfft(np.fft.rfft(wet[c].astype(np.float64)) * np.fft.rfft(ir[c][:m].astype(np.float64), n=N), n=N).astype(np.float32)
    return out


# ============================================================ Instrumente (je Note ein Mono-Signal)
def _vib(n, depth, rate, delay, rg):
    t = np.arange(n) / SR
    return depth * np.clip((t - delay) / 0.5, 0, 1) * np.sin(2 * np.pi * rate * t + rg.random() * 6.28)


def strings(f, dur, vel, rg, bright=24, voices=4, rel=0.4, att=0.22):
    n = int((dur + rel) * SR)
    out = np.zeros(n, dtype=np.float32)
    for v in range(voices):
        det = (rg.random() * 2 - 1) * 0.0075
        vb = _vib(n, 0.0035, 5.0 + rg.random() * 1.2, 0.25 + rg.random() * 0.2, rg)
        out += osc('str', f * (1 + det) * (1 + vb), n, rg.random(), bright)
    return out * env(n, att, rel, 1.4) * (vel / voices)


def spiccato(f, dur, vel, rg, bright=48):
    n = int((dur + 0.06) * SR)
    s = osc('saw', f * (1 + 0.003 * rg.standard_normal()), n, rg.random(), bright) + osc('saw', f * 1.004, n, rg.random(), bright)
    return s * env(n, 0.006, 0.05, 1.0) * expdec(n, max(0.05, dur * 0.8)) * vel * 0.5


def brass(f, dur, vel, rg, bright=1.0, rel=0.22, att=0.07, mute=False):
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    sw = np.clip(t / (0.1 + 0.25 * (1 - bright * 0.5)), 0, 1) ** 0.7 * bright
    sw = np.minimum(1.0, sw) * (0.65 + 0.35 * np.clip(t / (dur + 0.1), 0, 1) ** 0.4)
    a = osc('brassA', f * (1 + _vib(n, 0.002, 5.0, 0.4, rg)), n, rg.random(), 24)
    b = osc('brassB', f * (1 + _vib(n, 0.002, 5.0, 0.4, rg)) * 1.001, n, rg.random(), 40)
    return (a * (1 - sw) + b * sw * 0.8) * env(n, att, rel, 1.2) * vel


def accordion(f, dur, vel, rg, musette=9.0, trem=5.5):
    n = int((dur + 0.08) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n, dtype=np.float32)
    for c in (-musette, 0.0, musette):
        out += osc('reed', f * 2 ** (c / 1200.0), n, rg.random(), 20)
    tr = 1 - 0.07 + 0.07 * np.sin(2 * np.pi * trem * t)
    air = (rg.standard_normal(n).astype(np.float32) * 0.015 * (1 - np.exp(-t / 0.03))) * env(n, 0.02, 0.08)
    return (out * tr / 3.0 * env(n, 0.035, 0.09) + air) * vel


def fiddle(f, dur, vel, rg):
    n = int((dur + 0.12) * SR)
    vb = _vib(n, 0.0055, 5.6, 0.12, rg)
    s = osc('saw', f * (1 + vb), n, rg.random(), 30) * 0.7 + osc('saw', f * 1.003 * (1 + vb), n, rg.random(), 30) * 0.5
    bow = np.diff(rg.standard_normal(n + 1)).astype(np.float32) * 0.045
    e = env(n, 0.03, 0.1, 1.2) * (0.85 + 0.15 * np.clip(np.arange(n) / (0.2 * SR), 0, 1))
    return (s + bow) * e * vel * 0.8


def flute(f, dur, vel, rg, breath=0.05):
    n = int((dur + 0.1) * SR)
    t = np.arange(n) / SR
    fr = f * (1 + _vib(n, 0.004, 5.0, 0.25, rg))
    s = osc('sine', fr, n) + 0.25 * osc('sine', fr * 2, n) + 0.06 * osc('sine', fr * 3, n)
    air = np.diff(rg.standard_normal(n + 1)).astype(np.float32) * breath
    return (s + air) * env(n, 0.06, 0.1, 1.0) * vel * 0.8


def clarinet(f, dur, vel, rg):
    n = int((dur + 0.08) * SR)
    s = osc('clar', f * (1 + _vib(n, 0.003, 5.0, 0.3, rg)), n, rg.random(), 24)
    return s * env(n, 0.04, 0.08, 1.0) * vel * 0.9


def choir(f, dur, vel, rg):
    n = int((dur + 0.5) * SR)
    out = np.zeros(n, dtype=np.float32)
    for v in range(6):
        det = (rg.random() * 2 - 1) * 0.006
        out += osc('saw', f * (1 + det) * (1 + _vib(n, 0.004, 5.2 + 0.3 * v, 0.3, rg)), n, rg.random(), 20)
    return out * env(n, 0.5, 0.5, 1.3) * vel / 6.0


def ks(f, dur, rg, decay=0.996, w=0.5, bright=0.5, tension=0.0):
    """Karplus-Strong-Saite; Tonhöhe über Neuabtastung genau eingestellt."""
    f = float(f)
    N0 = max(3, int(round(SR / f)))
    n_out = int(dur * SR)
    n_in = int(n_out * (SR / f) / N0 * 1.0) + N0 + 2 if False else n_out + 2 * N0
    buf = rg.uniform(-1, 1, N0)
    for _ in range(int(max(0, (1 - bright) * 6))):
        buf = 0.5 * (buf + np.roll(buf, 1))
    out = np.empty(n_in)
    prev = buf
    pos = 0
    while pos < n_in:
        k = min(N0, n_in - pos)
        out[pos:pos + k] = prev[:k]
        prev = decay * (w * prev + (1 - w) * np.roll(prev, 1))
        pos += N0
    ratio = (SR / N0) / f
    if abs(ratio - 1) > 1e-4:
        src = np.arange(n_out) * ratio
        out = np.interp(src, np.arange(n_in), out)
    else:
        out = out[:n_out]
    return (out * (1 - np.exp(-np.arange(len(out)) / (0.002 * SR)))).astype(np.float32)


def guitar(f, dur, vel, rg):
    x = ks(f, dur, rg, 0.9975, 0.5, 0.45)
    return x * vel * 0.9


def harpsichord(f, dur, vel, rg):
    x = ks(f, min(dur, 1.6), rg, 0.995, 0.62, 0.95) + 0.5 * ks(f * 2, min(dur, 1.2), rg, 0.993, 0.6, 0.95)
    click = np.diff(rg.standard_normal(int(0.006 * SR) + 1)) * 0.2
    x[:len(click)] += click
    return x * vel * 0.55


def koto(f, dur, vel, rg):
    x = ks(f, dur, rg, 0.9985, 0.55, 0.55)
    return x * vel


def shamisen(f, dur, vel, rg):
    x = ks(f, dur, rg, 0.992, 0.78, 0.95)
    x = np.tanh(2.6 * x) * 0.55                                   # sawari: der Saitenbrummer
    th = np.diff(rg.standard_normal(int(0.012 * SR) + 1)) * 0.25 * expdec(int(0.012 * SR), 0.004)
    x[:len(th)] += th
    return x.astype(np.float32) * vel


def mandolin(f, dur, vel, rg):
    n = int(dur * SR)
    out = np.zeros(n + 14000, dtype=np.float32)
    step = int(0.065 * SR)
    for i, s in enumerate(range(0, max(1, n - 1000), step)):
        p = ks(f, 0.22, rg, 0.992, 0.6, 0.85)
        out[s:s + len(p)] += p * (0.7 if i % 2 else 1.0)
    return out[:n] * vel * 0.8


def pizz(f, dur, vel, rg):
    return ks(f, min(dur, 0.5), rg, 0.985, 0.6, 0.7) * vel * 1.1


def upright(f, dur, vel, rg):
    return ks(f, min(dur, 1.2), rg, 0.996, 0.5, 0.2) * vel * 1.4


def shakuhachi(f, dur, vel, rg):
    n = int((dur + 0.2) * SR)
    t = np.arange(n) / SR
    fr = f * (1 - 0.055 * np.exp(-t / 0.13)) * (1 + _vib(n, 0.009, 4.8, 0.45, rg))
    s = osc('sine', fr, n) + 0.28 * osc('sine', fr * 2, n) + 0.12 * osc('sine', fr * 3, n)
    breath = np.diff(rg.standard_normal(n + 1)).astype(np.float32) * 0.1
    breath = (breath + np.roll(breath, 1)) * 0.5
    swell = 0.75 + 0.25 * np.sin(np.pi * np.clip(t / (dur + 0.1), 0, 1))
    return (s + breath * (0.6 + 0.4 * swell)) * env(n, 0.07, 0.18, 1.0) * swell * vel * 0.8


def subdrone(f, dur, vel, rg):
    n = int((dur + 0.4) * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2 * t + 0.4)
    s = np.tanh(1.6 * s) * 0.7
    return s.astype(np.float32) * env(n, 0.6, 0.6, 1.3) * vel


def hurdy(f, dur, vel, rg):
    n = int((dur + 0.1) * SR)
    s = osc('reed', f, n, rg.random(), 16) * 0.7 + osc('reed', f * 1.5, n, rg.random(), 12) * 0.25 + osc('saw', f * 0.5, n, rg.random(), 12) * 0.3
    return s * env(n, 0.04, 0.1) * vel * 0.8


def taiko(vel, size, rg):
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    f = 62 * size + (125 * size - 62 * size) * np.exp(-t / 0.05)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / (0.32 * (0.6 + size)))
    body += 0.35 * np.sin(1.5 * ph) * np.exp(-t / 0.12)
    slap = np.diff(rg.standard_normal(n + 1)) * np.exp(-t / 0.012) * 0.6
    boom = np.sin(2 * np.pi * 52 * size * t) * np.exp(-t / 0.6) * 0.22
    return ((body + slap + boom) * vel).astype(np.float32)


def timpani(f, vel, rg, length=1.8):
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, (r, a, tau) in enumerate([(1.0, 1.0, 0.9), (1.504, 0.5, 0.55), (1.742, 0.35, 0.4), (2.0, 0.3, 0.35), (2.244, 0.2, 0.25), (2.8, 0.1, 0.2)]):
        fk = f * r * (1 + 0.06 * np.exp(-t / 0.05))
        out += a * np.sin(2 * np.pi * np.cumsum(fk) / SR) * np.exp(-t / tau)
    mallet = np.diff(rg.standard_normal(n + 1)) * np.exp(-t / 0.01) * 0.35
    return ((out * 0.6 + mallet) * vel).astype(np.float32)


def snare(vel, rg, length=0.22, tone=190):
    n = int(length * SR)
    t = np.arange(n) / SR
    noise = np.diff(rg.standard_normal(n + 1)) * np.exp(-t / 0.07)
    body = np.sin(2 * np.pi * tone * t * (1 + 0.3 * np.exp(-t / 0.02))) * np.exp(-t / 0.04)
    return ((noise * 0.7 + body * 0.5) * vel).astype(np.float32)


def frame_drum(vel, rg, f=95, length=0.5):
    n = int(length * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * (1 + 0.5 * np.exp(-t / 0.04)) * t) * np.exp(-t / 0.14)
    lo = rg.standard_normal(n)
    lo = (lo + np.roll(lo, 1) + np.roll(lo, 2)) / 3 * np.exp(-t / 0.02) * 0.4
    return ((s + lo) * vel).astype(np.float32)


def cymbal(dur, vel, rg, swell=False):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.diff(np.diff(rg.standard_normal(n + 2))) * 0.5
    e = (np.clip(t / (dur * 0.92), 0, 1) ** 2 * (t < dur * 0.92) + np.exp(-(t - dur * 0.92) / 0.18) * (t >= dur * 0.92)) if swell else np.exp(-t / (dur / 4.5))
    return (x * e * vel).astype(np.float32)


def bell(f, vel, rg, length=4.5, dark=False):
    n = int(length * SR)
    t = np.arange(n) / SR
    parts = [(0.56, 1.0, 1.0), (0.92, 0.6, 0.85), (1.19, 0.55, 0.7), (1.71, 0.35, 0.5), (2.0, 0.4, 0.45), (2.74, 0.22, 0.3), (3.0, 0.15, 0.25), (3.76, 0.1, 0.2), (5.4, 0.06, 0.12)]
    if dark:
        parts = [(1.0, 1.0, 1.0), (2.01, 0.55, 0.7), (2.76, 0.45, 0.55), (4.16, 0.3, 0.35), (5.4, 0.2, 0.3), (6.8, 0.1, 0.2)]
    out = np.zeros(n)
    for r, a, tau in parts:
        out += a * np.sin(2 * np.pi * f * r * t + rg.random() * 6.28) * np.exp(-t / (tau * length / 3.0))
    strike = np.diff(rg.standard_normal(n + 1)) * np.exp(-t / 0.006) * 0.4
    return ((out * 0.35 + strike) * vel).astype(np.float32)


def chains(dur, vel, rg):
    n = int(dur * SR)
    out = np.zeros(n, dtype=np.float32)
    k = max(3, int(dur * 14))
    for _ in range(k):
        p = int(rg.random() * (n - 3000))
        ln = int((0.03 + 0.05 * rg.random()) * SR)
        t = np.arange(ln) / SR
        s = sum(np.sin(2 * np.pi * (2600 + rg.random() * 5500) * t) for _ in range(5)) * np.exp(-t / 0.018)
        s += np.diff(rg.standard_normal(ln + 1)) * np.exp(-t / 0.02) * 1.5
        out[p:p + ln] += (s * (0.3 + 0.7 * rg.random()) * vel * 0.2).astype(np.float32)
    return out


def noise_bed(N, rg, lo, hi, cycles=(3, 5, 7)):
    """Rauschteppich (Meer, Wind), nahtlos: Hüllkurven mit ganzen Schwingungen je Schleife."""
    w = rg.standard_normal(N)
    F = np.fft.rfft(w)
    f = np.fft.rfftfreq(N, 1 / SR)
    g = (1 / (1 + (f / hi) ** 2)) * (1 - 1 / (1 + (f / lo) ** 2))
    x = np.fft.irfft(F * g, n=N)
    t = np.arange(N) / N
    m = 1 + 0.35 * sum(np.sin(2 * np.pi * c * t + k) for k, c in enumerate(cycles)) / len(cycles) * 2
    x = x * m
    return (x / max(1e-9, np.abs(x).max())).astype(np.float32)


# ============================================================ Komposition
SCALES = {
    'major': [0, 2, 4, 5, 7, 9, 11], 'mixo': [0, 2, 4, 5, 7, 9, 10], 'dorian': [0, 2, 3, 5, 7, 9, 10], 'minor': [0, 2, 3, 5, 7, 8, 10],
    'harm': [0, 2, 3, 5, 7, 8, 11], 'in': [0, 1, 5, 7, 8], 'hira': [0, 2, 3, 7, 8], 'phryg': [0, 1, 3, 5, 7, 8, 10],
}
CH = {'maj': [0, 4, 7], 'min': [0, 3, 7], 'dim': [0, 3, 6], 'sus': [0, 5, 7], 'pow': [0, 7, 12], 'sus2': [0, 2, 7], 'm7': [0, 3, 7, 10], 'd7': [0, 4, 7, 10]}

# Rhythmuszellen (Schritt, Dauer) in Achteln: 6 = 6/8 (ein Takt zwei Zählzeiten), 8 = 4/4
CELLS = {
    6: [[(0, 3), (3, 1), (4, 1), (5, 1)], [(0, 2), (2, 1), (3, 3)], [(0, 1), (1, 1), (2, 1), (3, 3)], [(0, 3), (3, 2), (5, 1)], [(0, 2), (2, 2), (4, 2)], [(0, 1), (1, 2), (3, 1), (4, 2)]],
    8: [[(0, 2), (2, 2), (4, 2), (6, 2)], [(0, 3), (3, 1), (4, 2), (6, 2)], [(0, 1), (1, 1), (2, 2), (4, 4)], [(0, 2), (2, 1), (3, 1), (4, 2), (6, 2)], [(0, 3), (3, 1), (4, 3), (7, 1)], [(0, 1), (1, 1), (2, 1), (3, 1), (4, 4)]],
}
CELL_END = {6: [(0, 6)], 8: [(0, 8)]}


class Key:
    def __init__(self, tonic, scale):
        self.tonic = tonic
        self.scale = scale
        self.pcs = {(tonic + x) % 12 for x in SCALES[scale]}

    def tones(self, lo, hi):
        return [m for m in range(lo, hi + 1) if m % 12 in self.pcs]


def chord_pcs(key, deg, q):
    return {(key.tonic + deg + x) % 12 for x in CH[q]}


def gen_phrase(rg, key, prog, spb, lo, hi, start, kinds=None, cadence=True):
    notes = []
    prev = start
    tones = key.tones(lo, hi)
    cells = CELLS[spb]
    for b, (deg, q) in enumerate(prog):
        cell = CELL_END[spb] if (b == len(prog) - 1 and cadence) else cells[int(rg.integers(len(cells)))]
        cp = chord_pcs(key, deg, q)
        for i, (st, du) in enumerate(cell):
            if i == 0 or (st % (spb // 2) == 0):
                cand = [m for m in tones if m % 12 in cp]
                if b == len(prog) - 1 and cadence and i == 0:
                    cand = [m for m in tones if m % 12 in (key.tonic % 12, (key.tonic + 7) % 12)] or cand
                pm = min(cand, key=lambda m: abs(m - prev) + 0.3 * rg.random())
            else:
                idx = min(range(len(tones)), key=lambda k: abs(tones[k] - prev))
                mv = int(rg.choice([-2, -1, -1, 0, 1, 1, 2], p=[0.1, 0.25, 0.15, 0.1, 0.2, 0.15, 0.05]))
                pm = tones[max(0, min(len(tones) - 1, idx + mv))]
            notes.append((b * spb + st, du, pm))
            prev = pm
    return notes


def build_melody(rg, key, plan, progs, spb, lo, hi):
    """plan z. B. ['A','A2','B','A','B2','A3']; je Phrase vier Takte."""
    cache = {}
    bars = []
    mel = []
    prev = (lo + hi) // 2
    for pi, lab in enumerate(plan):
        base = lab[0]
        prog = progs[base]
        if lab == base and base not in cache:
            ph = gen_phrase(rg, key, prog, spb, lo + (5 if base == 'B' else 0), hi + (5 if base == 'B' else 0), prev, cadence=True)
            cache[base] = ph
        elif lab != base:
            src = cache.get(base) or gen_phrase(rg, key, prog, spb, lo, hi, prev)
            keep = [n for n in src if n[0] < 2 * spb]
            tail = gen_phrase(rg, key, prog[2:], spb, lo, hi, keep[-1][2] if keep else prev, cadence=True)
            ph = keep + [(n[0] + 2 * spb, n[1], n[2]) for n in tail]
        ph = cache.get(lab) or ph
        if lab == plan[-1] and pi == len(plan) - 1:
            # Schlusstakt: auf dem Grundton enden, damit der Loop sauber anschließt
            ph = [n for n in ph if n[0] < 3 * spb] + [(3 * spb, spb, key.tones(lo, hi)[0] if False else next(m for m in key.tones(lo + 7, hi) if m % 12 == key.tonic % 12))]
        for (st, du, m) in ph:
            mel.append((pi * 4 * spb + st, du, m))
        bars += prog
        prev = ph[-1][2]
    return mel, bars


class Piece:
    """Ein Stück: Takt, Tempo, Grundstruktur; liefert Stems als Stereo-Puffer."""

    def __init__(self, name, bpm, spb, bars, key, seed=None):
        self.name = name
        self.bpm = bpm
        self.spb = spb
        self.bars = bars
        self.key = key
        # Schrittlänge: 6/8: bpm zählt punktierte Viertel (Schritt = Achtel = 20/bpm), 4/4: bpm zählt Viertel (Schritt = 30/bpm)
        self.step = (20.0 if spb == 6 else 30.0) / bpm
        self.N = int(round(bars * spb * self.step * SR))
        self.dur = self.N / SR
        self.rg = Rng(name)

    def t(self, step):
        return step * self.step

    def new(self):
        return np.zeros((2, self.N), dtype=np.float32)


def render_stem(piece, groups, rt60=2.8, wet=0.35, tail_seed=7):
    """groups: Liste (Puffer G, eq-Punkte oder None, Hallanteil, Pegel). Summiert, hallt und liefert (2, N)."""
    dry = np.zeros((2, piece.N), dtype=np.float32)
    send = np.zeros((2, piece.N), dtype=np.float32)
    for G, pts, snd, lvl in groups:
        if pts:
            eq(G, pts)
        dry += G * lvl
        send += G * (lvl * snd)
    return dry + reverb(send, rt60, tail_seed) * wet


# --------------------- Hilfen zum Spielen von Folgen
def play_notes(piece, G, notes, inst, vel=0.6, pan=0.0, trans=0, dur_scale=0.96, spread=0.0, accent=None, **kw):
    rg = piece.rg
    for (st, du, m) in notes:
        d = max(0.08, du * piece.step * dur_scale)
        v = vel * (accent(st) if accent else 1.0) * (0.9 + 0.2 * rg.random())
        f = float(mtof(m + trans))
        x = inst(f, d, v, rg, **kw) if kw else inst(f, d, v, rg)
        put(G, x, piece.t(st) + (rg.random() - 0.5) * 0.004, pan + spread * (rg.random() - 0.5), 1.0)


def chord_voicing(key, deg, q, base, n=3):
    root = key.tonic + deg
    while root < base:
        root += 12
    while root >= base + 12:
        root -= 12
    ints = CH[q]
    out = [root + ints[i % len(ints)] + 12 * (i // len(ints)) for i in range(n)]
    return out


def pad_part(piece, G, bars, inst, base=50, vel=0.5, n=3, pan_spread=0.7, bright=14, att=0.5, **kw):
    spb = piece.spb
    for b, (deg, q) in enumerate(bars):
        notes = chord_voicing(piece.key, deg, q, base, n)
        for i, m in enumerate(notes):
            d = spb * piece.step * 1.0 + 0.25
            f = float(mtof(m))
            x = inst(f, d, vel, piece.rg, bright=bright, voices=4, rel=0.5, att=att) if inst is strings else inst(f, d, vel, piece.rg)
            put(G, x, piece.t(b * spb), (i - (n - 1) / 2) * pan_spread / max(1, n - 1) * 2 * 0.5, 1.0)


def bass_part(piece, G, bars, inst, pattern, vel=0.6, oct_base=36, pan=0.0):
    spb = piece.spb
    for b, (deg, q) in enumerate(bars):
        root = piece.key.tonic + deg
        while root < oct_base:
            root += 12
        while root >= oct_base + 12:
            root -= 12
        fifth = root + 7
        for (st, du, kind) in pattern(spb):
            m = root if kind == 'r' else fifth if kind == 'f' else root + 12 if kind == 'o' else root - 12 if kind == 'l' else root + 3 if kind == 'm' else root + 5
            if kind == 'm' and q == 'maj':
                m = root + 4
            d = max(0.1, du * piece.step * 0.95)
            x = inst(float(mtof(m)), d, vel * (1.0 if st == 0 else 0.8), piece.rg)
            put(G, x, piece.t(b * spb + st), pan, 1.0)


def arp_part(piece, G, bars, inst, pattern, vel=0.5, base=55, pan=0.0, spread=0.5, **kw):
    spb = piece.spb
    for b, (deg, q) in enumerate(bars):
        ch = chord_voicing(piece.key, deg, q, base, 4)
        for (st, idx, du) in pattern(spb):
            m = ch[idx % len(ch)] + 12 * (idx // len(ch))
            f = float(mtof(m))
            x = inst(f, du * piece.step * 1.6, vel * (1.0 if st % (spb // 2) == 0 else 0.75), piece.rg)
            put(G, x, piece.t(b * spb + st), pan + spread * (((st * 7) % 5) - 2) / 4, 1.0)


# Muster
def pat_bass_6(spb):
    return [(0, 3, 'r'), (3, 3, 'f')]


def pat_bass_6_jig(spb):
    return [(0, 1.5, 'r'), (3, 1.5, 'f'), (4, 1, 'f'), (5, 1, 'o')]


def pat_bass_8(spb):
    return [(0, 4, 'r'), (4, 4, 'f')]


def pat_bass_8_march(spb):
    return [(0, 2, 'r'), (2, 2, 'o'), (4, 2, 'f'), (6, 2, 'o')]


def pat_bass_8_walk(spb):
    return [(0, 2, 'r'), (2, 2, 'm'), (4, 2, 'f'), (6, 2, 'r')]


def pat_bass_pulse8(spb):
    return [(i, 1, 'r' if i % 4 == 0 else 'f' if i % 4 == 2 else 'o') for i in range(8)]


def pat_bass_pulse6(spb):
    return [(i, 1, 'r' if i % 3 == 0 else 'f') for i in range(6)]


def pat_arp_6(spb):
    return [(0, 0, 2), (1, 1, 2), (2, 2, 2), (3, 3, 2), (4, 2, 2), (5, 1, 2)]


def pat_arp_8(spb):
    return [(i, [0, 2, 1, 3, 2, 3, 1, 2][i], 2) for i in range(8)]


def pat_arp_8_slow(spb):
    return [(0, 0, 4), (2, 2, 4), (4, 1, 4), (6, 3, 4)]


def pat_arp_16(spb):
    return [(i * 0.5, [0, 1, 2, 3, 2, 1][i % 6] + (4 if i % 12 > 5 else 0), 1.2) for i in range(16)]


def pulse_part(piece, G, bars, inst, vel, pattern='8', base=None):
    """Ostinato auf Grund- und Quintton (Spannungsschicht)."""
    spb = piece.spb
    for b, (deg, q) in enumerate(bars):
        root = piece.key.tonic + deg
        while root < (base or 48):
            root += 12
        while root >= (base or 48) + 12:
            root -= 12
        for s in range(spb):
            m = root if s % (spb // 2) == 0 else root + 7 if s % 2 == 0 else root + 12
            acc = 1.25 if s % (spb // 2) == 0 else 0.8
            x = inst(float(mtof(m)), piece.step * 0.7, vel * acc, piece.rg)
            put(G, x, piece.t(b * spb + s), -0.2 + 0.4 * ((s % 3) / 2), 1.0)


def timp_note(tonic):
    m = tonic - 24
    while m < 38:
        m += 12
    return m


def drum_pattern(piece, G, kind, vel=1.0, bars=None):
    """Schlagwerk-Muster für das ganze Stück. kind: jig, march, taiko, taiko_war, heavy, bodhran, bell_chain, siege, boarding, storm"""
    spb = piece.spb
    rg = piece.rg
    nb = bars if bars is not None else piece.bars
    for b in range(nb):
        o = b * spb
        if kind == 'jig':
            put(G, frame_drum(0.9 * vel, rg, 88), piece.t(o), -0.2)
            put(G, frame_drum(0.5 * vel, rg, 130, 0.3), piece.t(o + 3), 0.2)
            put(G, frame_drum(0.35 * vel, rg, 150, 0.25), piece.t(o + 5), 0.3)
        elif kind == 'jig_hard':
            for s, v in [(0, 1.0), (1, .45), (2, .5), (3, .9), (4, .45), (5, .55)]:
                put(G, frame_drum(v * vel, rg, 88 if s % 3 == 0 else 125, 0.4), piece.t(o + s), -0.25 + 0.5 * (s % 2))
            put(G, taiko(0.6 * vel, 0.8, rg), piece.t(o), 0.0)
        elif kind == 'march':
            for s in range(0, 8, 2):
                put(G, snare((0.9 if s in (2, 6) else 0.5) * vel, rg), piece.t(o + s), -0.25)
            put(G, timpani(float(mtof(timp_note(piece.key.tonic))), 0.9 * vel, rg, 1.2), piece.t(o), 0.0)
            if b % 2 == 1:
                put(G, timpani(float(mtof(timp_note(piece.key.tonic) + 7)), 0.7 * vel, rg, 1.2), piece.t(o + 4), 0.1)
        elif kind == 'march_roll':
            for s in range(0, 8):
                for k in range(2):
                    put(G, snare((0.55 + 0.25 * (s % 2)) * vel, rg, 0.12), piece.t(o + s + k * 0.5), -0.25)
            put(G, timpani(float(mtof(timp_note(piece.key.tonic))), 1.0 * vel, rg, 1.4), piece.t(o), 0.0)
            put(G, timpani(float(mtof(timp_note(piece.key.tonic) + 7)), 0.8 * vel, rg, 1.4), piece.t(o + 4), 0.1)
        elif kind == 'heavy':
            put(G, timpani(float(mtof(timp_note(piece.key.tonic))), 1.0 * vel, rg, 1.8), piece.t(o), -0.1)
            put(G, taiko(0.8 * vel, 1.0, rg), piece.t(o), 0.1)
            put(G, timpani(float(mtof(timp_note(piece.key.tonic) + 7)), 0.8 * vel, rg, 1.6), piece.t(o + 4), 0.1)
            if b % 2 == 1:
                put(G, taiko(0.6 * vel, 0.85, rg), piece.t(o + 6), -0.2)
        elif kind == 'taiko':
            put(G, taiko(0.9 * vel, 1.05, rg), piece.t(o), -0.1)
            if b % 2 == 1:
                put(G, taiko(0.7 * vel, 0.9, rg), piece.t(o + 4), 0.15)
        elif kind == 'taiko_war':
            for s, v, sz in [(0, 1.0, 1.1), (2, 0.55, 0.8), (3, 0.6, 0.8), (4, 0.95, 1.0), (6, 0.5, 0.8), (7, 0.7, 0.85)]:
                put(G, taiko(v * vel, sz, rg), piece.t(o + s), -0.3 + 0.6 * ((s * 3) % 5) / 4)
            if b % 4 == 3:
                for k in range(8):
                    put(G, taiko((0.4 + 0.07 * k) * vel, 0.8, rg), piece.t(o + 4 + k * 0.5), 0.0)
        elif kind == 'bell_chain':
            if b % 2 == 0:
                put(G, bell(float(mtof(piece.key.tonic + 12)), 0.8 * vel, rg, 5.5, True), piece.t(o), 0.15)
                put(G, bell(float(mtof(piece.key.tonic + 19)), 0.5 * vel, rg, 5.5, True), piece.t(o + 4), -0.2)
            put(G, chains(piece.step * 8, 0.8 * vel, rg), piece.t(o), 0.0)
            put(G, snare(0.4 * vel, rg, 0.15), piece.t(o + 4), -0.25)
        elif kind == 'siege':
            for s, v in [(0, 1.0), (3, 0.7), (4, 0.9), (7, 0.6)]:
                put(G, taiko(v * vel, 1.15, rg), piece.t(o + s), 0.0)
                put(G, timpani(float(mtof(timp_note(piece.key.tonic))), v * 0.8 * vel, rg, 1.4), piece.t(o + s), 0.1)
            for s in (2, 6):
                put(G, snare(0.7 * vel, rg), piece.t(o + s), -0.25)
        elif kind == 'boarding':
            for s in range(spb):
                v = 1.0 if s % 3 == 0 else 0.55
                put(G, taiko(v * 0.8 * vel, 0.9 if s % 3 == 0 else 0.7, rg), piece.t(o + s), -0.3 + 0.6 * (s % 2))
                if s % 3 != 0:
                    put(G, snare(0.55 * vel, rg, 0.1), piece.t(o + s), 0.25)
            if b % 4 == 3:
                put(G, cymbal(piece.step * 6, 0.5 * vel, rg, swell=True), piece.t(o), 0.2)
        elif kind == 'storm':
            for s in range(0, 8, 2):
                put(G, timpani(float(mtof(timp_note(piece.key.tonic) + (7 if s == 4 else 0))), (1.0 if s == 0 else 0.7) * vel, rg, 1.2), piece.t(o + s), -0.1 + 0.2 * (s / 6))
            if b % 2 == 1:
                for k in range(8):
                    put(G, timpani(float(mtof(timp_note(piece.key.tonic))), (0.35 + 0.07 * k) * vel, rg, 0.6), piece.t(o + 4 + k * 0.5), 0.0)
        elif kind == 'tavern':
            put(G, frame_drum(0.8 * vel, rg, 92), piece.t(o), -0.2)
            put(G, frame_drum(0.4 * vel, rg, 130, 0.3), piece.t(o + spb // 2), 0.2)
        if kind in ('march', 'heavy', 'siege', 'taiko_war', 'boarding') and b % 4 == 3:
            put(G, cymbal(piece.step * (spb // 2) * 1.0, 0.45 * vel, rg, swell=True), piece.t(o + spb // 2), 0.25)
        if kind in ('march', 'heavy', 'siege', 'taiko_war') and b % 4 == 0 and b > 0:
            put(G, cymbal(2.0, 0.4 * vel, rg), piece.t(o), 0.25)


def brass_part(piece, G, bars, vel, inst=brass, base=43, hold=1.0, every=2, trans=0, bright=1.0, voices=2, stab=False):
    spb = piece.spb
    for b, (deg, q) in enumerate(bars):
        if b % every != 0:
            continue
        notes = chord_voicing(piece.key, deg, q, base, voices + 1)[:voices + 1]
        for i, m in enumerate(notes):
            d = (piece.step * spb * (every if not stab else 0.5)) * hold
            x = inst(float(mtof(m + trans)), d, vel * (1.0 if i == 0 else 0.8), piece.rg, bright=bright)
            put(G, x, piece.t(b * spb), -0.35 + 0.35 * i, 1.0)


def choir_part(piece, G, bars, vel, base=57, every=2):
    spb = piece.spb
    for b, (deg, q) in enumerate(bars):
        if b % every != 0:
            continue
        for i, m in enumerate(chord_voicing(piece.key, deg, q, base, 3)):
            x = choir(float(mtof(m)), piece.step * spb * every, vel, piece.rg)
            put(G, x, piece.t(b * spb), -0.5 + 0.5 * i, 1.0)


def runs_part(piece, G, bars, inst, vel, per_step=2, base=60, accent_every=None):
    """Treibende Läufe (Fidel, Violinen, Spiccato): Skalentöne in Sechzehnteln."""
    spb = piece.spb
    tones = piece.key.tones(base, base + 19)
    pos = 0
    for b, (deg, q) in enumerate(bars):
        cp = chord_pcs(piece.key, deg, q)
        for s in range(spb):
            for k in range(per_step):
                if (s + k) % 3 == 0:
                    cand = [m for m in tones if m % 12 in cp]
                    idx = tones.index(min(cand, key=lambda m: abs(m - tones[pos % len(tones)])))
                    pos = idx
                else:
                    pos += 1 if ((b + s) // 2) % 2 == 0 else -1
                m = tones[pos % len(tones)]
                x = inst(float(mtof(m)), piece.step / per_step * 0.9, vel * (1.0 if (s % (spb // 2) == 0 and k == 0) else 0.75), piece.rg)
                put(G, x, piece.t(b * spb + s) + k * piece.step / per_step, -0.4 + 0.8 * ((pos % 5) / 4), 1.0)


# ============================================================ Equalizer-Presets
EQ_STR = [(40, -12), (80, -4), (200, 0), (2500, 0), (5000, -4), (9000, -12), (16000, -30)]
EQ_BRASS = [(40, -12), (80, -3), (300, 1), (1500, 0), (4000, -5), (8000, -14), (16000, -30)]
EQ_WARM = [(30, -10), (80, -3), (200, 0), (3000, 0), (6000, -5), (11000, -14), (18000, -30)]
EQ_PLUCK = [(40, -12), (100, -2), (300, 0), (4000, 0), (9000, -6), (15000, -18)]
EQ_CHOIR = [(60, -20), (200, -4), (500, 2), (800, 4), (1200, 2), (2500, 1), (4000, -6), (8000, -18)]
EQ_DRUM = [(25, -16), (45, -9), (70, -3), (120, 0), (400, 0), (4000, -2), (9000, -8), (16000, -22)]
EQ_BELL = [(60, -14), (300, -2), (1500, 0), (6000, -2), (12000, -10), (18000, -26)]
EQ_BREATH = [(80, -20), (400, -6), (900, 0), (3500, 1), (7000, -8), (14000, -26)]
EQ_BED = [(25, -3), (120, 0), (1200, -3), (6000, -14)]
EQ_SUB = [(20, -14), (40, -6), (60, -1), (100, 0), (220, -12), (600, -36)]
