# Insel-Flora, zweite Fassung: dichtere Kokospalmen mit Fiederblättern, mächtige Eichen, Birken, Kiefern, Bananenstauden, Agaven,
# Schilf, Grasbüschel, Blumen, blühende Büsche, bemooste Felsen.
#   blender --background --python tools/blender/headless.py -- build_env2.py
# Rollen: trunk, bark2 (helle Birkenrinde), leaf, leaf2, leaf3, nut, fruit, flower, flower2, moss, rock. Das Spiel färbt sie je Palette.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

ENV_DIR = os.path.join(ROOT, 'public', 'models', 'env')
exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())
ROLE_COL.update({'bark2': (0.88, 0.86, 0.8), 'fruit': (0.85, 0.72, 0.22), 'flower': (0.85, 0.3, 0.3), 'flower2': (0.95, 0.85, 0.35), 'moss': (0.35, 0.5, 0.25)})

def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def trunk_path(h, lean, n, sway=0.0, phase=0.0):
    return [(lean * (k / n) ** 2, h * k / n, sway * math.sin(k / n * math.pi * 1.2 + phase)) for k in range(n + 1)]

def v3(a): return Vector(a)

# ---------- Fiederwedel: Mittelrippe plus Fiederblättchen beidseits, hängend ----------
def pinnate(m, role, base, yaw, L, rise, droop, n=17, lw=0.62, tilt=0.75):
    d = Vector((math.cos(yaw), 0, math.sin(yaw)))
    side = Vector((-math.sin(yaw), 0, math.cos(yaw)))
    pts = [base + d * (L * k / n) + Vector((0, rise * (k / n) - droop * (k / n) ** 2, 0)) for k in range(n + 1)]
    m.tube('trunk', pts, [0.05 * (1 - 0.82 * k / n) + 0.006 for k in range(n + 1)], seg=4, caps=False, vscale=1.0)
    for k in range(2, n + 1):
        t = k / n
        p = pts[k]
        ln = lw * (0.35 + 0.65 * math.sin(math.pi * min(1.0, t * 1.04)) ** 0.7) * (1.0 + 0.1 * math.sin(k * 2.3))
        sag = droop * (2 * t) / n * 0.5
        for sg in (-1, 1):
            tip = p + side * (sg * ln * math.cos(tilt)) + d * (ln * 0.55) + Vector((0, -ln * math.sin(tilt) - sag * 0.4, 0))
            m.leaf(role, [p, p + d * 0.17, tip])

# ======================= Kokospalme, dichte Krone =======================
def build_palme2(v):
    rnd = random.Random(900 + v)
    m = Model(f'palme_{v + 1}')
    h = [7.0, 7.8, 8.6, 6.6, 8.2, 6.0][v]; lean = [0.9, 1.7, 2.2, 1.3, 1.2, 2.6][v]
    n = 26
    path = trunk_path(h, lean, n, 0.2 * (1 if v else -1), v * 2)
    radii = [(0.15 + 0.15 * (1 - k / n) ** 1.8) * (1.0 + 0.07 * (k % 2)) for k in range(n + 1)]
    m.tube('trunk', path, radii, seg=8, vscale=0.3)
    top = v3(path[-1])
    a0 = rnd.random() * 6.28
    nf = 11
    for i in range(nf):
        a = a0 + i * 2 * math.pi / nf + (rnd.random() - 0.5) * 0.25
        low = i % 3 == 1
        pinnate(m, ('leaf3' if low else ('leaf' if i % 2 == 0 else 'leaf2')), top + Vector((0, 0.18, 0)), a,
                3.9 + rnd.random() * 0.8, 0.1 if low else 1.2 + rnd.random() * 0.5, 3.4 if low else 2.5 + rnd.random() * 0.4, n=10, lw=1.0)
    for i in range(4):
        a = a0 + 0.3 + i * 1.6
        pinnate(m, 'leaf', top + Vector((0, 0.2, 0)), a, 1.9, 1.9, 0.5, n=9, lw=0.42, tilt=0.5)
    for i in range(5):                                                                     # Kokosnüsse im Büschel
        a = i * 1.26 + a0
        m.sphere('nut', 0.2, TR(x=top.x + math.cos(a) * 0.34, y=top.y - 0.3 - (i % 2) * 0.1, z=top.z + math.sin(a) * 0.34), seg=7)
    for i in range(3):                                                                     # alte, herabhängende Blattscheiden
        a = a0 + 1.0 + i * 2.1
        m.tube('trunk', [top + Vector((0, -0.2, 0)), top + Vector((math.cos(a) * 0.4, -0.7, math.sin(a) * 0.4)), top + Vector((math.cos(a) * 0.5, -1.4, math.sin(a) * 0.5))], [0.08, 0.06, 0.03], seg=4, vscale=1.0)
    def ao(role, p):
        if role == 'trunk': return 0.6 + 0.4 * min(1.0, p.y / h)
        if role == 'nut': return 0.7
        d = (p - top).length
        return 0.66 + 0.34 * sstep(0.2, 4.6, d)
    m.ao(ao)
    m.export(os.path.join(ENV_DIR, f'palme_{v + 1}.glb'))

