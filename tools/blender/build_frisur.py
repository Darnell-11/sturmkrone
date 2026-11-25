# Mehrlagige Anime-Frisur (4.6G.3, neu gebaut): geschlossene, spitz zulaufende Strähnen-Körper statt flacher Kartenstreifen.
#
# Bis 4.6G.2 bestand die Frisur aus einer Kugelhaube (12 cm Halbmesser) und flachen, aufgedickten Bändern: die Haube schnitt hinten in den
# Schädel (kahle Stelle, bei der weiblichen Figur groß), die Bänder zeigten weiße Kanten und zerfranste, nach innen gestülpte Flächen.
# Jetzt: der Schädel der Grundfigur wird gemessen (Radius je Richtung um die Kopfmitte, aus der Haut von Körper und Gesicht), die Haube
# liegt überall 7 mm darüber, und jede Strähne ist ein geschlossener Körper mit linsenförmigem Querschnitt (Grat außen), der vom Scheitel an
# der Kopfform entlang fällt (Kollision mit dem Schädel und den Ohren), sich zur Spitze verjüngt und spitz endet. Lagen: Deckhaar, Pony,
# Seitensträhnen vor den Ohren, zwei Nackenlagen. Normalen zeigen nach außen (je Strähne neu berechnet), UV: v Wurzel → Spitze, je
# Strähne eine Spalte.
#
# Rechnung im Kopfraum des Spiels (x, y oben, z hinten = Gesicht nach −Z), Ausgabe in Blender (Z oben, Vorderseite +Y).
import random
clear_gear()
random.seed(23)

HEAD = Vector((0.0005, 0.0063, 1.5454))   # Kopfknochen der männlichen Grundfigur (Blender)

def to_b(h):
    return Vector((h.x + HEAD.x, -h.z + HEAD.y, h.y + HEAD.z))

def from_b(v):
    return Vector((v.x - HEAD.x, v.z - HEAD.z, -(v.y - HEAD.y)))

# ---------- Schädel messen ----------
pts = []
for name in ('Body', 'Face'):
    o = bpy.data.objects.get(name)
    if not o:
        continue
    me = o.data
    mw = o.matrix_world
    for poly in me.polygons:
        mname = me.materials[poly.material_index].name if me.materials else ''
        if 'SKIN' not in mname.upper():
            continue
        vs = [from_b(mw @ me.vertices[i].co) for i in poly.vertices]
        c = sum(vs, Vector()) / len(vs)
        for v in vs + [c] + [(a + c) * 0.5 for a in vs]:
            if v.y > -0.09 and abs(v.x) < 0.17 and abs(v.z) < 0.17:
                pts.append(v)

zs = [p.z for p in pts if abs(p.y - 0.12) < 0.01 and abs(p.x) < 0.02]
C = Vector((0.0, 0.09, (min(zs) + max(zs)) / 2 if zs else 0.0))
NA, NE = 72, 40
E0, E1 = math.radians(-70), math.radians(90)

def bins(d):
    az = math.atan2(d.x, -d.z)
    el = math.atan2(d.y, math.hypot(d.x, d.z))
    a = (az % (2 * math.pi)) / (2 * math.pi) * NA
    e = (el - E0) / (E1 - E0) * (NE - 1)
    return a, e

R = [[0.0] * NA for _ in range(NE)]
for p in pts:
    d = p - C
    r = d.length
    if r < 1e-6:
        continue
    a, e = bins(d)
    ia, ie = int(round(a)) % NA, int(round(e))
    if 0 <= ie < NE and r > R[ie][ia]:
        R[ie][ia] = r
# Lücken füllen, dann nach außen glätten (nie unter die Haut)
for _ in range(12):
    nx = [row[:] for row in R]
    for e in range(NE):
        for a in range(NA):
            s = c = 0
            for de, da in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                e2 = e + de
                if 0 <= e2 < NE:
                    v = R[e2][(a + da) % NA]
                    if v > 0:
                        s += v; c += 1
            avg = s / c if c else 0
            nx[e][a] = max(R[e][a], avg * 0.985) if R[e][a] > 0 else avg
    R = nx

def skull(d):
    """Hautabstand von der Kopfmitte in Richtung d (bilinear)"""
    a, e = bins(d)
    e = min(NE - 1.001, max(0.0, e))
    a0, e0 = int(math.floor(a)), int(math.floor(e))
    ta, te = a - a0, e - e0
    v = lambda ee, aa: R[ee][aa % NA]
    return (v(e0, a0) * (1 - ta) + v(e0, a0 + 1) * ta) * (1 - te) + (v(e0 + 1, a0) * (1 - ta) + v(e0 + 1, a0 + 1) * ta) * te

