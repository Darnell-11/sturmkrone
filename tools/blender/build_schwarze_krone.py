# Phase 4.7D – Kapitän Schwarzbarts Flaggschiff „Die Schwarze Krone“: gekröntes Seeungeheuer als Galionsfigur und verziertes Kronen-Steuerrad.
#   blender --background --python tools/blender/headless.py -- build_schwarze_krone.py
# Ergebnis: public/models/figureheads/crowned_kraken.glb, public/models/ships/steuerrad_krone.glb (danach node scripts/compress-gear.mjs)
# Koordinaten wie build_figureheads.py: Fuß am Ursprung, Blick nach +Z (vorn), oben +Y, Sockel hinter dem Fuß (z < 0). Rad: Ebene XY, Achse +Z.
# Rollen (Materialname = Rolle, das Spiel setzt PBR-Materialien ein, src/entities/ship/figureheads.ts und shipBuilder.ts):
#   ebony (rabenschwarzer Lack), iron (dunkles Schmiedeeisen), gold (Blattgold), gem (glimmende Edelstein-Augen), dark (Rachen)
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

FH_DIR = os.path.join(ROOT, 'public', 'models', 'figureheads')
SHIP_DIR = os.path.join(ROOT, 'public', 'models', 'ships')
exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())
ROLE_COL.update({'ebony': (0.04, 0.035, 0.04), 'iron': (0.16, 0.16, 0.18), 'gem': (0.85, 0.35, 0.95), 'gold': (0.89, 0.69, 0.29)})


def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def cone(m, role, base, direction, length, radius, seg=6):
    """Spitzer Kegel: Fuß bei base, Spitze in Richtung direction."""
    d = Vector(direction).normalized()
    q = Vector((0, 1, 0)).rotation_difference(d)
    T = Matrix.Translation(Vector(base)) @ q.to_matrix().to_4x4()
    m.lathe(role, [(radius, 0.0), (radius * 0.55, length * 0.55), (0.0, length)], T, seg=seg)


def plinth(m, w=1.0):
    """Sockel am Vorsteven: schwarzer Lack, eiserne Bänder, goldene Nieten und Voluten."""
    m.rock('ebony', [(x * 0.26 * w, y * 0.15, z * 0.4) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)], TR(y=-0.14, z=-0.42), bevel=0.045)
    for zz in (-0.12, -0.42, -0.72):
        m.rock('iron', [(x * 0.285 * w, y * 0.022, z * 0.035) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)], TR(y=0.03, z=zz), bevel=0.01)
        for s in (-1, 1):
            m.sphere('gold', 0.022, TR(x=s * 0.22 * w, y=0.05, z=zz), seg=5)
    for s in (-1, 1):
        m.torus('gold', 0.13, 0.022, TR(x=s * 0.3 * w, y=-0.1, z=-0.14, rz=math.pi / 2), seg=14, sec=5, arc=1.65 * math.pi)
        m.sphere('gold', 0.036, TR(x=s * 0.3 * w, y=-0.1, z=-0.14), seg=6)


def tentacle(m, side, base, h, curl, wig, r0):
    """Fangarm aus schwarzem Lack, der sich um den Sockel windet; goldene Saugnapf-Ringe."""
    pts, rad = [], []
    n = 16
    for i in range(n + 1):
        t = i / n
        pts.append((base[0] + side * (0.24 * t + wig * math.sin(t * 10)), base[1] + h * t, base[2] + 0.12 * t + curl * t ** 3 + wig * math.cos(t * 10)))
        rad.append(r0 * (1.0 - 0.9 * t))
    m.tube('ebony', pts, rad, seg=7, vscale=0.5)
    for i in range(2, n - 1, 2):
        p = pts[i]
        m.torus('gold', rad[i] * 0.34, rad[i] * 0.09, TR(x=p[0] - side * rad[i] * 0.86, y=p[1], z=p[2] + rad[i] * 0.25, rz=math.pi / 2), seg=8, sec=3)


