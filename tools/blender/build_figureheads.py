# Vier skulpturierte Galionsfiguren für alle Schiffsklassen (Blender, ohne Oberfläche):
#   blender --background --python tools/blender/headless.py -- build_figureheads.py
# Ergebnis: public/models/figureheads/<id>.glb  (id = storm_dragon, valkyrie, leviathan_skull, royal_griffin; Tabelle in src/data/figureheads.ts)
# Koordinaten wie bei build_ships.py: Fuß am Ursprung, Blick nach +Z (vorn), oben +Y, Sockel hinter dem Fuß (z < 0).
# Rollen (Materialname): wood (Mahagoni), gold (Blattgold), bronze (Patina), bone (Bein), dark (Rachen, Pupillen), gem (Edelstein-Augen).
# Das Spiel hängt PBR-Materialien an diese Rollen (src/entities/ship/figureheads.ts). Kanten der Sockel sind abgeschrägt (Bevel), Körper glatt
# geschattet, UVs je Teil zylindrisch oder eben und beim Export ohne Überlappung gepackt; Ambient-Occlusion je Eckpunkt (Farbattribut Col).
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

FH_DIR = os.path.join(ROOT, 'public', 'models', 'figureheads')
exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())
ROLE_COL.update({'bone': (0.85, 0.81, 0.7), 'gem': (0.85, 0.12, 0.1), 'bronze': (0.3, 0.55, 0.45), 'gold': (0.89, 0.69, 0.29)})


def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def bbox(m, role, size, T, bevel=0.02):
    """Quader mit abgeschrägten Kanten."""
    sx, sy, sz = (s / 2 for s in size)
    m.rock(role, [(x * sx, y * sy, z * sz) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)], T, bevel=bevel)


def cone(m, role, base, direction, length, radius, seg=6):
    """Spitzer Kegel: Fuß bei base, Spitze in Richtung direction (Spiel-Vektor)."""
    d = Vector(direction).normalized()
    # lokale Y-Achse auf d drehen
    q = Vector((0, 1, 0)).rotation_difference(d)
    T = Matrix.Translation(Vector(base)) @ q.to_matrix().to_4x4()
    m.lathe(role, [(radius, 0.0), (radius * 0.55, length * 0.55), (0.0, length)], T, seg=seg)


def spike(m, role, base, direction, length, radius, seg=5):
    cone(m, role, base, direction, length, radius, seg)


def plinth(m, w=1.0):
    """Verzierter Sockel am Vorsteven: Mahagoni mit Goldleisten und seitlichen Schnecken (Voluten)."""
    bbox(m, 'wood', (0.5 * w, 0.3, 0.8), TR(y=-0.14, z=-0.42), 0.045)
    bbox(m, 'gold', (0.57 * w, 0.045, 0.86), TR(y=0.03, z=-0.42), 0.012)
    bbox(m, 'gold', (0.57 * w, 0.04, 0.86), TR(y=-0.3, z=-0.42), 0.012)
    for s in (-1, 1):
        m.torus('gold', 0.13, 0.022, TR(x=s * 0.3 * w, y=-0.1, z=-0.14, rz=math.pi / 2), seg=14, sec=5, arc=1.65 * math.pi)
        m.sphere('gold', 0.036, TR(x=s * 0.3 * w, y=-0.1, z=-0.14), seg=6)
        for k in range(3):
            m.sphere('gold', 0.022, TR(x=s * 0.3 * w, y=-0.2 - 0.0 * k, z=-0.62 + k * 0.17), seg=5)


def feather(m, role, p, tang, d, length, width):
    """Eine Schwungfeder: Fünfeck mit Spitze (doppelseitig)."""
    p = Vector(p); tang = Vector(tang).normalized(); d = Vector(d).normalized()
    h = width / 2
    a, b = p - tang * h, p + tang * h
    mid_l, mid_r = a + d * length * 0.62 - tang * h * 0.15, b + d * length * 0.62 + tang * h * 0.15
    tip = p + d * length + Vector((0, -0.03 * length, 0))
    m.leaf(role, [a, b, mid_r, tip, mid_l], [(0, 0), (1, 0), (1, 0.6), (0.5, 1), (0, 0.6)])


