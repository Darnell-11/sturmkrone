# Insel-Architektur: Hütte, Steinhaus, Taverne (Fachwerk, überstehende Schindeldächer, Fensterläden), Steg-Modul mit
# umwickelten Tauen, steinerner Torbogen. Spiel-Koordinaten (Meter, Y oben, Tür/Vorderseite nach +Z), Boden bei y = 0.
#   blender --background --python tools/blender/headless.py -- build_arch.py
# Rollen: wall, stone, stonelight, wood, darkwood, roof, iron, rope. Fenster-Glas und Nachtleuchten setzt der Code
# (window/lamp-Materialien der Siedlung), das Modell trägt nur Rahmenwerk, Läden und Wände.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

ARCH_DIR = os.path.join(ROOT, 'public', 'models', 'architecture')
exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())

def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def block(m, role, size, T, bevel=0.04, jit=0.0, rnd=None):
    """Abgeschrägter Stein: Hülle um acht leicht verrückte Eckpunkte."""
    sx, sy, sz = (s / 2 for s in size)
    pts = []
    for x in (-1, 1):
        for y in (-1, 1):
            for z in (-1, 1):
                j = (lambda: (rnd.random() - 0.5) * 2 * jit) if rnd else (lambda: 0.0)
                pts.append((x * sx + j(), y * sy + j(), z * sz + j()))
    m.rock(role, pts, T, bevel=bevel)

def shutters(m, x, y, z, w=0.8, h=0.9):
    """Fensterläden beidseits eines Fensters an der Vorderwand, leicht geöffnet."""
    for s in (-1, 1):
        m.box('wood', (0.34, h, 0.05), TR(x=x + s * (w / 2 + 0.26), y=y, z=z + 0.07, ry=s * 0.32))
        m.box('darkwood', (0.36, 0.06, 0.07), TR(x=x + s * (w / 2 + 0.26), y=y + h * 0.32, z=z + 0.08, ry=s * 0.32))
        m.box('darkwood', (0.36, 0.06, 0.07), TR(x=x + s * (w / 2 + 0.26), y=y - h * 0.32, z=z + 0.08, ry=s * 0.32))

def roof(m, w, d, y_w, rise, ow=0.65, go=0.5, rows=9, ridge_role='darkwood'):
    """Satteldach aus überlappenden Schindelreihen, Traufe und Giebel stehen über, Sparrenköpfe am Rand."""
    th = math.atan2(rise, d / 2)
    half = d / 2 + ow
    Ls = half / math.cos(th)
    wr = Ls / rows
    ridge = Vector((0, y_w + rise, 0))
    for sgn in (1, -1):
        direc = Vector((0, -math.sin(th), math.cos(th) * sgn))
        nrm = Vector((0, math.cos(th), math.sin(th) * sgn))
        for i in range(rows):
            dist = (i + 0.5) * wr
            c = ridge + direc * dist + nrm * (0.045 + (0.035 if i % 2 else 0.0))
            m.box('roof', (w + 2 * go, 0.09, wr * 1.22), TR(x=c.x, y=c.y, z=c.z, rx=th * sgn))
        # Sparrenköpfe unter der Traufe
        for k in range(int((w + 2 * go) / 0.75) + 1):
            x = -(w + 2 * go) / 2 + 0.2 + k * 0.75
            e = ridge + direc * Ls
            m.box('darkwood', (0.11, 0.16, 0.42), TR(x=x, y=e.y - 0.1, z=e.z - 0.08 * sgn, rx=th * sgn))
        # Ortgangbretter an den Giebeln
        for sx in (-1, 1):
            c = ridge + direc * (Ls / 2) + nrm * 0.1
            m.box('darkwood', (0.1, 0.2, Ls), TR(x=sx * (w / 2 + go), y=c.y, z=c.z, rx=th * sgn))
    m.box(ridge_role, (w + 2 * go + 0.1, 0.16, 0.2), TR(x=0, y=ridge.y + 0.1, z=0))
    return th, Ls, wr

def gable_ends(m, role, w, d, y_w, rise):
    for sx in (-1, 1):
        pts = []
        for ox in (0.0, 0.14):
            xx = sx * (w / 2 - ox)
            pts += [(xx, y_w, d / 2), (xx, y_w, -d / 2), (xx, y_w + rise, 0.0)]
        m.rock(role, pts, Matrix.Identity(4), bevel=0.0)

