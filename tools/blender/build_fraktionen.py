# Bausteine der Weltmächte (England, Niederlande, Deutschland, Frankreich, Kurogane, Marine): Wappen-Banner, Bastionen,
# Kontor, Barockpavillon, geschwungene Kurogane-Dächer, Marine-Wachtürme und Zellenblock. Spiel-Koordinaten (Meter, Y oben,
# Vorderseite nach +Z), Boden bei y = 0. Saubere UVs (Boxprojektion je Fläche, am Ende ohne Überlappung gepackt), Bevel-Kanten.
#   blender --background --python tools/blender/headless.py -- build_fraktionen.py
# Rollen (das Spiel setzt Farben je Macht aus data/factions.ts, siehe world/factionArch.ts):
#   wall, stone, stonelight, roof, wood, darkwood, iron, gold, cloth, cloth2, light, dark, lantern, glass, rope.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

# Hilfen (block, courses, crenels, arch_ring, gable_roof_z, door, footing …) aus den Bau-Skripten übernehmen, ohne deren Modelle zu bauen
_src2 = open(os.path.join(HERE, 'build_arch2.py'), encoding='utf-8').read().split('# ======================= Fachwerkhaus')[0]
exec(_src2)
FAC_DIR = os.path.join(ROOT, 'public', 'models', 'factions')
ROLE_COL.update({'light': (0.95, 0.94, 0.9), 'lantern': (0.9, 0.12, 0.08), 'glass': (0.6, 0.72, 0.85), 'dark': (0.05, 0.05, 0.06)})
PI = math.pi

def ao_std(top=3.0):
    return lambda role, p: 0.6 + 0.4 * sstep(0.0, top, p.y)

def prism(m, role, pts2, z, th=0.06, bevel=0.0):
    """Flaches Vieleck (konvex) in der XY-Ebene bei Tiefe z, Dicke th (für Wappen auf Tuch)."""
    m.rock(role, [(x, y, z + dz) for (x, y) in pts2 for dz in (-th / 2, th / 2)], Matrix.Identity(4), bevel=bevel)

def edge_boxes(m, role, P, y, h, th, shrink=1.0, skip=(), gap=None):
    """Kastenreihe entlang der Kanten eines Vielecks (Brüstung, Gesims); gap = (Länge, Lücke) für Schießscharten."""
    n = len(P)
    for i in range(n):
        if i in skip: continue
        a = Vector((P[i][0] * shrink, P[i][1] * shrink)); b = Vector((P[(i + 1) % n][0] * shrink, P[(i + 1) % n][1] * shrink))
        d = b - a; L = d.length; ang = math.atan2(d.x, d.y)
        if gap:
            seg, hole = gap
            k = max(1, int(L / (seg + hole)))
            for j in range(k):
                t0 = (j * (seg + hole) + hole / 2) / L; t1 = min(1.0, (j * (seg + hole) + hole / 2 + seg) / L)
                c = a + d * ((t0 + t1) / 2)
                m.box(role, (th, h, (t1 - t0) * L), TR(x=c.x, y=y + h / 2, z=c.y, ry=ang))
        else:
            c = (a + b) / 2
            m.box(role, (th, h, L + th * 0.6), TR(x=c.x, y=y + h / 2, z=c.y, ry=ang))

def cannon(m, x, y, z, ry=0.0, s=1.0):
    """Kanone auf Rädern (Rohr zeigt nach +Z, dann um Y gedreht)."""
    T = TR(x=x, y=y, z=z, ry=ry)
    m.cyl('iron', 0.24 * s, 2.0 * s, T @ TR(y=0.55 * s, z=0.2 * s, rx=PI / 2 - 0.05), seg=10)
    m.sphere('iron', 0.29 * s, T @ TR(y=0.58 * s, z=-0.78 * s), seg=8)
    m.box('darkwood', (0.8 * s, 0.34 * s, 1.5 * s), T @ TR(y=0.28 * s))
    for sx in (-1, 1): m.cyl('darkwood', 0.34 * s, 0.12 * s, T @ TR(x=sx * 0.5 * s, y=0.34 * s, rz=PI / 2), seg=10)

def pole_and_cloth(m, H, cw, ch, role_cloth='cloth', x=0.0):
    """Mast mit Querstange; Tuch hängt als Rechteck mit zwei Schwalbenschwänzen. Gibt (x, y_oben, y_unten) zurück."""
    m.tube('darkwood', [(x, 0, 0), (x, H, 0)], [0.11, 0.065], seg=8, vscale=0.4)
    m.box('darkwood', (cw + 0.5, 0.1, 0.1), TR(x=x, y=H - 0.65))
    m.sphere('gold', 0.14, TR(x=x, y=H + 0.1), seg=8)
    m.box('stone', (0.9, 0.5, 0.9), TR(x=x, y=0.25))
    yt = H - 0.72; yb = yt - ch
    m.box(role_cloth, (cw, ch, 0.05), TR(x=x, y=(yt + yb) / 2))
    for sx in (-1, 1):                                    # Schwalbenschwanz
        pts = [(x + sx * cw / 2, yb), (x + sx * 0.02, yb), (x + sx * cw / 4, yb - 0.85)]
        prism(m, role_cloth, pts, 0.0, 0.05)
    return x, yt, yb

def flat_both(fn):
    for sz in (1, -1): fn(sz * 0.045, sz)

# ======================= Banner =======================
def banner_england():
    m = Model('banner_england'); x, yt, yb = pole_and_cloth(m, 9.0, 2.0, 4.2, 'cloth')
    def deco(z, sz):
        cy = (yt + yb) / 2 + 0.2
        m.box('light', (0.34, 3.5, 0.03), TR(x=x, y=cy, z=z)); m.box('light', (1.7, 0.34, 0.03), TR(x=x, y=cy + 0.5, z=z))
        m.box('cloth2', (0.8, 0.8, 0.03), TR(x=x - 0.6, y=yt - 0.5, z=z))
        m.box('gold', (2.0, 0.07, 0.03), TR(x=x, y=yt - 0.06, z=z)); m.box('gold', (2.0, 0.07, 0.03), TR(x=x, y=yb + 0.0, z=z))
    flat_both(deco); m.ao(ao_std(4.0)); m.export(os.path.join(FAC_DIR, 'banner_england.glb'))

def banner_niederlande():
    m = Model('banner_niederlande'); x, yt, yb = pole_and_cloth(m, 9.0, 2.0, 4.2, 'cloth')
    def deco(z, sz):
        ch = (yt - yb) / 3
        m.box('light', (2.0, ch, 0.03), TR(x=x, y=yt - ch * 1.5, z=z)); m.box('cloth2', (2.0, ch, 0.03), TR(x=x, y=yt - ch * 2.5, z=z))
        # VOC-Zeichen: V mit O darüber und C links
        m.tube('cloth2', [(x - 0.45, yt - 1.15, z), (x, yt - 2.1, z), (x + 0.45, yt - 1.15, z)], [0.09] * 3, seg=6, caps=True)
        m.torus('gold', 0.18, 0.04, TR(x=x, y=yt - 1.35, z=z, rx=PI / 2), seg=14, sec=5)
        m.torus('cloth2', 0.22, 0.05, TR(x=x - 0.6, y=yt - 1.7, z=z, rx=PI / 2), seg=12, sec=5, arc=PI * 1.4)
        m.box('gold', (2.0, 0.07, 0.03), TR(x=x, y=yt - 0.06, z=z))
    flat_both(deco); m.ao(ao_std(4.0)); m.export(os.path.join(FAC_DIR, 'banner_niederlande.glb'))