# ---------------------------------------------------------------- Gekröntes Seeungeheuer
def build_crowned_kraken():
    m = Model('crowned_kraken')
    plinth(m, 1.12)
    # Hals: schwarzer, geschuppter Seeschlangen-Hals, der sich nach vorn reckt
    neck = [(0, 0.0, -0.36), (0, 0.24, -0.3), (0, 0.58, -0.14), (0, 0.92, 0.06), (0, 1.16, 0.32), (0, 1.26, 0.6), (0, 1.22, 0.86)]
    rad = [0.32, 0.3, 0.27, 0.24, 0.22, 0.22, 0.23]
    m.tube('ebony', neck, rad, seg=12, vscale=0.6)
    # eiserne Bauchplatten und Schuppen am Rücken
    for k in range(1, 6):
        p = Vector(neck[k]); nx = (Vector(neck[k + 1]) - Vector(neck[k - 1])).normalized()
        out = Vector((0, -nx.z, nx.y)).normalized()
        m.blob('iron', rad[k] * 0.6, TR(x=0, y=p.y + out.y * rad[k] * 0.8, z=p.z + out.z * rad[k] * 0.8), subdiv=1, noise=0.0, squash=0.36)
        back = Vector((0, nx.z, -nx.y)).normalized()
        for j in range(-2, 3):
            a = j * 0.5
            off = back * math.cos(a) * rad[k] * 0.96 + Vector((math.sin(a) * rad[k] * 0.96, 0, 0))
            m.blob('ebony', 0.07, TR(x=p.x + off.x, y=p.y + off.y, z=p.z + off.z), subdiv=1, noise=0.0, squash=0.5)
        # Rückenflossen aus Eisen mit Goldkante
        base = p + back * rad[k] * 0.95
        hgt = 0.3 - 0.03 * k
        m.leaf('iron', [base - nx * 0.13, base + nx * 0.13, base + back * hgt - nx * 0.06])
        cone(m, 'gold', tuple(base + back * hgt * 0.9 - nx * 0.05), tuple(back), 0.05, 0.012, seg=4)
    # Kopf: breiter, flacher Schädel mit Brauenwulst, weit aufgerissenes Maul
    m.blob('ebony', 0.3, TR(y=1.3, z=1.02), subdiv=2, noise=0.06, seed=7, squash=0.78)
    m.tube('ebony', [(0, 1.32, 1.02), (0, 1.3, 1.32), (0, 1.25, 1.58), (0, 1.18, 1.8)], [0.23, 0.2, 0.15, 0.1], seg=10, vscale=0.6)     # Oberkiefer
    m.tube('ebony', [(0, 1.02, 0.96), (0, 0.88, 1.24), (0, 0.78, 1.5), (0, 0.74, 1.68)], [0.15, 0.13, 0.095, 0.055], seg=8, vscale=0.6)   # Unterkiefer
    m.blob('dark', 0.17, TR(y=1.04, z=1.34), subdiv=1, noise=0.0, squash=0.55)                                                            # Rachen
    m.tube('dark', [(0, 0.98, 1.08), (0, 0.95, 1.4), (0, 0.9, 1.62)], [0.055, 0.048, 0.02], seg=6)                                         # Zunge
    for k in range(8):                                                                                                                      # Goldzähne
        z = 1.18 + k * 0.085
        for s in (-1, 1):
            cone(m, 'gold', (s * (0.12 - k * 0.007), 1.17 - k * 0.006, z), (0, -1, 0.12), 0.15 - 0.008 * k + (0.07 if k == 1 else 0), 0.03)
            if k < 7:
                cone(m, 'gold', (s * (0.1 - k * 0.006), 0.86 - k * 0.012, z - 0.03), (0, 1, 0.06), 0.1 - 0.005 * k, 0.024)
    for s in (-1, 1):
        # glimmende Augen in eisernen Fassungen unter dem Brauenwulst
        m.sphere('gem', 0.07, TR(x=s * 0.21, y=1.4, z=1.05), seg=8)
        m.torus('iron', 0.085, 0.018, TR(x=s * 0.225, y=1.4, z=1.05, rz=math.pi / 2), seg=12, sec=4)
        m.tube('ebony', [(s * 0.08, 1.54, 0.98), (s * 0.22, 1.52, 1.1), (s * 0.3, 1.45, 1.26)], [0.06, 0.055, 0.025], seg=6)               # Brauenwulst
        # Kiemenkämme / Flossenohren aus Eisen mit Goldstreben
        m.leaf('iron', [Vector((s * 0.22, 1.24, 0.84)), Vector((s * 0.23, 1.42, 0.76)), Vector((s * 0.56, 1.58, 0.46)), Vector((s * 0.62, 1.38, 0.4)), Vector((s * 0.46, 1.22, 0.62))], [(0, 0), (0, 1), (1, 1), (1, 0.4), (0.6, 0)])
        for a in (0.0, 0.3, 0.6):
            m.tube('gold', [(s * 0.24, 1.26 + a * 0.16, 0.82 - a * 0.1), (s * (0.48 + a * 0.08), 1.4 + a * 0.12, 0.56 - a * 0.1)], [0.012, 0.008], seg=4, caps=False)
        # Barteln wie Fangarme vom Kinn
        m.tube('ebony', [(s * 0.07, 0.84, 1.42), (s * 0.2, 0.7, 1.12), (s * 0.33, 0.52, 0.8), (s * 0.4, 0.36, 0.52)], [0.026, 0.022, 0.016, 0.006], seg=5)
    # Die eiserne Krone: Reif mit Goldkante, Zacken mit Edelsteinen
    m.torus('iron', 0.24, 0.03, TR(y=1.56, z=0.98), seg=20, sec=5)
    m.torus('gold', 0.245, 0.012, TR(y=1.6, z=0.98), seg=20, sec=4)
    for k in range(9):
        a = k / 9 * 2 * math.pi
        x, z = math.sin(a) * 0.24, 0.98 + math.cos(a) * 0.24
        tall = 0.36 if k % 2 == 0 else 0.22
        cone(m, 'iron', (x, 1.57, z), (math.sin(a) * 0.2, 1, math.cos(a) * 0.2 - 0.08), tall, 0.04, seg=5)
        if k % 2 == 0:
            m.sphere('gem', 0.028, TR(x=x + math.sin(a) * 0.2 * tall, y=1.57 + tall * 0.96, z=z + (math.cos(a) * 0.2 - 0.08) * tall), seg=5)
        else:
            m.sphere('gold', 0.022, TR(x=x + math.sin(a) * 0.2 * tall, y=1.57 + tall * 0.96, z=z + (math.cos(a) * 0.2 - 0.08) * tall), seg=5)
    # Fangarme winden sich vom Sockel um den Hals
    for s in (-1, 1):
        tentacle(m, s, (s * 0.44, 0.05, -0.2), 1.32, 0.6, 0.032, 0.105)
        tentacle(m, s, (s * 0.32, 0.0, -0.46), 1.02, 0.72, 0.042, 0.085)
    m.ao(lambda role, p: 0.6 + 0.4 * sstep(-0.3, 1.6, p.y))
    m.export(os.path.join(FH_DIR, 'crowned_kraken.glb'))


