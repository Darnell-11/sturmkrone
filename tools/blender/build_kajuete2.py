# Prunkmöbel für die Kapitänskajüten der großen Schiffe (Schiffe 2): Himmelbett, Kronleuchter, Anrichte, Fensterbank mit Vorhängen,
# Waffenwand, Gemälde, Kajütenofen, lange Tafel.
#   blender --background --python tools/blender/headless.py -- build_kajuete2.py
# Gleiche Konventionen wie build_kajuete.py: Meter, Y oben, Vorderseite nach +Z (Rücken an -Z), Mittelpunkt am Boden.
# Neue Rollen: velvet (Samt, tiefrot), paint1/paint2 (Gemälde), steel (Klinge), glass, flame (leuchtet im Spiel, wie die Flamme der Kerzen).
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

SHIP_DIR = os.path.join(ROOT, 'public', 'models', 'ships')
exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())
ROLE_COL.update({'paper': (0.9, 0.84, 0.66), 'cloth': (0.48, 0.12, 0.1), 'bedding': (0.85, 0.82, 0.72), 'leather': (0.3, 0.18, 0.1),
                 'book1': (0.5, 0.1, 0.1), 'book2': (0.14, 0.32, 0.2), 'velvet': (0.38, 0.07, 0.12), 'paint1': (0.18, 0.36, 0.48),
                 'paint2': (0.78, 0.6, 0.38), 'steel': (0.72, 0.74, 0.78), 'glass': (0.6, 0.78, 0.82), 'flame': (1.0, 0.85, 0.4)})

def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def floor_ao(top):
    return lambda role, p: (0.62 + 0.38 * sstep(0.0, top, p.y)) if role != 'flame' else 1.0

