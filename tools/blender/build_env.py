# Insel-Flora und Felsen: Kokospalmen, Laubbäume, Büsche, Farne, Treibholz, abgeschrägte Felsen und Klippen.
#   blender --background --python tools/blender/headless.py -- build_env.py
# Alle Teile in Spiel-Koordinaten (Meter, Y oben), Fuß am Ursprung. Rollen (Materialnamen): trunk, leaf, leaf2, leaf3, nut,
# drift, rock; das Spiel färbt sie je Biome-Palette. Ambient-Occlusion je Eckpunkt im Farbattribut Col (dunkler Kronenkern,
# helle Blattspitzen: der Laub-Shader leuchtet die Spitzen durch). Felsen haben abgeschrägte Kanten (Bevel).
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

ENV_DIR = os.path.join(ROOT, 'public', 'models', 'env')
exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())

def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def trunk_path(h, lean, n, sway=0.0, phase=0.0):
    return [(lean * (k / n) ** 2, h * k / n, sway * math.sin(k / n * math.pi * 1.2 + phase)) for k in range(n + 1)]

# ======================= Kokospalme =======================
def build_palme(v):
    rnd = random.Random(100 + v)
    m = Model(f'palme_{v + 1}')
    h = [6.6, 7.4, 8.1, 7.0][v]; lean = [0.9, 1.7, 2.4, 1.3][v]
    n = 24
    path = trunk_path(h, lean, n, 0.22 * (1 if v % 2 else -1), v)
    radii = []
    for k, p in enumerate(path):
        t = k / n
        radii.append((0.17 + 0.17 * (1 - t) ** 1.8) * (1.0 + 0.05 * (k % 2)))        # Fuß verbreitert, Ringnarben
    m.tube('trunk', path, radii, seg=8, vscale=0.3)
    top = Vector(path[-1])
    a0 = rnd.random() * 6.28
    for i in range(11):
        a = a0 + i * 2 * math.pi / 11 + (rnd.random() - 0.5) * 0.3
        low = i % 2 == 1
        frond(m, 'leaf3' if low else ('leaf' if i % 4 == 0 else 'leaf2'), top + Vector((0, 0.15, 0)), (math.cos(a), math.sin(a)),
              3.5 + rnd.random() * 0.9, 0.5, 0.2 if low else 0.9, 2.6 if low else 1.9, n=10, leaf_len=0.9, spread=0.6)
        # Mittelrippe
        pts = [top + Vector((0, 0.15, 0)) + Vector((math.cos(a), 0, math.sin(a))) * (3.8 * t) + Vector((0, (0.2 if low else 0.9) * t - (2.6 if low else 1.9) * t * t, 0)) for t in (0, 0.25, 0.5, 0.75, 1.0)]
        m.tube('trunk', pts, [0.045, 0.035, 0.028, 0.02, 0.008], seg=3, caps=False, vscale=1.0)
    for i in range(4):                                                      # junge, aufrechte Wedel
        a = a0 + 0.4 + i * 1.6
        frond(m, 'leaf', top + Vector((0, 0.2, 0)), (math.cos(a) * 0.3, math.sin(a) * 0.3), 1.6, 0.35, 1.9, 0.2, n=6, leaf_len=0.5, spread=0.5)
    for i in range(3):                                                      # Kokosnüsse
        a = i * 2.1 + a0
        m.sphere('nut', 0.19, TR(x=top.x + math.cos(a) * 0.32, y=top.y - 0.28, z=top.z + math.sin(a) * 0.32), seg=7)
    def ao(role, p):
        if role == 'trunk':
            return 0.6 + 0.4 * min(1.0, p.y / h)
        if role == 'nut':
            return 0.7
        d = (p - top).length
        return 0.5 + 0.5 * sstep(0.2, 4.4, d)                              # dunkler Kronenkern, helle Spitzen
    m.ao(ao)
    m.export(os.path.join(ENV_DIR, f'palme_{v + 1}.glb'))

