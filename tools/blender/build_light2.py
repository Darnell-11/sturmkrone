# Licht-Bausätze 2: Schiffs- und Hafenlaterne (Käfig, Glasscheiben, Tragering, Kette), gedrechselte Fackel mit Eisenkorb und
# verkohltem Brennkopf, genietete Feuerschale mit Kohle- und Scheitbett (Glut über Eckpunktfarbe).
#   blender --background --python tools/blender/headless.py -- build_light2.py
# Überschreibt public/models/world/laterne.glb sowie public/models/light/{fackel,feuerkorb,laternenpfahl}.glb (gleiche Maße und
# Flammenpunkte wie vorher: Laterne Flamme im Ursprung, Fackelkopf y 1,18, Korb y 1,28, Pfahllampe (0,6 | 2,7 | 0)).
# Rollen: iron, brass, glass (Spiel: Glasmaterial), ember (leuchtet; Eckpunktfarbe Col = Hitze 0 … 1), charcoal, log, darkwood.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

LIGHT_DIR = os.path.join(ROOT, 'public', 'models', 'light')
WORLD_DIR = os.path.join(ROOT, 'public', 'models', 'world')
exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())
ROLE_COL.update({'glass': (0.9, 0.8, 0.5), 'ember': (1.0, 0.45, 0.1), 'charcoal': (0.07, 0.06, 0.06), 'log': (0.23, 0.16, 0.11), 'stone': (0.43, 0.42, 0.4)})

def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def heat(p):
    """Glut: zerrissene Muster aus Rauschen, unten und in Ritzen heller"""
    n = bnoise.noise(p * 13.0) * 0.7 + bnoise.noise(p * 31.0) * 0.3
    return max(0.0, min(1.0, 0.55 + n * 1.1))

def ao_for(top, base=0.55):
    def fn(role, p):
        if role == 'ember': return heat(p)
        if role == 'glass': return 1.0
        return base + (1 - base) * sstep(0.0, top, p.y)
    return fn

# ---------- Laterne (Käfig, Scheiben, Kette); Flammenmitte bei (cx, cy, cz) ----------
def lantern(m, cx=0.0, cy=0.0, cz=0.0, chain=True, scale=1.0):
    r, hh = 0.25 * scale, 0.32 * scale
    T0 = lambda x=0, y=0, z=0, **k: TR(x=cx + x, y=cy + y, z=cz + z, **k)
    # Haube mit Schornstein und Schirmkappe (sechseckig wie der Käfig)
    m.lathe('iron', [(r * 1.16, hh - 0.01), (r * 1.16, hh + 0.03), (r * 0.82, hh + 0.075), (r * 0.52, hh + 0.14), (0.17 * scale, hh + 0.2), (0.12 * scale, hh + 0.225)], T0(), seg=6)
    m.lathe('iron', [(0.1 * scale, hh + 0.225), (0.1 * scale, hh + 0.3)], T0(), seg=6, caps=False)
    m.lathe('iron', [(0.16 * scale, hh + 0.3), (0.12 * scale, hh + 0.335), (0.035 * scale, hh + 0.375)], T0(), seg=6)
    m.sphere('brass', 0.034 * scale, T0(y=hh + 0.385 * scale), seg=8)
    # Tragering und Kette nach oben
    m.torus('iron', 0.085 * scale, 0.013 * scale, T0(y=hh + 0.43 * scale, rx=math.pi / 2), seg=14, sec=5)
    if chain:
        for i in range(5):
            m.torus('iron', 0.03, 0.0065, T0(y=hh + 0.52 * scale + i * 0.052, rx=math.pi / 2, ry=(math.pi / 2 if i % 2 else 0.0)), seg=8, sec=4)
    # Boden mit Fußnäpfen
    m.lathe('iron', [(r * 1.0, -hh + 0.02), (r * 1.1, -hh), (r * 1.0, -hh - 0.05), (r * 0.55, -hh - 0.1), (0.12 * scale, -hh - 0.135)], T0(), seg=6)
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.5
        m.sphere('iron', 0.022 * scale, T0(x=math.cos(a) * r * 0.7, y=-hh - 0.105, z=math.sin(a) * r * 0.7), seg=6)
    # sechs Eckstreben, zwei Messingbänder, Glasscheiben dazwischen
    corners = [(math.cos(k * math.pi / 3) * r, math.sin(k * math.pi / 3) * r) for k in range(6)]
    for (x, z) in corners:
        m.tube('iron', [(cx + x * 0.97, cy - hh + 0.01, cz + z * 0.97), (cx + x, cy, cz + z), (cx + x * 0.97, cy + hh - 0.01, cz + z * 0.97)], [0.0125 * scale] * 3, seg=5, vscale=1.0)
    for yy in (-hh + 0.035, hh - 0.035):
        m.torus('brass', r * 0.995, 0.011 * scale, T0(y=yy), seg=6, sec=4)
    for k in range(6):
        (x0, z0), (x1, z1) = corners[k], corners[(k + 1) % 6]
        yb, yt = cy - hh + 0.04, cy + hh - 0.04
        m.leaf('glass', [(cx + x0 * 0.985, yb, cz + z0 * 0.985), (cx + x1 * 0.985, yb, cz + z1 * 0.985), (cx + x1 * 0.985, yt, cz + z1 * 0.985), (cx + x0 * 0.985, yt, cz + z0 * 0.985)])
    # Innenleben: Ölnapf aus Messing, Docht, glühender Kern
    m.lathe('brass', [(0.07 * scale, -hh + 0.05), (0.095 * scale, -hh * 0.55), (0.085 * scale, -hh * 0.42), (0.03 * scale, -hh * 0.4)], T0(), seg=10)
    m.cyl('darkwood', 0.006, 0.09, T0(y=-hh * 0.3), seg=5)
    m.sphere('ember', 0.052 * scale, T0(y=-0.02 * scale), seg=8)