def banner_deutschland():
    m = Model('banner_deutschland'); x, yt, yb = pole_and_cloth(m, 9.0, 2.0, 4.2, 'cloth')
    def deco(z, sz):
        cy = (yt + yb) / 2 + 0.25
        m.box('light', (2.0, 1.3, 0.03), TR(x=x, y=cy, z=z))
        # Adler: Rumpf, Flügel mit Schwungfedern, Kopf, Schwanz (Gold auf Weiß, Schwarz am Rand)
        prism(m, 'dark', [(-0.16, cy + 0.38), (0.16, cy + 0.38), (0.22, cy - 0.05), (0.1, cy - 0.52), (-0.1, cy - 0.52), (-0.22, cy - 0.05)], z + sz * 0.012, 0.04)
        for s in (-1, 1):
            prism(m, 'dark', [(x + s * 0.16, cy + 0.3), (x + s * 0.92, cy + 0.58), (x + s * 0.8, cy + 0.12), (x + s * 0.94, cy - 0.12), (x + s * 0.6, cy - 0.1), (x + s * 0.16, cy - 0.12)], z + sz * 0.012, 0.04)
        m.sphere('dark', 0.13, TR(x=x, y=cy + 0.5, z=z + sz * 0.02), seg=8)
        prism(m, 'gold', [(x + 0.1, cy + 0.52), (x + 0.3, cy + 0.46), (x + 0.1, cy + 0.4)], z + sz * 0.02, 0.03)
        prism(m, 'gold', [(x - 0.1, cy - 0.5), (x + 0.1, cy - 0.5), (x + 0.14, cy - 0.8), (x, cy - 0.7), (x - 0.14, cy - 0.8)], z + sz * 0.012, 0.04)
        m.box('gold', (2.0, 0.07, 0.03), TR(x=x, y=yt - 0.06, z=z))
    flat_both(deco); m.ao(ao_std(4.0)); m.export(os.path.join(FAC_DIR, 'banner_deutschland.glb'))

def banner_frankreich():
    m = Model('banner_frankreich'); x, yt, yb = pole_and_cloth(m, 9.0, 2.0, 4.2, 'cloth')
    def lily(z, cx, cy, s):
        prism(m, 'gold', [(cx, cy + 0.62 * s), (cx + 0.22 * s, cy + 0.2 * s), (cx + 0.16 * s, cy - 0.1 * s), (cx - 0.16 * s, cy - 0.1 * s), (cx - 0.22 * s, cy + 0.2 * s)], z, 0.04)
        for sg in (-1, 1):
            m.tube('gold', [(cx + sg * 0.1 * s, cy - 0.02 * s, z), (cx + sg * 0.4 * s, cy + 0.26 * s, z), (cx + sg * 0.5 * s, cy - 0.04 * s, z), (cx + sg * 0.32 * s, cy - 0.16 * s, z)], [0.06 * s] * 4, seg=5, caps=True)
        m.box('gold', (0.62 * s, 0.1 * s, 0.04), TR(x=cx, y=cy - 0.12 * s, z=z))
        prism(m, 'gold', [(cx - 0.08 * s, cy - 0.17 * s), (cx + 0.08 * s, cy - 0.17 * s), (cx, cy - 0.5 * s)], z, 0.04)
    def deco(z, sz):
        lily(z + sz * 0.012, x, (yt + yb) / 2 + 0.1, 1.5)
        for k in (-1, 1): lily(z + sz * 0.012, x + k * 0.62, yt - 0.62, 0.45)
        m.box('light', (2.0, 0.08, 0.03), TR(x=x, y=yt - 0.06, z=z)); m.box('gold', (2.0, 0.07, 0.03), TR(x=x, y=yb + 0.04, z=z))
    flat_both(deco); m.ao(ao_std(4.0)); m.export(os.path.join(FAC_DIR, 'banner_frankreich.glb'))

def banner_kurogane():
    m = Model('banner_kurogane'); x, yt, yb = pole_and_cloth(m, 9.5, 2.0, 4.4, 'cloth2')
    def deco(z, sz):
        cy = (yt + yb) / 2 + 0.2
        # blutrote Klingenschnitte quer über das schwarze Tuch
        m.box('cloth', (2.4, 0.16, 0.03), TR(x=x, y=cy - 1.3, z=z, rz=0.62)); m.box('cloth', (2.0, 0.1, 0.03), TR(x=x, y=cy - 1.9, z=z, rz=0.62))
        # Dämonenmaske (Oni): Gesicht, Hörner, Augenschlitze, Fänge
        prism(m, 'cloth', [(x - 0.55, cy + 0.5), (x + 0.55, cy + 0.5), (x + 0.6, cy), (x + 0.38, cy - 0.6), (x - 0.38, cy - 0.6), (x - 0.6, cy)], z + sz * 0.012, 0.04)
        for s in (-1, 1):
            prism(m, 'cloth', [(x + s * 0.28, cy + 0.45), (x + s * 0.7, cy + 0.62), (x + s * 0.62, cy + 1.25)], z + sz * 0.012, 0.04)
            prism(m, 'dark', [(x + s * 0.1, cy + 0.18), (x + s * 0.46, cy + 0.3), (x + s * 0.4, cy + 0.04)], z + sz * 0.024, 0.03)
            prism(m, 'light', [(x + s * 0.2, cy - 0.28), (x + s * 0.26, cy - 0.52), (x + s * 0.12, cy - 0.3)], z + sz * 0.024, 0.03)
        prism(m, 'dark', [(x - 0.3, cy - 0.28), (x + 0.3, cy - 0.28), (x + 0.2, cy - 0.38), (x - 0.2, cy - 0.38)], z + sz * 0.024, 0.03)
        m.box('cloth', (2.0, 0.09, 0.03), TR(x=x, y=yt - 0.06, z=z))
    flat_both(deco)
    m.ao(ao_std(4.0)); m.export(os.path.join(FAC_DIR, 'banner_kurogane.glb'))