# ======================= Laubbaum =======================
def build_laubbaum(v):
    rnd = random.Random(200 + v)
    m = Model(f'laubbaum_{v + 1}')
    h = [3.6, 4.3, 5.0][v]; lean = (rnd.random() - 0.5) * 0.7
    path = trunk_path(h, lean, 10, 0.12, v)
    radii = [0.26 + 0.26 * (1 - k / 10) ** 2.2 for k in range(11)]
    m.tube('trunk', path, radii, seg=8, vscale=0.35)
    top = Vector(path[-1])
    for i in range(3):                                                      # Äste tragen die Krone
        a = i * 2.1 + rnd.random()
        d = Vector((math.cos(a), 0.0, math.sin(a)))
        p0 = top + Vector((0, -0.6, 0))
        pts = [p0 + d * (1.7 * t) + Vector((0, 1.9 * t - 0.25 * t * t, 0)) for t in (0, 0.33, 0.66, 1.0)]
        m.tube('trunk', pts, [0.2, 0.16, 0.12, 0.07], seg=6, vscale=0.5)
    C = top + Vector((0, 2.0, 0))
    def cluster(role, c, r, sub, seed):
        m.blob(role, r, TR(x=c.x, y=c.y, z=c.z), subdiv=sub, noise=0.2, seed=seed, squash=0.8)
        for j in range(6):                                                  # Blattspitzen: leicht gezackte Silhouette
            th = rnd.random() * 2 * math.pi; ph = rnd.random() * 1.2
            nrm = Vector((math.sin(ph) * math.cos(th), math.cos(ph), math.sin(ph) * math.sin(th)))
            p = c + Vector((nrm.x * r, nrm.y * r * 0.8, nrm.z * r))
            t1 = nrm.cross(Vector((0, 1, 0))).normalized() * 0.32 if nrm.cross(Vector((0, 1, 0))).length > 1e-3 else Vector((0.32, 0, 0))
            m.leaf(role, [p - t1 * 0.8, p + t1 * 0.8, p + nrm * 0.42])
    cluster('leaf2', C, 2.3, 3, v)
    nn = 6 + (v % 2)
    for i in range(nn):
        a = (i / nn) * 2 * math.pi + rnd.random()
        d = 1.5 + rnd.random() * 0.9
        c = C + Vector((math.cos(a) * d, -1.3 + rnd.random() * 1.7, math.sin(a) * d))
        cluster(('leaf', 'leaf2', 'leaf3')[i % 3], c, 1.35 + rnd.random() * 0.85, 2, v * 7 + i)
    def ao(role, p):
        if role == 'trunk':
            return 0.55 + 0.45 * min(1.0, p.y / (h + 1.5))
        d = (p - C).length
        up = sstep(h - 0.6, h + 4.5, p.y)
        return 0.38 + 0.62 * sstep(0.3, 3.9, d) * (0.55 + 0.45 * up)
    m.ao(ao)
    m.export(os.path.join(ENV_DIR, f'laubbaum_{v + 1}.glb'))

# ======================= Busch =======================
def build_busch(v):
    rnd = random.Random(300 + v)
    m = Model(f'busch_{v + 1}')
    for k in range(4 + v):
        s = 0.5 + rnd.random() * 0.5
        c = Vector(((rnd.random() - 0.5) * 1.3, s * 0.55, (rnd.random() - 0.5) * 1.3))
        role = ('leaf', 'leaf2', 'leaf3')[k % 3]
        m.blob(role, s, TR(x=c.x, y=c.y, z=c.z), subdiv=2, noise=0.22, seed=v * 5 + k, squash=0.78)
        for j in range(3):
            th = rnd.random() * 6.28; ph = rnd.random() * 1.1
            nrm = Vector((math.sin(ph) * math.cos(th), math.cos(ph), math.sin(ph) * math.sin(th)))
            p = c + Vector((nrm.x * s, nrm.y * s * 0.78, nrm.z * s))
            t1 = Vector((-nrm.z, 0, nrm.x)).normalized() * 0.2 if (nrm.x or nrm.z) else Vector((0.2, 0, 0))
            m.leaf(role, [p - t1, p + t1, p + nrm * 0.3])
    m.ao(lambda role, p: 0.5 + 0.5 * sstep(0.0, 1.0, p.y))
    m.export(os.path.join(ENV_DIR, f'busch_{v + 1}.glb'))

# ======================= Farn =======================
def build_farn(v):
    rnd = random.Random(400 + v)
    m = Model(f'farn_{v + 1}')
    n = 9 + v
    for i in range(n):
        a = (i / n) * 2 * math.pi + rnd.random() * 0.4
        L = 1.1 + rnd.random() * 0.45
        frond(m, 'leaf' if i % 2 else 'leaf2', (0, 0.05, 0), (math.cos(a), math.sin(a)), L, 0.2, 0.55 + rnd.random() * 0.3, 0.9, n=8, leaf_len=0.32, spread=0.5)
    m.ao(lambda role, p: 0.5 + 0.5 * sstep(0.0, 1.5, math.hypot(p.x, p.z)))
    m.export(os.path.join(ENV_DIR, f'farn_{v + 1}.glb'))

# ======================= Treibholz =======================
def build_treibholz(v):
    rnd = random.Random(500 + v)
    m = Model(f'treibholz_{v + 1}')
    L = [1.7, 2.2, 2.7][v]
    n = 9
    path = [(L * (k / n - 0.5), 0.1 + 0.05 * math.sin(k / n * 3.1) + 0.04 * k / n, 0.12 * math.sin(k / n * 4.0 + v)) for k in range(n + 1)]
    radii = [0.1 + 0.05 * math.sin(k * 1.7 + v) + 0.05 * (1 - k / n) for k in range(n + 1)]
    m.tube('drift', path, radii, seg=7, vscale=0.5)
    for j in range(1 + v):                                                  # Aststummel
        k = 2 + j * 3
        p = Vector(path[k]); d = Vector((rnd.random() - 0.5, 0.8, (rnd.random() - 0.5) * 1.2)).normalized()
        m.tube('drift', [p, p + d * 0.32, p + d * 0.55], [0.06, 0.045, 0.02], seg=5, vscale=1.0)
    m.blob('drift', 0.26, TR(x=path[0][0] - 0.05, y=0.22, z=0.0), subdiv=2, noise=0.3, seed=v, squash=0.75, flat=True)   # Wurzelballen
    m.ao(lambda role, p: 0.55 + 0.45 * sstep(0.0, 0.3, p.y))
    m.export(os.path.join(ENV_DIR, f'treibholz_{v + 1}.glb'))

