# Möbel der Kapitänskajüte: Schreibtisch, Stuhl, Koje, Kartentisch, Bücherregal, Truhe, Globus, Hängelampe, Teppich.
#   blender --background --python tools/blender/headless.py -- build_kajuete.py
# Spiel-Koordinaten (Meter, Y oben), Mittelpunkt am Boden. Alle Möbel schauen mit der Arbeits- bzw. Vorderseite nach +Z (Rücken an -Z),
# der Bau dreht sie in den Raum. Rollen: wood, darkwood, brass, iron, paper, cloth (rot), bedding (hell), leather, book1..4, globe, rug, rugtrim, glow.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

SHIP_DIR = os.path.join(ROOT, 'public', 'models', 'ships')
exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())
ROLE_COL.update({'paper': (0.9, 0.84, 0.66), 'cloth': (0.48, 0.12, 0.1), 'bedding': (0.85, 0.82, 0.72), 'leather': (0.3, 0.18, 0.1),
                 'book1': (0.5, 0.1, 0.1), 'book2': (0.14, 0.32, 0.2), 'book3': (0.35, 0.22, 0.12), 'book4': (0.16, 0.24, 0.45),
                 'globe': (0.2, 0.45, 0.6), 'rug': (0.5, 0.12, 0.1), 'rugtrim': (0.8, 0.62, 0.22), 'glow': (1.0, 0.7, 0.3)})

def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def floor_ao(top):
    return lambda role, p: (0.62 + 0.38 * sstep(0.0, top, p.y)) if role != 'glow' else 1.0

