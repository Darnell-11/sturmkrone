# Bauten der zweiten Welt-Fassung (Piratenzeit, Karibik und Europa): Fachwerkhaus mit Überhang und Gaube, Kolonialhaus mit Balkon und
# Terrakottadach, Lagerhaus mit Lastenkran-Ausleger, Kapelle mit Glockenturm, Marktstand, Hafenkran, Zinnenturm, Zinnenmauer,
# Torhaus mit Fallgitter, Bergfried. Spiel-Koordinaten (Meter, Y oben, Tür/Vorderseite nach +Z), Boden bei y = 0.
#   blender --background --python tools/blender/headless.py -- build_arch2.py
# Rollen: wall, stone, stonelight, wood, darkwood, roof, iron, rope, gold, greenery, flower, cloth, cloth2, fruit1..3, paint.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

# Hilfsfunktionen (Dach, Fachwerk, Tür, Schornstein, Fundament, AO) aus build_arch.py übernehmen, ohne dessen Modelle neu zu bauen
_src = open(os.path.join(HERE, 'build_arch.py'), encoding='utf-8').read()
exec(_src.split('# ======================= Hütte')[0])
ROLE_COL.update({'greenery': (0.3, 0.5, 0.22), 'flower': (0.8, 0.25, 0.3), 'cloth': (0.7, 0.2, 0.15), 'cloth2': (0.9, 0.86, 0.75),
                 'fruit1': (0.85, 0.28, 0.17), 'fruit2': (0.9, 0.7, 0.22), 'fruit3': (0.43, 0.55, 0.24), 'paint': (0.5, 0.1, 0.1), 'gold': (0.89, 0.69, 0.29)})

def arch_ring(m, cx, cy, r_in, r_out, z, depth, role='stonelight', n=9, bevel=0.03):
    """Halbrunder Bogen aus Keilsteinen um eine Öffnung (Mittelpunkt des Halbkreises bei cx, cy)."""
    for k in range(n):
        a0 = math.pi * k / n; a1 = math.pi * (k + 1) / n
        pts = []
        for dz in (-depth / 2, depth / 2):
            for a, R in ((a0, r_in), (a1, r_in), (a1, r_out), (a0, r_out)):
                pts.append((cx + math.cos(a) * R, cy + math.sin(a) * R, z + dz))
        m.rock(role, pts, Matrix.Identity(4), bevel=bevel)

def vault_fill(m, cx, cy, r_in, half_w, top, z, depth, role='stone', n=16, bevel=0.0):
    """Mauerwerk rund um eine Bogenöffnung: Keile vom Bogen (Radius r_in) bis zum Rechteck (halbe Breite half_w, Oberkante top).
    So bleibt über und neben dem Bogen keine Lücke und die Öffnung ist wirklich offen."""
    def outer(a):
        c, s_ = math.cos(a), math.sin(a)
        tx = half_w / max(abs(c), 1e-4); ty = (top - cy) / max(s_, 1e-4)
        return min(tx, ty)
    corner_a = math.atan2(top - cy, half_w)
    for sgn in (1, -1):
        for k in range(n):
            a0 = (math.pi / 2) * k / n; a1 = (math.pi / 2) * (k + 1) / n
            # Winkel von der Senkrechten aus gezählt: Spiegelung links/rechts
            A0 = a0 if sgn == 1 else math.pi - a0; A1 = a1 if sgn == 1 else math.pi - a1
            pts2 = [(cx + math.cos(A0) * r_in, cy + math.sin(A0) * r_in), (cx + math.cos(A1) * r_in, cy + math.sin(A1) * r_in)]
            for aa in (A1, A0):
                t = outer(aa); pts2.append((cx + math.cos(aa) * t, cy + math.sin(aa) * t))
            lo, hi = sorted((a0, a1)) if sgn == 1 else sorted((math.pi - a0, math.pi - a1))
            ca = corner_a if sgn == 1 else math.pi - corner_a
            if min(A0, A1) < ca < max(A0, A1):
                t = outer(ca); pts2.append((cx + math.cos(ca) * t, cy + math.sin(ca) * t))
            pts = [(x, y, z + dz) for (x, y) in pts2 for dz in (-depth / 2, depth / 2)]
            m.rock(role, pts, Matrix.Identity(4), bevel=bevel)

def courses(m, w, d, h, step=0.9, role='stonelight', th=0.05, cx=0.0):
    """Waagerechte Steinbänder an allen vier Seiten (Gesimse): bricht flache Wände auf."""
    y = step
    while y < h - 0.2:
        m.box(role, (w + 0.08, th, d + 0.08), TR(x=cx, y=y))
        y += step

def crenels(m, w, d, y, n_x=None, n_z=None, role='stone', mh=0.9, mw=0.8, mt=0.6, inset=0.0):
    """Zinnenkranz auf einem Rechteck (Breite w, Tiefe d) in Höhe y."""
    nx = n_x or max(2, int(w / (mw * 1.8)))
    nz = n_z or max(2, int(d / (mw * 1.8)))
    for sz in (-1, 1):
        for i in range(nx):
            x = -w / 2 + (i + 0.5) * w / nx
            m.rock(role, [(x + dx, y + yy, sz * (d / 2 - mt / 2 - inset) + dz) for dx in (-mw / 2, mw / 2) for yy in (0, mh) for dz in (-mt / 2, mt / 2)], Matrix.Identity(4), bevel=0.04)
    for sx in (-1, 1):
        for i in range(nz):
            z = -d / 2 + (i + 0.5) * d / nz
            m.rock(role, [(sx * (w / 2 - mt / 2 - inset) + dx, y + yy, z + dz) for dx in (-mt / 2, mt / 2) for yy in (0, mh) for dz in (-mw / 2, mw / 2)], Matrix.Identity(4), bevel=0.04)