def banner_marine():
    m = Model('banner_marine'); x, yt, yb = pole_and_cloth(m, 9.0, 2.0, 4.2, 'light')
    def deco(z, sz):
        m.box('cloth2', (2.0, 0.55, 0.03), TR(x=x, y=yt - 0.4, z=z)); m.box('cloth2', (2.0, 0.55, 0.03), TR(x=x, y=yb + 0.3, z=z))
        m.box('gold', (2.0, 0.05, 0.03), TR(x=x, y=yt - 0.72, z=z)); m.box('gold', (2.0, 0.05, 0.03), TR(x=x, y=yb + 0.6, z=z))
        cy = (yt + yb) / 2 - 0.05
        # Anker mit Ring, Schaft, Stock und Armen; darüber eine Möwe
        m.torus('cloth2', 0.15, 0.04, TR(x=x, y=cy + 0.45, z=z, rx=PI / 2), seg=12, sec=5)
        m.box('cloth2', (0.09, 1.3, 0.04), TR(x=x, y=cy - 0.1, z=z)); m.box('cloth2', (0.6, 0.08, 0.04), TR(x=x, y=cy + 0.28, z=z))
        m.torus('cloth2', 0.5, 0.045, TR(x=x, y=cy - 0.25, z=z, rx=PI / 2), seg=16, sec=5, arc=PI * 0.8)
        m.tube('cloth2', [(x - 0.8, cy + 1.0, z), (x - 0.4, cy + 1.3, z), (x, cy + 1.05, z), (x + 0.4, cy + 1.3, z), (x + 0.8, cy + 1.0, z)], [0.045] * 5, seg=5, caps=True)
    flat_both(deco); m.ao(ao_std(4.0)); m.export(os.path.join(FAC_DIR, 'banner_marine.glb'))

# ======================= Bastion (England, Sternfestung) =======================
def build_bastion_stern():
    m = Model('bastion_stern')
    P = [(-4.6, -3.6), (4.6, -3.6), (6.2, 1.6), (0.0, 8.8), (-6.2, 1.6)]
    pts = [(x * 1.14, -1.4, z * 1.14) for x, z in P] + [(x * 0.95, 5.5, z * 0.95) for x, z in P]
    m.rock('stonelight', pts, Matrix.Identity(4), bevel=0.08)                              # geböschte Wand (Anlauf)
    m.rock('stone', [(x * 0.9, 5.3, z * 0.9) for x, z in P] + [(x * 0.9, 5.7, z * 0.9) for x, z in P], Matrix.Identity(4), bevel=0.04)
    for dy in (4.25,):
        edge_boxes(m, 'stonelight', P, dy, 0.28, 0.2, 1.04)                                # Kordonband
    edge_boxes(m, 'stone', P, 5.6, 1.15, 1.0, 0.9, skip=(0,), gap=(2.3, 1.15))             # Brüstung mit Schießscharten
    for sx in (-1, 1): cannon(m, sx * 4.2, 5.7, 3.1, ry=sx * 0.5 * -1 + (0.5 if sx > 0 else -0.5) * 0, s=1.0)
    cannon(m, 0.0, 5.7, 6.2, ry=0.0, s=1.0)
    # Wachtürmchen (Garita) an der Spitze, Pfeilscharten, Kegeldach
    tx, tz = 0.0, 7.0
    m.lathe('stonelight', [(1.0, 5.6), (0.95, 6.4), (0.95, 8.0), (1.05, 8.2)], TR(x=tx, z=tz), seg=12, caps=False)
    m.lathe('roof', [(1.35, 8.2), (0.5, 9.2), (0.0, 9.9)], TR(x=tx, z=tz), seg=12, caps=False)
    for a in (0.0, PI / 2, PI, 1.5 * PI): m.box('dark', (0.12, 0.5, 0.1), TR(x=tx + math.sin(a) * 0.96, y=7.2, z=tz + math.cos(a) * 0.96, ry=a))
    m.sphere('gold', 0.12, TR(x=tx, y=9.95, z=tz), seg=8)
    # Plattform und Flaggenmast
    m.box('stone', (7.0, 0.3, 5.5), TR(y=5.45, z=-0.4))
    m.tube('darkwood', [(0, 5.6, -1.6), (0, 11.0, -1.6)], [0.1, 0.06], seg=6, vscale=0.5)
    m.box('cloth', (1.5, 0.95, 0.04), TR(x=0.78, y=10.4, z=-1.6)); m.box('light', (1.5, 0.2, 0.05), TR(x=0.78, y=10.4, z=-1.6)); m.box('light', (0.2, 0.95, 0.05), TR(x=0.5, y=10.4, z=-1.6))
    # Ausgang nach hinten: Torbogen in der Rückwand
    m.box('dark', (2.0, 2.6, 0.2), TR(y=1.3, z=-3.75)); arch_ring(m, 0.0, 2.6, 1.0, 1.35, -3.78, 0.5)
    m.ao(lambda role, p: (0.6 + 0.4 * sstep(0.0, 4.0, p.y)) * (0.85 + 0.15 * sstep(4.2, 5.7, p.y)))
    m.export(os.path.join(FAC_DIR, 'bastion_stern.glb'))

# ======================= Kontor (Niederlande, Backstein mit Treppengiebel) =======================
def build_kontor():
    m = Model('kontor_giebel'); w, d, hw = 9.0, 7.0, 6.4
    footing(m, w, d)
    m.box('wall', (w, hw, d), TR(y=hw / 2))
    courses(m, w, d, hw, 1.6, 'stonelight', 0.1)
    for sx in (-1, 1): m.box('stonelight', (0.5, hw, 0.5), TR(x=sx * (w / 2 + 0.05), y=hw / 2, z=d / 2 + 0.05))   # Eckquader
    th = gable_roof_z(m, w, d, hw, 2.6, ow=0.4, go=0.55, rows=7, role='roof')
    gable_tri_z(m, 'wall', w, hw, 2.6, -d / 2 + 0.1, 0.4)
    # Treppengiebel an der Front
    widths = [8.4, 6.6, 4.9, 3.3, 1.8]
    y = hw
    for i, ww in enumerate(widths):
        sh = 0.95 if i < 4 else 1.3
        m.box('wall', (ww, sh, 0.55), TR(y=y + sh / 2, z=d / 2 + 0.05))
        m.box('stonelight', (ww + 0.25, 0.14, 0.7), TR(y=y + sh + 0.05, z=d / 2 + 0.07))
        y += sh + 0.1
    m.sphere('gold', 0.18, TR(y=y + 0.3, z=d / 2 + 0.05), seg=8)
    # Fenster in zwei Reihen und doppelte Ladetüren, Lastenbalken mit Rolle und Haken
    for row, yy in enumerate((2.0, 4.3)):
        for bx in (-2.8, 0.0, 2.8):
            m.box('darkwood', (0.95, 1.5, 0.14), TR(x=bx, y=yy + 0.75, z=d / 2 + 0.03))
            m.box('stonelight', (1.2, 0.14, 0.3), TR(x=bx, y=yy - 0.02, z=d / 2 + 0.12)); m.box('stonelight', (1.15, 0.2, 0.2), TR(x=bx, y=yy + 1.6, z=d / 2 + 0.08))
            m.box('iron', (0.05, 1.5, 0.05), TR(x=bx, y=yy + 0.75, z=d / 2 + 0.12)); m.box('iron', (0.9, 0.05, 0.05), TR(x=bx, y=yy + 0.75, z=d / 2 + 0.12))
    m.box('wood', (1.6, 1.9, 0.14), TR(y=hw + 1.6, z=d / 2 + 0.36)); m.box('iron', (1.62, 0.06, 0.05), TR(y=hw + 1.6, z=d / 2 + 0.45))
    m.box('darkwood', (0.2, 0.2, 2.3), TR(y=hw + 3.0, z=d / 2 + 1.4)); m.torus('iron', 0.2, 0.04, TR(y=hw + 3.0, z=d / 2 + 2.45, rz=PI / 2), seg=10, sec=4)
    m.tube('rope', [(0, hw + 2.9, d / 2 + 2.45), (0, hw + 0.4, d / 2 + 2.45)], [0.035, 0.035], seg=5)
    m.box('iron', (0.18, 0.4, 0.18), TR(y=hw + 0.3, z=d / 2 + 2.45))
    for sx in (-1, 1): m.box('darkwood', (1.25, 2.35, 0.16), TR(x=sx * 0.64, y=1.2, z=d / 2 + 0.04))
    m.box('stonelight', (3.0, 0.28, 0.4), TR(y=2.5, z=d / 2 + 0.08))
    # Kisten und Fässer an der Rampe
    barrel(m, 4.9, d / 2 - 0.4, 0.0, 1.0); barrel(m, 5.7, d / 2 - 1.0, 0.0, 0.9, 0.5); crate(m, -4.9, 0.0, d / 2 - 0.5, 0.9, 0.2)
    m.ao(ao_std(3.5)); m.export(os.path.join(FAC_DIR, 'kontor_giebel.glb'))