def frame_front(m, w, d, y0, h, bays, braces=True, depth=0.07):
    """Fachwerk an der Vorder- und Rückwand: Pfosten, Schwelle, Rähm, Streben."""
    for sz in (1, -1):
        zf = sz * (d / 2 + depth / 2)
        m.box('darkwood', (w + 0.1, 0.18, 0.12), TR(y=y0 + 0.09, z=zf))
        m.box('darkwood', (w + 0.1, 0.18, 0.12), TR(y=y0 + h - 0.09, z=zf))
        for i in range(bays + 1):
            x = -w / 2 + w * i / bays
            m.box('darkwood', (0.17, h, 0.13), TR(x=x, y=y0 + h / 2, z=zf))
        if braces:
            for i in range(bays):
                x0 = -w / 2 + w * i / bays; x1 = -w / 2 + w * (i + 1) / bays
                ln = math.hypot(x1 - x0, h - 0.4)
                ang = math.atan2(h - 0.4, x1 - x0) * (1 if i % 2 == 0 else -1)
                m.box('darkwood', (ln, 0.12, 0.1), TR(x=(x0 + x1) / 2, y=y0 + h / 2, z=zf, rz=ang))

def door(m, x, d, h=2.05, w=1.1, front=True):
    z = d / 2
    m.box('stonelight', (w + 0.5, 0.24, 0.3), TR(x=x, y=h + 0.2, z=z + 0.06))        # Sturz
    m.box('stonelight', (w + 0.9, 0.14, 0.8), TR(x=x, y=0.07, z=z + 0.42))           # Schwelle
    m.box('darkwood', (w, h, 0.12), TR(x=x, y=0.15 + h / 2, z=z + 0.03))
    for yy in (0.55, 1.45):
        m.box('iron', (w * 0.92, 0.07, 0.04), TR(x=x, y=yy, z=z + 0.1))              # Beschläge
    m.sphere('iron', 0.045, TR(x=x + w * 0.32, y=1.05, z=z + 0.13), seg=6)

def chimney(m, x, z, y_base, h):
    m.box('stone', (0.8, h, 0.8), TR(x=x, y=y_base + h / 2, z=z))
    m.box('stonelight', (1.0, 0.18, 1.0), TR(x=x, y=y_base + h + 0.05, z=z))
    m.box('stone', (0.6, 0.18, 0.6), TR(x=x, y=y_base + h + 0.2, z=z))

def footing(m, w, d):
    block(m, 'stone', (w + 0.5, 2.4, d + 0.5), TR(y=-1.05), bevel=0.06)

def ao_house(wall_top, th, ow, d, wr):
    def ao(role, p):
        if role == 'roof':
            s = abs(p.z) / max(0.001, math.cos(th))
            frac = (s / wr) % 1.0
            return 0.68 + 0.32 * frac
        v = 0.7 + 0.3 * sstep(0.0, 1.4, p.y)                                # Spritzwasser und Bodenschatten
        if p.y > wall_top - 0.35: v *= 0.82                                  # unter der Traufe
        return v
    return ao

# ======================= Hütte =======================
def build_huette():
    m = Model('haus_huette'); w, d, h = 5.4, 4.0, 2.6
    footing(m, w, d)
    m.box('wall', (w, h, d), TR(y=0.15 + h / 2))
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box('darkwood', (0.26, h + 0.1, 0.26), TR(x=sx * w / 2, y=0.15 + h / 2, z=sz * d / 2))
    th, Ls, wr = roof(m, w, d, 0.15 + h, 1.9, ow=0.65, go=0.5, rows=8)
    gable_ends(m, 'wall', w, d, 0.15 + h, 1.9)
    frame_front(m, w, d, 0.15, h, 4, braces=False, depth=0.05)
    door(m, -w * 0.2, d)
    shutters(m, w * 0.22, 1.75, d / 2 + 0.02)
    m.box('roof', (1.9, 0.08, 0.9), TR(x=-w * 0.2, y=2.3, z=d / 2 + 0.45, rx=0.22))            # Vordach
    for sx in (-1, 1): m.box('darkwood', (0.1, 0.9, 0.1), TR(x=-w * 0.2 + sx * 0.85, y=1.85, z=d / 2 + 0.85, rx=0.0))
    chimney(m, w * 0.28, -0.4, 0.15 + h + 0.7, 1.5)
    m.ao(ao_house(0.15 + h, th, 0.65, d, wr))
    m.export(os.path.join(ARCH_DIR, 'haus_huette.glb'))