def wing(m, role, role2, root, side, span, up, rows=3, n=9, sweep=0.6, droop=0.18, arm_role=None):
    """Flügel: Armknochen als Bogen, dahinter Federreihen (lange Schwungfedern außen, kürzere Decken innen)."""
    root = Vector(root)
    bone = []
    for i in range(n + 1):
        t = i / n
        bone.append(root + Vector((side * span * t, up * (0.55 * t + 0.45 * math.sin(t * math.pi * 0.9)), -sweep * 0.45 * t * t)))
    if arm_role:
        m.tube(arm_role, bone, [0.05 * (1 - 0.6 * i / n) for i in range(n + 1)], seg=6, vscale=0.5)
    for r in range(rows):
        k = 1.0 - 0.27 * r
        for i in range(1, n + 1):
            t = i / n
            tang = (bone[i] - bone[i - 1]).normalized()
            base = bone[i] + Vector((0, -0.045 * r, -0.03 * r))
            d = Vector((side * (0.3 + 0.35 * t), -droop - 0.1 * r, -1.0))
            L = span * (0.5 + 0.62 * t) * k
            feather(m, role if (i + r) % 2 == 0 else (role2 or role), base, tang, d, L, span * 0.19 * (1.0 - 0.15 * r))


def tentacle(m, role, side, base, h, curl, wig, r0, suckers=True):
    pts, rad = [], []
    n = 16
    for i in range(n + 1):
        t = i / n
        pts.append((base[0] + side * (0.22 * t + wig * math.sin(t * 11)), base[1] + h * t, base[2] + 0.1 * t + curl * t ** 3 + wig * math.cos(t * 11)))
        rad.append(r0 * (1.0 - 0.88 * t))
    m.tube(role, pts, rad, seg=7, vscale=0.5)
    if suckers:
        for i in range(2, n - 1, 2):
            p = pts[i]
            m.sphere('bone', rad[i] * 0.36, TR(x=p[0] - side * rad[i] * 0.85, y=p[1], z=p[2] + rad[i] * 0.3), seg=5)