def blk(m, role, size, T, bevel=0.012):
    sx, sy, sz = (s / 2 for s in size)
    pts = [(x * sx, y * sy, z * sz) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    m.rock(role, pts, T, bevel=bevel)

def candle(m, x, y, z, h=0.12):
    m.lathe('brass', [(0.035, 0.0), (0.03, 0.012), (0.012, 0.03), (0.011, 0.07), (0.03, 0.09)], TR(x=x, y=y, z=z), seg=8, caps=False)
    m.cyl('paper', 0.011, h, TR(x=x, y=y + 0.08 + h / 2, z=z), seg=6)

def build_schreibtisch():
    m = Model('kajuete_schreibtisch')
    blk(m, 'wood', (1.7, 0.07, 0.85), TR(y=0.78 + 0.035), 0.02)                              # Platte
    for sx in (-1, 1):
        blk(m, 'darkwood', (0.5, 0.74, 0.78), TR(x=sx * 0.6, y=0.37, z=0.0), 0.015)        # Schubladenstock
        for k in range(3):
            y = 0.18 + k * 0.22
            blk(m, 'wood', (0.44, 0.19, 0.03), TR(x=sx * 0.6, y=y, z=0.4), 0.008)             # Schubladenfront
            m.sphere('brass', 0.022, TR(x=sx * 0.6, y=y, z=0.43), seg=6)
    blk(m, 'darkwood', (0.7, 0.6, 0.03), TR(y=0.46, z=-0.4), 0.008)                        # Rückwand zwischen den Stöcken
    m.box('leather', (1.2, 0.012, 0.55), TR(y=0.826, z=0.02))                                # Schreibunterlage
    m.box('paper', (0.42, 0.01, 0.3), TR(x=-0.2, y=0.835, z=0.05, ry=0.18))                  # Papiere
    m.box('paper', (0.38, 0.01, 0.28), TR(x=-0.17, y=0.846, z=0.08, ry=-0.12))
    m.lathe('iron', [(0.0, 0.0), (0.04, 0.0), (0.045, 0.05), (0.025, 0.065), (0.02, 0.07)], TR(x=0.3, y=0.832, z=0.0), seg=8)   # Tintenfass
    m.tube('paper', [(0.3, 0.9, 0.0), (0.38, 1.05, -0.05), (0.42, 1.17, -0.08)], [0.006, 0.004, 0.001], seg=4, vscale=1.0)       # Feder
    candle(m, 0.65, 0.832, -0.2)
    m.cyl('paper', 0.03, 0.4, TR(x=-0.55, y=0.862, z=-0.25, rz=math.pi / 2), seg=8)          # Kartenrolle
    m.ao(floor_ao(0.9))
    m.export(os.path.join(SHIP_DIR, 'kajuete_schreibtisch.glb'))

def build_stuhl():
    m = Model('kajuete_stuhl')
    blk(m, 'wood', (0.52, 0.05, 0.5), TR(y=0.47), 0.015)
    m.box('cloth', (0.44, 0.05, 0.42), TR(y=0.52))                                           # Polster
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.tube('darkwood', [(sx * 0.22, 0.0, sz * 0.2), (sx * 0.22, 0.45, sz * 0.2)], [0.025, 0.03], seg=5, vscale=1.0)
    for sx in (-1, 1): m.tube('darkwood', [(sx * 0.22, 0.45, -0.2), (sx * 0.22, 1.0, -0.22)], [0.03, 0.025], seg=5, vscale=1.0)
    blk(m, 'darkwood', (0.52, 0.07, 0.05), TR(y=1.0, z=-0.22), 0.015)
    for k in range(4): m.box('wood', (0.05, 0.4, 0.03), TR(x=-0.15 + k * 0.1, y=0.76, z=-0.215))
    for sx in (-1, 1): blk(m, 'darkwood', (0.04, 0.04, 0.4), TR(x=sx * 0.25, y=0.72, z=0.0), 0.01)    # Armlehnen
    m.ao(floor_ao(0.9)); m.export(os.path.join(SHIP_DIR, 'kajuete_stuhl.glb'))

def build_koje():
    m = Model('kajuete_koje')
    blk(m, 'darkwood', (0.9, 0.12, 2.05), TR(y=0.38), 0.02)                                  # Rahmen
    for sx in (-1, 1):
        for sz in (-1, 1): blk(m, 'darkwood', (0.09, 0.45, 0.09), TR(x=sx * 0.42, y=0.225, z=sz * 0.98), 0.012)
        blk(m, 'wood', (0.04, 0.22, 2.05), TR(x=sx * 0.44, y=0.55), 0.01)                    # Seitenbretter
    blk(m, 'darkwood', (0.9, 0.6, 0.06), TR(y=0.62, z=-1.02), 0.015)                        # Kopfbrett
    blk(m, 'wood', (0.9, 0.3, 0.05), TR(y=0.47, z=1.02), 0.012)                              # Fußbrett
    blk(m, 'bedding', (0.8, 0.12, 1.9), TR(y=0.5), 0.04)                                     # Matratze
    blk(m, 'bedding', (0.55, 0.1, 0.32), TR(y=0.62, z=-0.72), 0.035)                         # Kissen
    blk(m, 'cloth', (0.82, 0.07, 1.1), TR(y=0.585, z=0.4), 0.03)                             # Decke
    m.box('cloth', (0.84, 0.05, 0.14), TR(y=0.57, z=-0.12))
    m.ao(floor_ao(0.8)); m.export(os.path.join(SHIP_DIR, 'kajuete_koje.glb'))

def build_kartentisch():
    m = Model('kajuete_kartentisch')
    blk(m, 'wood', (1.3, 0.06, 0.9), TR(y=0.82), 0.02)
    for sx in (-1, 1):
        for sz in (-1, 1): m.tube('darkwood', [(sx * 0.58, 0.0, sz * 0.38), (sx * 0.56, 0.8, sz * 0.36)], [0.045, 0.05], seg=6, vscale=1.0)
    blk(m, 'darkwood', (1.1, 0.04, 0.05), TR(y=0.28, z=0.0), 0.01)                           # Querstrebe
    m.box('paper', (1.1, 0.012, 0.72), TR(y=0.856, ry=0.03))                                 # Seekarte
    for k in range(6): m.box('darkwood', (1.08, 0.004, 0.006), TR(y=0.864, z=-0.28 + k * 0.11, ry=0.03))
    m.lathe('brass', [(0.0, 0.0), (0.075, 0.0), (0.085, 0.02), (0.07, 0.04), (0.0, 0.04)], TR(x=0.35, y=0.862, z=0.12), seg=14)      # Kompass
    m.lathe('paper', [(0.0, 0.0), (0.06, 0.0)], TR(x=0.35, y=0.903, z=0.12), seg=14, caps=False)
    for sx in (-1, 1): m.tube('brass', [(-0.2 + sx * 0.02, 0.87, 0.05), (-0.15 + sx * 0.05, 0.875, 0.3)], [0.008, 0.005], seg=4, vscale=1.0)   # Zirkel
    candle(m, -0.5, 0.85, -0.3)
    m.ao(floor_ao(0.9)); m.export(os.path.join(SHIP_DIR, 'kajuete_kartentisch.glb'))

def build_regal():
    m = Model('kajuete_regal'); rnd = random.Random(5)
    W, H, Dp = 1.0, 1.9, 0.34
    for sx in (-1, 1): blk(m, 'darkwood', (0.05, H, Dp), TR(x=sx * (W / 2 - 0.025), y=H / 2, z=0.0), 0.01)
    blk(m, 'darkwood', (W, 0.06, Dp), TR(y=H - 0.03), 0.01)
    blk(m, 'wood', (W - 0.1, H, 0.025), TR(y=H / 2, z=-Dp / 2 + 0.0125), 0.006)
    ys = [0.06, 0.52, 0.96, 1.4]
    for y in ys: blk(m, 'wood', (W - 0.1, 0.035, Dp - 0.03), TR(y=y), 0.008)
    roles = ['book1', 'book2', 'book3', 'book4']
    for si, y in enumerate(ys):
        x = -W / 2 + 0.09
        while x < W / 2 - 0.12:
            w = 0.035 + rnd.random() * 0.03; h = 0.22 + rnd.random() * 0.14
            lean = (rnd.random() - 0.5) * 0.04 if rnd.random() < 0.15 else 0.0
            m.box(roles[rnd.randrange(4)], (w, h, 0.22 + rnd.random() * 0.05), TR(x=x + w / 2, y=y + 0.0175 + h / 2, z=0.02, rz=lean))
            x += w + 0.004
            if rnd.random() < 0.06: x += 0.14
    m.ao(lambda role, p: (0.55 + 0.45 * sstep(-0.17, 0.12, p.z)) * (0.7 + 0.3 * sstep(0.0, H, p.y)))
    m.export(os.path.join(SHIP_DIR, 'kajuete_regal.glb'))

def build_truhe():
    m = Model('kajuete_truhe')
    blk(m, 'wood', (0.95, 0.4, 0.58), TR(y=0.2), 0.02)
    m.lathe('wood', [(0.0, -0.475), (0.26, -0.475), (0.29, 0.0), (0.26, 0.475), (0.0, 0.475)], TR(y=0.4, rz=math.pi / 2, ry=0), seg=10, caps=False)   # gewölbter Deckel (Halbzylinder-Näherung)
    for x in (-0.38, 0.0, 0.38): m.box('brass', (0.06, 0.62, 0.62), TR(x=x, y=0.32))
    m.box('brass', (0.1, 0.12, 0.03), TR(y=0.38, z=0.3)); m.sphere('iron', 0.02, TR(y=0.37, z=0.325), seg=6)
    for sx in (-1, 1): m.torus('iron', 0.05, 0.01, TR(x=sx * 0.5, y=0.25, rz=math.pi / 2), seg=8, sec=3)
    m.ao(floor_ao(0.6)); m.export(os.path.join(SHIP_DIR, 'kajuete_truhe.glb'))

def build_globus():
    m = Model('kajuete_globus')
    for i in range(3):
        a = i * 2 * math.pi / 3
        m.tube('darkwood', [(math.cos(a) * 0.28, 0.0, math.sin(a) * 0.28), (math.cos(a) * 0.06, 0.78, math.sin(a) * 0.06)], [0.025, 0.02], seg=5, vscale=1.0)
    m.cyl('darkwood', 0.07, 0.04, TR(y=0.8), seg=8)
    m.sphere('globe', 0.24, TR(y=1.1), seg=14)
    m.torus('brass', 0.255, 0.01, TR(y=1.1, rx=0.4), seg=20, sec=4)
    m.torus('brass', 0.255, 0.008, TR(y=1.1, rx=0.4 + math.pi / 2, ry=0.0), seg=20, sec=4)
    m.ao(floor_ao(1.4)); m.export(os.path.join(SHIP_DIR, 'kajuete_globus.glb'))

def build_lampe():
    m = Model('kajuete_lampe')
    m.tube('iron', [(0, 0.0, 0), (0, -0.2, 0), (0, -0.4, 0)], [0.012, 0.012, 0.012], seg=4, vscale=1.0)
    m.lathe('brass', [(0.04, -0.4), (0.12, -0.44), (0.2, -0.5), (0.18, -0.52)], TR(), seg=10)                  # Dach
    m.lathe('brass', [(0.15, -0.8), (0.19, -0.84), (0.1, -0.9), (0.04, -0.93)], TR(), seg=10)                    # Boden
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        m.tube('brass', [(math.cos(a) * 0.17, -0.52, math.sin(a) * 0.17), (math.cos(a) * 0.16, -0.8, math.sin(a) * 0.16)], [0.012, 0.012], seg=4, vscale=1.0)
    m.torus('brass', 0.165, 0.01, TR(y=-0.66), seg=10, sec=3)
    m.lathe('glow', [(0.0, -0.58), (0.06, -0.62), (0.05, -0.72), (0.0, -0.74)], TR(), seg=8, caps=False)           # Flamme/Kern (leuchtet im Spiel)
    m.export(os.path.join(SHIP_DIR, 'kajuete_lampe.glb'))

def build_teppich():
    m = Model('kajuete_teppich')
    m.box('rugtrim', (2.6, 0.012, 1.9), TR(y=0.006))
    m.box('rug', (2.4, 0.016, 1.7), TR(y=0.008))
    m.box('rugtrim', (1.9, 0.018, 1.2), TR(y=0.009))
    m.box('rug', (1.8, 0.02, 1.1), TR(y=0.01))
    m.box('rugtrim', (0.9, 0.022, 0.5), TR(y=0.011, ry=0.0))
    m.ao(lambda role, p: 1.0)
    m.export(os.path.join(SHIP_DIR, 'kajuete_teppich.glb'))

for fn in (build_schreibtisch, build_stuhl, build_koje, build_kartentisch, build_regal, build_truhe, build_globus, build_lampe, build_teppich):
    clear_gear(); fn()