def build_laterne():
    m = Model('laterne')
    lantern(m)
    m.ao(ao_for(0.7, 0.7))
    m.export(os.path.join(WORLD_DIR, 'laterne.glb'))

def build_laternenpfahl():
    m = Model('laternenpfahl')
    m.tube('darkwood', [(0, -0.2, 0), (0, 1.5, 0), (0, 3.0, 0)], [0.1, 0.085, 0.07], seg=7, vscale=0.4)                  # Pfahl
    m.lathe('iron', [(0.14, 0.0), (0.12, 0.1), (0.1, 0.5)], TR(), seg=7)                                                   # Fußzwinge
    m.torus('iron', 0.11, 0.012, TR(y=0.44), seg=10, sec=4)
    m.tube('iron', [(0, 2.95, 0), (0.15, 3.12, 0), (0.45, 3.1, 0), (0.6, 2.98, 0)], [0.035, 0.03, 0.028, 0.025], seg=5, vscale=1.0)   # Arm
    m.tube('iron', [(0.12, 2.9, 0), (0.36, 3.0, 0)], [0.02, 0.02], seg=4, vscale=1.0)                                       # Strebe
    m.tube('iron', [(0.0, 2.7, 0), (0.12, 2.82, 0), (0.12, 2.9, 0)], [0.02, 0.018, 0.016], seg=4, vscale=1.0)
    lantern(m, 0.6, 2.7, 0.0, chain=False, scale=0.78)
    m.ao(ao_for(3.0, 0.62))
    m.export(os.path.join(LIGHT_DIR, 'laternenpfahl.glb'))

# ---------- Fackel: gedrechselter Holzgriff, Eisenkorb, verkohlter Brennkopf (Kopf bei y 1,18) ----------
def build_fackel():
    m = Model('fackel'); rnd = random.Random(5)
    prof = [(0.024, 0.0), (0.034, 0.03), (0.034, 0.07), (0.022, 0.1), (0.026, 0.2), (0.026, 0.4), (0.036, 0.43), (0.036, 0.47), (0.025, 0.5),
            (0.028, 0.7), (0.031, 0.82), (0.026, 0.9), (0.042, 0.94), (0.05, 0.965)]
    m.lathe('darkwood', prof, TR(), seg=8)                                                                                   # gedrechselter Griff
    for y, R in ((0.2, 0.027), (0.62, 0.029), (0.9, 0.028), (0.97, 0.052)):
        m.torus('iron', R, 0.0075, TR(y=y), seg=8, sec=4)                                                                    # Eisenzwingen
    m.lathe('iron', [(0.052, 0.96), (0.078, 1.01), (0.095, 1.1), (0.1, 1.17)], TR(), seg=8, caps=False)                       # Korb
    for k in range(8):                                                                                                       # Korbstäbe
        a = k * math.pi / 4 + 0.2
        m.tube('iron', [(math.cos(a) * 0.05, 0.97, math.sin(a) * 0.05), (math.cos(a) * 0.092, 1.1, math.sin(a) * 0.092), (math.cos(a) * 0.115, 1.2, math.sin(a) * 0.115)], [0.011, 0.01, 0.008], seg=4, caps=False, vscale=1.0)
    m.torus('iron', 0.1, 0.009, TR(y=1.17), seg=12, sec=4)
    m.torus('iron', 0.082, 0.007, TR(y=1.04), seg=10, sec=4)
    m.lathe('log', [(0.0, 1.0), (0.07, 1.02), (0.088, 1.1), (0.082, 1.17)], TR(), seg=8)                                      # Pechwickel
    for k in range(5):                                                                                                       # Pechtropfen am Rand
        a = k * 1.3 + 0.4
        m.sphere('charcoal', 0.016, TR(x=math.cos(a) * 0.092, y=1.05 - 0.02 * (k % 2), z=math.sin(a) * 0.092), seg=5)
    m.blob('charcoal', 0.08, TR(y=1.17), subdiv=1, noise=0.3, seed=3, squash=0.75)                                            # verkohlter Kopf
    for k in range(5):                                                                                                       # Glutnester im Kopf
        a = k * 2 * math.pi / 5
        m.blob('ember', 0.032, TR(x=math.cos(a) * 0.04, y=1.2 + (k % 2) * 0.008, z=math.sin(a) * 0.04), subdiv=1, noise=0.35, seed=k + 1, squash=0.8)
    m.blob('ember', 0.04, TR(y=1.205), subdiv=1, noise=0.3, seed=9, squash=0.8)
    m.ao(ao_for(1.2, 0.7))
    m.export(os.path.join(LIGHT_DIR, 'fackel.glb'))