# ---------------------------------------------------------------- 1. Gekrönter Sturmdrache
def build_storm_dragon():
    m = Model('storm_dragon')
    plinth(m)
    neck = [(0, 0.0, -0.38), (0, 0.22, -0.31), (0, 0.55, -0.17), (0, 0.9, 0.02), (0, 1.18, 0.25), (0, 1.33, 0.54), (0, 1.31, 0.8), (0, 1.22, 0.98)]
    rad = [0.31, 0.29, 0.26, 0.23, 0.21, 0.2, 0.2, 0.21]
    m.tube('bronze', neck, rad, seg=12, vscale=0.6)
    # Bauchplatten (Gold) an der Vorderseite des Halses
    for k in range(1, 7):
        p = Vector(neck[k]); nx = Vector(neck[k + 1]) - Vector(neck[k - 1]); nx.normalize()
        out = Vector((0, -nx.z, nx.y)).normalized()   # nach vorn/außen
        m.blob('gold', rad[k] * 0.62, TR(x=0, y=p.y + out.y * rad[k] * 0.78, z=p.z + out.z * rad[k] * 0.78), subdiv=1, noise=0.0, squash=0.38)
    # Schuppen am Rücken des Halses
    rnd = random.Random(11)
    for k in range(1, 7):
        p = Vector(neck[k]); nx = (Vector(neck[k + 1]) - Vector(neck[k - 1])).normalized()
        back = Vector((0, nx.z, -nx.y)).normalized()
        for j in range(-2, 3):
            a = j * 0.5
            off = back * math.cos(a) * rad[k] * 0.95 + Vector((math.sin(a) * rad[k] * 0.95, 0, 0))
            m.blob('bronze', 0.065, TR(x=p.x + off.x, y=p.y + off.y, z=p.z + off.z), subdiv=1, noise=0.0, squash=0.55)
    # Kopf: Schädel, Oberkiefer, Unterkiefer (weit aufgerissen)
    m.blob('bronze', 0.25, TR(y=1.27, z=1.08), subdiv=2, noise=0.05, seed=2, squash=0.86)
    m.tube('bronze', [(0, 1.3, 1.08), (0, 1.27, 1.34), (0, 1.22, 1.58), (0, 1.16, 1.78)], [0.2, 0.17, 0.135, 0.1], seg=10, vscale=0.6)
    m.blob('bronze', 0.1, TR(y=1.17, z=1.8), subdiv=1, noise=0.02, squash=0.8)
    m.tube('bronze', [(0, 1.04, 1.0), (0, 0.9, 1.26), (0, 0.8, 1.5), (0, 0.76, 1.68)], [0.13, 0.115, 0.085, 0.05], seg=8, vscale=0.6)
    m.blob('dark', 0.15, TR(y=1.06, z=1.34), subdiv=1, noise=0.0, squash=0.55)                 # Rachen
    m.tube('dark', [(0, 0.97, 1.1), (0, 0.95, 1.4), (0, 0.9, 1.6)], [0.05, 0.045, 0.02], seg=6)    # Zunge
    m.leaf('dark', [Vector((-0.04, 0.9, 1.58)), Vector((0.04, 0.9, 1.58)), Vector((0.0, 0.84, 1.78))])
    for k in range(7):                                                                       # Reißzähne
        z = 1.2 + k * 0.095; hh = 0.13 - 0.01 * k if k != 1 else 0.2
        for s in (-1, 1):
            cone(m, 'bone', (s * (0.1 - k * 0.006), 1.17 - k * 0.004, z), (0, -1, 0.1), hh, 0.026)
            cone(m, 'bone', (s * (0.085 - k * 0.005), 0.86 - k * 0.012 - 0.1 + 0.1, z - 0.02), (0, 1, 0.05), 0.09, 0.02)
    for s in (-1, 1):
        m.blob('dark', 0.016, TR(x=s * 0.045, y=1.27, z=1.7), subdiv=1, noise=0.0)           # Nüstern
        m.sphere('gem', 0.062, TR(x=s * 0.19, y=1.37, z=1.02), seg=8)                         # Edelstein-Augen
        m.torus('gold', 0.075, 0.016, TR(x=s * 0.205, y=1.37, z=1.02, rz=math.pi / 2), seg=12, sec=4)
        m.tube('gold', [(s * 0.1, 1.5, 1.0), (s * 0.2, 1.46, 1.12), (s * 0.24, 1.4, 1.3)], [0.03, 0.03, 0.015], seg=5)        # Brauen
        m.tube('gold', [(s * 0.16, 1.42, 0.92), (s * 0.3, 1.58, 0.74), (s * 0.36, 1.7, 0.45), (s * 0.36, 1.72, 0.15)], [0.06, 0.05, 0.032, 0.01], seg=6)   # Hörner
        # Flossenohren
        m.leaf('gold', [Vector((s * 0.2, 1.22, 0.86)), Vector((s * 0.21, 1.36, 0.78)), Vector((s * 0.46, 1.5, 0.5)), Vector((s * 0.5, 1.34, 0.46)), Vector((s * 0.4, 1.2, 0.66))], [(0, 0), (0, 1), (1, 1), (1, 0.4), (0.6, 0)])
        for a in (0.0, 0.25, 0.5):
            m.tube('gold', [(s * 0.22, 1.24 + a * 0.16, 0.84 - a * 0.1), (s * (0.4 + a * 0.1), 1.32 + a * 0.14, 0.6 - a * 0.1)], [0.012, 0.008], seg=4, caps=False)
        # Barteln vom Kinn
        m.tube('gold', [(s * 0.06, 0.84, 1.4), (s * 0.18, 0.72, 1.1), (s * 0.3, 0.55, 0.75), (s * 0.34, 0.4, 0.5)], [0.02, 0.018, 0.014, 0.006], seg=5)
    # Sturmkrone: Goldreif mit Blitzzacken und Edelsteinen
    m.torus('gold', 0.215, 0.024, TR(y=1.47, z=0.99), seg=18, sec=5)
    for k in range(9):
        a = k / 9 * 2 * math.pi
        x, z = math.sin(a) * 0.215, 0.99 + math.cos(a) * 0.215
        tall = 0.34 if k % 2 == 0 else 0.2
        spike(m, 'gold', (x, 1.48, z), (math.sin(a) * 0.25, 1, math.cos(a) * 0.25 - 0.1), tall, 0.034)
        if k % 2 == 0: m.sphere('gem', 0.024, TR(x=x + math.sin(a) * 0.25 * tall, y=1.48 + tall * 0.92, z=z + (math.cos(a) * 0.25 - 0.1) * tall), seg=5)
    # Rückenflossen entlang des Halses
    for k in range(1, 7):
        p = Vector(neck[k]); nx = (Vector(neck[k + 1]) - Vector(neck[k - 1])).normalized()
        back = Vector((0, nx.z, -nx.y)).normalized()
        hgt = 0.34 - 0.025 * k
        base = p + back * rad[k] * 0.95
        a = base - nx * 0.12; b = base + nx * 0.12
        tip = base + back * hgt - nx * 0.1
        m.leaf('gold', [a, b, tip + nx * 0.06], [(0, 0), (1, 0), (0.5, 1)])
        spike(m, 'gold', tuple(base), tuple(back * 1.0 + Vector((0, 0.1, 0))), hgt * 0.8, 0.028)
    m.ao(lambda role, p: 0.62 + 0.38 * sstep(-0.3, 1.6, p.y))
    m.export(os.path.join(FH_DIR, 'storm_dragon.glb'))