def build_kran_rad():
    """Hafenkran der Handelskompanie: Kranhaus, Ausleger und Tretrad."""
    m = Model('kran_rad')
    m.box('stone', (4.0, 0.9, 4.0), TR(y=0.35))
    for sx in (-1, 1):
        for sz in (-1, 1): m.tube('darkwood', [(sx * 1.4, 0.4, sz * 1.4), (sx * 0.9, 8.2, sz * 0.9)], [0.2, 0.15], seg=6, vscale=0.3)
    for yy in (2.0, 4.0, 6.0):
        k = 1.4 - (yy / 8.2) * 0.5
        m.box('wood', (2 * k, 0.16, 0.16), TR(y=yy, z=k)); m.box('wood', (2 * k, 0.16, 0.16), TR(y=yy, z=-k))
        m.box('wood', (0.16, 0.16, 2 * k), TR(y=yy, x=k)); m.box('wood', (0.16, 0.16, 2 * k), TR(y=yy, x=-k))
    m.box('roof', (2.6, 0.2, 2.6), TR(y=8.35))
    # Ausleger (Gaffelbalken) nach +Z und Strebe
    m.tube('darkwood', [(0, 7.4, -1.0), (0, 8.3, 2.6), (0, 8.1, 6.4)], [0.17, 0.15, 0.12], seg=6, vscale=0.3)
    m.tube('wood', [(0, 4.6, 0.6), (0, 7.5, 4.0)], [0.1, 0.09], seg=5, vscale=0.3)
    # Tretrad an der Seite (Speichenrad aus Holz mit Lauffläche)
    m.torus('wood', 2.55, 0.12, TR(x=1.6, y=3.6, rz=PI / 2), seg=24, sec=5)
    m.torus('darkwood', 2.3, 0.08, TR(x=1.6, y=3.6, rz=PI / 2), seg=24, sec=4)
    for k in range(8):
        a = k * PI / 4
        m.box('darkwood', (0.1, 0.12, 5.0), TR(x=1.6, y=3.6, rx=a))
    m.cyl('iron', 0.17, 0.9, TR(x=1.6, y=3.6, rz=PI / 2), seg=8)
    for k in range(10):
        a = k * PI / 5
        m.box('wood', (0.5, 0.06, 0.22), TR(x=1.6, y=3.6 + math.cos(a) * 2.3, z=math.sin(a) * 2.3, rx=-a))
    # Seil, Hakenblock, Kiste als Last
    m.tube('rope', [(0, 8.1, 6.3), (0, 3.2, 6.3)], [0.04, 0.04], seg=5)
    m.sphere('iron', 0.18, TR(y=3.1, z=6.3), seg=8); m.torus('iron', 0.14, 0.04, TR(y=2.85, z=6.3, rz=PI / 2), seg=10, sec=4)
    crate(m, 0.0, 1.0, 6.3, 1.2)
    for sx in (-1, 1): m.tube('rope', [(sx * 0.55, 2.2, 6.3 + sx * 0.0), (0, 2.9, 6.3)], [0.025, 0.025], seg=4)
    m.ao(ao_std(3.0)); m.export(os.path.join(FAC_DIR, 'kran_rad.glb'))

# ======================= Küstenbastion (Deutschland, Granit und Backstein) =======================
def build_bastion_granit():
    m = Model('bastion_granit'); w, d, h = 13.0, 9.0, 6.0
    block(m, 'stone', (w + 0.8, 3.2, d + 0.8), TR(y=-0.8), bevel=0.08)
    m.rock('stone', [(sx * (w / 2 + 0.5), -0.3, sz * (d / 2 + 0.5)) for sx in (-1, 1) for sz in (-1, 1)] + [(sx * w / 2, h, sz * d / 2) for sx in (-1, 1) for sz in (-1, 1)], Matrix.Identity(4), bevel=0.06)
    courses(m, w + 0.7, d + 0.7, h, 1.1, 'stonelight', 0.08)
    # drei Kasematten mit Backsteinbögen und Kanonenrohren
    for i, bx in enumerate((-4.0, 0.0, 4.0)):
        m.box('dark', (2.0, 2.4, 0.3), TR(x=bx, y=1.9, z=d / 2 + 0.28))
        arch_ring(m, bx, 3.1, 1.0, 1.45, d / 2 + 0.34, 0.55, role='wall')
        m.box('wall', (3.0, 0.4, 0.6), TR(x=bx, y=0.5, z=d / 2 + 0.34))
        m.cyl('iron', 0.3, 2.3, TR(x=bx, y=2.2, z=d / 2 + 0.55, rx=PI / 2), seg=10)
        m.torus('iron', 0.3, 0.07, TR(x=bx, y=2.2, z=d / 2 + 1.7, rx=PI / 2), seg=10, sec=4)
    # Brustwehr oben mit Scharten, Erdwall dahinter
    for sx in (-1, 1): m.box('stone', (0.9, 1.2, d), TR(x=sx * (w / 2 - 0.2), y=h + 0.6))
    for i in range(5):
        x = -w / 2 + 1.3 + i * (w - 2.6) / 4
        m.box('stone', (1.5, 1.2, 0.9), TR(x=x, y=h + 0.6, z=d / 2 - 0.35))
    m.box('stone', (w - 1.8, 0.25, d - 1.4), TR(y=h + 0.1, z=-0.4))
    m.box('darkwood', (1.6, 0.14, 1.4), TR(x=-2.5, y=h + 0.3, z=-1.5)); m.box('darkwood', (1.6, 0.14, 1.4), TR(x=2.5, y=h + 0.3, z=-1.5))
    for sx in (-1, 1): cannon(m, sx * 3.6, h + 0.32, d / 2 - 1.4, s=1.1)
    # runder Wachturm an der Rückecke mit Kegeldach und Mast
    tx, tz = -w / 2 + 0.2, -d / 2 + 0.2
    m.lathe('stone', [(2.7, -1.0), (2.4, 0.0), (2.2, 9.2), (2.35, 9.6)], TR(x=tx, z=tz), seg=14, caps=False)
    for yy in (3.0, 6.0): m.torus('stonelight', 2.28, 0.08, TR(x=tx, y=yy, z=tz), seg=20, sec=4)
    m.lathe('roof', [(2.9, 9.6), (1.0, 11.4), (0.0, 12.8)], TR(x=tx, z=tz), seg=14, caps=False)
    for a in (0.5, 2.0, 3.6, 5.2): m.box('dark', (0.12, 0.7, 0.14), TR(x=tx + math.sin(a) * 2.25, y=6.8, z=tz + math.cos(a) * 2.25, ry=a))
    m.tube('darkwood', [(tx, 12.7, tz), (tx, 16.0, tz)], [0.08, 0.05], seg=6)
    m.box('cloth', (1.5, 0.9, 0.04), TR(x=tx + 0.78, y=15.4, z=tz)); m.box('light', (1.5, 0.28, 0.05), TR(x=tx + 0.78, y=15.4, z=tz))
    m.ao(lambda role, p: (0.6 + 0.4 * sstep(0.0, 4.0, p.y)))
    m.export(os.path.join(FAC_DIR, 'bastion_granit.glb'))

