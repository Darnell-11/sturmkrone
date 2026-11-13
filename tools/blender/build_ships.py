# Zwei dezente Hero-Details für die bestehenden Schiffe (Rümpfe und Segel bleiben unverändert):
# geschnitzte Drachen-Galionsfigur und Steuerrad mit Griffen, Messingbändern und Nabe.
#   blender --background --python tools/blender/headless.py -- build_ships.py
# Galionsfigur: Fuß am Ursprung, Blick nach +Z (vorn), oben +Y. Steuerrad: Ebene XY, Achse +Z.
# Rollen: paint (Körper), gold (Hörner, Mähne, Zähne), wood, dark (Augen, Rachen); Rad: wood, brass.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

SHIP_DIR = os.path.join(ROOT, 'public', 'models', 'ships')
exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())

def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def build_drache():
    m = Model('galionsfigur_drache'); rnd = random.Random(21)
    m.box('wood', (0.42, 0.4, 0.55), TR(y=-0.05, z=-0.42))                                      # Sockel am Vorsteven
    neck = [(0, 0.0, -0.45), (0, 0.18, -0.35), (0, 0.5, -0.12), (0, 0.85, 0.12), (0, 1.05, 0.4), (0, 1.1, 0.62)]
    m.tube('paint', neck, [0.27, 0.25, 0.22, 0.19, 0.18, 0.19], seg=10, vscale=0.6)
    # Kopf: Oberkiefer (Schnauze) und Unterkiefer, leicht geöffnet
    m.blob('paint', 0.26, TR(y=1.12, z=0.72), subdiv=2, noise=0.08, seed=2, squash=0.9)
    m.tube('paint', [(0, 1.12, 0.7), (0, 1.1, 1.0), (0, 1.04, 1.32), (0, 1.0, 1.52)], [0.2, 0.17, 0.13, 0.1], seg=8, vscale=0.6)
    m.tube('paint', [(0, 0.95, 0.66), (0, 0.84, 0.95), (0, 0.76, 1.22), (0, 0.72, 1.4)], [0.12, 0.1, 0.075, 0.05], seg=7, vscale=0.6)
    m.lathe('dark', [(0.0, 0.0), (0.14, 0.0)], TR(y=0.92, z=1.0, rx=math.pi / 2 - 0.12), seg=8, caps=False)                       # Rachen
    for k in range(5):                                                                      # Zähne
        z = 1.0 + k * 0.1
        m.lathe('gold', [(0.022, 0.0), (0.0, -0.09)], TR(x=0.09, y=1.0 - k * 0.012, z=z), seg=4)
        m.lathe('gold', [(0.022, 0.0), (0.0, -0.09)], TR(x=-0.09, y=1.0 - k * 0.012, z=z), seg=4)
    m.sphere('dark', 0.05, TR(x=0.2, y=1.2, z=0.8), seg=6); m.sphere('dark', 0.05, TR(x=-0.2, y=1.2, z=0.8), seg=6)       # Augen
    m.torus('gold', 0.06, 0.012, TR(x=0.205, y=1.2, z=0.8, rz=math.pi / 2), seg=8, sec=4); m.torus('gold', 0.06, 0.012, TR(x=-0.205, y=1.2, z=0.8, rz=math.pi / 2), seg=8, sec=4)
    for s in (-1, 1):                                                                       # Hörner, nach hinten geschwungen
        horn = [(s * 0.14, 1.28, 0.62), (s * 0.24, 1.46, 0.45), (s * 0.3, 1.6, 0.2), (s * 0.3, 1.66, -0.08)]
        m.tube('gold', horn, [0.055, 0.045, 0.03, 0.01], seg=5, vscale=1.0)
        ear = [(s * 0.2, 1.1, 0.55), (s * 0.5, 1.2, 0.35), (s * 0.7, 1.15, 0.1)]                  # Flossenohren
        m.leaf('gold', [Vector((s * 0.2, 1.08, 0.6)), Vector((s * 0.2, 1.2, 0.5)), Vector((s * 0.62, 1.22, 0.28)), Vector((s * 0.58, 1.08, 0.3))])
    for k in range(5):                                                                      # Rückenkamm aus Platten entlang des Halses
        t = k / 4; i = min(len(neck) - 2, int(t * (len(neck) - 1)))
        p = Vector(neck[i]).lerp(Vector(neck[i + 1]), t * (len(neck) - 1) - i)
        hgt = 0.26 - 0.1 * t
        m.box('gold', (0.05, hgt, 0.16), TR(x=0, y=p.y + 0.16 + hgt / 2, z=p.z - 0.05 - 0.08 * t, rx=-0.45))
    m.ao(lambda role, p: 0.62 + 0.38 * sstep(-0.2, 1.5, p.y))
    m.export(os.path.join(SHIP_DIR, 'galionsfigur_drache.glb'))

def build_steuerrad():
    m = Model('steuerrad'); n = 10
    ZA = TR(rx=math.pi / 2)
    m.torus('wood', 0.46, 0.042, ZA, seg=32, sec=8)                                          # Felge
    m.torus('brass', 0.46, 0.014, TR(z=0.04, rx=math.pi / 2), seg=32, sec=5)                  # Messingband vorn
    m.torus('wood', 0.2, 0.028, ZA, seg=22, sec=6)                                           # Innenring
    m.torus('brass', 0.12, 0.016, TR(z=0.05, rx=math.pi / 2), seg=20, sec=5)
    for i in range(n):
        a = i * 2 * math.pi / n
        ca, sa = -math.sin(a), math.cos(a)
        m.lathe('wood', [(0.032, -0.19), (0.04, -0.1), (0.034, 0.0), (0.04, 0.12)], TR(x=ca * 0.33, y=sa * 0.33, rz=a), seg=8, caps=False)      # Speiche, gedrechselt
        m.lathe('wood', [(0.03, -0.24), (0.036, -0.18), (0.05, -0.1), (0.036, -0.03), (0.03, 0.12), (0.048, 0.15), (0.0, 0.22)],
                TR(x=ca * 0.66, y=sa * 0.66, rz=a), seg=8)                                  # Griff
        m.cyl('brass', 0.05, 0.05, TR(x=ca * 0.5, y=sa * 0.5, rz=a), seg=8)                 # Messinghülse an der Felge
    m.cyl('brass', 0.12, 0.16, AX, seg=16)                                                   # Nabe
    m.torus('brass', 0.12, 0.018, TR(z=0.08, rx=math.pi / 2), seg=16, sec=5)
    m.torus('brass', 0.12, 0.018, TR(z=-0.08, rx=math.pi / 2), seg=16, sec=5)
    m.cyl('brass', 0.055, 0.34, AX, seg=10)                                                  # Welle
    m.sphere('brass', 0.055, TR(z=0.2), seg=10)
    m.export(os.path.join(SHIP_DIR, 'steuerrad.glb'))

for fn in (build_drache, build_steuerrad):
    clear_gear(); fn()