# ---------------------------------------------------------------- 2. Geflügelte Meeres-Walküre
def build_valkyrie():
    m = Model('valkyrie')
    plinth(m)
    spine = [(0, 0.02, -0.36), (0, 0.3, -0.3), (0, 0.64, -0.13), (0, 0.96, 0.12), (0, 1.2, 0.4)]
    rad = [0.32, 0.29, 0.23, 0.2, 0.15]
    m.tube('wood', spine, rad, seg=14, vscale=0.6)                                          # Rumpf im wehenden Gewand
    for s in (-1, 1):                                                                        # Gewandfalten, Zipfel hinten
        for k in range(3):
            x0 = s * (0.06 + 0.1 * k)
            m.tube('wood', [(x0, 0.62, -0.1 + 0.02 * k), (x0 * 1.7, 0.4, -0.32 - 0.04 * k), (x0 * 2.3, 0.15, -0.5 - 0.08 * k)], [0.07, 0.06, 0.012], seg=6)
        m.tube('gold', [(s * 0.24, 0.7, -0.1), (s * 0.4, 0.5, -0.32), (s * 0.5, 0.25, -0.52)], [0.016, 0.014, 0.01], seg=5)   # Goldsaum
    m.torus('gold', 0.2, 0.026, TR(y=0.72, z=-0.07, rx=0.45), seg=16, sec=5)                # Gürtel
    m.sphere('gem', 0.035, TR(y=0.72, z=0.1), seg=6)
    m.blob('gold', 0.2, TR(y=1.06, z=0.26), subdiv=2, noise=0.0, squash=0.8)                # Brustpanzer
    m.torus('gold', 0.21, 0.02, TR(y=1.2, z=0.3, rx=0.6), seg=14, sec=4)                    # Kragen
    # Kopf: Gesicht, Helm mit Flügelchen, wehendes Haar
    m.blob('wood', 0.135, TR(y=1.4, z=0.52), subdiv=2, noise=0.0, seed=1, squash=1.08)
    m.blob('wood', 0.03, TR(y=1.37, z=0.64), subdiv=1, noise=0.0)                           # Nase
    for s in (-1, 1):
        m.sphere('dark', 0.016, TR(x=s * 0.055, y=1.42, z=0.635), seg=5)
    m.lathe('gold', [(0.152, -0.03), (0.145, 0.0), (0.12, 0.07), (0.06, 0.12), (0.0, 0.14)], TR(y=1.43, z=0.5), seg=14, caps=False)  # Helm
    m.torus('gold', 0.148, 0.014, TR(y=1.43, z=0.5), seg=14, sec=4)
    for s in (-1, 1):
        for k in range(3):
            m.leaf('gold', [Vector((s * 0.14, 1.5 + 0.02 * k, 0.5 - 0.02 * k)), Vector((s * 0.16, 1.54 + 0.02 * k, 0.5 - 0.02 * k)), Vector((s * (0.3 + 0.07 * k), 1.64 + 0.06 * k, 0.35 - 0.06 * k)), Vector((s * (0.27 + 0.07 * k), 1.55 + 0.05 * k, 0.4 - 0.05 * k))])
        for k in range(2):
            m.tube('gold', [(s * (0.04 + 0.05 * k), 1.5, 0.42), (s * (0.09 + 0.07 * k), 1.38, 0.1), (s * (0.12 + 0.1 * k), 1.12, -0.2 - 0.06 * k), (s * (0.16 + 0.12 * k), 0.82, -0.42 - 0.08 * k)], [0.05, 0.045, 0.03, 0.008], seg=6)  # Haar
    m.tube('gold', [(0, 1.52, 0.4), (0, 1.35, 0.12), (0, 1.1, -0.2), (0, 0.85, -0.44)], [0.05, 0.045, 0.03, 0.008], seg=6)
    # Arme: rechter Arm mit Speer nach vorn, linker zurückgeschwungen
    m.tube('wood', [(0.2, 1.14, 0.36), (0.38, 1.08, 0.56), (0.32, 1.1, 0.84)], [0.075, 0.06, 0.05], seg=8)
    m.tube('wood', [(-0.2, 1.14, 0.36), (-0.43, 1.0, 0.2), (-0.52, 0.8, -0.05)], [0.075, 0.06, 0.05], seg=8)
    m.sphere('gold', 0.075, TR(x=0.2, y=1.16, z=0.36), seg=8); m.sphere('gold', 0.075, TR(x=-0.2, y=1.16, z=0.36), seg=8)   # Schulterkacheln
    m.sphere('wood', 0.055, TR(x=0.32, y=1.1, z=0.86), seg=8)
    for s in (-1, 1):
        m.torus('gold', 0.058, 0.014, TR(x=s * 0.36 if s > 0 else -0.45, y=1.06 if s > 0 else 0.97, z=0.62 if s > 0 else 0.14, rz=math.pi / 2), seg=10, sec=4)  # Armreifen
    # Speer mit Dreizack
    d = Vector((0.02, 1.0, 0.9)).normalized()
    p0, p1 = Vector((0.32, 0.95, 0.5)), Vector((0.32, 0.95, 0.5)) + Vector((0.02, 1.0, 0.9)).normalized() * 1.25
    m.tube('gold', [tuple(p0), tuple(p1)], [0.024, 0.02], seg=7)
    m.sphere('gold', 0.035, TR(x=p1.x, y=p1.y, z=p1.z), seg=6)
    for dx in (-0.08, 0.0, 0.08):
        cone(m, 'gold', tuple(p1 + Vector((dx * 0.6, 0.0, 0.0))), tuple(d + Vector((dx * 1.6, 0.0, 0.0))), 0.3 if dx == 0 else 0.23, 0.026)
    m.tube('gold', [tuple(p1 - d * 0.02 + Vector((-0.08, -0.04, -0.01))), tuple(p1 + Vector((0, 0.0, 0.0)) + d * 0.02), tuple(p1 + Vector((0.08, -0.04, -0.01)))], [0.012, 0.012, 0.012], seg=4)
    # Schwingen
    for s in (-1, 1):
        wing(m, 'gold', 'wood', (s * 0.14, 1.08, -0.08), s, 1.05, 0.78, rows=3, n=9, sweep=0.55, droop=0.22, arm_role='gold')
    m.ao(lambda role, p: 0.6 + 0.4 * sstep(-0.3, 1.5, p.y))
    m.export(os.path.join(FH_DIR, 'valkyrie.glb'))