# ======================= Felsen und Klippen =======================
def rock_points(rnd, rx, ry, rz, n=18, jit=0.2, cy=0.0):
    pts = []
    for i in range(n):
        y = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(max(0.0, 1 - y * y)); th = i * 2.399963
        k = 1 + (rnd.random() - 0.5) * 2 * jit
        pts.append(Vector((math.cos(th) * r * rx * k, max(-0.15 * ry, y * ry * k) + cy, math.sin(th) * r * rz * k)))
    return pts

def build_fels(v):
    rnd = random.Random(600 + v)
    m = Model(f'fels_{v + 1}')
    if v == 0:                                                              # einzelner Felsblock
        m.rock('rock', rock_points(rnd, 1.15, 0.78, 1.0, 20, 0.22, 0.3), Matrix.Identity(4), bevel=0.07)
    elif v == 1:                                                            # Gruppe aus drei Blöcken
        m.rock('rock', rock_points(rnd, 1.0, 0.7, 0.9, 18, 0.2, 0.3), Matrix.Identity(4), bevel=0.07)
        m.rock('rock', rock_points(rnd, 0.6, 0.45, 0.55, 14, 0.22, 0.2), TR(x=1.1, z=0.5), bevel=0.025)
        m.rock('rock', rock_points(rnd, 0.42, 0.32, 0.4, 12, 0.25, 0.14), TR(x=-0.9, z=0.85), bevel=0.015)
    else:                                                                   # Küstenklippe: aufgeschichtete Platten
        base = 0.0
        for k, (rx, ry, rz, ox, oz) in enumerate([(1.3, 0.55, 1.1, 0.0, 0.0), (1.05, 0.5, 0.9, 0.18, -0.1), (0.8, 0.5, 0.7, -0.15, 0.1), (0.5, 0.4, 0.5, 0.1, 0.0)]):
            m.rock('rock', rock_points(rnd, rx, ry, rz, 16, 0.16, 0.0), TR(x=ox, y=base + ry * 0.7, z=oz, ry=rnd.random()), bevel=0.08)
            base += ry * 1.25
    top = 2.6 if v == 2 else (1.1 if v == 0 else 0.9)
    m.ao(lambda role, p: 0.6 + 0.4 * sstep(0.0, top, p.y))
    m.export(os.path.join(ENV_DIR, f'fels_{v + 1}.glb'))

def build_klippe(v):
    """Zerklüftete Küstenklippe: große Formation (6 bis 9 m breit), Fuß im Wasser, abgeschrägte Kanten."""
    rnd = random.Random(700 + v)
    m = Model(f'klippe_{v + 1}')
    specs = [(3.4, 1.6, 2.8, 0.0, 0.0), (2.6, 2.3, 2.2, 1.1, -0.4), (2.0, 2.9, 1.7, -0.9, 0.5), (1.5, 3.6, 1.3, 0.4, 0.2), (1.1, 4.2, 0.95, -0.2, -0.3)] if v == 0 else \
            [(3.8, 1.3, 2.4, 0.0, 0.0), (2.9, 2.0, 2.0, -1.2, 0.3), (2.2, 2.6, 1.6, 1.0, -0.5), (1.6, 3.1, 1.3, -0.6, 0.0), (1.2, 2.0, 1.0, 2.3, 0.6)]
    for k, (rx, hy, rz, ox, oz) in enumerate(specs):
        base = 0.0 if k < 2 else hy * 0.35
        m.rock('rock', rock_points(rnd, rx, hy, rz, 22, 0.2, 0.0), TR(x=ox, y=base, z=oz, ry=rnd.random() * 2), bevel=0.14)
    m.ao(lambda role, p: 0.55 + 0.45 * sstep(0.0, 4.4, p.y))
    m.export(os.path.join(ENV_DIR, f'klippe_{v + 1}.glb'))

for v in range(4): clear_gear(); build_palme(v)
for v in range(3): clear_gear(); build_laubbaum(v)
for v in range(2): clear_gear(); build_busch(v)
for v in range(2): clear_gear(); build_farn(v)
for v in range(3): clear_gear(); build_treibholz(v)
for v in range(3): clear_gear(); build_fels(v)
for v in range(2): clear_gear(); build_klippe(v)