# ======================= Eichen =======================
def cluster(m, rnd, role, c, r, sub, seed, spikes=6):
    m.blob(role, r, TR(x=c.x, y=c.y, z=c.z), subdiv=sub, noise=0.22, seed=seed, squash=0.78)
    for j in range(spikes):
        th = rnd.random() * 2 * math.pi; ph = rnd.random() * 1.3
        nrm = Vector((math.sin(ph) * math.cos(th), math.cos(ph), math.sin(ph) * math.sin(th)))
        p = c + Vector((nrm.x * r, nrm.y * r * 0.78, nrm.z * r))
        t1 = nrm.cross(Vector((0, 1, 0)))
        t1 = t1.normalized() * 0.34 if t1.length > 1e-3 else Vector((0.34, 0, 0))
        m.leaf(role, [p - t1 * 0.8, p + t1 * 0.8, p + nrm * 0.45])

def build_eiche(v):
    rnd = random.Random(1000 + v)
    m = Model(f'laubbaum_{v + 4}')
    h = [4.4, 5.2, 4.0][v]; lean = (rnd.random() - 0.5) * 0.9
    n = 12
    path = trunk_path(h, lean, n, 0.18, v)
    radii = [0.3 + 0.36 * (1 - k / n) ** 3 + 0.12 * (1 - k / n) for k in range(n + 1)]
    m.tube('trunk', path, radii, seg=9, vscale=0.35)
    for i in range(5):                                                                     # Wurzelanläufe
        a = i * 1.26 + rnd.random()
        d = Vector((math.cos(a), 0, math.sin(a)))
        m.tube('trunk', [d * 0.2 + Vector((0, 0.5, 0)), d * 0.65 + Vector((0, 0.2, 0)), d * 1.2 + Vector((0, -0.1, 0))], [0.22, 0.14, 0.05], seg=5, vscale=0.5)
    top = v3(path[-1])
    for i in range(5):                                                                     # Hauptäste
        a = i * 1.25 + rnd.random() * 0.4
        d = Vector((math.cos(a), 0.0, math.sin(a)))
        p0 = top + Vector((0, -0.9 - rnd.random() * 0.5, 0))
        pts = [p0 + d * (2.3 * t) + Vector((0, 2.0 * t - 0.2 * t * t, 0)) for t in (0, 0.33, 0.66, 1.0)]
        m.tube('trunk', pts, [0.22, 0.17, 0.12, 0.07], seg=6, vscale=0.5)
    C = top + Vector((0, 2.4, 0))
    cluster(m, rnd, 'leaf2', C, 2.7, 3, v)
    nn = 9
    for i in range(nn):
        a = (i / nn) * 2 * math.pi + rnd.random()
        d = 2.0 + rnd.random() * 1.2
        c = C + Vector((math.cos(a) * d, -1.5 + rnd.random() * 2.2, math.sin(a) * d))
        cluster(m, rnd, ('leaf', 'leaf2', 'leaf3')[i % 3], c, 1.5 + rnd.random() * 1.0, 2, v * 11 + i)
    for i in range(3):                                                                     # dunkle Unterkrone
        a = i * 2.1 + 0.5
        cluster(m, rnd, 'leaf3', C + Vector((math.cos(a) * 1.4, -2.0, math.sin(a) * 1.4)), 1.3, 2, 40 + i, spikes=3)
    def ao(role, p):
        if role == 'trunk': return 0.55 + 0.45 * min(1.0, p.y / (h + 1.5))
        d = (p - C).length
        up = sstep(h - 0.6, h + 5.0, p.y)
        return 0.36 + 0.64 * sstep(0.3, 4.4, d) * (0.55 + 0.45 * up)
    m.ao(ao)
    m.export(os.path.join(ENV_DIR, f'laubbaum_{v + 4}.glb'))