# ======================= Barockpavillon (Frankreich) =======================
def build_pavillon():
    m = Model('pavillon_barock'); w, d, h = 12.0, 8.0, 6.2
    footing(m, w, d)
    for i in range(3): m.box('stonelight', (w + 1.2 - i * 0.5, 0.3, d + 1.2 - i * 0.5), TR(y=0.15 + i * 0.3))
    m.box('wall', (w, h, d), TR(y=0.9 + h / 2 - 0.9 + 0.0));
    courses(m, w, d, h, 1.2, 'stonelight', 0.06)
    # Pilaster mit vergoldeten Kapitellen, hohe Bogenfenster mit Glas
    for i, bx in enumerate((-5.4, -2.7, 0.0, 2.7, 5.4)):
        m.box('stonelight', (0.7, h - 0.8, 0.36), TR(x=bx, y=0.9 + (h - 0.8) / 2, z=d / 2 + 0.12))
        m.box('gold', (0.9, 0.22, 0.46), TR(x=bx, y=h - 0.1, z=d / 2 + 0.14)); m.box('stonelight', (0.9, 0.2, 0.46), TR(x=bx, y=1.0, z=d / 2 + 0.14))
    for bx in (-4.05, -1.35, 1.35, 4.05):
        m.box('glass', (1.5, 3.2, 0.1), TR(x=bx, y=3.2, z=d / 2 + 0.05)); arch_ring(m, bx, 4.8, 0.75, 1.0, d / 2 + 0.08, 0.3)
        m.box('iron', (0.06, 3.4, 0.06), TR(x=bx, y=3.2, z=d / 2 + 0.13)); m.box('iron', (1.5, 0.06, 0.06), TR(x=bx, y=3.2, z=d / 2 + 0.13))
        m.box('stonelight', (1.7, 0.18, 0.5), TR(x=bx, y=1.45, z=d / 2 + 0.2))
    # Gesims, Balustrade
    m.box('stonelight', (w + 0.9, 0.35, d + 0.9), TR(y=h + 0.2)); m.box('gold', (w + 0.95, 0.07, d + 0.95), TR(y=h + 0.42))
    for sx in range(-6, 7):
        m.lathe('stonelight', [(0.0, 0.0), (0.14, 0.06), (0.1, 0.3), (0.16, 0.5), (0.1, 0.62), (0.0, 0.66)], TR(x=sx * 0.92, y=h + 0.45, z=d / 2 + 0.3), seg=7)
        m.lathe('stonelight', [(0.0, 0.0), (0.14, 0.06), (0.1, 0.3), (0.16, 0.5), (0.1, 0.62), (0.0, 0.66)], TR(x=sx * 0.92, y=h + 0.45, z=-d / 2 - 0.3), seg=7)
    m.box('stonelight', (w + 0.7, 0.1, 0.16), TR(y=h + 1.14, z=d / 2 + 0.3)); m.box('stonelight', (w + 0.7, 0.1, 0.16), TR(y=h + 1.14, z=-d / 2 - 0.3))
    # Mansarddach: steiler Unterbau (Hüllkörper) und flacher Aufsatz in Schieferblau, Gauben, vergoldete Kämme, Laternenkuppel
    y0 = h + 0.6
    corners = lambda hw, hd, y: [(sx * hw, y, sz * hd) for sx in (-1, 1) for sz in (-1, 1)]
    m.rock('roof', corners(w / 2 + 0.3, d / 2 + 0.3, y0) + corners(w / 2 - 1.6, d / 2 - 1.5, y0 + 2.3), Matrix.Identity(4), bevel=0.05)
    m.rock('roof', corners(w / 2 - 1.6, d / 2 - 1.5, y0 + 2.3) + corners(w / 2 - 2.1, d / 2 - 2.0, y0 + 3.0), Matrix.Identity(4), bevel=0.04)
    for sz in (-1, 1): m.box('gold', (w - 3.0, 0.1, 0.12), TR(y=y0 + 3.02, z=sz * (d / 2 - 2.0)))
    for sx in (-1, 1): m.box('gold', (0.12, 0.1, d - 3.8), TR(x=sx * (w / 2 - 2.1), y=y0 + 3.02))
    for gx in (-3.6, 0.0, 3.6):
        m.box('wall', (1.1, 1.2, 1.0), TR(x=gx, y=y0 + 1.1, z=d / 2 - 0.2)); m.box('glass', (0.6, 0.8, 0.1), TR(x=gx, y=y0 + 1.1, z=d / 2 + 0.31))
        m.rock('roof', [(gx + sx, y0 + 1.7, sz) for sx in (-0.7, 0.7) for sz in (d / 2 - 0.9, d / 2 + 0.35)] + [(gx, y0 + 2.3, d / 2 - 0.3)], Matrix.Identity(4), bevel=0.02)
    m.lathe('gold', [(1.0, 0.0), (1.2, 0.2), (0.9, 0.8), (0.5, 1.5), (0.18, 1.9), (0.3, 2.1), (0.0, 2.9)], TR(y=y0 + 3.0), seg=12, caps=False)
    # Freitreppe
    for i in range(4): m.box('stonelight', (3.4 + i * 0.1, 0.22, 0.5), TR(y=0.11 + i * 0.22 - 0.1, z=d / 2 + 0.9 - i * 0.0 + 0.5 - i * 0.2))
    m.box('wood', (1.8, 2.8, 0.14), TR(y=1.4 + 0.9, z=d / 2 + 0.04))
    m.ao(ao_std(4.0)); m.export(os.path.join(FAC_DIR, 'pavillon_barock.glb'))