def gable_roof_z(m, w, L, y_w, rise, ow=0.6, go=0.5, rows=8, role='roof'):
    """Satteldach mit Firstrichtung entlang Z (Giebel nach vorn/hinten), für die Kapelle."""
    th = math.atan2(rise, w / 2)
    half = w / 2 + ow
    Ls = half / math.cos(th)
    for sx in (-1, 1):
        for i in range(rows):
            dist = (i + 0.5) * Ls / rows
            cx = sx * dist * math.cos(th); cy = y_w + rise - dist * math.sin(th) + 0.05
            m.box(role, (Ls / rows * 1.22, 0.1, L + 2 * go), TR(x=cx, y=cy, rz=-th * sx))
    m.box('darkwood', (0.2, 0.16, L + 2 * go + 0.1), TR(y=y_w + rise + 0.1))
    return th

def gable_tri_z(m, role, w, y_w, rise, z, t=0.3):
    m.rock(role, [(x, y, z + dz) for dz in (-t / 2, t / 2) for (x, y) in ((-w / 2, y_w), (w / 2, y_w), (0, y_w + rise))], Matrix.Identity(4), bevel=0.0)

def barrel(m, x, z, y=0.0, s=1.0, ry=0.0):
    m.lathe('wood', [(0.0, 0.0), (0.3 * s, 0.0), (0.37 * s, 0.25 * s), (0.4 * s, 0.5 * s), (0.37 * s, 0.75 * s), (0.3 * s, 1.0 * s), (0.0, 1.0 * s)], TR(x=x, y=y, z=z, ry=ry), seg=10)
    for yy, rr in ((0.12, 0.34), (0.38, 0.4), (0.62, 0.4), (0.88, 0.34)):
        m.torus('iron', rr * s, 0.018 * s, TR(x=x, y=y + yy * s, z=z), seg=12, sec=3)

def crate(m, x, y, z, s=0.8, ry=0.0):
    m.box('wood', (s, s, s), TR(x=x, y=y + s / 2, z=z, ry=ry))
    for k in (-1, 1):
        m.box('darkwood', (s * 1.02, 0.06, 0.07), TR(x=x, y=y + s / 2 + k * s * 0.3, z=z, ry=ry))

# ======================= Fachwerkhaus =======================
def build_fachwerk():
    m = Model('haus_fachwerk'); w, d, h1, h2, ov = 6.4, 5.2, 2.7, 2.5, 0.45
    rnd = random.Random(21)
    footing(m, w, d)
    m.box('wall', (w, h1, d), TR(y=h1 / 2))
    for sx in (-1, 1):
        for sz in (-1, 1):
            for k in range(4):
                block(m, 'stonelight', (0.5, 0.42, 0.5), TR(x=sx * (w / 2 - 0.2), y=0.4 + k * 0.7, z=sz * (d / 2 - 0.2)), bevel=0.035, jit=0.015, rnd=rnd)
    dd = d + 2 * ov
    m.box('wall', (w + 0.3, h2, dd), TR(y=h1 + h2 / 2))
    for yy in (h1 + 0.1, h1 + h2 - 0.1): m.box('darkwood', (w + 0.4, 0.2, dd + 0.1), TR(y=yy))
    for sz in (-1, 1):
        for k in range(int(w / 0.7)):
            m.box('darkwood', (0.16, 0.22, ov + 0.1), TR(x=-w / 2 + 0.45 + k * 0.7, y=h1 - 0.12, z=sz * (d / 2 + ov / 2)))
    frame_front(m, w + 0.3, dd, h1, h2, 5, braces=True, depth=0.08)
    frame_front(m, w, d, 0.15, h1 - 0.15, 5, braces=False, depth=0.05)
    th, Ls, wr = roof(m, w + 0.3, dd, h1 + h2, 2.7, ow=0.7, go=0.5, rows=10)
    gable_ends(m, 'wall', w + 0.3, dd, h1 + h2, 2.7)
    chimney(m, -w * 0.28, -0.3, h1 + h2 + 1.2, 2.2)
    door(m, -w * 0.18, d, h=2.1, w=1.1)
    shutters(m, w * 0.25, 1.75, d / 2 + 0.02)
    for x in (-w * 0.25, w * 0.25):
        shutters(m, x, h1 + 1.3, d / 2 + ov + 0.02, w=0.8, h=0.9)
        m.box('wood', (1.0, 0.2, 0.3), TR(x=x, y=h1 + 0.65, z=d / 2 + ov + 0.2))            # Blumenkasten
        m.blob('greenery', 0.28, TR(x=x, y=h1 + 0.85, z=d / 2 + ov + 0.2), subdiv=1, noise=0.25, seed=int(x * 10), squash=0.6)
        m.blob('flower', 0.12, TR(x=x + 0.25, y=h1 + 0.98, z=d / 2 + ov + 0.28), subdiv=1, noise=0.2, seed=3)
        m.blob('flower', 0.1, TR(x=x - 0.2, y=h1 + 0.96, z=d / 2 + ov + 0.3), subdiv=1, noise=0.2, seed=5)
    # Ausleger mit Handwerkerschild
    m.box('iron', (0.08, 0.08, 1.2), TR(x=w * 0.42, y=2.5, z=d / 2 + 0.7)); m.box('wood', (0.06, 0.6, 0.8), TR(x=w * 0.42, y=2.1, z=d / 2 + 0.95))
    m.ao(ao_house(h1 + h2, th, 0.7, dd, wr))
    m.export(os.path.join(ARCH_DIR, 'haus_fachwerk.glb'))