# ---------- Feuerschale: schwere genietete Eisenschale auf Dreibein, Kohle- und Scheitbett (Flamme bei y 1,28) ----------
def bowl_r(y):
    """Außenradius der Schale in Höhe y (aus dem Profil)"""
    pts = [(0.22, 0.99), (0.38, 1.05), (0.5, 1.19), (0.55, 1.34)]
    for (r0, y0), (r1, y1) in zip(pts, pts[1:]):
        if y0 <= y <= y1: return r0 + (r1 - r0) * (y - y0) / (y1 - y0)
    return pts[-1][0]

def build_feuerkorb():
    m = Model('feuerkorb'); rnd = random.Random(17)
    for i in range(3):                                                                                                       # Dreibein mit Krallenfüßen
        a = i * 2 * math.pi / 3 + 0.5
        m.tube('iron', [(math.cos(a) * 0.58, 0.0, math.sin(a) * 0.58), (math.cos(a) * 0.4, 0.55, math.sin(a) * 0.4), (math.cos(a) * 0.22, 0.98, math.sin(a) * 0.22)], [0.038, 0.034, 0.03], seg=6, vscale=1.0)
        m.blob('iron', 0.065, TR(x=math.cos(a) * 0.6, y=0.035, z=math.sin(a) * 0.6), subdiv=1, noise=0.12, seed=i, squash=0.55, flat=True)
        for s in (-1, 1):
            m.sphere('iron', 0.024, TR(x=math.cos(a) * 0.64 + math.cos(a + math.pi / 2) * s * 0.055, y=0.02, z=math.sin(a) * 0.64 + math.sin(a + math.pi / 2) * s * 0.055), seg=5)
    m.torus('iron', 0.28, 0.016, TR(y=0.5), seg=18, sec=5)                                                                   # Querring zwischen den Beinen
    m.lathe('iron', [(0.0, 0.98), (0.22, 0.99), (0.38, 1.05), (0.5, 1.19), (0.55, 1.34), (0.505, 1.345), (0.45, 1.2), (0.3, 1.09), (0.0, 1.06)], TR(), seg=20, caps=False)   # Schale
    m.torus('iron', 0.527, 0.02, TR(y=1.342), seg=24, sec=6)                                                                 # Wulstrand
    for y in (1.13, 1.265):                                                                                                  # Verstärkungsbänder
        m.torus('iron', bowl_r(y) + 0.006, 0.012, TR(y=y), seg=24, sec=4)
    for y, n in ((1.1, 18), (1.2, 20), (1.30, 22)):                                                                          # Nietenreihen
        R = bowl_r(y) + 0.012
        for k in range(n):
            a = (k + (0.5 if y > 1.15 else 0.0)) * 2 * math.pi / n
            m.sphere('iron', 0.0135, TR(x=math.cos(a) * R, y=y, z=math.sin(a) * R), seg=5)
    for a0 in (0.0, math.pi):                                                                                                # Tragringe
        x, z = math.cos(a0) * 0.585, math.sin(a0) * 0.585
        m.torus('iron', 0.055, 0.011, TR(x=x, y=1.26, z=z, rx=math.pi / 2, ry=-a0), seg=10, sec=4)
        m.box('iron', (0.06, 0.05, 0.04), TR(x=math.cos(a0) * 0.545, y=1.26, z=math.sin(a0) * 0.545, ry=-a0))
    # Kohlebett: dunkle Brocken mit glühenden Nestern dazwischen; Scheite darüber, Enden verkohlt
    m.blob('charcoal', 0.42, TR(y=1.17), subdiv=2, noise=0.18, seed=2, squash=0.3)
    for i in range(16):
        a = rnd.random() * 2 * math.pi; d = math.sqrt(rnd.random()) * 0.4
        m.blob('ember', 0.065 + rnd.random() * 0.05, TR(x=math.cos(a) * d, y=1.255 + rnd.random() * 0.04, z=math.sin(a) * d), subdiv=1, noise=0.4, seed=i, squash=0.7)
    for i in range(12):
        a = rnd.random() * 2 * math.pi; d = math.sqrt(rnd.random()) * 0.42
        m.blob('charcoal', 0.05 + rnd.random() * 0.045, TR(x=math.cos(a) * d, y=1.275 + rnd.random() * 0.05, z=math.sin(a) * d), subdiv=1, noise=0.35, seed=i + 40, squash=0.8)
    for i in range(3):
        a = i * 2.1 + 0.4
        p0 = (math.cos(a) * 0.36, 1.27, math.sin(a) * 0.36); p1 = (math.cos(a + 0.2) * 0.05, 1.4, math.sin(a + 0.2) * 0.05); p2 = (-math.cos(a) * 0.1, 1.38, -math.sin(a) * 0.1)
        m.tube('log', [p0, p1, p2], [0.05, 0.052, 0.04], seg=6, vscale=0.7)
        m.blob('charcoal', 0.055, TR(x=p0[0], y=p0[1], z=p0[2]), subdiv=1, noise=0.3, seed=i + 7, squash=0.8)
        m.blob('ember', 0.04, TR(x=p2[0], y=p2[1], z=p2[2]), subdiv=1, noise=0.3, seed=i + 12, squash=0.8)
    m.ao(ao_for(1.4, 0.6))
    m.export(os.path.join(LIGHT_DIR, 'feuerkorb.glb'))