# ======================= Kurogane: geschwungene Dächer, Burg, Tor, Haus =======================
def curved_roof(m, role, w, d, y0, h, over=1.4, rows=8, lift=0.9, th=0.14):
    """Walmdach mit geschwungener Traufe: flach und nach oben gebogen an der Kante, steil zum First (Streifen je Seite)."""
    def prof(t):                                                      # t: 0 Traufe … 1 First
        return y0 + h * (t ** 1.8) + lift * (1 - t) ** 4
    for side in range(4):
        along_x = side < 2
        sgn = 1 if side % 2 == 0 else -1
        half_out = (d if along_x else w) / 2 + over
        half_len = (w if along_x else d) / 2 + over
        for i in range(rows):
            t0, t1 = i / rows, (i + 1) / rows
            tm = (t0 + t1) / 2
            dist0, dist1 = half_out * (1 - t0), half_out * (1 - t1)
            dd = dist0 - dist1; dy = prof(t1) - prof(t0)
            ang = math.atan2(dy, dd); sl = math.hypot(dd, dy) * 1.18
            L = 2 * half_len * (1 - 0.9 * tm) + 0.4
            dist = (dist0 + dist1) / 2; yy = prof(tm) + th * 0.5
            if along_x:
                m.box(role, (L, th, sl), TR(x=0, y=yy, z=sgn * dist, rx=ang * sgn))
            else:
                m.box(role, (sl, th, L), TR(x=sgn * dist, y=yy, z=0, rz=-ang * sgn))
    m.box(role, (max(0.5, (w - 2 * 0.9 * 0) * 0.12 + 0.6), 0.3, max(0.5, d * 0.12 + 0.6)), TR(y=prof(1.0) + 0.1))

def shachi(m, x, y, z, s=1.0, ry=0.0):
    """Goldener Dachfisch (Shachihoko): geschwungener Leib, hoher Schwanz."""
    T = TR(x=x, y=y, z=z, ry=ry)
    pts = [Vector(T @ Vector(p)) for p in [(0, 0, 0.0), (0, 0.5 * s, 0.25 * s), (0, 1.0 * s, 0.1 * s), (0, 1.35 * s, -0.4 * s), (0, 1.5 * s, -0.9 * s)]]
    m.tube('gold', [(p.x, p.y, p.z) for p in pts], [0.2 * s, 0.17 * s, 0.13 * s, 0.09 * s, 0.03 * s], seg=7, vscale=0.5)

def build_dach_kuro():
    """Kuroganes Burgturm: Steinsockel, drei Stockwerke mit geschwungenen Dächern, rote Laternen, Dachfische."""
    m = Model('dach_kuro'); rnd = random.Random(88)
    base = [(sx * 7.6, -1.6, sz * 7.6) for sx in (-1, 1) for sz in (-1, 1)] + [(sx * 5.9, 3.6, sz * 5.9) for sx in (-1, 1) for sz in (-1, 1)]
    m.rock('stone', base, Matrix.Identity(4), bevel=0.12)
    for k in range(5):                                                 # Fugen des Sockels
        yy = -0.6 + k * 0.85; ww = 7.6 - (yy + 1.6) / 5.2 * 1.7
        m.box('stonelight', (ww * 2 + 0.06, 0.05, ww * 2 + 0.06), TR(y=yy))
    m.box('stone', (11.0, 0.35, 11.0), TR(y=3.7))
    y = 3.85
    tiers = [(9.6, 4.0, 2.4), (7.2, 3.6, 2.2), (4.8, 3.2, 2.0)]
    for k, (ww, hh, rise) in enumerate(tiers):
        m.box('wall', (ww, hh, ww), TR(y=y + hh / 2))
        for s in (-1, 1):
            for t in (-0.5, -0.25, 0.0, 0.25, 0.5):
                m.box('darkwood', (0.18, hh, 0.18), TR(x=s * ww / 2, y=y + hh / 2, z=t * ww)); m.box('darkwood', (0.18, hh, 0.18), TR(x=t * ww, y=y + hh / 2, z=s * ww / 2))
        for yy in (y + 0.08, y + hh - 0.08):
            m.box('darkwood', (ww + 0.25, 0.2, ww + 0.25), TR(y=yy))
        # Gitterfenster (glühend rot erleuchtet) und rotes Fensterband
        for s in (-1, 1):
            for t in (-0.3, 0.3):
                m.box('lantern', (0.9, 1.1, 0.08), TR(x=t * ww, y=y + hh * 0.55, z=s * (ww / 2 + 0.1)))
                m.box('lantern', (0.08, 1.1, 0.9), TR(x=s * (ww / 2 + 0.1), y=y + hh * 0.55, z=t * ww))
        m.box('cloth', (ww + 0.3, 0.22, ww + 0.3), TR(y=y + hh + 0.02))
        # Umgang mit roten Geländern am zweiten Stock
        if k == 1:
            m.box('darkwood', (ww + 1.6, 0.16, ww + 1.6), TR(y=y + 0.05))
            for s in (-1, 1):
                m.box('cloth', (0.1, 0.1, ww + 1.6), TR(x=s * (ww / 2 + 0.8), y=y + 0.95)); m.box('cloth', (ww + 1.6, 0.1, 0.1), TR(y=y + 0.95, z=s * (ww / 2 + 0.8)))
                for t in range(-3, 4): m.box('darkwood', (0.08, 0.9, 0.08), TR(x=s * (ww / 2 + 0.8), y=y + 0.5, z=t * (ww + 1.6) / 7)); m.box('darkwood', (0.08, 0.9, 0.08), TR(x=t * (ww + 1.6) / 7, y=y + 0.5, z=s * (ww / 2 + 0.8)))
        curved_roof(m, 'roof', ww, ww, y + hh + 0.15, rise, over=1.5 - k * 0.12, rows=7, lift=0.9 - k * 0.1)
        # rote Laternen unter den Traufecken
        for sx in (-1, 1):
            for sz in (-1, 1):
                cx, cz = sx * (ww / 2 + 1.3), sz * (ww / 2 + 1.3)
                m.tube('iron', [(cx, y + hh + 0.5, cz), (cx, y + hh - 0.5, cz)], [0.02, 0.02], seg=4)
                m.sphere('lantern', 0.3, TR(x=cx, y=y + hh - 0.85, z=cz), seg=8)
                m.box('iron', (0.34, 0.06, 0.34), TR(x=cx, y=y + hh - 0.52, z=cz)); m.box('iron', (0.34, 0.06, 0.34), TR(x=cx, y=y + hh - 1.18, z=cz))
        y += hh + 0.15 + rise * 0.55 + 0.1
    # Dachfische auf dem obersten First und Spitze
    shachi(m, 0.9, y + 0.15, 0.0, 1.6, 0.0); shachi(m, -0.9, y + 0.15, 0.0, 1.6, PI)
    m.tube('iron', [(0, y, 0), (0, y + 2.8, 0)], [0.08, 0.04], seg=5); m.sphere('gold', 0.14, TR(y=y + 2.85), seg=6)
    # Tür im Sockel (Rampe) mit rotem Tuch
    m.box('dark', (2.2, 3.2, 0.3), TR(y=1.5, z=5.95)); m.box('darkwood', (2.0, 3.0, 0.2), TR(y=1.5, z=6.1)); m.box('cloth', (2.6, 0.3, 0.3), TR(y=3.3, z=6.2))
    m.ao(lambda role, p: (0.62 + 0.38 * sstep(-1.0, 4.0, p.y)))
    m.export(os.path.join(FAC_DIR, 'dach_kuro.glb'))