# ---------------------------------------------------------------- Kronen-Steuerrad
def build_steuerrad_krone():
    m = Model('steuerrad_krone'); n = 12
    ZA = TR(rx=math.pi / 2)
    m.torus('ebony', 0.5, 0.046, ZA, seg=36, sec=8)                                       # Felge (schwarzer Lack)
    m.torus('gold', 0.5, 0.013, TR(z=0.045, rx=math.pi / 2), seg=36, sec=5)               # Goldband vorn
    m.torus('gold', 0.5, 0.013, TR(z=-0.045, rx=math.pi / 2), seg=36, sec=5)              # Goldband hinten
    m.torus('iron', 0.22, 0.03, ZA, seg=24, sec=6)                                        # eiserner Innenring
    for i in range(n):
        a = i * 2 * math.pi / n
        ca, sa = -math.sin(a), math.cos(a)
        m.lathe('ebony', [(0.03, -0.2), (0.042, -0.1), (0.032, 0.0), (0.042, 0.13)], TR(x=ca * 0.36, y=sa * 0.36, rz=a), seg=8, caps=False)   # Speiche
        m.lathe('ebony', [(0.03, -0.26), (0.036, -0.19), (0.052, -0.1), (0.036, -0.03), (0.03, 0.12), (0.05, 0.15), (0.0, 0.22)],
                TR(x=ca * 0.71, y=sa * 0.71, rz=a), seg=8)                                # gedrechselter Griff
        m.sphere('gold', 0.03, TR(x=ca * 0.93, y=sa * 0.93, rz=a), seg=6)                 # Goldkappe am Griff
        m.cyl('iron', 0.054, 0.055, TR(x=ca * 0.54, y=sa * 0.54, rz=a), seg=8)            # Eisenhülse an der Felge
    # Nabe aus Eisen, darauf die goldene Krone
    m.cyl('iron', 0.13, 0.17, AX, seg=16)
    m.torus('gold', 0.13, 0.016, TR(z=0.085, rx=math.pi / 2), seg=16, sec=5)
    m.torus('gold', 0.13, 0.016, TR(z=-0.085, rx=math.pi / 2), seg=16, sec=5)
    m.cyl('iron', 0.055, 0.36, AX, seg=10)                                                 # Welle
    m.torus('gold', 0.075, 0.014, TR(z=0.12, rx=math.pi / 2), seg=14, sec=4)               # Kronreif auf der Nabe
    for k in range(5):
        a = k / 5 * 2 * math.pi
        cone(m, 'gold', (math.sin(a) * 0.075, math.cos(a) * 0.075, 0.12), (math.sin(a) * 0.35, math.cos(a) * 0.35, 1), 0.08, 0.018, seg=4)
    m.sphere('gem', 0.035, TR(z=0.15), seg=8)
    m.export(os.path.join(SHIP_DIR, 'steuerrad_krone.glb'))


for fn in (build_crowned_kraken, build_steuerrad_krone):
    clear_gear(); fn()