# ======================= Kolonialhaus (Karibik) =======================
def build_kolonial():
    m = Model('haus_kolonial'); w, d, h1, h2 = 7.2, 5.8, 3.1, 2.8
    rnd = random.Random(31)
    footing(m, w, d)
    m.box('wall', (w, h1 + h2, d), TR(y=(h1 + h2) / 2))
    m.box('stonelight', (w + 0.2, 0.5, d + 0.2), TR(y=0.25))                                  # Sockel
    for yy in (h1, h1 + h2 - 0.05): m.box('stonelight', (w + 0.3, 0.16, d + 0.3), TR(y=yy))     # Gesimse
    for sx in (-1, 1):                                                                        # Eckquaderung
        for k in range(8):
            block(m, 'stonelight', (0.55, 0.38, 0.55), TR(x=sx * (w / 2 - 0.1), y=0.7 + k * 0.72, z=d / 2 - 0.1), bevel=0.03, jit=0.01, rnd=rnd)
    # Erdgeschoss: Bogentür in der Mitte, zwei Bogenfenster
    z = d / 2
    for x, hh, ww in ((0, 2.3, 1.3), (-2.3, 1.5, 0.95), (2.3, 1.5, 0.95)):
        yb = 0.7 if x == 0 else 1.0
        if x == 0:
            m.box('darkwood', (ww, hh, 0.14), TR(x=x, y=0.15 + hh / 2, z=z + 0.03))
            for yy in (0.6, 1.6): m.box('iron', (ww * 0.92, 0.06, 0.04), TR(x=x, y=yy, z=z + 0.1))
            m.box('stonelight', (ww + 0.8, 0.16, 0.7), TR(x=x, y=0.08, z=z + 0.4))
            arch_ring(m, x, 0.15 + hh, ww / 2, ww / 2 + 0.28, z + 0.05, 0.3)
        else:
            m.box('stonelight', (ww + 0.45, 0.14, 0.34), TR(x=x, y=yb - 0.07, z=z + 0.12))
            arch_ring(m, x, yb + hh * 0.5, ww / 2, ww / 2 + 0.25, z + 0.04, 0.26)
            for sx in (-1, 1): m.box('stonelight', (0.24, hh * 0.5, 0.26), TR(x=x + sx * (ww / 2 + 0.12), y=yb + hh * 0.25, z=z + 0.04))
            shutters(m, x, yb + hh * 0.35, z + 0.02, w=ww, h=hh * 0.7)
    # Obergeschoss: Balkon über die ganze Front, Flügeltüren mit Läden
    bz = z + 0.75
    m.box('darkwood', (w + 0.7, 0.18, 1.5), TR(y=h1 + 0.02, z=z + 0.75 - 0.0))
    for i in range(int((w + 0.7) / 0.5) + 1):
        m.box('wood', (0.07, 0.1, 1.5), TR(x=-(w + 0.7) / 2 + i * 0.5, y=h1 - 0.14, z=z + 0.75))   # Balkenköpfe
    for x in (-w / 2 - 0.25, -w * 0.18, w * 0.18, w / 2 + 0.25):
        m.box('darkwood', (0.2, h1 - 0.1, 0.2), TR(x=x, y=(h1 - 0.1) / 2 + 0.05, z=z + 1.4))     # Stützen bis zum Boden
    pts = [(-w / 2 - 0.35, bz + 0.7), (w / 2 + 0.35, bz + 0.7), (w / 2 + 0.35, z + 0.05), (-w / 2 - 0.35, z + 0.05)]
    for i in range(4):
        if i == 3: continue
        a, b = pts[i], pts[(i + 1) % 4]
        ln = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(2, int(ln / 0.22))
        for k in range(n + 1):
            t = k / n
            m.box('wood', (0.05, 0.85, 0.05), TR(x=a[0] + (b[0] - a[0]) * t, y=h1 + 0.52, z=a[1] + (b[1] - a[1]) * t))
        m.box('darkwood', (abs(b[0] - a[0]) + 0.1 if i % 2 == 0 else 0.1, 0.08, abs(b[1] - a[1]) + 0.1 if i % 2 else 0.1), TR(x=(a[0] + b[0]) / 2, y=h1 + 0.98, z=(a[1] + b[1]) / 2))
    for x in (-w * 0.28, 0.0, w * 0.28):
        m.box('darkwood', (1.05, 2.1, 0.1), TR(x=x, y=h1 + 1.15, z=z + 0.03))
        m.box('wood', (0.9, 0.08, 0.04), TR(x=x, y=h1 + 1.15, z=z + 0.09))
        shutters(m, x, h1 + 1.15, z + 0.02, w=1.05, h=2.0)
        m.box('stonelight', (1.35, 0.14, 0.3), TR(x=x, y=h1 + 2.28, z=z + 0.07))
    # Walmdach mit Terrakotta, Firstkappen, Dachreiter
    ow = 0.9; y0 = h1 + h2; rise = 2.6
    top_w, top_d = w * 0.35, 0.0
    pts = [(sx * (w / 2 + ow), y0 - 0.1, sz * (d / 2 + ow)) for sx in (-1, 1) for sz in (-1, 1)] + [(sx * top_w / 2, y0 + rise, 0.0) for sx in (-1, 1)]
    m.rock('roof', pts, Matrix.Identity(4), bevel=0.04)
    m.box('roof', (w + 2 * ow + 0.2, 0.18, d + 2 * ow + 0.2), TR(y=y0 - 0.12))               # Traufkranz
    m.box('darkwood', (top_w + 0.3, 0.18, 0.24), TR(y=y0 + rise + 0.06))
    chimney(m, w * 0.28, -0.5, y0 + 0.6, 1.8)
    m.cyl('stonelight', 0.34, 0.9, TR(x=-w * 0.3, y=y0 + 1.55, z=0.2), seg=8)               # kleiner Rauchfang
    m.ao(lambda role, p: (0.7 + 0.3 * sstep(0.0, 1.4, p.y)) * (0.8 + 0.2 * sstep(y0 - 0.5, y0 + 1.5, p.y)) if role != 'roof' else 0.62 + 0.38 * sstep(y0, y0 + rise, p.y))
    m.export(os.path.join(ARCH_DIR, 'haus_kolonial.glb'))