def build_tor_kuro():
    """Kuroganes Tor: zwei Pfosten, geschwungener Querbalken mit Dachaufsatz und rote Laterne."""
    m = Model('tor_kuro'); sp = 2.9
    for sx in (-1, 1):
        m.box('stone', (1.6, 0.6, 1.6), TR(x=sx * sp, y=0.1)); m.lathe('darkwood', [(0.5, 0.2), (0.45, 3.0), (0.42, 6.4), (0.5, 6.7)], TR(x=sx * sp), seg=10, caps=True)
        m.torus('cloth', 0.5, 0.07, TR(x=sx * sp, y=1.0), seg=12, sec=4); m.torus('cloth', 0.45, 0.07, TR(x=sx * sp, y=5.2), seg=12, sec=4)
    m.box('darkwood', (2 * sp + 1.6, 0.4, 0.46), TR(y=5.7))                                         # Nuki
    m.box('cloth', (2 * sp + 0.8, 0.28, 0.5), TR(y=5.35))
    # geschwungener oberer Balken (Kasagi): Mitte flach, Enden nach oben
    n = 9
    for i in range(n):
        t = (i / (n - 1)) * 2 - 1; x = t * (sp + 1.2); yy = 6.85 + 0.55 * (abs(t) ** 2.4); ang = 0.5 * t * abs(t)
        m.box('darkwood', (0.95, 0.4, 0.8), TR(x=x, y=yy, rz=ang))
    m.box('cloth', (2 * sp + 2.0, 0.12, 0.84), TR(y=6.62))
    curved_roof(m, 'roof', 2.2, 1.0, 7.4, 1.3, over=0.7, rows=5, lift=0.45)
    m.box('wood', (1.8, 0.8, 0.1), TR(y=5.0, z=0.28)); m.box('cloth', (1.4, 0.5, 0.06), TR(y=5.0, z=0.34))
    for sx in (-1, 1):
        m.tube('iron', [(sx * 1.4, 5.5, 0), (sx * 1.4, 4.6, 0)], [0.02, 0.02], seg=4); m.sphere('lantern', 0.34, TR(x=sx * 1.4, y=4.2), seg=8)
        m.box('iron', (0.4, 0.06, 0.4), TR(x=sx * 1.4, y=4.55)); m.box('iron', (0.4, 0.06, 0.4), TR(x=sx * 1.4, y=3.88))
        for k in range(5): m.tube('iron', [(sx * (sp + 0.62), 0.6 + k * 0.0, -0.4 + k * 0.2), (sx * (sp + 0.62), 2.0, -0.4 + k * 0.2)], [0.03, 0.01], seg=4)
    m.ao(ao_std(4.0)); m.export(os.path.join(FAC_DIR, 'tor_kuro.glb'))

def build_haus_kuro():
    """Kuroganes Haus: dunkles Holz, geschwungenes Dach, Veranda, rote Laterne an der Tür."""
    m = Model('haus_kuro'); w, d, h = 8.0, 6.0, 3.2
    m.box('stone', (w + 0.6, 0.9, d + 0.6), TR(y=0.0)); m.box('wall', (w, h, d), TR(y=0.45 + h / 2))
    for t in range(-4, 5):
        m.box('darkwood', (0.16, h, 0.16), TR(x=t * w / 8, y=0.45 + h / 2, z=d / 2 + 0.04)); m.box('darkwood', (0.16, h, 0.16), TR(x=t * w / 8, y=0.45 + h / 2, z=-d / 2 - 0.04))
    m.box('darkwood', (w + 0.3, 0.2, d + 0.3), TR(y=0.45 + h))
    for bx in (-2.2, 2.2): m.box('lantern', (1.3, 1.0, 0.08), TR(x=bx, y=2.2, z=d / 2 + 0.1))
    m.box('darkwood', (1.3, 2.3, 0.12), TR(y=1.6, z=d / 2 + 0.05)); m.box('cloth', (1.7, 0.2, 0.2), TR(y=2.85, z=d / 2 + 0.12))
    curved_roof(m, 'roof', w, d, 0.45 + h + 0.1, 2.2, over=1.3, rows=7, lift=0.8)
    m.box('wood', (w + 0.4, 0.14, 1.6), TR(y=0.55, z=d / 2 + 0.9))
    for sx in (-1, 1): m.box('darkwood', (0.14, 1.9, 0.14), TR(x=sx * (w / 2 + 0.1), y=1.5, z=d / 2 + 1.6))
    m.tube('iron', [(1.2, 2.8, d / 2 + 1.4), (1.2, 2.2, d / 2 + 1.4)], [0.02, 0.02], seg=4); m.sphere('lantern', 0.28, TR(x=1.2, y=1.95, z=d / 2 + 1.4), seg=8)
    m.ao(ao_std(3.0)); m.export(os.path.join(FAC_DIR, 'haus_kuro.glb'))

# ======================= Marine: Wachturm und Zellenblock =======================
def build_wachturm_marine():
    m = Model('wachturm_marine'); H = 21.0
    prof = [(3.2, -2.4), (3.05, -0.4), (2.95, 0.0), (2.6, 8.0), (2.35, H - 3.4), (2.45, H - 3.0)]
    m.lathe('wall', prof, TR(), seg=16, caps=False)
    for yy, r in ((5.0, 2.75), (10.5, 2.52), (15.0, 2.4)):
        m.torus('cloth2', r + 0.02, 0.18, TR(y=yy), seg=24, sec=4)
    for yy in (2.4, 7.7, 13.0, 18.0):
        for k in range(4):
            a = k * PI / 2 + yy * 0.3
            m.box('dark', (0.2, 0.9, 0.14), TR(x=math.sin(a) * 2.5, y=yy + 0.4, z=math.cos(a) * 2.5, ry=a)); m.box('stonelight', (0.4, 0.14, 0.24), TR(x=math.sin(a) * 2.52, y=yy - 0.08, z=math.cos(a) * 2.52, ry=a))
    # Umgang mit Geländer und Konsolen
    m.cyl('stonelight', 3.35, 0.3, TR(y=H - 3.2), seg=16)
    for k in range(16):
        a = k * 2 * PI / 16
        m.box('stonelight', (0.3, 0.6, 0.5), TR(x=math.sin(a) * 2.7, y=H - 3.55, z=math.cos(a) * 2.7, ry=a))
        m.box('wall', (0.14, 1.0, 0.14), TR(x=math.sin(a) * 3.25, y=H - 2.65, z=math.cos(a) * 3.25))
    m.torus('stonelight', 3.25, 0.08, TR(y=H - 2.15), seg=24, sec=4)
    # Laternenhaus: großes Glas, Eisenrahmen, blaues Dach mit Möwe als Wetterfahne
    m.lathe('glass', [(1.7, H - 3.0), (1.7, H - 0.6)], TR(), seg=12, caps=False)
    for k in range(12):
        a = k * 2 * PI / 12
        m.box('iron', (0.1, 2.5, 0.1), TR(x=math.sin(a) * 1.72, y=H - 1.8, z=math.cos(a) * 1.72))
    m.torus('iron', 1.72, 0.07, TR(y=H - 0.6), seg=14, sec=4); m.torus('iron', 1.72, 0.07, TR(y=H - 3.0), seg=14, sec=4)
    m.lathe('roof', [(2.3, H - 0.6), (1.8, H - 0.1), (0.9, H + 1.4), (0.0, H + 2.5)], TR(), seg=14, caps=False)
    m.torus('gold', 2.15, 0.07, TR(y=H - 0.5), seg=18, sec=4)
    m.tube('iron', [(0, H + 2.4, 0), (0, H + 3.8, 0)], [0.06, 0.03], seg=5)
    m.tube('gold', [(-0.7, H + 3.95, 0), (-0.3, H + 4.3, 0), (0, H + 4.0, 0), (0.3, H + 4.3, 0), (0.7, H + 3.95, 0)], [0.05] * 5, seg=5, caps=True)
    # Tür mit Bogen und Signalmast
    m.box('darkwood', (1.6, 2.7, 0.2), TR(y=1.35, z=2.95)); arch_ring(m, 0, 2.7, 0.8, 1.15, 2.98, 0.4)
    m.tube('darkwood', [(1.5, 9.0, 2.2), (4.5, 12.8, 2.2)], [0.07, 0.05], seg=6)
    m.box('cloth2', (1.3, 0.8, 0.04), TR(x=3.9, y=11.7, z=2.2, rz=0.0)); m.box('light', (1.3, 0.2, 0.05), TR(x=3.9, y=11.7, z=2.2))
    m.ao(lambda role, p: (0.6 + 0.4 * sstep(0.0, 5.0, p.y)))
    m.export(os.path.join(FAC_DIR, 'wachturm_marine.glb'))