# ---------- Feuerstelle: Steinring, gekreuzte Scheite, Aschebett und Glutnester (Flamme bei y 0,26) ----------
def stone_block(m, role, c, size, ry, rnd, bevel=0.03):
    sx, sy, sz = (s / 2 for s in size)
    pts = [(x * sx + (rnd.random() - 0.5) * 0.05, y * sy + (rnd.random() - 0.5) * 0.04, z * sz + (rnd.random() - 0.5) * 0.05) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    m.rock(role, pts, TR(x=c[0], y=c[1], z=c[2], ry=ry), bevel=bevel)

def build_feuerstelle():
    m = Model('feuerstelle'); rnd = random.Random(31)
    n = 11
    for i in range(n):                                                                                                       # Steinring, Steine unterschiedlich groß
        a = i * 2 * math.pi / n
        stone_block(m, 'stone', (math.cos(a) * 0.78, 0.13, math.sin(a) * 0.78), (0.4 + rnd.random() * 0.1, 0.24 + rnd.random() * 0.08, 0.32 + rnd.random() * 0.06), -a, rnd)
    m.lathe('charcoal', [(0.0, 0.05), (0.62, 0.05), (0.66, 0.09), (0.5, 0.15), (0.0, 0.17)], TR(), seg=14)                    # Aschebett
    for i in range(14):                                                                                                      # Glutnester im Bett
        a = rnd.random() * 2 * math.pi; d = math.sqrt(rnd.random()) * 0.5
        m.blob('ember', 0.055 + rnd.random() * 0.045, TR(x=math.cos(a) * d, y=0.19 + rnd.random() * 0.02, z=math.sin(a) * d), subdiv=1, noise=0.4, seed=i, squash=0.6)
    for i in range(5):                                                                                                       # Scheite gekreuzt, Enden verkohlt
        a = i * 2 * math.pi / 5 + 0.3
        c = Vector((math.cos(a) * 0.12, 0.3, math.sin(a) * 0.12))
        m.tube('log', [Vector((math.cos(a) * 0.62, 0.12, math.sin(a) * 0.62)), c, Vector((-math.cos(a) * 0.12, 0.5, -math.sin(a) * 0.12))], [0.07, 0.075, 0.06], seg=6, vscale=0.7)
        m.sphere('charcoal', 0.075, TR(x=math.cos(a) * 0.63, y=0.12, z=math.sin(a) * 0.63), seg=6)
        m.blob('ember', 0.05, TR(x=-math.cos(a) * 0.12, y=0.5, z=-math.sin(a) * 0.12), subdiv=1, noise=0.35, seed=i + 20, squash=0.8)
    m.ao(ao_for(0.5, 0.6))
    m.export(os.path.join(LIGHT_DIR, 'feuerstelle.glb'))

for fn in (build_laterne, build_laternenpfahl, build_fackel, build_feuerkorb, build_feuerstelle):
    clear_gear(); fn()