# ======================= Birken =======================
def build_birke(v):
    rnd = random.Random(1100 + v)
    m = Model(f'birke_{v + 1}')
    h = [5.6, 6.8][v]; lean = (rnd.random() - 0.5) * 0.6
    n = 12
    path = trunk_path(h, lean, n, 0.15, v)
    m.tube('bark2', path, [0.13 * (1 - 0.55 * k / n) + 0.035 for k in range(n + 1)], seg=7, vscale=0.4)
    for k in range(9):                                                                     # dunkle Rindenmale
        y = 0.4 + rnd.random() * (h - 1.2); t = y / h
        px = lean * t * t
        m.torus('trunk', 0.125 * (1 - 0.55 * t) + 0.036, 0.012, TR(x=px, y=y, z=0.15 * math.sin(t * 3.8 + v)), seg=10, sec=3)
    top = v3(path[-1])
    for i in range(4):
        a = i * 1.6 + rnd.random()
        d = Vector((math.cos(a), 0, math.sin(a)))
        p0 = Vector(path[8]) + Vector((0, 0.2 * i, 0))
        m.tube('bark2', [p0, p0 + d * 0.7 + Vector((0, 0.7, 0)), p0 + d * 1.5 + Vector((0, 1.7, 0))], [0.05, 0.04, 0.02], seg=4, vscale=1.0)
    C = top + Vector((0, 1.1, 0))
    for i in range(8):
        a = i * 0.78 + rnd.random()
        d = 0.8 + rnd.random() * 1.1
        c = C + Vector((math.cos(a) * d, -0.9 + rnd.random() * 1.9, math.sin(a) * d))
        role = ('leaf2', 'leaf', 'leaf2', 'leaf3')[i % 4]
        m.blob(role, 0.85 + rnd.random() * 0.5, TR(x=c.x, y=c.y, z=c.z), subdiv=2, noise=0.25, seed=v * 9 + i, squash=1.25)
        for j in range(5):                                                                 # hängende Zweigspitzen
            th = rnd.random() * 6.28
            p = c + Vector((math.cos(th) * 0.8, -0.5, math.sin(th) * 0.8))
            m.leaf(role, [p, p + Vector((0.12, 0, 0.05)), p + Vector((0.05, -0.9 - rnd.random() * 0.5, 0.0))])
    def ao(role, p):
        if role in ('bark2', 'trunk'): return 0.65 + 0.35 * min(1.0, p.y / h)
        return 0.42 + 0.58 * sstep(0.3, 2.8, (p - C).length)
    m.ao(ao)
    m.export(os.path.join(ENV_DIR, f'birke_{v + 1}.glb'))

# ======================= Kiefern =======================
def build_kiefer(v):
    rnd = random.Random(1200 + v)
    m = Model(f'kiefer_{v + 1}')
    h = [7.4, 9.0, 6.4][v]; lean = [0.8, 0.3, 1.8][v]
    n = 14
    path = trunk_path(h, lean, n, 0.22, v)
    m.tube('trunk', path, [0.3 * (1 - 0.7 * k / n) + 0.05 for k in range(n + 1)], seg=7, vscale=0.35)
    tiers = 5 + v
    bias = 0.0 if v < 2 else 0.9                                                           # Windkiefer: Krone nach einer Seite
    for t in range(tiers):
        f = 0.38 + 0.62 * t / (tiers - 1)
        y = h * f
        px = lean * f * f
        rr = 1.9 * (1.0 - 0.72 * (t / tiers)) * (0.9 + 0.2 * rnd.random())
        for k in range(4):
            a = k * 1.57 + rnd.random() * 0.8 + t * 0.7
            c = Vector((px + math.cos(a) * rr * 0.55 + bias * (1 - f) * 0.9, y + rnd.random() * 0.2, math.sin(a) * rr * 0.55))
            role = ('leaf3', 'leaf2', 'leaf3', 'leaf')[(t + k) % 4]
            m.blob(role, rr * 0.62, TR(x=c.x, y=c.y, z=c.z), subdiv=2, noise=0.28, seed=t * 5 + k + v * 31, squash=0.4)
            for j in range(5):                                                             # Nadelbüschel
                th = rnd.random() * 6.28
                p = c + Vector((math.cos(th) * rr * 0.62, 0.0, math.sin(th) * rr * 0.62))
                dirv = Vector((math.cos(th), 0.25, math.sin(th)))
                t1 = Vector((-dirv.z, 0, dirv.x)).normalized() * 0.2
                m.leaf(role, [p - t1, p + t1, p + dirv * 0.7])
        m.tube('trunk', [Vector((px, y, 0)), Vector((px + rr * 0.4, y - 0.1, rr * 0.3)), Vector((px + rr * 0.8, y - 0.3, rr * 0.5))], [0.07, 0.05, 0.03], seg=4, vscale=1.0)
    top = Vector((lean, h, 0))
    m.blob('leaf', 0.55, TR(x=top.x, y=top.y + 0.35, z=0), subdiv=2, noise=0.2, seed=v, squash=1.5)
    def ao(role, p):
        if role == 'trunk': return 0.55 + 0.45 * min(1.0, p.y / h)
        return 0.4 + 0.6 * sstep(h * 0.3, h * 1.05, p.y) * (0.6 + 0.4 * sstep(0.2, 1.8, math.hypot(p.x - lean * (p.y / h) ** 2, p.z)))
    m.ao(ao)
    m.export(os.path.join(ENV_DIR, f'kiefer_{v + 1}.glb'))