# ======================= Steinhaus =======================
def build_steinhaus():
    m = Model('haus_stein'); w, d, h = 6.6, 5.0, 3.1
    rnd = random.Random(3)
    footing(m, w, d)
    m.box('stone', (w, h, d), TR(y=h / 2))
    for sx in (-1, 1):                                                      # helle Ecksteine
        for sz in (-1, 1):
            for k in range(4):
                block(m, 'stonelight', (0.5, 0.42, 0.5), TR(x=sx * (w / 2 - 0.2), y=0.4 + k * 0.78, z=sz * (d / 2 - 0.2)), bevel=0.035, jit=0.015, rnd=rnd)
    th, Ls, wr = roof(m, w, d, h, 2.3, ow=0.55, go=0.45, rows=9)
    gable_ends(m, 'stone', w, d, h, 2.3)
    chimney(m, w * 0.3, -0.6, h + 0.9, 2.2)
    door(m, 0, d, h=2.05, w=1.15)
    for x in (-w * 0.3, w * 0.3):
        shutters(m, x, 1.8, d / 2 + 0.02)
        m.box('stonelight', (1.1, 0.22, 0.3), TR(x=x, y=1.8 + 0.62, z=d / 2 + 0.05))      # Fenstersturz
    m.ao(ao_house(h, th, 0.55, d, wr))
    m.export(os.path.join(ARCH_DIR, 'haus_stein.glb'))

# ======================= Taverne =======================
def build_taverne():
    m = Model('haus_taverne'); w, d, h1, h2 = 9.2, 6.2, 3.0, 2.6
    rnd = random.Random(4)
    footing(m, w, d)
    m.box('stone', (w, h1, d), TR(y=h1 / 2))
    for sx in (-1, 1):
        for sz in (-1, 1):
            for k in range(4):
                block(m, 'stonelight', (0.55, 0.45, 0.55), TR(x=sx * (w / 2 - 0.22), y=0.4 + k * 0.74, z=sz * (d / 2 - 0.22)), bevel=0.035, jit=0.015, rnd=rnd)
    m.box('wall', (w + 0.5, h2, d + 0.5), TR(y=h1 + h2 / 2))                           # Obergeschoss kragt vor
    for yy in (h1 + 0.1, h1 + h2 - 0.1): m.box('darkwood', (w + 0.6, 0.2, d + 0.6), TR(y=yy))
    for k in range(int(w / 0.8)):                                                       # Balkenköpfe unter dem Überstand
        m.box('darkwood', (0.16, 0.2, 0.55), TR(x=-w / 2 + 0.4 + k * 0.8, y=h1 - 0.12, z=d / 2 + 0.2))
    frame_front(m, w + 0.5, d + 0.5, h1, h2, 7, braces=True, depth=0.08)
    th, Ls, wr = roof(m, w + 0.5, d + 0.5, h1 + h2, 2.9, ow=0.8, go=0.55, rows=10)
    gable_ends(m, 'wall', w + 0.5, d + 0.5, h1 + h2, 2.9)
    chimney(m, -w * 0.3, 0.4, h1 + h2 + 1.1, 2.3)
    door(m, 0, d, h=2.2, w=1.5)
    m.box('stonelight', (2.2, 0.18, 1.0), TR(y=0.09, z=d / 2 + 0.5))
    for sx in (-1, 1):
        shutters(m, sx * 2.9, 1.75, d / 2 + 0.02, w=1.0, h=1.0)
        shutters(m, sx * 2.9, h1 + 1.3, d / 2 + 0.3, w=0.9, h=0.9)
    shutters(m, 0, h1 + 1.3, d / 2 + 0.3, w=0.9, h=0.9)
    m.box('iron', (0.1, 0.1, 1.5), TR(x=2, y=3.3, z=d / 2 + 0.9))                        # Ausleger fürs Wirtshausschild
    m.box('gold', (0.08, 0.8, 1.1), TR(x=2, y=2.8, z=d / 2 + 1.05))
    m.ao(ao_house(h1 + h2, th, 0.8, d + 0.5, wr))
    m.export(os.path.join(ARCH_DIR, 'haus_taverne.glb'))

