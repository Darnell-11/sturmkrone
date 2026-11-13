# Mehrlagige Anime-Frisur: Kopfhaube, Nackenlocken in zwei Lagen, Seitenlocken, Pony aus spitzen Strähnen, Scheitelzipfel.
# Alle UVs laufen senkrecht: v = Wurzel (0) → Spitze (1), u quer, jede Strähne in ihrer eigenen Spalte (kein Überlappen).
# Das Spiel zeichnet sie mit dem anisotropen Haar-Shader (Lichtband quer zur Strähne).
import random
clear_gear()
random.seed(11)
C = Vector((0.0, 0.03, 1.635))       # Kopfmitte
parts = []
bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')

def hang(root, length, bend, sway=0.0, steps=9, curl=0.0):
    """Pfad einer Strähne: von der Wurzel nach außen-unten, am Ende zur Seite geschwungen."""
    out = Vector((root.x - C.x, root.y - C.y, 0.0)).normalized()
    side = Vector((-out.y, out.x, 0.0))
    pts = []
    for i in range(steps):
        t = i / (steps - 1)
        p = root + out * (bend * (t ** 1.4)) + side * (sway * t * t + curl * math.sin(t * 5) * 0.01) + Vector((0, 0, -length * t))
        pts.append(p)
    return pts

# 1) Kopfhaube: Kugelschale, vorn über der Stirn offen; senkrechte UVs (v = Breitengrad von der Scheitelmitte nach unten)
NU, NV = 48, 14
rows = []
for k in range(NV + 1):
    th = (k / NV) * 1.95                                  # 0 = Scheitel, ≈ 112° nach unten
    row = []
    for i in range(NU):
        ph = 2 * math.pi * i / NU
        rx, ry, rz = 0.122, 0.128, 0.118
        row.append(bm.verts.new((C.x + rx * math.sin(th) * math.sin(ph), C.y + ry * math.sin(th) * math.cos(ph), C.z + rz * math.cos(th) + 0.01)))
    rows.append(row)
for k in range(NV):
    for i in range(NU):
        j = (i + 1) % NU
        # Stirn-Ausschnitt: Vorderseite (+Y), tiefer als Breitengrad 0.55 offen
        ph = 2 * math.pi * (i + 0.5) / NU
        front = math.cos(ph) > 0.5 and abs(math.sin(ph)) < 0.7
        if front and k > 9: continue
        f = bm.faces.new((rows[k][i], rows[k][j], rows[k + 1][j], rows[k + 1][i]))
        for l, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
            l[uvl].uv = (0.0 + 0.5 * ii / NU, 0.0 + kk / NV * 0.5)  # linke obere Hälfte des Atlas

NC = 70  # Spalten im Atlas (rechte Hälfte für Strähnen)
col = 0

# 2) Nacken, zwei Lagen, Seiten, Pony, Scheitel: Streifen mit eigener UV-Spalte (rechte Atlas-Hälfte)
def ribbon_col(pts, w0, w1):
    global col
    col += 1
    n = len(pts)
    row = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        out = Vector((p.x - C.x, p.y - C.y, 0.0)); out = out.normalized() if out.length > 1e-5 else Vector((0, 1, 0))
        s = t.cross(out); s = s.normalized() if s.length > 1e-5 else Vector((1, 0, 0))
        w = (w0 + (w1 - w0) * (i / (n - 1)) ** 0.8) / 2
        row.append((bm.verts.new(p + s * w), bm.verts.new(p - s * w)))
    for i in range(n - 1):
        a, b = row[i]; c, d = row[i + 1]
        f = bm.faces.new((a, c, d, b))
        u0 = 0.5 + 0.5 * (col - 1) / NC; u1 = u0 + 0.5 * 0.9 / NC
        for l, (u, v) in zip(f.loops, ((u0, i / (n - 1)), (u0, (i + 1) / (n - 1)), (u1, (i + 1) / (n - 1)), (u1, i / (n - 1)))):
            l[uvl].uv = (u, v)

for layer, (nloc, ln, rad) in enumerate(((20, 0.15, 0.132), (16, 0.1, 0.15))):
    for i in range(nloc):
        ph = math.pi * 0.62 + (2 * math.pi - math.pi * 1.24) * (i / (nloc - 1))
        root = Vector((C.x + rad * math.sin(ph), C.y + rad * math.cos(ph), C.z + 0.035 - layer * 0.03))
        ribbon_col(hang(root, ln * (0.8 + random.random() * 0.4), 0.03 + layer * 0.02, sway=random.uniform(-0.03, 0.03), curl=1.0), 0.052 - layer * 0.006, 0.006)
# 3) Seitenlocken vor den Ohren
for s in (-1, 1):
    for k in range(4):
        root = Vector((C.x + s * (0.118 + k * 0.004), C.y + 0.055 - k * 0.012, C.z + 0.02 - k * 0.012))
        ribbon_col(hang(root, 0.085 + 0.02 * k, 0.012, sway=s * 0.015, curl=0.8), 0.04, 0.006)
# 4) Pony: spitze Strähnen über der Stirn
for i in range(11):
    x = -0.085 + 0.017 * i
    root = Vector((C.x + x, C.y + 0.108 - 0.012 * (abs(x) / 0.085), C.z + 0.085))
    pts = hang(root, 0.075 + random.random() * 0.045, 0.02, sway=x * 0.25)
    ribbon_col([Vector((p.x, p.y + 0.008 * (j / 8), p.z)) for j, p in enumerate(pts)], 0.036, 0.004)
# 5) Scheitelzipfel
for i in range(7):
    ph = 2 * math.pi * i / 7
    root = Vector((C.x + 0.045 * math.sin(ph), C.y + 0.045 * math.cos(ph), C.z + 0.115))
    ribbon_col(hang(root, 0.05, 0.05, sway=0.01, steps=5), 0.03, 0.004)

bm.normal_update()
me = bpy.data.meshes.new('G_frisur'); bm.to_mesh(me); bm.free()
hair = bpy.data.objects.new('G_frisur', me); bpy.context.collection.objects.link(hair)
me.materials.append(mat('hair'))
for p in me.polygons: p.use_smooth = True
# doppelseitig dünn: Verdickung
solid(hair, 0.0025)
export([hair], GEAR_DIR + r'\frisur_mehrlagig.glb')
print('frisur', len(me.polygons), os.path.getsize(GEAR_DIR + r'\frisur_mehrlagig.glb'))
