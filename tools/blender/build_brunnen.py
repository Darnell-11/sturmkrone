# Marktplatz-Brunnen von Ankerglück: dreistufiger Steinbrunnen mit gestuftem Sockel, achtseitig gegliedertem Becken, acht Löwenköpfen mit
# Speiern, Mittelsäule mit Delfinen, zwei Schalen und einer dritten kleinen Schale mit goldener Spitze. Spiel-Koordinaten (Meter, Y oben),
# Boden bei y = 0. Wasserflächen, Strahlen und Spritzer baut der Code (world/fountain.ts) nach den Maßen unten – beide Seiten müssen übereinstimmen:
#   Beckenwasser y = 0.84, Radius 2.84 (Säule 0.55)       Schale 1: Wasser y = 2.50, Radius 1.62
#   Schale 2: Wasser y = 3.62, Radius 0.92                Schale 3: Wasser y = 4.34, Radius 0.42    Spitze y = 4.95
#   Speier: acht Stück bei Radius 3.0, y = 0.98, Winkel k * 45° + 22.5°, zeigen zur Mitte
#   blender --background --python tools/blender/headless.py -- build_brunnen.py
# Rollen: stone, stonelight, moss, bronze, gold, iron.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

ARCH_DIR = os.path.join(ROOT, 'public', 'models', 'architecture')
exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())
ROLE_COL.update({'stone': (0.62, 0.59, 0.54), 'stonelight': (0.8, 0.77, 0.7), 'moss': (0.3, 0.45, 0.24), 'bronze': (0.6, 0.38, 0.22), 'gold': (0.89, 0.69, 0.29)})