# ======================= Steg-Modul =======================
# 3 m breit, 4,5 m lang (z von 0 bis 4,5), Oberkante der Bohlen bei y = 1,45; Pfahlpaar bei z = 1
def build_steg():
    m = Model('steg_modul'); rnd = random.Random(7)
    top = 1.45
    for i in range(12):                                                                  # einzelne Bohlen mit Fugen
        z = 0.2 + i * 0.37
        m.box('wood', (3.0, 0.12, 0.34), TR(y=top - 0.06 + (rnd.random() - 0.5) * 0.014, z=z + (rnd.random() - 0.5) * 0.01))
    for x in (-1.1, 0.0, 1.1): m.box('darkwood', (0.2, 0.24, 4.5), TR(x=x, y=top - 0.24, z=2.25))
    for z in (0.15, 4.35): m.box('darkwood', (3.1, 0.22, 0.2), TR(y=top - 0.4, z=z))
    for sx in (-1, 1):
        px = sx * 1.55
        m.tube('darkwood', [(px, -2.8, 1.0), (px, 0.5, 1.0), (px, 1.95, 1.0)], [0.19, 0.17, 0.15], seg=7, vscale=0.4)
        m.box('darkwood', (0.2, 0.1, 0.2), TR(x=px, y=2.0, z=1.0))
        # Tau um den Pfahl: Schraubenlinie von 1,5 bis 1,95 m, mehrere Windungen
        n = 40; path = []
        for k in range(n + 1):
            t = k / n; a = t * 2 * math.pi * 4.5
            path.append((px + math.cos(a) * 0.205, 1.2 + 0.75 * t, 1.0 + math.sin(a) * 0.205))
        m.tube('rope', path, [0.035] * (n + 1), seg=4, caps=True, vscale=1.0)
        m.box('iron', (0.28, 0.08, 0.14), TR(x=sx * 1.38, y=top + 0.05, z=2.6))        # Klampe
        m.box('iron', (0.1, 0.1, 0.1), TR(x=sx * 1.38, y=top + 0.12, z=2.6, ry=0.4))
    m.ao(lambda role, p: (0.72 + 0.28 * sstep(-1.0, top, p.y)) * (0.88 + 0.12 * (math.sin(p.z * 17.0) * 0.5 + 0.5)) if role in ('wood', 'darkwood') else 0.85)
    m.export(os.path.join(ARCH_DIR, 'steg_modul.glb'))

# ======================= Torbogen =======================
def build_bogen():
    m = Model('bogen'); rnd = random.Random(11)
    for sx in (-1, 1):                                                                   # Pfeiler aus Quadern
        block(m, 'stone', (1.9, 0.5, 1.9), TR(x=sx * 2.6, y=0.25), bevel=0.06)
        y = 0.5
        for k in range(7):
            hh = 0.78 + (rnd.random() - 0.5) * 0.08
            block(m, 'stone', (1.25 + (rnd.random() - 0.5) * 0.08, hh, 1.25), TR(x=sx * 2.6 + (rnd.random() - 0.5) * 0.06, y=y + hh / 2, z=(rnd.random() - 0.5) * 0.05, ry=(rnd.random() - 0.5) * 0.05), bevel=0.05, jit=0.02, rnd=rnd)
            y += hh
    N = 9; Ri, Ro = 2.0, 3.2
    for k in range(N):
        if k in (6, 7): continue                                                         # eingestürzt
        a0 = math.pi * k / N; a1 = math.pi * (k + 1) / N
        pts = []
        for z in (-0.6, 0.6):
            for a, R in ((a0, Ri), (a1, Ri), (a1, Ro), (a0, Ro)):
                pts.append((math.cos(a) * R + 0.0, 5.6 + math.sin(a) * R, z))
        m.rock('stone', pts, Matrix.Identity(4), bevel=0.05)
    # heruntergefallene Quader
    block(m, 'stone', (1.0, 0.6, 1.3), TR(x=1.4, y=0.3, z=1.8, ry=0.5), bevel=0.05, jit=0.03, rnd=rnd)
    block(m, 'stone', (0.8, 0.5, 0.9), TR(x=-0.6, y=0.25, z=2.3, ry=-0.3), bevel=0.05, jit=0.03, rnd=rnd)
    m.blob('stonelight', 0.4, TR(x=2.6, y=3.4, z=0.7), subdiv=2, noise=0.25, seed=5, squash=0.5)        # Moos-/Efeupolster (Rolle stonelight, Shader färbt Oberseiten)
    m.ao(lambda role, p: 0.6 + 0.4 * sstep(0.0, 6.5, p.y))
    m.export(os.path.join(ARCH_DIR, 'bogen.glb'))

for fn in (build_huette, build_steinhaus, build_taverne, build_steg, build_bogen):
    clear_gear(); fn()