def build_zellenblock():
    m = Model('zellenblock_marine'); w, d, h = 14.0, 9.0, 8.4
    footing(m, w, d)
    m.box('wall', (w, h, d), TR(y=h / 2))
    courses(m, w, d, h, 2.1, 'stonelight', 0.12)
    for sx in (-1, 1):
        m.box('stonelight', (0.6, h, 0.6), TR(x=sx * (w / 2 + 0.05), y=h / 2, z=d / 2 + 0.05)); m.box('stonelight', (0.6, h, 0.6), TR(x=sx * (w / 2 + 0.05), y=h / 2, z=-d / 2 - 0.05))
    # vergitterte Fenster: zwei Reihen, fünf Felder, auf Vorder- und Seitenwänden
    for yy in (3.2, 6.2):
        for k in range(5):
            bx = -w / 2 + 1.6 + k * (w - 3.2) / 4
            m.box('dark', (1.0, 1.2, 0.2), TR(x=bx, y=yy, z=d / 2 + 0.02)); m.box('stonelight', (1.3, 0.16, 0.34), TR(x=bx, y=yy - 0.66, z=d / 2 + 0.1)); m.box('stonelight', (1.3, 0.2, 0.3), TR(x=bx, y=yy + 0.68, z=d / 2 + 0.08))
            for j in range(-2, 3): m.box('iron', (0.06, 1.3, 0.08), TR(x=bx + j * 0.22, y=yy, z=d / 2 + 0.12))
            m.box('iron', (1.0, 0.07, 0.08), TR(x=bx, y=yy, z=d / 2 + 0.12))
        for k in range(3):
            bz = -d / 2 + 1.5 + k * (d - 3.0) / 2
            for sx in (-1, 1):
                m.box('dark', (0.2, 1.2, 1.0), TR(x=sx * (w / 2 + 0.02), y=yy, z=bz))
                for j in range(-2, 3): m.box('iron', (0.08, 1.3, 0.06), TR(x=sx * (w / 2 + 0.12), y=yy, z=bz + j * 0.22))
    # schweres Eisentor mit Nieten und Fallgitter
    m.box('dark', (2.6, 3.6, 0.3), TR(y=1.8, z=d / 2 + 0.02)); arch_ring(m, 0, 3.6, 1.3, 1.65, d / 2 + 0.04, 0.5)
    m.box('iron', (2.4, 3.5, 0.14), TR(y=1.75, z=d / 2 + 0.14))
    for j in range(-4, 5): m.box('darkwood', (0.05, 3.4, 0.05), TR(x=j * 0.28, y=1.75, z=d / 2 + 0.24))
    for r in range(6):
        for c in range(-4, 5): m.sphere('iron', 0.045, TR(x=c * 0.26, y=0.4 + r * 0.55, z=d / 2 + 0.22), seg=5)
    # Zinnenkranz und Wachecken-Türmchen mit Suchscheinwerfer
    m.box('stonelight', (w + 0.5, 0.25, d + 0.5), TR(y=h + 0.12))
    crenels(m, w + 0.3, d + 0.3, h + 0.2, role='stonelight', mh=1.0, mw=1.0, mt=0.6)
    for sx in (-1, 1):
        for sz in (-1, 1):
            cx, cz = sx * (w / 2 - 0.3), sz * (d / 2 - 0.3)
            m.lathe('wall', [(1.4, 0.0), (1.2, 2.0), (1.15, h + 2.4), (1.4, h + 2.7)], TR(x=cx, z=cz), seg=12, caps=False)
            m.lathe('roof', [(1.7, h + 2.7), (0.8, h + 3.8), (0.0, h + 5.0)], TR(x=cx, z=cz), seg=12, caps=False)
            m.lathe('glass', [(0.6, h + 1.4), (0.6, h + 2.2)], TR(x=cx + sx * 0.2, z=cz + sz * 0.2), seg=8, caps=False)
            m.box('iron', (0.2, 0.8, 0.2), TR(x=cx + sx * 0.2, y=h + 1.4, z=cz + sz * 0.2))
    m.box('cloth2', (w - 1.0, 0.7, 0.14), TR(y=h - 1.0, z=d / 2 + 0.06)); m.box('gold', (w - 1.0, 0.07, 0.16), TR(y=h - 0.58, z=d / 2 + 0.06))
    m.tube('darkwood', [(0, h + 0.4, -1.0), (0, h + 4.6, -1.0)], [0.09, 0.05], seg=6)
    m.box('light', (1.6, 1.0, 0.04), TR(x=0.85, y=h + 4.0, z=-1.0)); m.box('cloth2', (1.6, 0.25, 0.05), TR(x=0.85, y=h + 4.0, z=-1.0))
    m.ao(ao_std(4.5)); m.export(os.path.join(FAC_DIR, 'zellenblock_marine.glb'))

for fn in (banner_england, banner_niederlande, banner_deutschland, banner_frankreich, banner_kurogane, banner_marine,
           build_bastion_stern, build_kontor, build_kran_rad, build_bastion_granit, build_pavillon,
           build_dach_kuro, build_tor_kuro, build_haus_kuro, build_wachturm_marine, build_zellenblock):
    clear_gear(); fn()