# ======================= Banane =======================
def build_banane(v):
    rnd = random.Random(1300 + v)
    m = Model(f'banane_{v + 1}')
    h = [2.7, 3.3][v]
    m.tube('leaf3', trunk_path(h, 0.3, 8, 0.05, v), [0.2 * (1 - 0.35 * k / 8) for k in range(9)], seg=8, vscale=0.5)
    top = Vector((0.3, h, 0))
    a0 = rnd.random() * 6.28
    for i in range(8):
        a = a0 + i * 0.785 + (rnd.random() - 0.5) * 0.3
        d = Vector((math.cos(a), 0, math.sin(a))); side = Vector((-d.z, 0, d.x))
        L = 2.7 + rnd.random() * 0.7; rise = 1.0 + rnd.random() * 0.8 if i % 3 else 2.0; droop = 2.0 + rnd.random() * 0.8 if i % 3 else 0.6
        N = 8
        pts = [top + d * (L * k / N) + Vector((0, rise * (k / N) - droop * (k / N) ** 2, 0)) for k in range(N + 1)]
        m.tube('leaf3', pts, [0.04 * (1 - 0.8 * k / N) + 0.008 for k in range(N + 1)], seg=3, caps=False, vscale=1.0)
        role = ('leaf', 'leaf2')[i % 2]
        for k in range(N):
            t0 = k / N; t1 = (k + 1) / N
            w0 = 0.62 * math.sin(math.pi * min(1.0, t0 + 0.06)) ** 0.7; w1 = 0.62 * math.sin(math.pi * min(1.0, t1 + 0.06)) ** 0.7
            for sg in (-1, 1):
                dn0 = Vector((0, -w0 * 0.35, 0)); dn1 = Vector((0, -w1 * 0.35, 0))
                m.leaf(role, [pts[k], pts[k + 1], pts[k + 1] + side * (sg * w1) + dn1, pts[k] + side * (sg * w0) + dn0])
    # Fruchtstand
    c = top + Vector((0.2, -0.5, 0.15))
    m.tube('leaf3', [top + Vector((0, 0.1, 0)), c, c + Vector((0.1, -0.55, 0.05))], [0.04, 0.035, 0.03], seg=4, vscale=1.0)
    for k in range(9):
        a = k * 0.9
        p = c + Vector((math.cos(a) * 0.14, -0.3 - 0.06 * (k % 3), math.sin(a) * 0.14))
        m.tube('fruit', [p, p + Vector((0.05, -0.18, 0.0)), p + Vector((0.1, -0.34, 0.0))], [0.045, 0.05, 0.03], seg=4, vscale=1.0)
    m.blob('flower', 0.17, TR(x=c.x + 0.1, y=c.y - 0.95, z=c.z + 0.05), subdiv=1, noise=0.15, seed=v, squash=1.4)
    m.ao(lambda role, p: 0.5 + 0.5 * sstep(0.0, h + 1.5, p.y))
    m.export(os.path.join(ENV_DIR, f'banane_{v + 1}.glb'))