top_y = max(p.y for p in pts)
print('Schädel: Mitte', tuple(round(x, 4) for x in C), 'Scheitel', round(top_y, 4), 'Punkte', len(pts))

def dirv(az, el):
    return Vector((math.sin(az) * math.cos(el), math.sin(el), -math.cos(az) * math.cos(el)))

def down_m(d):
    """Meridian abwärts (tangential) an der Richtung d"""
    az = math.atan2(d.x, -d.z)
    el = math.atan2(d.y, math.hypot(d.x, d.z))
    return Vector((math.sin(az) * math.sin(el), -math.cos(el), -math.cos(az) * math.sin(el)))

def edge_el(az):
    """Unterkante der Haube: vorn am Haaransatz der Stirn, seitlich über den Ohren, hinten im Nacken"""
    f = (1 - math.cos(az)) / 2
    return math.radians(18 - 64 * f ** 1.25)

bm = bmesh.new()
uvl = bm.loops.layers.uv.new('UVMap')
NC = 64
col = 0

# ---------- Haube ----------
CAP_OFF = 0.007
HA, HE = 56, 18
grid = []
for i in range(HE + 1):
    row = []
    for j in range(HA):
        az = 2 * math.pi * j / HA
        el = edge_el(az) + (math.radians(89.5) - edge_el(az)) * (i / HE)
        d = dirv(az, el)
        row.append(bm.verts.new(to_b(C + d * (skull(d) + CAP_OFF))))
    grid.append(row)
apex = bm.verts.new(to_b(C + Vector((0, 1, 0)) * (skull(Vector((0, 1, 0))) + CAP_OFF)))
cap_faces = []
for i in range(HE):
    for j in range(HA):
        k = (j + 1) % HA
        f = bm.faces.new((grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j]))
        cap_faces.append(f)
        for l, (u, v) in zip(f.loops, ((j / HA, i / HE), ((j + 1) / HA, i / HE), ((j + 1) / HA, (i + 1) / HE), (j / HA, (i + 1) / HE))):
            l[uvl].uv = (u * 0.5, v * 0.5)
for j in range(HA):
    f = bm.faces.new((grid[HE][j], grid[HE][(j + 1) % HA], apex))
    cap_faces.append(f)