# ======================= Lagerhaus =======================
def build_lagerhaus():
    m = Model('lagerhaus'); w, d, h = 10.4, 7.0, 4.3
    rnd = random.Random(41)
    footing(m, w, d)
    m.box('wall', (w, h, d), TR(y=h / 2))
    m.box('stonelight', (w + 0.2, 0.7, d + 0.2), TR(y=0.35))
    frame_front(m, w, d, 0.7, h - 0.7, 8, braces=True, depth=0.07)
    th, Ls, wr = roof(m, w, d, h, 3.3, ow=0.8, go=0.6, rows=11)
    gable_ends(m, 'wall', w, d, h, 3.3)
    z = d / 2
    for sx in (-1, 1):                                                                         # große Doppeltür
        m.box('darkwood', (1.55, 3.2, 0.14), TR(x=sx * 0.8, y=0.15 + 1.6, z=z + 0.04))
        for yy in (0.6, 1.6, 2.6): m.box('iron', (1.45, 0.09, 0.05), TR(x=sx * 0.8, y=yy, z=z + 0.13))
    m.box('stonelight', (3.5, 0.3, 0.4), TR(y=3.5, z=z + 0.08))
    m.box('stonelight', (4.2, 0.12, 1.2), TR(y=0.06, z=z + 0.6))
    # Ladeluke im Giebel mit Hebebalken, Rolle, Tau und Haken
    m.box('darkwood', (1.3, 1.5, 0.12), TR(x=-1.8, y=h - 0.3, z=z + 0.03)); m.box('darkwood', (0.1, 1.55, 0.2), TR(x=-1.8, y=h - 0.3, z=z + 0.05))
    m.box('darkwood', (0.2, 0.2, 2.2), TR(x=-1.8, y=h + 0.95, z=z + 0.7))                       # Hebebalken
    m.box('darkwood', (0.14, 1.0, 0.14), TR(x=-1.8, y=h + 0.5, z=z + 1.2, rx=-0.7))
    m.torus('iron', 0.18, 0.03, TR(x=-1.8, y=h + 0.95, z=z + 1.7, rz=math.pi / 2), seg=12, sec=3)
    m.tube('rope', [(-1.8, h + 0.95, z + 1.7), (-1.8, h - 0.8, z + 1.75), (-1.8, h - 2.0, z + 1.75)], [0.03] * 3, seg=4, vscale=1.0)
    m.torus('iron', 0.1, 0.03, TR(x=-1.8, y=h - 2.15, z=z + 1.75, rx=math.pi / 2), seg=8, sec=3)
    # Laderampe, Fässer, Kisten
    m.box('wood', (4.0, 0.4, 2.2), TR(x=3.2, y=0.2, z=z + 1.3))
    for x, zz in ((2.4, z + 1.2), (3.2, z + 1.6), (3.9, z + 1.0)): barrel(m, x, zz, 0.4)
    crate(m, 2.5, 0.4, z + 2.0, 0.8, 0.2); crate(m, 3.8, 0.4, z + 2.1, 0.7, -0.3)
    chimney(m, w * 0.33, -0.5, h + 1.0, 1.6)
    # Seitentür
    m.box('darkwood', (0.14, 2.0, 1.0), TR(x=w / 2 + 0.03, y=1.15, z=-1.0)); m.box('stonelight', (0.3, 0.2, 1.5), TR(x=w / 2 + 0.06, y=2.25, z=-1.0))
    m.ao(ao_house(h, th, 0.8, d, wr))
    m.export(os.path.join(ARCH_DIR, 'lagerhaus.glb'))

# ======================= Kapelle =======================
def build_kapelle():
    m = Model('kapelle'); w, L, h = 6.2, 10.0, 4.4
    rnd = random.Random(51)
    footing(m, w, L)
    m.box('stone', (w, h, L), TR(y=h / 2))
    courses(m, w, L, h, 1.0)
    for sx in (-1, 1):                                                                         # Strebepfeiler
        for z in (-3.2, 0.0, 3.2): block(m, 'stonelight', (0.6, h * 0.8, 0.9), TR(x=sx * (w / 2 + 0.2), y=h * 0.4, z=z), bevel=0.05)
    for sx in (-1, 1):                                                                         # lange Spitzbogenfenster-Rahmen
        for z in (-2.0, 1.6):
            m.box('stonelight', (0.3, 2.2, 1.1), TR(x=sx * (w / 2 + 0.05), y=2.4, z=z))
    th = gable_roof_z(m, w, L, h, 2.8, ow=0.55, go=0.45, rows=9)
    gable_tri_z(m, 'stone', w, h, 2.8, L / 2 - 0.15); gable_tri_z(m, 'stone', w, h, 2.8, -L / 2 + 0.15)
    # Glockenturm vor der Front (Tür nach +Z im Turm)
    tw = 3.0; tz = L / 2 + tw / 2 - 0.1; th2 = 8.2
    block(m, 'stone', (tw + 0.4, 1.0, tw + 0.4), TR(y=0.5, z=tz), bevel=0.05)
    m.box('stone', (tw, th2, tw), TR(y=th2 / 2, z=tz))
    for yy in (2.0, 4.0, 6.0): m.box('stonelight', (tw + 0.14, 0.14, tw + 0.14), TR(y=yy, z=tz))
    # Spitzbogen-Portal
    zf = tz + tw / 2
    m.box('darkwood', (1.7, 2.6, 0.14), TR(y=1.3, z=zf + 0.03))
    for yy in (0.7, 1.7): m.box('iron', (1.6, 0.08, 0.05), TR(y=yy, z=zf + 0.12))
    arch_ring(m, 0, 2.6, 0.85, 1.2, zf + 0.04, 0.35)
    m.box('stonelight', (2.9, 0.14, 1.0), TR(y=0.07, z=zf + 0.5))
    # Glockenstube offen mit Pfeilern, Glocke, Zinnen-Brüstung, Spitzdach mit Kreuz
    sy = th2
    for sx in (-1, 1):
        for sz in (-1, 1): m.box('stone', (0.5, 2.2, 0.5), TR(x=sx * (tw / 2 - 0.25), y=sy + 1.1, z=tz + sz * (tw / 2 - 0.25)))
    m.box('stonelight', (tw + 0.3, 0.3, tw + 0.3), TR(y=sy + 2.3, z=tz))
    m.lathe('iron', [(0.0, 0.0), (0.55, 0.0), (0.5, 0.3), (0.3, 0.9), (0.14, 1.0), (0.0, 1.0)], TR(y=sy + 0.5, z=tz), seg=10)
    m.box('darkwood', (0.1, 0.1, 1.6), TR(y=sy + 1.6, z=tz))
    pts = [(sx * (tw / 2 + 0.25), sy + 2.45, tz + sz * (tw / 2 + 0.25)) for sx in (-1, 1) for sz in (-1, 1)] + [(0.0, sy + 6.2, tz)] * 1
    m.rock('roof', pts, Matrix.Identity(4), bevel=0.0)
    m.box('iron', (0.08, 1.3, 0.08), TR(y=sy + 6.75, z=tz)); m.box('iron', (0.7, 0.08, 0.08), TR(y=sy + 6.9, z=tz))
    m.ao(lambda role, p: (0.65 + 0.35 * sstep(0.0, 2.5, p.y)) * (0.85 + 0.15 * sstep(h - 0.4, h + 1.0, p.y)) if role != 'roof' else 0.7 + 0.3 * sstep(h, h + 2.8, p.y))
    m.export(os.path.join(ARCH_DIR, 'kapelle.glb'))