# ======================= Agave =======================
def build_agave(v):
    rnd = random.Random(1400)
    m = Model('agave_1')
    n = 16
    for i in range(n):
        a = i * 2.4 + rnd.random() * 0.2
        ring = i % 3
        d = Vector((math.cos(a), 0, math.sin(a)))
        up = [1.3, 0.8, 0.35][ring]; out = [0.45, 0.8, 1.15][ring]
        m.tube('leaf3' if i % 2 else 'leaf', [d * 0.05 + Vector((0, 0.05, 0)), d * (out * 0.55) + Vector((0, up * 0.55, 0)), d * out + Vector((0, up, 0))], [0.11, 0.1, 0.012], seg=4, vscale=1.0)
    m.tube('leaf', [Vector((0, 0.1, 0)), Vector((0.05, 1.4, 0)), Vector((0.1, 2.5, 0.0))], [0.06, 0.04, 0.015], seg=4, vscale=1.0)       # Blütenschaft
    for k in range(6): m.blob('flower2', 0.12, TR(x=0.1 + math.cos(k) * 0.12, y=2.1 + k * 0.12, z=math.sin(k) * 0.12), subdiv=1, noise=0.2, seed=k, squash=1.2)
    m.ao(lambda role, p: 0.5 + 0.5 * sstep(0.0, 1.6, math.hypot(p.x, p.z) + p.y * 0.4))
    m.export(os.path.join(ENV_DIR, 'agave_1.glb'))

# ======================= Schilf =======================
def build_schilf(v):
    rnd = random.Random(1500 + v)
    m = Model(f'schilf_{v + 1}')
    for i in range(22 + v * 6):
        a = rnd.random() * 6.28; r = rnd.random() * 0.45
        h = 1.4 + rnd.random() * 1.0
        bend = (rnd.random() - 0.5) * 0.6
        b = Vector((math.cos(a) * r, 0, math.sin(a) * r))
        t1 = Vector((-math.sin(a), 0, math.cos(a))) * 0.05
        mid = b + Vector((bend * 0.4, h * 0.55, 0)); tip = b + Vector((bend, h, bend * 0.3))
        m.leaf('leaf' if i % 3 else 'leaf2', [b - t1, b + t1, mid + t1 * 0.7, mid - t1 * 0.7])
        m.leaf('leaf' if i % 3 else 'leaf2', [mid - t1 * 0.7, mid + t1 * 0.7, tip])
    for i in range(4 + v * 2):                                                              # Rohrkolben
        a = i * 1.7; r = 0.15 + 0.2 * (i % 3) / 2
        b = Vector((math.cos(a) * r, 0, math.sin(a) * r)); hh = 1.6 + 0.2 * (i % 3)
        m.tube('leaf', [b, b + Vector((0.03, hh * 0.5, 0)), b + Vector((0.06, hh, 0))], [0.012, 0.01, 0.008], seg=3, vscale=1.0)
        m.tube('nut', [b + Vector((0.055, hh - 0.32, 0)), b + Vector((0.06, hh + 0.05, 0))], [0.05, 0.045], seg=5, vscale=1.0)
    m.ao(lambda role, p: 0.5 + 0.5 * sstep(0.0, 2.2, p.y))
    m.export(os.path.join(ENV_DIR, f'schilf_{v + 1}.glb'))

# ======================= Grasbüschel =======================
def build_gras(v):
    rnd = random.Random(1600 + v)
    m = Model(f'gras_{v + 1}')
    nb = [17, 22, 15][v]
    for i in range(nb):
        a = rnd.random() * 6.28; r = rnd.random() * 0.26
        h = [0.5, 0.7, 1.05][v] * (0.55 + rnd.random() * 0.65)
        w = [0.05, 0.055, 0.04][v]
        b = Vector((math.cos(a) * r, 0, math.sin(a) * r))
        out = Vector((math.cos(a), 0, math.sin(a)))
        lean = h * (0.35 + rnd.random() * 0.4)
        t1 = Vector((-out.z, 0, out.x)) * w
        mid = b + out * (lean * 0.35) + Vector((0, h * 0.6, 0)); tip = b + out * lean + Vector((0, h * 0.95 - lean * 0.2, 0))
        role = ('leaf', 'leaf2', 'leaf3')[i % 3]
        m.leaf(role, [b - t1, b + t1, mid + t1 * 0.6, mid - t1 * 0.6])
        m.leaf(role, [mid - t1 * 0.6, mid + t1 * 0.6, tip])
    m.ao(lambda role, p: 0.55 + 0.45 * sstep(0.0, 0.9, p.y))
    m.export(os.path.join(ENV_DIR, f'gras_{v + 1}.glb'))