def blk(m, role, size, T, bevel=0.012):
    sx, sy, sz = (s / 2 for s in size)
    pts = [(x * sx, y * sy, z * sz) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    m.rock(role, pts, T, bevel=bevel)

def candle(m, x, y, z, h=0.12):
    m.lathe('brass', [(0.035, 0.0), (0.03, 0.012), (0.012, 0.03), (0.011, 0.07), (0.03, 0.09)], TR(x=x, y=y, z=z), seg=8, caps=False)
    m.cyl('paper', 0.011, h, TR(x=x, y=y + 0.08 + h / 2, z=z), seg=6)
    m.lathe('flame', [(0.0, 0.0), (0.012, 0.012), (0.008, 0.034), (0.0, 0.05)], TR(x=x, y=y + 0.08 + h, z=z), seg=6, caps=False)

def build_himmelbett():
    m = Model('kajuete_himmelbett')
    W, Lb = 1.5, 2.1
    zh = -(Lb / 2 - 0.03)
    blk(m, 'darkwood', (W, 0.32, Lb), TR(y=0.16), 0.02)
    blk(m, 'wood', (W + 0.04, 0.05, Lb + 0.04), TR(y=0.34), 0.015)
    blk(m, 'bedding', (W - 0.1, 0.2, Lb - 0.12), TR(y=0.46), 0.05)
    blk(m, 'velvet', (W - 0.06, 0.07, 1.25), TR(y=0.58, z=0.38), 0.03)
    blk(m, 'brass', (W - 0.04, 0.025, 0.05), TR(y=0.6, z=0.98), 0.005)                            # Saumleiste der Decke
    for sx in (-1, 1):
        blk(m, 'bedding', (0.6, 0.14, 0.36), TR(x=sx * 0.34, y=0.62, z=-0.78), 0.06)
    for sx in (-1, 1):
        for sz in (-1, 1):
            px, pz = sx * (W / 2 - 0.02), sz * (Lb / 2 - 0.03)
            m.lathe('darkwood', [(0.045, 0.0), (0.06, 0.12), (0.04, 0.3), (0.06, 0.55), (0.04, 0.8), (0.04, 1.7), (0.06, 1.95), (0.04, 2.1), (0.0, 2.15)], TR(x=px, z=pz), seg=10)
            m.sphere('brass', 0.055, TR(x=px, y=2.2, z=pz), seg=8)
    blk(m, 'darkwood', (W, 1.15, 0.08), TR(y=0.92, z=zh), 0.015)                                 # Kopfteil
    blk(m, 'wood', (W - 0.3, 0.75, 0.03), TR(y=1.05, z=zh + 0.05), 0.01)
    blk(m, 'brass', (W - 0.2, 0.04, 0.04), TR(y=1.45, z=zh + 0.05), 0.005)
    blk(m, 'brass', (W - 0.2, 0.04, 0.04), TR(y=0.68, z=zh + 0.05), 0.005)
    m.lathe('brass', [(0.0, 0.0), (0.16, 0.0), (0.18, 0.02), (0.14, 0.04), (0.05, 0.06), (0.0, 0.07)], TR(y=1.1, z=zh + 0.07, rx=math.pi / 2), seg=14)   # Wappenscheibe
    for sz in (-1, 1):                                                                           # Baldachinrahmen
        blk(m, 'darkwood', (W, 0.07, 0.07), TR(y=2.12, z=sz * (Lb / 2 - 0.03)), 0.01)
    for sx in (-1, 1):
        blk(m, 'darkwood', (0.07, 0.07, Lb), TR(x=sx * (W / 2 - 0.02), y=2.12), 0.01)
    blk(m, 'velvet', (W, 0.02, Lb), TR(y=2.14), 0.005)
    for sz in (-1, 1):                                                                           # Behang rundum
        blk(m, 'velvet', (W + 0.02, 0.3, 0.03), TR(y=1.95, z=sz * (Lb / 2 - 0.03)), 0.01)
        blk(m, 'brass', (W + 0.02, 0.03, 0.035), TR(y=1.78, z=sz * (Lb / 2 - 0.03)), 0.004)
    for sx in (-1, 1):
        blk(m, 'velvet', (0.03, 0.3, Lb), TR(x=sx * (W / 2 - 0.02), y=1.95), 0.01)
        blk(m, 'brass', (0.035, 0.03, Lb), TR(x=sx * (W / 2 - 0.02), y=1.78), 0.004)
    for sx in (-1, 1):                                                                           # Vorhänge: hinten geschlossen, vorn gerafft
        blk(m, 'velvet', (0.05, 1.7, 0.85), TR(x=sx * (W / 2 + 0.03), y=1.0, z=-0.55), 0.015)
        m.tube('velvet', [(sx * (W / 2 + 0.04), 2.0, 0.92), (sx * (W / 2 + 0.07), 1.2, 0.95), (sx * (W / 2 + 0.06), 0.3, 1.0)], [0.075, 0.06, 0.1], seg=7, vscale=1.0)
        m.torus('brass', 0.085, 0.01, TR(x=sx * (W / 2 + 0.065), y=1.15, z=0.95), seg=10, sec=3)
    m.ao(lambda role, p: (0.62 + 0.38 * sstep(0.0, 2.0, p.y)) if role != 'flame' else 1.0)
    m.export(os.path.join(SHIP_DIR, 'kajuete_himmelbett.glb'))

def build_kronleuchter():
    m = Model('kajuete_kronleuchter')
    m.lathe('brass', [(0.0, 0.0), (0.07, -0.01), (0.05, -0.05), (0.02, -0.08)], TR(), seg=8)
    m.tube('iron', [(0, -0.05, 0), (0, -0.25, 0), (0, -0.42, 0)], [0.014, 0.014, 0.014], seg=5, vscale=1.0)
    m.lathe('brass', [(0.03, -0.4), (0.08, -0.48), (0.05, -0.6), (0.11, -0.72), (0.05, -0.86), (0.07, -0.94), (0.0, -1.02)], TR(), seg=10)
    m.sphere('brass', 0.045, TR(y=-1.06), seg=8)
    for R, n, y, rise in ((0.64, 8, -0.7, 0.22), (0.4, 6, -0.88, 0.18)):
        m.torus('brass', R, 0.012, TR(y=y), seg=24, sec=4)
        for i in range(n):
            a = i * 2 * math.pi / n
            ex, ez = math.cos(a) * R, math.sin(a) * R
            m.tube('brass', [(0, y + 0.02, 0), (ex * 0.45, y - 0.05, ez * 0.45), (ex * 0.9, y + 0.02, ez * 0.9), (ex, y + rise * 0.55, ez)], [0.014, 0.012, 0.012, 0.012], seg=4, vscale=1.0)
            candle(m, ex, y + rise * 0.55, ez, 0.11)
            m.sphere('glass', 0.02, TR(x=ex * 1.0, y=y - 0.07, z=ez * 1.0), seg=5)
            m.sphere('glass', 0.016, TR(x=ex * 1.0, y=y - 0.14, z=ez * 1.0), seg=5)
    m.export(os.path.join(SHIP_DIR, 'kajuete_kronleuchter.glb'))

def build_anrichte():
    m = Model('kajuete_anrichte')
    W, D = 1.7, 0.55
    blk(m, 'darkwood', (W - 0.04, 0.1, D - 0.06), TR(y=0.05), 0.01)
    blk(m, 'wood', (W, 0.72, D), TR(y=0.46), 0.02)
    blk(m, 'darkwood', (W + 0.08, 0.05, D + 0.06), TR(y=0.845, z=0.01), 0.02)
    for i in range(3):
        x = (i - 1) * 0.55
        blk(m, 'darkwood', (0.5, 0.6, 0.03), TR(x=x, y=0.46, z=D / 2 + 0.005), 0.01)
        blk(m, 'wood', (0.38, 0.46, 0.02), TR(x=x, y=0.46, z=D / 2 + 0.022), 0.008)
        m.sphere('brass', 0.024, TR(x=x, y=0.46, z=D / 2 + 0.05), seg=6)
    blk(m, 'brass', (W, 0.03, 0.03), TR(y=0.8, z=D / 2 + 0.02), 0.004)
    # Spiegelwand dahinter
    blk(m, 'darkwood', (1.4, 0.98, 0.05), TR(y=1.4, z=-D / 2 + 0.03), 0.015)
    m.box('glass', (1.18, 0.78, 0.015), TR(y=1.42, z=-D / 2 + 0.065))
    for sy in (-1, 1): blk(m, 'brass', (1.24, 0.03, 0.03), TR(y=1.42 + sy * 0.4, z=-D / 2 + 0.07), 0.004)
    for sx in (-1, 1): blk(m, 'brass', (0.03, 0.83, 0.03), TR(x=sx * 0.61, y=1.42, z=-D / 2 + 0.07), 0.004)
    # Aufsatz: Kandelaber, Karaffen, Becher, Obstschale
    m.lathe('brass', [(0.0, 0.0), (0.07, 0.0), (0.06, 0.02), (0.02, 0.06), (0.02, 0.2), (0.03, 0.24)], TR(x=-0.62, y=0.87, z=0.0), seg=10)
    for dx, dy in ((-0.1, 0.0), (0.1, 0.0), (0.0, 0.1)):
        m.tube('brass', [(-0.62, 1.09 + dy * 0.3, 0.0), (-0.62 + dx * 0.6, 1.1 + dy * 0.3, 0.0), (-0.62 + dx, 1.12 + dy, 0.0)], [0.01, 0.01, 0.01], seg=4, vscale=1.0)
        candle(m, -0.62 + dx, 1.1 + dy, 0.0, 0.1)
    for x, hgt in ((-0.2, 0.3), (-0.02, 0.27)):
        m.lathe('glass', [(0.0, 0.0), (0.06, 0.0), (0.066, 0.05), (0.05, 0.14), (0.02, 0.2), (0.025, hgt), (0.0, hgt)], TR(x=x, y=0.87, z=-0.04), seg=9)
        m.lathe('velvet', [(0.0, 0.005), (0.055, 0.01), (0.058, 0.05), (0.045, 0.12), (0.0, 0.12)], TR(x=x, y=0.87, z=-0.04), seg=9, caps=False)
    for x in (0.2, 0.3, 0.4):
        m.lathe('brass', [(0.0, 0.0), (0.03, 0.0), (0.008, 0.012), (0.008, 0.07), (0.03, 0.11), (0.032, 0.15)], TR(x=x, y=0.87, z=0.08), seg=8)
    m.lathe('brass', [(0.0, 0.0), (0.06, 0.0), (0.13, 0.07), (0.14, 0.09)], TR(x=0.62, y=0.87, z=0.0), seg=12)
    for k, (dx, dz, role) in enumerate(((0.0, 0.0, 'book1'), (0.06, 0.04, 'book2'), (-0.05, 0.05, 'book1'), (0.04, -0.05, 'book2'), (-0.04, -0.04, 'book1'))):
        m.sphere(role, 0.04, TR(x=0.62 + dx, y=0.98 + 0.01 * (k % 2), z=dz), seg=6)
    m.ao(floor_ao(1.0))
    m.export(os.path.join(SHIP_DIR, 'kajuete_anrichte.glb'))

def build_fensterbank():
    m = Model('kajuete_fensterbank')
    W = 1.4
    blk(m, 'darkwood', (W, 0.4, 0.42), TR(y=0.2), 0.015)
    blk(m, 'wood', (W - 0.1, 0.28, 0.02), TR(y=0.2, z=0.215), 0.008)
    blk(m, 'brass', (W, 0.025, 0.03), TR(y=0.39, z=0.215), 0.004)
    blk(m, 'velvet', (W - 0.04, 0.1, 0.42), TR(y=0.45), 0.04)
    for sx in (-1, 1):
        blk(m, 'velvet', (0.34, 0.28, 0.12), TR(x=sx * 0.42, y=0.66, z=-0.14, rx=-0.35), 0.05)
        blk(m, 'brass', (0.1, 0.02, 0.02), TR(x=sx * 0.42, y=0.66, z=-0.06), 0.004)
    m.cyl('brass', 0.015, W + 0.3, TR(y=2.32, z=-0.22, rz=math.pi / 2), seg=8)
    for sx in (-1, 1):
        m.sphere('brass', 0.035, TR(x=sx * (W / 2 + 0.17), y=2.32, z=-0.22), seg=8)
        m.tube('velvet', [(sx * (W / 2 - 0.02), 2.3, -0.2), (sx * (W / 2 - 0.05), 1.4, -0.18), (sx * (W / 2 + 0.0), 0.5, -0.12)], [0.09, 0.07, 0.11], seg=7, vscale=1.0)
        m.torus('brass', 0.075, 0.01, TR(x=sx * (W / 2 - 0.045), y=1.1, z=-0.18), seg=10, sec=3)
    blk(m, 'velvet', (W - 0.1, 0.12, 0.05), TR(y=2.22, z=-0.2), 0.02)                              # Querbehang
    m.ao(floor_ao(1.2))
    m.export(os.path.join(SHIP_DIR, 'kajuete_fensterbank.glb'))

def build_waffenwand():
    m = Model('kajuete_waffenwand')
    blk(m, 'darkwood', (1.3, 0.9, 0.05), TR(y=0.45), 0.015)
    for sy in (0.0, 0.9): blk(m, 'brass', (1.36, 0.035, 0.05), TR(y=sy), 0.004)
    m.lathe('wood', [(0.0, 0.0), (0.22, 0.0), (0.24, 0.015), (0.2, 0.03), (0.06, 0.05), (0.0, 0.06)], TR(y=0.45, z=0.03, rx=math.pi / 2), seg=16)
    m.torus('brass', 0.235, 0.01, TR(y=0.45, z=0.05, rx=math.pi / 2), seg=18, sec=4)
    m.sphere('brass', 0.055, TR(y=0.45, z=0.1), seg=8)
    for sx in (-1, 1):
        m.tube('steel', [(sx * -0.5, 0.14, 0.07), (sx * -0.05, 0.46, 0.08), (sx * 0.5, 0.76, 0.07)], [0.014, 0.013, 0.004], seg=5, vscale=1.0)
        m.tube('leather', [(sx * -0.5, 0.14, 0.07), (sx * -0.58, 0.09, 0.07)], [0.016, 0.016], seg=5, vscale=1.0)
        blk(m, 'brass', (0.1, 0.02, 0.035), TR(x=sx * -0.5, y=0.14, z=0.07, rz=sx * 0.5), 0.004)
        m.sphere('brass', 0.022, TR(x=sx * -0.6, y=0.08, z=0.07), seg=6)
        # Pistole
        m.tube('iron', [(sx * 0.3, 0.8, 0.07), (sx * 0.5, 0.8, 0.07)], [0.016, 0.016], seg=5, vscale=1.0)
        m.tube('darkwood', [(sx * 0.3, 0.8, 0.07), (sx * 0.22, 0.78, 0.07), (sx * 0.14, 0.72, 0.07)], [0.022, 0.026, 0.03], seg=5, vscale=1.0)
        blk(m, 'brass', (0.04, 0.03, 0.03), TR(x=sx * 0.3, y=0.77, z=0.07), 0.004)
    m.ao(lambda role, p: 0.7 + 0.3 * sstep(0.0, 0.9, p.y))
    m.export(os.path.join(SHIP_DIR, 'kajuete_waffenwand.glb'))

def build_gemaelde():
    m = Model('kajuete_gemaelde')
    W, H = 1.0, 0.75
    blk(m, 'brass', (W + 0.18, H + 0.18, 0.05), TR(y=H / 2), 0.02)
    blk(m, 'darkwood', (W + 0.06, H + 0.06, 0.04), TR(y=H / 2, z=0.015), 0.01)
    m.box('paint2', (W, H, 0.03), TR(y=H / 2, z=0.03))                                           # Himmel (warm)
    m.box('paint1', (W, H * 0.46, 0.034), TR(y=H * 0.23, z=0.03))                                # Meer
    m.lathe('brass', [(0.0, 0.0), (0.08, 0.0), (0.085, 0.012), (0.0, 0.012)], TR(x=-0.25, y=H * 0.62, z=0.052, rx=math.pi / 2), seg=12)   # Sonne
    blk(m, 'darkwood', (0.3, 0.055, 0.03), TR(x=0.12, y=H * 0.47, z=0.052), 0.006)              # Rumpf
    for dx, hh in ((-0.07, 0.2), (0.05, 0.26), (0.17, 0.18)):
        m.box('paper', (0.07, hh, 0.012), TR(x=0.12 + dx, y=H * 0.5 + hh / 2 + 0.01, z=0.058))
    m.box('darkwood', (0.012, 0.3, 0.012), TR(x=0.17, y=H * 0.5 + 0.15, z=0.056))
    for sx in (-1, 1):
        for sy in (-1, 1): m.sphere('brass', 0.04, TR(x=sx * (W / 2 + 0.07), y=H / 2 + sy * (H / 2 + 0.07), z=0.04), seg=6)
    m.ao(lambda role, p: 1.0)
    m.export(os.path.join(SHIP_DIR, 'kajuete_gemaelde.glb'))

def build_ofen():
    m = Model('kajuete_ofen')
    for sx in (-1, 1):
        for sz in (-1, 1): m.cyl('iron', 0.03, 0.22, TR(x=sx * 0.2, y=0.11, z=sz * 0.2), seg=6)
    m.lathe('iron', [(0.0, 0.2), (0.22, 0.2), (0.3, 0.3), (0.32, 0.6), (0.28, 0.95), (0.2, 1.05), (0.0, 1.05)], TR(), seg=14)
    for y, R in ((0.45, 0.315), (0.82, 0.29)): m.torus('brass', R, 0.012, TR(y=y), seg=16, sec=4)
    blk(m, 'brass', (0.24, 0.28, 0.03), TR(y=0.58, z=0.305), 0.006)
    blk(m, 'iron', (0.19, 0.23, 0.03), TR(y=0.58, z=0.325), 0.006)
    m.box('flame', (0.11, 0.13, 0.01), TR(y=0.58, z=0.343))
    m.sphere('brass', 0.02, TR(x=0.07, y=0.58, z=0.35), seg=6)
    m.lathe('brass', [(0.0, 1.05), (0.22, 1.05), (0.1, 1.14), (0.06, 1.14)], TR(), seg=12, caps=False)
    m.cyl('iron', 0.055, 0.3, TR(y=1.25), seg=10)
    m.ao(floor_ao(1.1))
    m.export(os.path.join(SHIP_DIR, 'kajuete_ofen.glb'))

def build_tafel():
    m = Model('kajuete_tafel')
    Lt, Wt = 3.2, 1.1
    blk(m, 'wood', (Wt, 0.06, Lt), TR(y=0.78), 0.02)
    blk(m, 'darkwood', (Wt - 0.3, 0.1, Lt - 0.4), TR(y=0.69), 0.01)
    for sx in (-1, 1):
        for sz in (-1, 1): m.lathe('darkwood', [(0.06, 0.0), (0.045, 0.1), (0.07, 0.3), (0.045, 0.5), (0.06, 0.75)], TR(x=sx * (Wt / 2 - 0.12), z=sz * (Lt / 2 - 0.15)), seg=8)
    blk(m, 'velvet', (0.5, 0.012, Lt - 0.2), TR(y=0.815), 0.004)
    blk(m, 'brass', (0.03, 0.014, Lt - 0.2), TR(x=0.26, y=0.818), 0.003)
    blk(m, 'brass', (0.03, 0.014, Lt - 0.2), TR(x=-0.26, y=0.818), 0.003)
    for sx in (-1, 1):
        for zz in (-1.1, 0.0, 1.1):
            m.lathe('paper', [(0.0, 0.0), (0.11, 0.0), (0.13, 0.015), (0.0, 0.012)], TR(x=sx * 0.4, y=0.81, z=zz), seg=12)
            m.lathe('brass', [(0.0, 0.0), (0.03, 0.0), (0.008, 0.012), (0.008, 0.07), (0.03, 0.1), (0.032, 0.15)], TR(x=sx * 0.4 + sx * 0.08, y=0.81, z=zz + 0.17), seg=8)
    for zz in (-0.75, 0.75):
        m.lathe('brass', [(0.0, 0.0), (0.07, 0.0), (0.06, 0.02), (0.02, 0.06), (0.02, 0.2)], TR(y=0.82, z=zz), seg=10)
        for dx, dy in ((-0.1, 0.0), (0.1, 0.0), (0.0, 0.1)):
            m.tube('brass', [(0, 1.0 + dy * 0.3, zz), (dx * 0.6, 1.0 + dy * 0.3, zz), (dx, 1.02 + dy, zz)], [0.01, 0.01, 0.01], seg=4, vscale=1.0)
            candle(m, dx, 1.0 + dy, zz, 0.1)
    m.lathe('brass', [(0.0, 0.0), (0.14, 0.0), (0.22, 0.03), (0.24, 0.05)], TR(y=0.82, z=0.0), seg=14)       # Platte in der Mitte
    for k, (dx, dz, role) in enumerate(((0, 0, 'book1'), (0.09, 0.05, 'book2'), (-0.08, 0.06, 'book1'), (0.05, -0.08, 'book2'), (-0.07, -0.06, 'book1'), (0.0, 0.12, 'book2'))):
        m.sphere(role, 0.05, TR(x=dx, y=0.92 + 0.012 * (k % 2), z=dz), seg=6)
    m.ao(floor_ao(1.0))
    m.export(os.path.join(SHIP_DIR, 'kajuete_tafel.glb'))

for fn in (build_himmelbett, build_kronleuchter, build_anrichte, build_fensterbank, build_waffenwand, build_gemaelde, build_ofen, build_tafel):
    clear_gear(); fn()