# ======================= Marktstand =======================
def build_marktstand():
    m = Model('marktstand'); w, d = 3.4, 2.4
    for sx in (-1, 1):
        m.box('darkwood', (0.12, 2.5, 0.12), TR(x=sx * (w / 2 - 0.1), y=1.25, z=-d / 2 + 0.15))
        m.box('darkwood', (0.12, 2.1, 0.12), TR(x=sx * (w / 2 - 0.1), y=1.05, z=d / 2 - 0.15))
    m.box('wood', (w - 0.2, 0.1, 1.2), TR(y=0.95, z=0.25))                                      # Auslage
    m.box('darkwood', (w - 0.3, 0.7, 1.1), TR(y=0.5, z=0.25))
    m.box('wood', (w - 0.1, 0.07, 0.5), TR(y=0.55, z=-d / 2 + 0.55))
    n = 9
    for i in range(n):                                                                          # gestreifte Markise
        x = -w / 2 - 0.05 + (i + 0.5) * (w + 0.1) / n
        m.box('cloth' if i % 2 == 0 else 'cloth2', ((w + 0.1) / n * 1.02, 0.05, d + 0.3), TR(x=x, y=2.35, z=0.0, rx=0.2))
    for sx in (-1, 1): m.box('darkwood', (0.1, 0.1, d + 0.3), TR(x=sx * (w / 2 + 0.05), y=2.33, rx=0.2))
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        m.box('cloth' if i % 2 == 0 else 'cloth2', (w / n * 1.02, 0.28, 0.04), TR(x=x, y=2.1, z=d / 2 + 0.2))        # Volant
    for k in range(7):                                                                          # Obst, Fische, Säcke
        m.sphere(('fruit1', 'fruit2', 'fruit3')[k % 3], 0.13, TR(x=-1.2 + (k % 4) * 0.22, y=1.1 + (k // 4) * 0.2, z=0.0 + (k // 4) * 0.12), seg=8)
    m.lathe('wood', [(0.0, 0.0), (0.3, 0.0), (0.34, 0.18), (0.3, 0.3), (0.0, 0.3)], TR(x=0.3, y=1.0, z=0.3), seg=10)
    for k in range(5): m.sphere(('fruit2', 'fruit1')[k % 2], 0.1, TR(x=0.3 + (k - 2) * 0.1, y=1.34 + (k % 2) * 0.05, z=0.3), seg=8)
    m.blob('cloth2', 0.28, TR(x=-0.5, y=0.75, z=-0.5), subdiv=1, noise=0.15, seed=3, squash=0.8)                    # Sack
    crate(m, 1.15, 0.0, -0.6, 0.7, 0.3); barrel(m, -1.4, -0.7, 0.0, 0.8)
    m.ao(lambda role, p: 0.7 + 0.3 * sstep(0.0, 1.5, p.y))
    m.export(os.path.join(ARCH_DIR, 'marktstand.glb'))

# ======================= Hafenkran =======================
def build_kran():
    m = Model('kran'); H = 8.0
    block(m, 'stone', (3.6, 0.6, 3.6), TR(y=0.3), bevel=0.06)
    for sx in (-1, 1):                                                                         # zwei Stützen als A-Rahmen
        m.tube('darkwood', [(sx * 1.3, 0.5, -0.8), (sx * 0.35, H * 0.55, 0.0), (sx * 0.2, H, 0.2)], [0.22, 0.2, 0.17], seg=6, vscale=0.3)
        m.tube('darkwood', [(sx * 1.3, 0.5, 0.8), (sx * 0.35, H * 0.55, 0.0)], [0.2, 0.18], seg=6, vscale=0.3)
    for yy in (2.2, 4.0, 5.6):
        m.box('darkwood', (2.8 - yy * 0.28, 0.16, 0.2), TR(y=yy, z=0.0))
    m.box('darkwood', (0.3, 0.3, 8.6), TR(y=H + 0.1, z=2.6))                                    # Ausleger über den Kai
    m.tube('darkwood', [(0.0, H * 0.6, 0.0), (0.0, H * 0.85, 2.2), (0.0, H + 0.1, 4.0)], [0.12, 0.1, 0.09], seg=5, vscale=0.4)
    m.torus('iron', 0.22, 0.04, TR(y=H + 0.1, z=6.8, rz=math.pi / 2), seg=12, sec=3)
    m.tube('rope', [(0.0, H + 0.1, 6.8), (0.0, H - 2.0, 6.85), (0.0, H - 4.2, 6.85)], [0.04] * 3, seg=4, vscale=1.0)
    m.box('iron', (0.2, 0.4, 0.1), TR(y=H - 4.4, z=6.85))
    # Tretrad
    m.torus('darkwood', 1.7, 0.1, TR(x=1.9, y=3.0, z=0.2, rz=math.pi / 2), seg=20, sec=4)
    m.torus('darkwood', 1.7, 0.1, TR(x=-1.9, y=3.0, z=0.2, rz=math.pi / 2), seg=20, sec=4)
    for k in range(10):
        a = k * math.pi / 5
        m.box('darkwood', (3.9, 0.1, 0.1), TR(y=3.0 + math.sin(a) * 0.85, z=0.2 + math.cos(a) * 0.85, rx=a))
    m.cyl('darkwood', 0.2, 4.2, TR(y=3.0, z=0.2, rz=math.pi / 2), seg=8)
    # Ballast und Kisten am Fuß
    crate(m, 1.9, 0.6, -1.6, 0.8, 0.2); barrel(m, -1.8, -1.5, 0.6, 0.9)
    m.ao(lambda role, p: 0.65 + 0.35 * sstep(0.0, 4.0, p.y))
    m.export(os.path.join(ARCH_DIR, 'kran.glb'))

# ======================= Zinnenturm (rund) =======================
def build_turm_zinnen():
    m = Model('turm_zinnen'); R, H = 2.9, 11.0
    rnd = random.Random(61)
    # Mauerwerk: leicht nach oben verjüngter Schaft in Lagen, helle Gesimsringe
    prof = [(R + 0.6, -2.8), (R + 0.5, -0.8), (R + 0.5, 0.0), (R + 0.15, 0.9), (R, 1.8), (R - 0.02, H - 1.6), (R + 0.1, H - 1.3)]
    m.lathe('stone', prof, TR(), seg=16, caps=False)
    for yy in (2.4, 4.8, 7.2, 9.4): m.torus('stonelight', R - 0.02 + (0.05 if yy > 9 else 0), 0.07, TR(y=yy), seg=24, sec=4)
    # Kragsteine (Machikuli) und Wehrgang
    m.lathe('stone', [(R + 0.1, H - 1.3), (R + 0.7, H - 0.9), (R + 0.7, H - 0.1), (R - 0.4, H - 0.1)], TR(), seg=16, caps=False)
    for k in range(16):
        a = k * 2 * math.pi / 16
        m.box('stonelight', (0.36, 0.7, 0.5), TR(x=math.cos(a) * (R + 0.4), y=H - 1.1, z=math.sin(a) * (R + 0.4), ry=-a))
    m.cyl('darkwood', R + 0.55, 0.22, TR(y=H - 0.02), seg=16)                                  # Wehrgangboden
    N = 16
    for k in range(N):                                                                          # Zinnen rund um den Wehrgang
        a = k * 2 * math.pi / N
        m.rock('stone', [(math.cos(a + da) * rr, H + yy, math.sin(a + da) * rr) for da in (-0.1, 0.1) for rr in (R + 0.25, R + 0.7) for yy in (0.1, 1.0)], Matrix.Identity(4), bevel=0.04)
    # Pfeilscharten und Tür
    for yy, k in ((4.4, 4), (7.0, 4), (9.0, 6)):
        for j in range(k):
            a = j * 2 * math.pi / k + 0.4 + yy
            m.box('iron', (0.08, 0.9, 0.34), TR(x=math.cos(a) * (R - 0.02), y=yy, z=math.sin(a) * (R - 0.02), ry=-a))
    z = R
    m.box('darkwood', (1.5, 2.5, 0.14), TR(y=1.45, z=z + 0.05))
    for yy in (0.8, 2.0): m.box('iron', (1.4, 0.08, 0.05), TR(y=yy, z=z + 0.14))
    arch_ring(m, 0, 2.7, 0.75, 1.08, z + 0.02, 0.4)
    # Fahnenmast
    m.tube('darkwood', [(0, H, 0), (0, H + 3.2, 0)], [0.1, 0.06], seg=6, vscale=0.5)
    m.box('cloth', (1.5, 0.9, 0.04), TR(x=0.8, y=H + 2.6, z=0.0))
    m.sphere('gold', 0.14, TR(y=H + 3.3), seg=8)
    m.ao(lambda role, p: (0.62 + 0.38 * sstep(0.0, 4.0, p.y)) * (0.85 + 0.15 * sstep(H - 2.0, H, p.y)))
    m.export(os.path.join(ARCH_DIR, 'turm_zinnen.glb'))

# ======================= Zinnenmauer-Segment =======================
def build_mauer_zinnen():
    m = Model('mauer_zinnen'); Lw, T, H = 6.0, 1.7, 5.4
    rnd = random.Random(71)
    block(m, 'stone', (Lw + 0.1, 3.2, T + 0.6), TR(y=-0.9), bevel=0.06)                       # Sockel mit Anlauf, tief im Boden
    m.box('stone', (Lw, H, T), TR(y=H / 2))
    courses(m, Lw, T, H, 0.9, 'stonelight', 0.06)
    m.box('stonelight', (Lw + 0.1, 0.22, T + 0.4), TR(y=H + 0.05))                              # Wehrgang-Abschluss
    for i in range(int(Lw / 1.5)):                                                              # Zinnen vorn und hinten
        x = -Lw / 2 + 0.75 + i * 1.5
        for sz in (-1, 1):
            block(m, 'stone', (0.95, 1.0, 0.5), TR(x=x, y=H + 0.7, z=sz * (T / 2 - 0.02)), bevel=0.05)
    m.box('wood', (Lw, 0.1, T - 1.0), TR(y=H + 0.2))
    for k in range(3):                                                                          # Strebepfeiler auf der Rückseite
        block(m, 'stonelight', (0.7, H * 0.8, 0.9), TR(x=-Lw / 2 + 0.6 + k * 2.4, y=H * 0.4, z=-T / 2 - 0.4), bevel=0.05)
    m.ao(lambda role, p: (0.62 + 0.38 * sstep(0.0, 3.5, p.y)))
    m.export(os.path.join(ARCH_DIR, 'mauer_zinnen.glb'))

# ======================= Torhaus =======================
def build_torhaus():
    m = Model('torhaus'); W, D, H = 15.0, 6.4, 9.0; tw = 4.6; gap = W - 2 * tw
    rnd = random.Random(81)
    for sx in (-1, 1):
        cx = sx * (W / 2 - tw / 2)
        block(m, 'stone', (tw + 0.6, 3.4, D + 0.6), TR(x=cx, y=-0.7), bevel=0.07)
        m.box('stone', (tw, H, D), TR(x=cx, y=H / 2))
        courses(m, tw, D, H, 1.0, cx=cx)
        for yy in (H - 1.1,): m.box('stonelight', (tw + 0.7, 0.4, D + 0.7), TR(x=cx, y=yy))
        m.box('stone', (tw + 0.8, 1.0, D + 0.8), TR(x=cx, y=H + 0.2))
        crenels(m, tw + 0.8, D + 0.8, H + 0.7, role='stone', mh=1.0, mw=0.85, mt=0.5)
        for j in range(3): m.box('iron', (0.1, 1.0, 0.34), TR(x=cx - 0.0 + (j - 1) * 1.2, y=5.2, z=D / 2 + 0.0))
        m.box('iron', (0.34, 1.0, 0.1), TR(x=cx + sx * tw / 2, y=5.2, z=0.0))
    # Durchgang: Rundbogen, Mauerwerk bis zur Oberkante 6,4 m ohne Lücken, darüber Obergeschoss mit Wehrerker
    ar = gap / 2 - 0.9; cyA = 3.2; topP = 6.4
    for sz, zz in ((1, D / 2), (-1, -D / 2)):
        arch_ring(m, 0, cyA, ar, ar + 0.5, zz + sz * 0.05, 0.6, n=11)
    vault_fill(m, 0, cyA, ar, gap / 2 + 0.1, topP, 0.0, D, role='stone', n=14)
    for sx in (-1, 1): m.box('stone', (gap / 2 + 0.1 - ar, cyA, D), TR(x=sx * (ar + (gap / 2 + 0.1 - ar) / 2), y=cyA / 2))
    block(m, 'stonelight', (gap + 0.4, 0.5, D + 0.2), TR(y=topP + 0.1), bevel=0.05)
    m.box('stone', (gap + 0.2, H - topP - 0.35, D), TR(y=topP + 0.35 + (H - topP - 0.35) / 2))
    for i in range(7):
        x = -gap / 2 + 0.3 + i * (gap - 0.6) / 6
        m.box('stonelight', (0.4, 0.8, 0.9), TR(x=x, y=6.2, z=D / 2 + 0.3))                         # Konsolen des Erkers
    m.box('wood', (gap + 0.2, 0.2, 1.1), TR(y=6.7, z=D / 2 + 0.55))
    m.box('stone', (gap + 0.2, 1.0, 0.4), TR(y=7.3, z=D / 2 + 1.0))
    for i in range(4): block(m, 'stone', (0.8, 0.8, 0.4), TR(x=-gap / 2 + 0.7 + i * (gap - 1.4) / 3, y=8.1, z=D / 2 + 1.0), bevel=0.05)
    # Fallgitter halb gehoben im Bogen, Torflügel offen an der Innenseite
    for k in range(6):
        x = -ar + 0.35 + k * (2 * ar - 0.7) / 5
        m.box('iron', (0.1, 3.0, 0.1), TR(x=x, y=4.3, z=0.35))
    for yy in (3.1, 4.0, 4.9): m.box('iron', (2 * ar - 0.5, 0.1, 0.1), TR(y=yy, z=0.35))
    for sx in (-1, 1):
        m.box('darkwood', (0.2, 3.0, 1.8), TR(x=sx * (ar - 0.1), y=1.5, z=-D / 2 + 0.7, ry=sx * 1.25))
    # Wappen (Gold auf Rot) und Wimpel
    m.box('paint', (1.3, 1.6, 0.1), TR(y=8.0, z=D / 2 + 0.12)); m.box('gold', (0.8, 0.12, 0.12), TR(y=8.1, z=D / 2 + 0.2)); m.box('gold', (0.12, 1.0, 0.12), TR(y=8.0, z=D / 2 + 0.2))
    for sx in (-1, 1):
        cx = sx * (W / 2 - tw / 2)
        m.tube('darkwood', [(cx, H + 0.6, 0), (cx, H + 4.2, 0)], [0.09, 0.05], seg=6, vscale=0.5)
        m.box('cloth', (1.6, 1.0, 0.04), TR(x=cx + 0.85, y=H + 3.6))
    m.ao(lambda role, p: (0.6 + 0.4 * sstep(0.0, 5.0, p.y)))
    m.export(os.path.join(ARCH_DIR, 'torhaus.glb'))

# ======================= Bergfried =======================
def build_bergfried():
    m = Model('bergfried'); W, H = 13.0, 17.0
    rnd = random.Random(91)
    block(m, 'stone', (W + 1.4, 3.8, W + 1.4), TR(y=-0.5), bevel=0.08)
    m.box('stone', (W, H, W), TR(y=H / 2))
    courses(m, W, W, H, 1.2)
    for sx in (-1, 1):                                                                         # Ecktürmchen
        for sz in (-1, 1):
            m.lathe('stone', [(1.85, 0.0), (1.8, H - 0.5), (2.0, H + 0.2)], TR(x=sx * (W / 2), z=sz * (W / 2)), seg=12, caps=False)
            m.lathe('stonelight', [(2.05, H + 0.1), (2.2, H + 0.5), (2.0, H + 0.7)], TR(x=sx * (W / 2), z=sz * (W / 2)), seg=12)
            m.lathe('roof', [(2.5, H + 0.7), (0.0, H + 5.2)], TR(x=sx * (W / 2), z=sz * (W / 2)), seg=12, caps=False)
            m.sphere('gold', 0.18, TR(x=sx * (W / 2), y=H + 5.3, z=sz * (W / 2)), seg=8)
    m.box('stonelight', (W + 0.5, 0.5, W + 0.5), TR(y=H - 1.4))
    m.box('stone', (W + 1.0, 1.0, W + 1.0), TR(y=H - 0.6))
    crenels(m, W + 1.0, W + 1.0, H - 0.1, role='stone', mh=1.1, mw=1.0, mt=0.6)
    # Dach in der Mitte (Walm mit Schiefer)
    pts = [(sx * (W / 2 - 0.5), H - 0.2, sz * (W / 2 - 0.5)) for sx in (-1, 1) for sz in (-1, 1)] + [(0, H + 4.4, 0)]
    m.rock('roof', pts, Matrix.Identity(4), bevel=0.0)
    m.tube('darkwood', [(0, H + 4.3, 0), (0, H + 7.4, 0)], [0.12, 0.06], seg=6, vscale=0.5)
    m.box('paint', (2.2, 1.4, 0.05), TR(x=1.2, y=H + 6.6))
    # Tor mit Freitreppe (Eingang im Obergeschoss-Sockel), Fenster
    z = W / 2
    for k in range(6): m.box('stone', (3.2, 0.3, 1.8 - k * 0.22), TR(y=0.15 + k * 0.3, z=z + 0.9 + (1.8 - k * 0.22) / 2 - 0.9 + 0.0))
    m.box('darkwood', (1.9, 3.0, 0.16), TR(y=1.8 + 0.5, z=z + 0.04))
    for yy in (1.8, 3.0): m.box('iron', (1.8, 0.09, 0.05), TR(y=yy, z=z + 0.14))
    arch_ring(m, 0, 3.3, 0.95, 1.3, z + 0.03, 0.4)
    for yy in (7.0, 11.5):
        for x in (-3.5, 0.0, 3.5):
            m.box('darkwood', (0.9, 1.6, 0.1), TR(x=x, y=yy, z=z + 0.03))
            arch_ring(m, x, yy + 0.8, 0.45, 0.7, z + 0.04, 0.3, n=7)
    m.ao(lambda role, p: (0.6 + 0.4 * sstep(0.0, 6.0, p.y)))
    m.export(os.path.join(ARCH_DIR, 'bergfried.glb'))


# ======================= Leuchtturm =======================
def build_leuchtturm():
    m = Model('leuchtturm'); H = 21.0
    block(m, 'stone', (8.2, 1.4, 8.2), TR(y=0.5), bevel=0.12)
    m.lathe('stone', [(3.9, 0.0), (3.7, 1.8)], TR(), seg=16, caps=False)
    # Schaft in Ringen: weiß und rot abwechselnd, leicht verjüngt
    bands = 6
    for b in range(bands):
        y0 = 1.8 + (H - 1.8) * b / bands; y1 = 1.8 + (H - 1.8) * (b + 1) / bands
        r0 = 3.6 - 1.5 * (y0 - 1.8) / (H - 1.8); r1 = 3.6 - 1.5 * (y1 - 1.8) / (H - 1.8)
        m.lathe('paint' if b % 2 == 0 else 'wall', [(r0, y0), (r1, y1)], TR(), seg=18, caps=False)
        m.torus('stonelight', r1 + 0.02, 0.06, TR(y=y1), seg=24, sec=4)
    for k in range(5):                                                                     # kleine Fenster
        y = 4.0 + k * 3.3; a = k * 2.2; r = 3.6 - 1.5 * (y - 1.8) / (H - 1.8)
        m.box('darkwood', (0.5, 0.9, 0.3), TR(x=math.cos(a) * r, y=y, z=math.sin(a) * r, ry=-a))
    z0 = 3.6
    m.box('darkwood', (1.4, 2.4, 0.16), TR(y=1.25, z=z0 + 0.1))
    arch_ring(m, 0, 2.5, 0.7, 1.0, z0 + 0.08, 0.4)
    # Galerie mit Geländer
    top = H; rg = 2.9
    m.cyl('stonelight', rg, 0.3, TR(y=top), seg=20)
    for k in range(28):
        a = k * 2 * math.pi / 28
        m.box('iron', (0.06, 1.0, 0.06), TR(x=math.cos(a) * (rg - 0.15), y=top + 0.65, z=math.sin(a) * (rg - 0.15)))
    m.torus('iron', rg - 0.15, 0.04, TR(y=top + 1.15), seg=28, sec=3)
    # Laternenhaus: Eisenrahmen, Glasband wird im Spiel als Leuchtfläche gesetzt
    rl = 1.5
    for k in range(10):
        a = k * 2 * math.pi / 10
        m.box('iron', (0.12, 2.2, 0.12), TR(x=math.cos(a) * rl, y=top + 1.4, z=math.sin(a) * rl))
    m.cyl('iron', rl + 0.1, 0.18, TR(y=top + 0.3), seg=12); m.cyl('iron', rl + 0.15, 0.2, TR(y=top + 2.55), seg=12)
    m.lathe('gold', [(rl + 0.5, top + 2.6), (rl + 0.3, top + 2.9), (0.15, top + 4.0)], TR(), seg=12, caps=False)
    m.sphere('gold', 0.2, TR(y=top + 4.1), seg=8)
    m.tube('iron', [(0, top + 4.2, 0), (0, top + 5.0, 0)], [0.04, 0.02], seg=4, vscale=1.0)
    m.ao(lambda role, p: (0.62 + 0.38 * sstep(0.0, 6.0, p.y)))
    m.export(os.path.join(ARCH_DIR, 'leuchtturm.glb'))

for fn in (build_fachwerk, build_kolonial, build_lagerhaus, build_kapelle, build_marktstand, build_kran, build_turm_zinnen, build_mauer_zinnen, build_torhaus, build_bergfried, build_leuchtturm):
    clear_gear(); fn()