# ======================= Blumen =======================
def build_blume(v):
    rnd = random.Random(1700 + v)
    m = Model(f'blume_{v + 1}')
    for i in range([4, 5, 3][v]):
        a = rnd.random() * 6.28; r = 0.05 + rnd.random() * 0.22
        h = 0.32 + rnd.random() * 0.28
        b = Vector((math.cos(a) * r, 0, math.sin(a) * r))
        top = b + Vector((rnd.random() * 0.06 - 0.03, h, rnd.random() * 0.06 - 0.03))
        m.tube('leaf', [b, b + (top - b) * 0.5 + Vector((0.02, 0, 0)), top], [0.012, 0.011, 0.009], seg=3, vscale=1.0)
        role = 'flower' if (i + v) % 2 == 0 else 'flower2'
        np_ = 5 + (v % 2)
        for k in range(np_):
            th = k * 2 * math.pi / np_
            c = Vector((math.cos(th), 0.0, math.sin(th)))
            t1 = Vector((-c.z, 0, c.x)) * 0.05
            tip = top + c * 0.1 + Vector((0, 0.03, 0))
            m.leaf(role, [top + t1 * 0.2, top - t1 * 0.2, tip + t1 * 0.2 if False else tip])
        m.sphere('fruit', 0.032, TR(x=top.x, y=top.y + 0.01, z=top.z), seg=5)
        for sg in (-1, 1):                                                                  # zwei Blättchen am Stiel
            q = b + (top - b) * 0.3
            m.leaf('leaf2', [q, q + Vector((sg * 0.16, 0.1, 0.04)), q + Vector((sg * 0.05, 0.02, 0.05))])
    m.ao(lambda role, p: 0.62 + 0.38 * sstep(0.0, 0.5, p.y))
    m.export(os.path.join(ENV_DIR, f'blume_{v + 1}.glb'))

# ======================= Blühende Büsche =======================
def build_busch2(v):
    rnd = random.Random(1800 + v)
    m = Model(f'busch_{v + 3}')
    if v == 0:                                                                              # Blütenstrauch
        for k in range(5):
            s = 0.55 + rnd.random() * 0.45
            c = Vector(((rnd.random() - 0.5) * 1.2, s * 0.6, (rnd.random() - 0.5) * 1.2))
            m.blob(('leaf', 'leaf2', 'leaf3')[k % 3], s, TR(x=c.x, y=c.y, z=c.z), subdiv=2, noise=0.22, seed=k, squash=0.8)
            for j in range(9):
                th = rnd.random() * 6.28; ph = rnd.random() * 1.1
                nrm = Vector((math.sin(ph) * math.cos(th), math.cos(ph), math.sin(ph) * math.sin(th)))
                p = c + Vector((nrm.x * s * 0.95, nrm.y * s * 0.78, nrm.z * s * 0.95))
                m.blob('flower' if j % 2 else 'flower2', 0.1 + rnd.random() * 0.05, TR(x=p.x, y=p.y, z=p.z), subdiv=1, noise=0.2, seed=j + k, squash=0.9)
    else:                                                                                   # dürrer Strauch mit Ästen
        for k in range(9):
            a = k * 0.7 + rnd.random()
            d = Vector((math.cos(a), 0, math.sin(a)))
            pts = [Vector((0, 0, 0)), d * 0.3 + Vector((0, 0.5, 0)), d * 0.7 + Vector((0, 0.95 + rnd.random() * 0.3, 0)), d * 0.95 + Vector((0, 1.3 + rnd.random() * 0.3, 0))]
            m.tube('trunk', pts, [0.05, 0.04, 0.025, 0.012], seg=4, vscale=0.6)
            for j in range(4):
                p = pts[1 + j % 3] + d * 0.05
                m.leaf('leaf' if j % 2 else 'leaf2', [p, p + Vector((0.2, 0.05, 0.1)), p + d * 0.35 + Vector((0, 0.1, 0))])
    m.ao(lambda role, p: 0.5 + 0.5 * sstep(0.0, 1.3, p.y))
    m.export(os.path.join(ENV_DIR, f'busch_{v + 3}.glb'))

# ======================= Bemooste Felsen =======================
def rock_points(rnd, rx, ry, rz, n=18, jit=0.2, cy=0.0):
    pts = []
    for i in range(n):
        y = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(max(0.0, 1 - y * y)); th = i * 2.399963
        k = 1 + (rnd.random() - 0.5) * 2 * jit
        pts.append(Vector((math.cos(th) * r * rx * k, max(-0.15 * ry, y * ry * k) + cy, math.sin(th) * r * rz * k)))
    return pts