# ---------------------------------------------------------------- 3. Kraken- und Leviathan-Schädel
def build_leviathan_skull():
    m = Model('leviathan_skull')
    plinth(m, 1.15)
    m.blob('bone', 0.44, TR(y=0.98, z=0.1), subdiv=3, noise=0.05, seed=3, squash=0.95)     # Hirnschale
    m.tube('bone', [(0, 1.0, 0.3), (0, 0.95, 0.68), (0, 0.86, 1.0), (0, 0.8, 1.26)], [0.34, 0.26, 0.2, 0.15], seg=12, vscale=0.6)   # Schnauze
    m.blob('bone', 0.15, TR(y=0.8, z=1.28), subdiv=1, noise=0.02, squash=0.7)
    m.tube('bone', [(0, 1.42, 0.0), (0, 1.38, 0.3), (0, 1.22, 0.6)], [0.07, 0.06, 0.04], seg=6)                                   # Scheitelkamm
    for s in (-1, 1):
        # Augenhöhlen mit glimmenden Edelsteinen
        m.blob('dark', 0.105, TR(x=s * 0.22, y=1.02, z=0.5), subdiv=2, noise=0.0, squash=1.0)
        m.sphere('gem', 0.05, TR(x=s * 0.215, y=1.0, z=0.57), seg=8)
        m.tube('bone', [(s * 0.1, 1.3, 0.2), (s * 0.3, 1.27, 0.5), (s * 0.4, 1.12, 0.78)], [0.08, 0.075, 0.05], seg=7)              # Brauenwulst
        m.blob('dark', 0.035, TR(x=s * 0.07, y=0.9, z=1.34), subdiv=1, noise=0.0)                                                   # Nasenlöcher
        # Wangenknochen, Jochbogen
        m.tube('bone', [(s * 0.33, 0.86, 0.5), (s * 0.34, 0.76, 0.85), (s * 0.24, 0.66, 1.1)], [0.07, 0.06, 0.04], seg=6)
        # Hauer: gebogen, mit Goldspitze
        pts = [(s * 0.22, 0.72, 0.9), (s * 0.34, 0.5, 1.0), (s * 0.38, 0.26, 1.18), (s * 0.3, 0.1, 1.36)]
        m.tube('bone', pts, [0.06, 0.052, 0.036, 0.012], seg=6)
        cone(m, 'gold', pts[-1], (-s * 0.5, -0.4, 0.8), 0.12, 0.014)
        m.torus('gold', 0.058, 0.012, TR(x=pts[0][0] + s * 0.015, y=pts[0][1] - 0.04, z=pts[0][2] + 0.0, rz=math.pi / 2 + 0.3 * s), seg=10, sec=4)
        # Unterkiefer, leicht geöffnet
        m.tube('bone', [(s * 0.26, 0.66, 0.2), (s * 0.2, 0.46, 0.7), (s * 0.12, 0.42, 1.12), (0, 0.46, 1.3)], [0.1, 0.085, 0.065, 0.05], seg=8)
        for k in range(9):                                                                   # Zähne oben und unten
            z = 0.62 + k * 0.085
            cone(m, 'bone', (s * (0.2 - k * 0.012), 0.76 - k * 0.01, z), (0, -1, 0.1), 0.13 - 0.006 * k + (0.1 if k == 2 else 0), 0.03)
            if k < 8: cone(m, 'bone', (s * (0.14 - k * 0.008), 0.5 - k * 0.003, 0.6 + k * 0.085), (0, 1, -0.05), 0.1 - 0.004 * k, 0.026)
    m.blob('dark', 0.19, TR(y=0.6, z=0.95), subdiv=1, noise=0.0, squash=0.6)                # Maulinneres
    # Tentakel-Ornamente: vier Arme winden sich vom Sockel um den Schädel, Saugnäpfe aus Bein
    for s in (-1, 1):
        tentacle(m, 'bronze', s, (s * 0.42, 0.05, -0.2), 1.3, 0.55, 0.03, 0.1)
        tentacle(m, 'bronze', s, (s * 0.3, 0.0, -0.45), 1.05, 0.7, 0.04, 0.08)
        m.torus('gold', 0.08, 0.014, TR(x=s * 0.43, y=0.12, z=-0.18, rz=math.pi / 2), seg=10, sec=4)
    # Goldene Kette (Stirnband) als Tribut
    m.torus('gold', 0.42, 0.018, TR(y=1.0, z=0.08, rx=0.25), seg=24, sec=4)
    m.ao(lambda role, p: 0.6 + 0.4 * sstep(-0.3, 1.5, p.y))
    m.export(os.path.join(FH_DIR, 'leviathan_skull.glb'))