# Haube nach außen ausrichten
bm.normal_update()
probe = cap_faces[len(cap_faces) // 3]
pc = from_b(probe.calc_center_median())
nb = probe.normal
n_game = Vector((nb.x, nb.z, -nb.y))
if n_game.dot(pc - C) < 0:
    bmesh.ops.reverse_faces(bm, faces=cap_faces)

# ---------- Strähnen ----------
RING = 6

def path(az0, el0, tip_y, lay, steer=Vector(), flare=0.0, max_len=0.34, ds=0.006):
    """Weg einer Strähne: vom Scheitel an der Kopfform abwärts (Kollision mit Schädel und Ohren), unter der Haube frei fallend"""
    d = dirv(az0, el0)
    p = C + d * (skull(d) + lay)
    out = [p.copy()]
    L = 0.0
    while L < max_len:
        r = p - C
        n = r.normalized()
        az = math.atan2(r.x, -r.z)
        el = math.atan2(r.y, math.hypot(r.x, r.z))
        under = max(0.0, min(1.0, (edge_el(az) - el) / math.radians(18)))
        s = L / max_len
        dirn = down_m(r) * (1 - under) + Vector((0, -1, 0)) * under + steer * (0.6 + s) + Vector((n.x, 0, n.z)) * flare * s * s
        p = p + dirn.normalized() * ds
        rr = p - C
        need = skull(rr.normalized()) + lay
        if rr.length < need:
            p = C + rr.normalized() * need
        out.append(p.copy())
        L += ds
        if p.y <= tip_y:
            break
    return out

def resample(ps, n):
    acc = [0.0]
    for i in range(1, len(ps)):
        acc.append(acc[-1] + (ps[i] - ps[i - 1]).length)
    total = acc[-1] or 1e-6
    res = []
    j = 0
    for k in range(n + 1):
        t = total * k / n
        while j < len(acc) - 2 and acc[j + 1] < t:
            j += 1
        f = (t - acc[j]) / max(1e-9, acc[j + 1] - acc[j])
        res.append(ps[j].lerp(ps[j + 1], min(1.0, max(0.0, f))))
    return res

def strand(az0, el0, tip_y, w, th, lay, steer=Vector(), flare=0.0, seg=10, twist=0.0, max_len=0.34):
    global col
    col += 1
    ps = resample(path(az0, el0, tip_y, lay + th * 0.5, steer, flare, max_len), seg)
    rings = []
    for i, p in enumerate(ps):
        t = (ps[min(i + 1, seg)] - ps[max(i - 1, 0)]).normalized()
        n = (p - C).normalized()
        n = (n - t * n.dot(t)).normalized()
        b = t.cross(n).normalized()
        s = i / seg
        # breit an der Wurzel, weich zur Spitze, die letzten Ringe laufen spitz zu
        k = (1 - s) ** 0.75 * min(1.0, 0.55 + s * 5)
        ww, tt = w * 0.5 * k, th * 0.5 * max(0.25, k)
        ring = []
        for q in range(RING):
            a = 2 * math.pi * q / RING + twist * s
            # Linse: außen ein Grat, innen flach
            up = math.sin(a)
            o = b * (ww * math.cos(a)) + n * (tt * (up if up > 0 else up * 0.55))
            ring.append(bm.verts.new(to_b(p + o)))
        rings.append(ring)
    t_end = (ps[-1] - ps[-2]).normalized()
    tip = bm.verts.new(to_b(ps[-1] + t_end * 0.008))
    faces = []
    u0 = 0.5 + 0.5 * (col - 1) / NC
    du = 0.5 * 0.85 / NC
    for i in range(seg):
        for q in range(RING):
            q2 = (q + 1) % RING
            f = bm.faces.new((rings[i][q], rings[i][q2], rings[i + 1][q2], rings[i + 1][q]))
            faces.append(f)
            for l, (u, v) in zip(f.loops, ((q, i), (q + 1, i), (q + 1, i + 1), (q, i + 1))):
                l[uvl].uv = (u0 + du * u / RING, v / seg)
    for q in range(RING):
        f = bm.faces.new((rings[seg][q], rings[seg][(q + 1) % RING], tip))
        faces.append(f)
        for l in f.loops:
            l[uvl].uv = (u0 + du * 0.5, 1.0)
    faces.append(bm.faces.new(list(reversed(rings[0]))))
    bmesh.ops.recalc_face_normals(bm, faces=faces)

EYE_Y = 0.0625
# Deckhaar: breite, kurze Strähnen vom Scheitel rundum über die Haube
for i in range(12):
    az = 2 * math.pi * i / 12 + 0.15
    strand(az, math.radians(85), top_y - 0.08, 0.052, 0.012, 0.005, seg=8, twist=0.25)
# Nacken, untere Lage: lang, Spitzen leicht nach außen
for i in range(13):
    az = math.radians(108 + (252 - 108) * i / 12)
    strand(az, math.radians(36), -0.07 + random.uniform(-0.012, 0.012), 0.05, 0.012, 0.009, flare=0.35, seg=10, twist=random.uniform(-0.4, 0.4))
# Nacken, obere Lage: kürzer, um eine halbe Breite versetzt
for i in range(12):
    az = math.radians(100 + (260 - 100) * (i + 0.5) / 12)
    strand(az, math.radians(66), -0.014 + random.uniform(-0.01, 0.01), 0.054, 0.012, 0.015, flare=0.25, seg=10, twist=random.uniform(-0.3, 0.3))
# Seitensträhnen vor den Ohren bis zur Wange, zum Gesicht hin geschwungen
for sgn in (-1, 1):
    for k in range(4):
        az = sgn * math.radians(66 + 11 * k)
        strand(az, math.radians(62 - 4 * k), 0.006 - 0.01 * k, 0.044, 0.011, 0.011 + 0.003 * k, steer=Vector((0, 0, -0.16)), seg=10, twist=sgn * 0.3)
# Pony: breite, überlappende Strähnen über die ganze Stirn, spitz auf Brauenhöhe (die Mitte etwas länger), leicht zur Seite gekämmt
for layer in (0, 1):
    n = 7 if layer == 0 else 6
    for i in range(n):
        u = (i + 0.5 * layer) / (7 - 1) - 0.5
        az = u * math.radians(96)
        tip = EYE_Y + 0.024 - 0.014 * (1 - min(1, abs(u) * 2)) ** 2 + random.uniform(-0.004, 0.004) + layer * 0.008
        strand(az, math.radians(76 - layer * 4), tip, 0.046 - abs(u) * 0.008, 0.011, 0.012 + layer * 0.006, steer=Vector((0.06, 0, 0)), seg=10, twist=0.2)

bm.normal_update()
me = bpy.data.meshes.new('G_frisur')
bm.to_mesh(me)
bm.free()
hair = bpy.data.objects.new('G_frisur', me)
bpy.context.collection.objects.link(hair)
me.materials.append(mat('hair'))
for p in me.polygons:
    p.use_smooth = True
tris = sum(len(p.vertices) - 2 for p in me.polygons)
export([hair], GEAR_DIR + r'\frisur_mehrlagig.glb')
print('frisur', tris, 'Dreiecke', os.path.getsize(GEAR_DIR + r'\frisur_mehrlagig.glb'))