def build_fels2(v):
    rnd = random.Random(1900 + v)
    m = Model(f'fels_{v + 4}')
    if v == 0:                                                                              # Block mit Moospolster und Geröll
        m.rock('rock', rock_points(rnd, 1.25, 0.9, 1.1, 22, 0.2, 0.35), Matrix.Identity(4), bevel=0.08)
        m.blob('moss', 0.7, TR(x=0.1, y=0.95, z=0.05), subdiv=2, noise=0.3, seed=2, squash=0.35)
        m.blob('moss', 0.4, TR(x=-0.8, y=0.35, z=0.6), subdiv=1, noise=0.3, seed=4, squash=0.4)
        for k in range(4): m.rock('rock', rock_points(rnd, 0.22, 0.16, 0.2, 10, 0.25, 0.08), TR(x=1.3 + rnd.random() * 0.5, z=-0.6 + k * 0.45), bevel=0.01)
    else:                                                                                   # geschichtete Platte
        for k in range(4):
            m.rock('rock', rock_points(rnd, 1.35 - k * 0.2, 0.28, 1.1 - k * 0.12, 16, 0.12, 0.0), TR(x=(k % 2) * 0.12, y=0.22 + k * 0.45, z=-(k % 2) * 0.08, ry=rnd.random() * 0.4), bevel=0.05)
        m.blob('moss', 0.55, TR(x=0.0, y=1.75, z=0.05), subdiv=2, noise=0.3, seed=5, squash=0.35)
    top = 1.9
    m.ao(lambda role, p: 0.6 + 0.4 * sstep(0.0, top, p.y))
    m.export(os.path.join(ENV_DIR, f'fels_{v + 4}.glb'))


# ======================= Kieselhaufen =======================
def build_kiesel(v):
    rnd = random.Random(2000 + v)
    m = Model(f'kiesel_{v + 1}')
    n = [6, 9, 12][v]
    for k in range(n):
        a = rnd.random() * 6.28; rr = (0.05 + rnd.random() * 0.35) * (1 + v * 0.3)
        s_ = 0.07 + rnd.random() * 0.11 + (0.06 if k == 0 else 0)
        m.rock('rock', rock_points(rnd, s_ * 1.3, s_ * 0.8, s_, 8, 0.25, s_ * 0.2), TR(x=math.cos(a) * rr, z=math.sin(a) * rr, ry=rnd.random() * 3), bevel=0.0)
    m.ao(lambda role, p: 0.7 + 0.3 * sstep(0.0, 0.25, p.y))
    m.export(os.path.join(ENV_DIR, f'kiesel_{v + 1}.glb'))

# ======================= Strandgras (Dünengras mit Ähren) =======================
def build_strandgras(v):
    rnd = random.Random(2100 + v)
    m = Model(f'strandgras_{v + 1}')
    nb = [26, 34][v]
    for i in range(nb):
        a = rnd.random() * 6.28; r = rnd.random() * 0.3
        h = (0.8 + rnd.random() * 0.8) * (1.0 + v * 0.3)
        b = Vector((math.cos(a) * r, 0, math.sin(a) * r))
        out = Vector((math.cos(a), 0, math.sin(a)))
        lean = h * (0.3 + rnd.random() * 0.5)
        t1 = Vector((-out.z, 0, out.x)) * 0.035
        mid = b + out * (lean * 0.3) + Vector((0, h * 0.62, 0)); tip = b + out * lean + Vector((0, h * 0.9 - lean * 0.25, 0))
        role = ('leaf', 'leaf2')[i % 2]
        m.leaf(role, [b - t1, b + t1, mid + t1 * 0.5, mid - t1 * 0.5])
        m.leaf(role, [mid - t1 * 0.5, mid + t1 * 0.5, tip])
        if i % 5 == 0:                                                                       # Ähre am hohen Halm
            top = b + out * (lean * 0.8) + Vector((0, h * 0.78, 0))
            m.tube('fruit', [top, top + out * 0.05 + Vector((0, 0.16, 0)), top + out * 0.12 + Vector((0, 0.3, 0))], [0.012, 0.016, 0.004], seg=4, vscale=1.0)
    m.ao(lambda role, p: 0.55 + 0.45 * sstep(0.0, 1.2, p.y))
    m.export(os.path.join(ENV_DIR, f'strandgras_{v + 1}.glb'))