# ---------------------------------------------------------------- 4. Vergoldeter Wappengreif
def build_royal_griffin():
    m = Model('royal_griffin')
    plinth(m)
    spine = [(0, 0.04, -0.38), (0, 0.32, -0.3), (0, 0.66, -0.1), (0, 0.94, 0.16), (0, 1.12, 0.42)]
    rad = [0.3, 0.28, 0.24, 0.22, 0.17]
    m.tube('gold', spine, rad, seg=14, vscale=0.6)                                          # Löwenleib
    for k in range(14):                                                                      # Mähne und Brustfedern
        a = k / 14 * 2 * math.pi
        cone(m, 'gold', (math.sin(a) * 0.17, 1.02 + math.cos(a) * 0.17, 0.3), (math.sin(a) * 0.6, math.cos(a) * 0.6 - 0.1, -0.5), 0.3, 0.07, seg=5)
    for k in range(4):
        for s in (-1, 1):
            feather(m, 'gold', (s * (0.07 + 0.05 * k), 0.95 - 0.1 * k, 0.28 + 0.04 * k), (1, 0, 0), (s * 0.15, -0.55, 0.45), 0.2 + 0.03 * k, 0.12)
    # Adlerkopf mit Hakenschnabel und Krone
    m.blob('gold', 0.17, TR(y=1.2, z=0.46), subdiv=2, noise=0.02, seed=4, squash=1.05)
    m.tube('gold', [(0, 1.2, 0.54), (0, 1.19, 0.74), (0, 1.12, 0.9), (0, 1.0, 0.96), (0, 0.93, 0.93)], [0.1, 0.08, 0.055, 0.032, 0.008], seg=8)    # Oberschnabel
    m.tube('bronze', [(0, 1.1, 0.62), (0, 1.07, 0.8), (0, 1.03, 0.9)], [0.05, 0.04, 0.022], seg=6)                                              # Unterschnabel
    for s in (-1, 1):
        m.sphere('gem', 0.04, TR(x=s * 0.1, y=1.25, z=0.55), seg=7)
        m.tube('gold', [(s * 0.06, 1.33, 0.52), (s * 0.12, 1.31, 0.6), (s * 0.15, 1.27, 0.66)], [0.026, 0.024, 0.01], seg=5)                  # Braue
        m.leaf('gold', [Vector((s * 0.12, 1.3, 0.32)), Vector((s * 0.16, 1.4, 0.3)), Vector((s * 0.3, 1.52, 0.1)), Vector((s * 0.2, 1.3, 0.2))])  # Ohrbüschel
        m.leaf('gold', [Vector((s * 0.1, 1.24, 0.32)), Vector((s * 0.2, 1.28, 0.22)), Vector((s * 0.42, 1.22, 0.0)), Vector((s * 0.2, 1.18, 0.22))])
        m.blob('dark', 0.013, TR(x=s * 0.03, y=1.16, z=0.85), subdiv=1, noise=0.0)
    m.torus('gold', 0.14, 0.022, TR(y=1.37, z=0.44, rx=-0.12), seg=16, sec=5)                # Krone
    for k in range(7):
        a = k / 7 * 2 * math.pi
        x, z = math.sin(a) * 0.14, 0.44 + math.cos(a) * 0.14
        h = 0.2 if k % 2 == 0 else 0.13
        spike(m, 'gold', (x, 1.38, z), (math.sin(a) * 0.2, 1, math.cos(a) * 0.2), h, 0.03)
        m.sphere('gem' if k % 2 == 0 else 'gold', 0.024, TR(x=x * 1.1, y=1.38 + h + 0.02, z=0.44 + (z - 0.44) * 1.1), seg=5)
    # Vorderläufe: Löwenbeine mit Pranken und Krallen
    for s in (-1, 1):
        m.tube('gold', [(s * 0.14, 0.9, 0.2), (s * 0.2, 0.78, 0.52), (s * 0.18, 0.6, 0.78), (s * 0.16, 0.52, 0.94)], [0.1, 0.085, 0.07, 0.06], seg=8)
        m.blob('gold', 0.085, TR(x=s * 0.16, y=0.5, z=0.97), subdiv=2, noise=0.0, squash=0.8)
        for k in (-1, 0, 1):
            m.tube('bronze', [(s * 0.16 + k * 0.045, 0.5, 1.02), (s * 0.16 + k * 0.05, 0.43, 1.1), (s * 0.16 + k * 0.05, 0.34, 1.12)], [0.022, 0.018, 0.006], seg=5)
        m.torus('gold', 0.075, 0.016, TR(x=s * 0.19, y=0.7, z=0.82, rx=math.pi / 2 - 0.4), seg=10, sec=4)
    # Schwanzquaste
    m.tube('gold', [(0, 0.22, -0.52), (0, 0.5, -0.78), (0, 0.9, -0.82), (0, 1.12, -0.62)], [0.05, 0.045, 0.04, 0.03], seg=6)
    for k in range(6):
        a = (k - 2.5) * 0.35
        cone(m, 'gold', (0, 1.12, -0.62), (math.sin(a) * 0.7, 0.8, 0.5), 0.26, 0.05, seg=5)
    # Schwingen, aufgestellt und nach hinten geschwungen
    for s in (-1, 1):
        wing(m, 'gold', 'bronze', (s * 0.14, 1.0, -0.06), s, 1.0, 0.95, rows=4, n=10, sweep=0.65, droop=0.1, arm_role='gold')
    m.ao(lambda role, p: 0.6 + 0.4 * sstep(-0.3, 1.5, p.y))
    m.export(os.path.join(FH_DIR, 'royal_griffin.glb'))


for fn in (build_storm_dragon, build_valkyrie, build_leviathan_skull, build_royal_griffin):
    clear_gear(); fn()
