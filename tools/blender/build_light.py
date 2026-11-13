# Licht-Bausätze: Feuerstelle (Steinring, Scheite, Glutbett), Feuerkorb auf Dreibein, Fackel, Laternenpfahl mit Hängelaterne.
#   blender --background --python tools/blender/headless.py -- build_light.py
# Spiel-Koordinaten (Meter, Y oben), Fuß am Ursprung. Rollen: stone, log, charcoal, ember (Glut, leuchtet im Spiel), iron,
# darkwood, brass. Die Flamme zeichnet das GlowSystem (render/glow.ts) an einem Punkt über dem Modell:
#   feuerstelle: y 0.26 | feuerkorb: y 1.28 | fackel: y 0.0 über der Spitze (Kopf bei y 1.18) | laternenpfahl: Lampe bei (0.6, 2.7, 0)
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

LIGHT_DIR = os.path.join(ROOT, 'public', 'models', 'light')
exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())
ROLE_COL.update({'stone': (0.43, 0.42, 0.4), 'log': (0.23, 0.16, 0.11), 'charcoal': (0.07, 0.06, 0.06), 'ember': (1.0, 0.45, 0.1)})

def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def stone_block(m, role, c, size, ry, rnd, bevel=0.03):
    sx, sy, sz = (s / 2 for s in size)
    pts = [(x * sx + (rnd.random() - 0.5) * 0.05, y * sy + (rnd.random() - 0.5) * 0.04, z * sz + (rnd.random() - 0.5) * 0.05) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    m.rock(role, pts, TR(x=c[0], y=c[1], z=c[2], ry=ry), bevel=bevel)

def build_feuerstelle():
    m = Model('feuerstelle'); rnd = random.Random(31)
    n = 10
    for i in range(n):                                                                  # Steinring
        a = i * 2 * math.pi / n
        stone_block(m, 'stone', (math.cos(a) * 0.78, 0.13, math.sin(a) * 0.78), (0.42, 0.26, 0.34), -a, rnd)
    m.lathe('charcoal', [(0.0, 0.05), (0.62, 0.05), (0.66, 0.09), (0.5, 0.15), (0.0, 0.17)], TR(), seg=14)    # Aschebett
    m.lathe('ember', [(0.0, 0.17), (0.44, 0.15), (0.5, 0.12)], TR(y=0.04), seg=10, caps=False)               # Glutbett (leuchtet)
    for i in range(5):                                                                  # Scheite gekreuzt, Enden verkohlt
        a = i * 2 * math.pi / 5 + 0.3
        c = Vector((math.cos(a) * 0.12, 0.3, math.sin(a) * 0.12))
        m.tube('log', [Vector((math.cos(a) * 0.62, 0.12, math.sin(a) * 0.62)), c, Vector((-math.cos(a) * 0.12, 0.5, -math.sin(a) * 0.12))], [0.07, 0.075, 0.06], seg=6, vscale=0.7)
        m.sphere('charcoal', 0.075, TR(x=math.cos(a) * 0.63, y=0.12, z=math.sin(a) * 0.63), seg=6)
    m.ao(lambda role, p: 0.6 + 0.4 * sstep(0.0, 0.5, p.y) if role != 'ember' else 1.0)
    m.export(os.path.join(LIGHT_DIR, 'feuerstelle.glb'))

def build_feuerkorb():
    m = Model('feuerkorb')
    for i in range(3):                                                                  # Dreibein
        a = i * 2 * math.pi / 3 + 0.5
        m.tube('iron', [(math.cos(a) * 0.55, 0.0, math.sin(a) * 0.55), (math.cos(a) * 0.3, 0.7, math.sin(a) * 0.3), (math.cos(a) * 0.18, 1.0, math.sin(a) * 0.18)], [0.035, 0.032, 0.03], seg=5, vscale=1.0)
    m.lathe('iron', [(0.0, 1.0), (0.2, 1.0), (0.4, 1.12), (0.5, 1.32), (0.44, 1.32), (0.36, 1.14), (0.0, 1.04)], TR(), seg=10)    # Korbschale
    for k in range(10):                                                                 # Eisenstäbe um den Korb
        a = k * 2 * math.pi / 10
        m.tube('iron', [(math.cos(a) * 0.2, 1.0, math.sin(a) * 0.2), (math.cos(a) * 0.38, 1.14, math.sin(a) * 0.38), (math.cos(a) * 0.52, 1.36, math.sin(a) * 0.52)], [0.018, 0.016, 0.014], seg=4, caps=False, vscale=1.0)
    m.torus('iron', 0.5, 0.02, TR(y=1.36), seg=16, sec=4)
    m.lathe('charcoal', [(0.0, 1.2), (0.34, 1.2), (0.44, 1.28), (0.0, 1.3)], TR(), seg=10)
    m.lathe('ember', [(0.0, 1.3), (0.4, 1.26)], TR(y=0.0), seg=10, caps=False)
    for i in range(3): m.tube('log', [(math.cos(i * 2.1) * 0.3, 1.26, math.sin(i * 2.1) * 0.3), (0, 1.42, 0)], [0.05, 0.04], seg=5, vscale=0.7)
    m.ao(lambda role, p: 0.6 + 0.4 * sstep(0.0, 1.0, p.y) if role != 'ember' else 1.0)
    m.export(os.path.join(LIGHT_DIR, 'feuerkorb.glb'))

def build_fackel():
    m = Model('fackel')
    m.tube('darkwood', [(0, 0.0, 0), (0, 0.5, 0), (0, 1.0, 0)], [0.035, 0.03, 0.028], seg=6, vscale=0.7)    # Schaft
    m.lathe('iron', [(0.03, 0.96), (0.075, 1.0), (0.085, 1.14), (0.06, 1.16)], TR(), seg=8, caps=False)   # Eisenschale
    m.lathe('log', [(0.0, 1.0), (0.07, 1.02), (0.08, 1.14), (0.04, 1.2), (0.0, 1.21)], TR(), seg=8)         # Pechwickel
    m.lathe('ember', [(0.0, 1.18), (0.045, 1.19)], TR(), seg=6, caps=False)
    for y in (0.6, 0.85): m.torus('iron', 0.034, 0.007, TR(y=y), seg=8, sec=3)
    m.ao(lambda role, p: 0.7 + 0.3 * sstep(0.0, 1.0, p.y) if role != 'ember' else 1.0)
    m.export(os.path.join(LIGHT_DIR, 'fackel.glb'))

def build_laternenpfahl():
    m = Model('laternenpfahl')
    m.tube('darkwood', [(0, -0.2, 0), (0, 1.5, 0), (0, 3.0, 0)], [0.1, 0.085, 0.07], seg=7, vscale=0.4)         # Pfahl
    m.lathe('iron', [(0.14, 0.0), (0.12, 0.1), (0.1, 0.5)], TR(), seg=7)                                          # Fußzwinge
    m.tube('iron', [(0, 2.95, 0), (0.15, 3.12, 0), (0.45, 3.1, 0), (0.6, 2.98, 0)], [0.035, 0.03, 0.028, 0.025], seg=5, vscale=1.0)       # geschwungener Arm
    m.tube('iron', [(0.12, 2.9, 0), (0.36, 3.0, 0)], [0.02, 0.02], seg=4, vscale=1.0)                                # Strebe
    cx, cy = 0.6, 2.7                                                                  # Hängelaterne, Flamme bei (0.6, 2.7, 0)
    m.torus('iron', 0.07, 0.014, TR(x=cx, y=cy + 0.4, rz=math.pi / 2), seg=10, sec=4)
    m.lathe('iron', [(0.04, cy + 0.34), (0.14, cy + 0.27), (0.22, cy + 0.22), (0.2, cy + 0.2)], TR(x=cx), seg=8)
    m.sphere('brass', 0.035, TR(x=cx, y=cy + 0.37), seg=6)
    m.lathe('iron', [(0.16, cy - 0.22), (0.2, cy - 0.27), (0.12, cy - 0.32), (0.05, cy - 0.34)], TR(x=cx), seg=8)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        m.box('iron', (0.022, 0.42, 0.022), TR(x=cx + math.cos(a) * 0.2, y=cy, z=math.sin(a) * 0.2))
    m.torus('brass', 0.2, 0.012, TR(x=cx, y=cy - 0.2), seg=8, sec=3)
    m.ao(lambda role, p: 0.62 + 0.38 * sstep(0.0, 3.0, p.y))
    m.export(os.path.join(LIGHT_DIR, 'laternenpfahl.glb'))

for fn in (build_feuerstelle, build_feuerkorb, build_fackel, build_laternenpfahl):
    clear_gear(); fn()