# ======================= Baumstumpf, umgestürzter Stamm, Pilze =======================
def build_stumpf(v):
    rnd = random.Random(2200 + v)
    m = Model('stumpf_1')
    m.tube('trunk', [(0, -0.1, 0), (0.02, 0.2, 0), (0.0, 0.5, 0.0)], [0.34, 0.27, 0.25], seg=9, vscale=0.5)
    for k in range(5):                                                                      # Wurzelanläufe
        a = k * 1.26
        m.tube('trunk', [(math.cos(a) * 0.15, 0.25, math.sin(a) * 0.15), (math.cos(a) * 0.4, 0.08, math.sin(a) * 0.4), (math.cos(a) * 0.65, -0.02, math.sin(a) * 0.65)], [0.12, 0.08, 0.03], seg=5, vscale=0.5)
    m.cyl('nut', 0.26, 0.04, TR(y=0.5), seg=9)                                              # Schnittfläche (Rolle nut = hell-braun)
    m.blob('moss', 0.22, TR(x=0.12, y=0.5, z=0.08), subdiv=1, noise=0.3, seed=2, squash=0.35)
    m.ao(lambda role, p: 0.6 + 0.4 * sstep(-0.1, 0.5, p.y))
    m.export(os.path.join(ENV_DIR, 'stumpf_1.glb'))

def build_stamm(v):
    rnd = random.Random(2300 + v)
    m = Model('stamm_1')
    L = 3.2
    path = [(L * (k / 8 - 0.5), 0.3 + 0.03 * math.sin(k * 0.9), 0.05 * math.sin(k * 0.7)) for k in range(9)]
    m.tube('trunk', path, [0.3 - 0.07 * k / 8 for k in range(9)], seg=9, vscale=0.4)
    for j in range(3):                                                                      # Aststummel
        k = 2 + j * 2
        p = Vector(path[k]); d = Vector((rnd.random() - 0.5, 0.7, rnd.random() - 0.5)).normalized()
        m.tube('trunk', [p, p + d * 0.4, p + d * 0.75], [0.07, 0.05, 0.02], seg=5, vscale=1.0)
    m.blob('moss', 0.3, TR(x=0.3, y=0.58, z=0.05), subdiv=1, noise=0.3, seed=3, squash=0.3)
    m.blob('moss', 0.22, TR(x=-0.7, y=0.55, z=-0.02), subdiv=1, noise=0.3, seed=4, squash=0.3)
    m.ao(lambda role, p: 0.62 + 0.38 * sstep(0.0, 0.6, p.y))
    m.export(os.path.join(ENV_DIR, 'stamm_1.glb'))

def build_pilz(v):
    rnd = random.Random(2400 + v)
    m = Model('pilz_1')
    for k in range(5):
        a = rnd.random() * 6.28; rr = rnd.random() * 0.14
        h = 0.1 + rnd.random() * 0.14
        x, z = math.cos(a) * rr, math.sin(a) * rr
        m.tube('bark2', [(x, 0, z), (x + 0.01, h * 0.5, z), (x, h, z)], [0.022, 0.018, 0.015], seg=5, vscale=1.0)
        m.lathe('flower', [(0.0, h + 0.05), (0.07 + rnd.random() * 0.05, h + 0.01), (0.09, h - 0.01)], TR(x=x, z=z), seg=8, caps=False)
    m.ao(lambda role, p: 0.7 + 0.3 * sstep(0.0, 0.25, p.y))
    m.export(os.path.join(ENV_DIR, 'pilz_1.glb'))

for v in range(6): clear_gear(); build_palme2(v)
for v in range(3): clear_gear(); build_eiche(v)
for v in range(2): clear_gear(); build_birke(v)
for v in range(3): clear_gear(); build_kiefer(v)
for v in range(2): clear_gear(); build_banane(v)
clear_gear(); build_agave(0)
for v in range(2): clear_gear(); build_schilf(v)
for v in range(3): clear_gear(); build_gras(v)
for v in range(3): clear_gear(); build_blume(v)
for v in range(2): clear_gear(); build_busch2(v)
for v in range(2): clear_gear(); build_fels2(v)

for v in range(3): clear_gear(); build_kiesel(v)
for v in range(2): clear_gear(); build_strandgras(v)
clear_gear(); build_stumpf(0)
clear_gear(); build_stamm(0)
clear_gear(); build_pilz(0)