def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def build_brunnen():
    m = Model('brunnen')
    rnd = random.Random(11)
    # --- Pflasterkranz und Sockel ---
    m.lathe('stonelight', [(4.35, 0.0), (4.35, 0.12), (3.75, 0.16), (3.6, 0.16)], TR(), seg=48, caps=False)
    m.lathe('stone', [(3.62, 0.0), (3.62, 0.3), (3.4, 0.3), (3.4, 0.5), (3.32, 0.98), (3.46, 1.02), (3.46, 1.12), (3.02, 1.12), (3.02, 1.04),
                      (2.92, 1.0), (2.86, 0.62), (0.7, 0.58), (0.0, 0.58)], TR(), seg=48, smooth=True)
    m.torus('stonelight', 3.24, 0.085, TR(y=1.13), seg=48, sec=6)                      # Randwulst
    m.torus('stonelight', 3.4, 0.06, TR(y=0.32), seg=48, sec=5)                        # Fußleiste
    # Gliederung: sechzehn Pilaster an der Beckenwand, dazwischen Füllfelder, acht davon mit Rosette
    for k in range(16):
        a = k * 2 * math.pi / 16
        m.box('stonelight', (0.32, 0.64, 0.14), TR(x=math.cos(a) * 3.43, y=0.8, z=math.sin(a) * 3.43, ry=-a + math.pi / 2))
        m.box('stonelight', (0.4, 0.07, 0.17), TR(x=math.cos(a) * 3.45, y=1.14, z=math.sin(a) * 3.45, ry=-a + math.pi / 2))
    for k in range(8):
        a = (k + 0.5) * 2 * math.pi / 8
        m.cyl('bronze', 0.1, 0.05, TR(x=math.cos(a) * 3.38, y=0.76, z=math.sin(a) * 3.38, rz=math.pi / 2, ry=-a), seg=10)
    # Löwenköpfe mit Speiern (Wasseraustritt: Radius 3.0, y 0.98)
    for k in range(8):
        a = (k + 0.5) * 2 * math.pi / 8
        c, s = math.cos(a), math.sin(a)
        m.sphere('stonelight', 0.2, TR(x=c * 3.1, y=0.98, z=s * 3.1), seg=10)
        for e in (-1, 1):
            m.sphere('stonelight', 0.07, TR(x=c * 3.1 - s * e * 0.17, y=1.14, z=s * 3.1 + c * e * 0.17), seg=6)
        m.tube('bronze', [(c * 3.22, 0.96, s * 3.22), (c * 3.0, 0.97, s * 3.0), (c * 2.86, 0.94, s * 2.86)], [0.075, 0.07, 0.06], seg=8, vscale=1.0)
    # Moos an Sockel und Beckenfuß
    for k in range(34):
        a = rnd.random() * 2 * math.pi
        r = 3.38 + rnd.random() * 0.22
        m.blob('moss', 0.07 + rnd.random() * 0.1, TR(x=math.cos(a) * r, y=0.14 + rnd.random() * 0.12, z=math.sin(a) * r), subdiv=1, noise=0.2, seed=k, squash=0.5)
    # --- Mittelsäule, Delfine, Schalen ---
    m.lathe('stonelight', [(1.1, 0.58), (1.1, 0.78), (0.86, 0.9), (0.68, 1.1), (0.58, 1.3), (0.55, 2.04), (0.7, 2.1)], TR(), seg=28, caps=False)
    m.torus('stonelight', 0.88, 0.05, TR(y=0.9), seg=28, sec=5)
    for k in range(4):                                                                     # vier Delfine tragen die erste Schale
        a = k * math.pi / 2 + math.pi / 4
        pts = []
        for t in range(11):
            u = t / 10
            r = 1.0 - 0.45 * math.sin(u * math.pi * 0.5)
            ang = a + 0.32 * math.sin(u * math.pi)
            pts.append((math.cos(ang) * r, 0.95 + u * 1.12 + 0.12 * math.sin(u * math.pi * 2.5), math.sin(ang) * r))
        rad = [0.17, 0.2, 0.2, 0.18, 0.16, 0.14, 0.12, 0.1, 0.085, 0.06, 0.035]
        m.tube('bronze', pts, rad, seg=10, vscale=1.0)
        e = Vector(pts[0]); out = Vector((math.cos(a), 0.0, math.sin(a)))
        m.sphere('bronze', 0.19, TR(x=e.x, y=e.y, z=e.z), seg=10)                          # Kopf
        sn = e + out * 0.2 + Vector((0, -0.12, 0))
        m.tube('bronze', [tuple(e), tuple(sn), tuple(sn + out * 0.14 + Vector((0, -0.04, 0)))], [0.1, 0.075, 0.05], seg=8, vscale=1.0)   # Schnauze
        for sd in (-1, 1):
            side = Vector((-math.sin(a), 0.0, math.cos(a))) * sd * 0.12
            ep = e + out * 0.08 + Vector((0, 0.1, 0)) + side
            m.sphere('stonelight', 0.03, TR(x=ep.x, y=ep.y, z=ep.z), seg=6)
        mid = Vector(pts[5])                                                                # Rückenflosse
        m.leaf('bronze', [(mid.x, mid.y + 0.1, mid.z), (mid.x + math.cos(a) * 0.04, mid.y + 0.42, mid.z + math.sin(a) * 0.04), (mid.x - out.x * 0.0 + 0.0, mid.y + 0.22, mid.z + 0.12)])
        t = Vector(pts[-1]); tg = Vector((-math.sin(a), 0.0, math.cos(a)))
        for sd in (-1, 1):                                                                  # Schwanzflosse
            m.leaf('bronze', [tuple(t), tuple(t + tg * sd * 0.36 + Vector((0, 0.16, 0))), tuple(t + tg * sd * 0.14 + Vector((0, 0.3, 0)))])
    # Schale 1
    m.lathe('stone', [(0.62, 2.04), (1.0, 2.12), (1.5, 2.34), (1.78, 2.56), (1.86, 2.64), (1.86, 2.7), (1.72, 2.7), (1.7, 2.6), (1.4, 2.46), (0.0, 2.4)], TR(), seg=40)
    m.torus('stonelight', 1.82, 0.05, TR(y=2.69), seg=40, sec=5)
    for k in range(12):
        a = k * 2 * math.pi / 12
        m.sphere('stonelight', 0.07, TR(x=math.cos(a) * 1.82, y=2.76, z=math.sin(a) * 1.82), seg=6)
    # Säule 2
    m.lathe('stonelight', [(0.34, 2.4), (0.3, 2.5), (0.24, 2.7), (0.3, 2.8), (0.22, 2.95), (0.2, 3.3), (0.32, 3.4)], TR(), seg=20, caps=False)
    m.torus('stonelight', 0.26, 0.04, TR(y=2.78), seg=20, sec=4)
    # Schale 2
    m.lathe('stone', [(0.3, 3.35), (0.62, 3.42), (0.9, 3.58), (1.04, 3.74), (1.08, 3.8), (0.98, 3.8), (0.94, 3.72), (0.7, 3.62), (0.0, 3.56)], TR(), seg=32)
    m.torus('stonelight', 1.03, 0.04, TR(y=3.79), seg=32, sec=4)
    # Säule 3, Schale 3, Spitze
    m.lathe('stonelight', [(0.2, 3.5), (0.13, 3.7), (0.15, 3.9), (0.12, 4.1), (0.2, 4.2)], TR(), seg=16, caps=False)
    m.lathe('stone', [(0.15, 4.18), (0.34, 4.24), (0.5, 4.38), (0.54, 4.44), (0.46, 4.44), (0.42, 4.37), (0.0, 4.33)], TR(), seg=24)
    m.lathe('bronze', [(0.1, 4.36), (0.08, 4.55), (0.12, 4.65), (0.0, 4.95)], TR(), seg=12, caps=False)
    m.sphere('gold', 0.13, TR(y=4.98), seg=10)
    m.ao(lambda role, p: 0.62 + 0.38 * sstep(0.0, 1.4, p.y))
    m.export(os.path.join(ARCH_DIR, 'brunnen.glb'))

clear_gear()
build_brunnen()
