# Phase 4.93A – Kino-VFX-Netze für die Faustkämpfer und den Himmelssturz (Stufe 101), headless gebaut:
#   "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background --python scripts/blender/buildBrawlerAndMeteorVfx.py
#   danach: node scripts/compress-gear.mjs vfx
# Ausgabe nach public/models/vfx/:
#   vfx_fist_shockcone.glb      mehrfach gestaffelte, gedrehte Mach-Luftdruckkegel mit gezackten Schockwellen-Ringen
#   vfx_fist_rapid_barrage.glb  Bündel aus 16 versetzten Phantom-Faust- und Blitz-Projektilkegeln mit Schweif-Kernen
#   vfx_trench_fissure.glb      aufgerissene Schollenplatten mit leuchtenden Magma-/Tiefsee-Spalten und hochstehenden Bruchkanten
#   vfx_meteor_colossus.glb     zerklüfteter, asymmetrischer Haupt-Meteorit (im Spiel 45 m) mit Krater-Furchen, Magma-Adern, Plasma-Bugkegel
#   vfx_meteor_shards.glb       fünf spitze, unterschiedlich gedrehte Vorhut-Brocken mit langen Feuerschweifen
#
# Achsen: gebaut wird in SPIEL-Koordinaten (x rechts, y oben, z vorn = Flug- bzw. Schlagrichtung), geschrieben in Blender-Achsen (x, −z, y);
# der Export (Y oben) stellt die Spiel-Achsen wieder her. Maße sind normiert (Länge bzw. Durchmesser ≈ 1), das Spiel skaliert je Einsatz.
#
# Eckpunktfarbe „Col“ (linear, je Ecke) – Daten für den gemeinsamen Effekt-Shader des Spiels, keine sichtbare Farbe:
#   R = weißglühende Kern-Intensität (1 = Kern, Spitze, Magma-Ader)
#   G = Rand-Verlauf (1 = voll, 0 = ausgeblendeter Rand bzw. tiefer Schatten bei Gestein)
#   B = Animationsphase 0 … 1 (Reihenfolge, in der die Schichten zünden; das Spiel legt daran den UV-Lauf an)
# Materialname = Rolle: core (leuchtender Kern), glow (Glut in der Spalte), plasma (Bugkegel, Feuerschweif), rock (festes Gestein).
import bpy, bmesh, os, math
from math import sin, cos, pi, sqrt, atan2, acos, exp
from mathutils import Vector, noise as mnoise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'models', 'vfx')


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def smooth(a, b, x):
    t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def n3(x, y, z):
    """Perlin-Rauschen −1 … 1 (deterministisch)"""
    return mnoise.noise(Vector((x, y, z)))


def fbm(x, y, z, s=1.0, octaves=4):
    amp, f, total, norm = 0.5, s, 0.0, 0.0
    for _ in range(octaves):
        total += amp * mnoise.noise(Vector((x * f, y * f, z * f)))
        norm += amp
        amp *= 0.5
        f *= 2.03
    return total / norm


class Part:
    """Ein Netz einer Rolle in Spiel-Koordinaten; Farbe (R, G, B) und UV je Eckpunkt"""

    def __init__(self, name, role):
        self.name, self.role = name, role
        self.v, self.c, self.uv, self.f = [], [], [], []

    def vert(self, x, y, z, r, g, b, u, v):
        self.v.append((x, y, z))
        self.c.append((clamp(r), clamp(g), clamp(b)))
        self.uv.append((u, v))
        return len(self.v) - 1

    def quad(self, a, b, c, d):
        self.f.append((a, b, c, d))

    def tri(self, a, b, c):
        self.f.append((a, b, c))

    def loft(self, rings):
        """Ringe gleicher Länge zu Viereck-Bändern verbinden (offene Reihen: der letzte Punkt wiederholt den ersten für die UV-Naht)"""
        for r0, r1 in zip(rings, rings[1:]):
            for i in range(len(r0) - 1):
                self.quad(r0[i], r0[i + 1], r1[i + 1], r1[i])

    def fan(self, centre, ring):
        for i in range(len(ring) - 1):
            self.tri(centre, ring[i], ring[i + 1])


ROLE_COL = {'core': (0.55, 0.8, 1.0), 'glow': (1.0, 0.42, 0.1), 'plasma': (1.0, 0.6, 0.25), 'rock': (0.2, 0.17, 0.15)}


def material(role):
    """Material je Rolle (eigene Grundfarbe: das Verkleinern fasst gleiche Materialien sonst zu einem zusammen und die Rolle ginge verloren)"""
    m = bpy.data.materials.get(role)
    if not m:
        m = bpy.data.materials.new(role)
        m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = (*ROLE_COL.get(role, (0.5, 0.5, 0.5)), 1)
    return m


def to_object(part):
    bm = bmesh.new()
    vs = [bm.verts.new((x, -z, y)) for (x, y, z) in part.v]
    bm.verts.ensure_lookup_table()
    col = bm.loops.layers.float_color.new('Col')
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in part.f:
        if len(set(f)) < 3:
            continue
        try:
            face = bm.faces.new([vs[i] for i in f])
        except ValueError:
            continue
        face.smooth = True
        for loop, i in zip(face.loops, f):
            r, g, b = part.c[i]
            loop[col] = (r, g, b, 1.0)
            loop[uvl].uv = part.uv[i]
    # Nähte verschweißen (UV und Farbe bleiben je Ecke erhalten): durchgehend glatte, saubere Normalen
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(part.name)
    bm.to_mesh(me)
    bm.free()
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = me.color_attributes.find('Col')
    me.materials.append(material(part.role))
    ob = bpy.data.objects.new(part.name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def export(name, parts):
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    objs = [to_object(p) for p in parts]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False,
                              export_vertex_color='ACTIVE', export_vertex_color_name='Col', export_all_vertex_colors=False,
                              export_active_vertex_color_when_no_material=True, export_draco_mesh_compression_enable=False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    print('VFX', name, 'Netze', len(objs), 'Dreiecke', tris, 'Bytes', os.path.getsize(path))


# ---------------------------------------------------------------------------------------------------------------
# 1. Mach-Luftdruckkegel
# ---------------------------------------------------------------------------------------------------------------

def build_shockcone():
    core = Part('fist_shockcone_core', 'core')
    SEG, STAGES, ROWS = 40, 4, 10
    for s in range(STAGES):
        z_tip = 1.0 - s * 0.19
        length = 0.40 + s * 0.11
        r_base = 0.30 + s * 0.235
        twist = 0.85 + s * 0.4
        rings = []
        for r in range(ROWS + 1):
            t = r / ROWS
            rad = r_base * (t ** 0.7) + 0.01
            ring = []
            for i in range(SEG + 1):
                a0 = (i % SEG) / SEG * 2 * pi
                a = a0 + twist * t + s * 0.83
                wob = 1 + 0.08 * sin(a0 * 5 + s * 1.7 + t * 5.0) * t + 0.07 * n3(cos(a0) * 1.6, sin(a0) * 1.6, t * 2.2 + s * 3.1) * t
                # gezackter Abströmrand: jede zweite Rippe steht weit nach hinten über
                jag = (0.055 + 0.02 * s) * (1.0 if (i % SEG) % 2 else -0.35) * smooth(0.72, 1.0, t)
                x, y = cos(a) * rad * wob, sin(a) * rad * wob
                z = z_tip - t * length - jag
                R = (1 - t) ** 1.7 * (1.0 - 0.14 * s)
                G = (1 - t ** 2.4) * (1.0 - 0.09 * s)
                B = (s + t) / STAGES
                ring.append(core.vert(x, y, z, R, G, B, i / SEG * 3.0, B * 3.0))
            rings.append(ring)
        core.loft(rings)
    # drei gezackte Schockwellen-Ringe quer zur Achse (innen glühend, außen ausfransend)
    for k in range(3):
        zc = 0.66 - k * 0.25
        r_in = 0.26 + k * 0.21
        r_out = r_in + 0.27 + k * 0.06
        N = 56
        rings = []
        for j, (rad, R, G, dz) in enumerate(((r_in, 0.95 - 0.12 * k, 0.9, 0.0), ((r_in + r_out) * 0.5, 0.5, 1.0, -0.03), (r_out, 0.04, 0.0, -0.08))):
            ring = []
            for i in range(N + 1):
                ii = i % N
                a = ii / N * 2 * pi + k * 0.37
                jag = 1.0
                if j == 2:
                    jag = 1 + (0.24 if ii % 2 else -0.10) + 0.06 * n3(cos(a) * 2, sin(a) * 2, k * 4.2)
                elif j == 0:
                    jag = 1 + 0.05 * sin(a * 9 + k)
                B = 0.3 + 0.24 * k + 0.08 * j
                ring.append(core.vert(cos(a) * rad * jag, sin(a) * rad * jag, zc + dz, R, G, B, i / N * 4.0, B * 3.0))
            rings.append(ring)
        core.loft(rings)
    return [core]


# ---------------------------------------------------------------------------------------------------------------
# 2. Phantom-Faust- und Blitz-Projektile
# ---------------------------------------------------------------------------------------------------------------

def _rot(x, y, a):
    return x * cos(a) - y * sin(a), x * sin(a) + y * cos(a)


def _tail_core(p, cx, cy, z_front, size, tail, phase):
    """Schweif-Kern: dünne, weißglühende Spindel im Inneren"""
    SEG, ROWS = 6, 6
    rings = []
    for r in range(ROWS + 1):
        t = r / ROWS
        z = z_front - size * 0.5 - t * tail * 0.72
        rad = size * 0.2 * (1 - t) ** 0.7 + size * 0.012
        ring = []
        for i in range(SEG + 1):
            a = (i % SEG) / SEG * 2 * pi
            ring.append(p.vert(cx + cos(a) * rad, cy + sin(a) * rad, z, 1.0 - 0.4 * t, 1.0 - 0.75 * t, phase * 0.7 + 0.3 * t, i / SEG, phase + t * 2.0))
        rings.append(ring)
    p.loft(rings)


def _fist(p, cx, cy, z_front, size, tail, phase, roll):
    SEG = 12
    # (Abstand hinter der Schlagfläche in Faustgrößen, Radius-Faktor)
    prof = [(0.0, 0.36), (0.10, 0.82), (0.35, 1.0), (0.80, 1.0), (1.15, 0.86), (1.45, 0.62)]
    total = 1.45 * size + tail
    rings = []
    for (d, k) in prof:
        ring = []
        for i in range(SEG + 1):
            a0 = (i % SEG) / SEG * 2 * pi
            # abgerundetes Rechteck (Superellipse), breiter als hoch
            ca, sa = cos(a0), sin(a0)
            ex = (abs(ca) ** (2 / 3.2)) * (1 if ca >= 0 else -1)
            ey = (abs(sa) ** (2 / 3.2)) * (1 if sa >= 0 else -1)
            # Knöchel: vier Wülste auf der Oberkante der Schlagfläche
            knuckle = 0.15 * size * (max(0.0, sa) ** 1.5) * (0.55 + 0.45 * cos(a0 * 8)) * (1 - smooth(0.2, 0.9, d))
            lx, ly = ex * size * k, ey * size * k * 0.8 + knuckle
            x, y = _rot(lx, ly, roll)
            dist = d * size
            R = 1.0 - 0.45 * (d / 1.45)
            ring.append(p.vert(cx + x, cy + y, z_front - dist, R, 1.0, phase * 0.7 + 0.3 * dist / total, i / SEG, phase + dist / total * 2.0))
        rings.append(ring)
    centre = p.vert(cx, cy, z_front + 0.04 * size, 1.0, 1.0, phase * 0.7, 0.5, phase)
    p.fan(centre, rings[0])
    # aerodynamischer Schweif vom Handgelenk bis zur Spitze
    ROWS = 7
    for r in range(1, ROWS + 1):
        t = r / ROWS
        ring = []
        for i in range(SEG + 1):
            a0 = (i % SEG) / SEG * 2 * pi
            rad = size * (0.62 * (1 - t) ** 0.85 + 0.02) * (1 + 0.12 * cos(a0 * 3 + t * 4 + roll))
            x, y = _rot(cos(a0) * rad, sin(a0) * rad * 0.9, roll + t * 0.9)
            dist = 1.45 * size + t * tail
            ring.append(p.vert(cx + x, cy + y, z_front - dist, 0.5 * (1 - t) ** 1.5, (1 - t) ** 1.3, phase * 0.7 + 0.3 * dist / total, i / SEG, phase + dist / total * 2.0))
        rings.append(ring)
    p.loft(rings)
    _tail_core(p, cx, cy, z_front, size, tail, phase)


def _bolt(p, cx, cy, z_front, size, tail, phase, roll):
    SEG = 12
    total = 1.6 * size + tail
    ox, oy = cos(roll), sin(roll)
    rows = [(0.0, 0.03, 0.0), (0.5, 0.45, 0.0), (1.1, 0.8, 0.0), (1.6, 0.9, 0.0)]
    # gezackter Schweif: fünf Knicke quer zur Flugrichtung
    for r in range(1, 7):
        t = r / 6
        rows.append((1.6 + t * tail / size, 0.9 * (1 - t) ** 0.8 + 0.03, (0.42 if r % 2 else -0.42) * (1 - t * 0.6)))
    rings = []
    for (d, k, kink) in rows:
        dist = d * size
        ring = []
        for i in range(SEG + 1):
            a0 = (i % SEG) / SEG * 2 * pi
            rad = size * k * (1 + 0.34 * cos(a0 * 4))
            x, y = _rot(cos(a0) * rad, sin(a0) * rad, roll + dist * 2.5)
            x += ox * kink * size
            y += oy * kink * size
            head = d <= 1.6
            R = (1.0 - 0.35 * d / 1.6) if head else 0.55 * (1 - (dist - 1.6 * size) / tail) ** 1.4
            G = 1.0 if head else (1 - (dist - 1.6 * size) / tail) ** 1.2
            ring.append(p.vert(cx + x, cy + y, z_front - dist, R, G, phase * 0.7 + 0.3 * dist / total, i / SEG, phase + dist / total * 2.0))
        rings.append(ring)
    p.loft(rings)
    _tail_core(p, cx, cy, z_front, size, tail, phase)


def build_barrage():
    core = Part('fist_rapid_barrage_core', 'core')
    N = 16
    for i in range(N):
        ang = i * 2.399963
        rad = 0.16 + 0.74 * sqrt((i + 0.5) / N)
        cx, cy = cos(ang) * rad, sin(ang) * rad * 0.82
        order = (i * 7) % N
        phase = order / N
        z_front = 1.0 - 0.05 * order
        size = 0.075 + 0.028 * ((i * 5) % 4) / 3
        tail = size * (6.5 + 2.5 * ((i * 3) % 5) / 4)
        if i % 2 == 0:
            _fist(core, cx, cy, z_front, size, tail, phase, i * 0.9)
        else:
            _bolt(core, cx, cy, z_front, size, tail, phase, i * 0.9)
    return [core]


# ---------------------------------------------------------------------------------------------------------------
# 3. Tektonische Spalte
# ---------------------------------------------------------------------------------------------------------------

def crack_x(z):
    return 0.05 * n3(z * 7.3, 0.31, 1.7) + 0.022 * n3(z * 23.0, 4.1, 0.2)


def crack_w(z):
    return (0.012 + 0.058 * sin(pi * clamp(z)) ** 0.7) * (1 + 0.35 * n3(z * 11.0, 9.3, 2.2))


def crack_d(z):
    return 0.05 + 0.15 * sin(pi * clamp(z)) ** 0.6


def build_fissure():
    glow = Part('trench_fissure_glow', 'glow')
    rock = Part('trench_fissure_rock', 'rock')
    ROWS = 48
    # glühende Rinne: V-Querschnitt, am Grund weißglühend
    rings = []
    for r in range(ROWS + 1):
        z = r / ROWS
        xc, w, d = crack_x(z), crack_w(z), crack_d(z)
        ends = sin(pi * z) ** 0.5
        mid = 0.2 * w * n3(z * 31.0, 2.0, 2.0)
        prof = [(-w, -0.004, 0.25, 0.55), (-w * 0.55, -d * 0.55, 0.6, 0.9), (mid, -d, 1.0, 1.0), (w * 0.55, -d * 0.55, 0.6, 0.9), (w, -0.004, 0.25, 0.55)]
        rings.append([glow.vert(xc + dx, y, z, R * (0.55 + 0.45 * ends), G * ends, z, j / 4.0, z * 4.0) for j, (dx, y, R, G) in enumerate(prof)])
    glow.loft(rings)
    # Lichtvorhänge: Glut schlägt beidseitig aus der Spalte nach oben (aus flachem Blickwinkel sichtbar)
    for side in (-1, 1):
        rings = []
        for r in range(ROWS + 1):
            z = r / ROWS
            xc, w, d = crack_x(z), crack_w(z), crack_d(z)
            ends = sin(pi * z) ** 0.5
            h = (0.07 + 0.09 * abs(n3(z * 9.0, side * 3.3, 5.5))) * ends
            rings.append([
                glow.vert(xc + side * w * 0.2, -d * 0.6, z, 0.85 * ends, 0.9 * ends, z, 0.0, z * 4.0),
                glow.vert(xc + side * w * 0.5, 0.02, z, 0.5 * ends, 0.6 * ends, z, 0.5, z * 4.0),
                glow.vert(xc + side * (w * 0.9 + 0.02), h, z, 0.0, 0.0, z, 1.0, z * 4.0),
            ])
        glow.loft(rings)
    # Seitenrisse: verästelte Glut-Adern flach auf dem Boden
    for b in range(8):
        z0 = 0.12 + 0.76 * (b + 0.5) / 8 + 0.03 * n3(b * 3.3, 1.0, 1.0)
        side = 1 if b % 2 else -1
        ang = side * (0.75 + 0.5 * n3(b * 1.7, 5.0, 2.0))
        length = 0.10 + 0.08 * abs(n3(b * 2.9, 7.0, 3.0))
        nx, nz = cos(ang), -sin(ang)
        rings = []
        for s in range(6):
            t = s / 5
            px = crack_x(z0) + side * crack_w(z0) + sin(ang) * length * t + 0.012 * n3(b * 5.0, t * 9.0, 1.0)
            pz = z0 + cos(ang) * length * t * 0.6
            hw = 0.012 * (1 - t) + 0.002
            rings.append([
                glow.vert(px - nx * hw, 0.006, pz - nz * hw * 0.6, 0.1, 0.0, z0, 0.0, z0 * 4 + t),
                glow.vert(px, 0.004, pz, 0.8 * (1 - t), 1 - t, z0, 0.5, z0 * 4 + t),
                glow.vert(px + nx * hw, 0.006, pz + nz * hw * 0.6, 0.1, 0.0, z0, 1.0, z0 * 4 + t),
            ])
        glow.loft(rings)
    # Schollenplatten beidseits: zur Spalte hin aufgeworfen (hochstehende Bruchkante), außen im Boden
    NU, NV = 4, 4
    for side in (-1, 1):
        n_slab = 10
        for k in range(n_slab):
            za = 0.03 + 0.94 * k / n_slab + 0.012 * n3(k * 4.1, side, 2.0)
            zb = 0.03 + 0.94 * (k + 1) / n_slab - 0.012 - 0.01 * abs(n3(k * 3.7, side * 2.0, 5.0))
            zc = (za + zb) / 2
            ends = sin(pi * zc) ** 0.6
            reach = (0.16 + 0.16 * abs(n3(k * 2.3, side * 4.0, 8.0))) * (0.45 + 0.55 * ends)
            lift = (0.05 + 0.11 * abs(n3(k * 5.9, side * 1.3, 3.0))) * ends
            tilt = 0.03 * n3(k * 7.7, side, 9.0)
            grid = []
            for iu in range(NU + 1):
                u = iu / NU
                row = []
                for iv in range(NV + 1):
                    v = iv / NV
                    z = za + (zb - za) * v
                    edge = crack_x(z) + side * (crack_w(z) + 0.004)
                    jag = 0.012 * n3(z * 40.0, side * 2.0, k) * (1 - u)
                    x = edge + side * (reach * u + jag) + 0.014 * n3(k, v * 5.0, 3.0) * u
                    y = lift * (1 - u) ** 1.6 + tilt * (v - 0.5) + 0.008 * n3(x * 30.0, z * 30.0, k)
                    if iu == NU:
                        y = min(y, 0.004)
                    R = (1 - u) ** 3 * 0.85 * ends
                    G = 0.72 + 0.14 * n3(x * 14.0, z * 14.0, k * 2.0) + 0.1 * (1 - u)
                    row.append(rock.vert(x, y, z, R, G, zc, x * 3.0 + 0.5, z * 6.0))
                grid.append(row)
            for iu in range(NU):
                for iv in range(NV):
                    rock.quad(grid[iu][iv], grid[iu][iv + 1], grid[iu + 1][iv + 1], grid[iu + 1][iv])
            # Bruchwand: von der Kante hinab in die glühende Spalte
            bot = []
            for iv in range(NV + 1):
                z = za + (zb - za) * iv / NV
                bot.append(rock.vert(crack_x(z) + side * crack_w(z) * 0.75, -crack_d(z) * 0.5, z, 0.9 * ends, 0.3, zc, 0.1, z * 6.0))
            for iv in range(NV):
                rock.quad(grid[0][iv], bot[iv], bot[iv + 1], grid[0][iv + 1])
            # Stirnwände: schließen die Scholle an beiden Enden bis in den Boden
            for row_i, zend in ((0, za), (NV, zb)):
                top = [grid[iu][row_i] for iu in range(NU + 1)]
                low = [rock.vert(rock.v[t][0], min(rock.v[t][1], 0.0) - 0.02, zend, 0.0, 0.35, zc, rock.v[t][0] * 3.0 + 0.5, zend * 6.0 - 0.05) for t in top]
                for iu in range(NU):
                    rock.quad(top[iu], top[iu + 1], low[iu + 1], low[iu])
    return [rock, glow]


# ---------------------------------------------------------------------------------------------------------------
# 4. Koloss-Meteorit mit Plasma-Bugkegel
# ---------------------------------------------------------------------------------------------------------------

CRATERS = [((0.5, 0.6, 0.62), 0.42, 0.16), ((-0.7, 0.2, 0.68), 0.34, 0.12), ((0.1, -0.8, 0.59), 0.38, 0.14), ((-0.3, 0.75, -0.58), 0.40, 0.15),
           ((0.85, -0.2, -0.48), 0.36, 0.13), ((-0.6, -0.6, -0.52), 0.30, 0.10), ((0.0, 0.1, -1.0), 0.45, 0.17)]


def build_colossus():
    rock = Part('meteor_colossus_rock', 'rock')
    plasma = Part('meteor_colossus_plasma', 'plasma')
    craters = [(Vector(d).normalized(), r, depth) for (d, r, depth) in CRATERS]
    bite_dir = Vector((-0.55, 0.45, -0.7)).normalized()
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=5, radius=1.0)
    idx = {}
    for v in bm.verts:
        n = v.co.normalized()
        big = fbm(n.x, n.y, n.z, 1.3, 4)
        mid = fbm(n.x + 7.1, n.y - 3.3, n.z + 1.9, 3.4, 3)
        # Grat-Rauschen: 1 in den Furchen (tiefe Rinnen, in denen das Magma glüht)
        ridged = 1 - abs(fbm(n.x - 2.7, n.y + 5.1, n.z + 8.3, 2.6, 3)) * 2.4
        furrow = smooth(0.62, 0.96, ridged)
        r = 1 + 0.24 * big + 0.08 * mid - 0.11 * furrow
        floor = 0.0
        for (cd, cr, depth) in craters:
            d = acos(clamp(n.dot(cd), -1.0, 1.0))
            if d < cr * 1.3:
                q = d / cr
                r += -depth * (1 - smooth(0.0, 1.0, q)) + depth * 0.35 * exp(-((q - 1.0) / 0.16) ** 2)
                floor = max(floor, 1 - smooth(0.0, 0.7, q))
        # asymmetrisch: gestreckt, auf einer Seite wie abgebrochen
        r *= 1 - 0.20 * smooth(0.55, 0.95, n.dot(bite_dir))
        x, y, z = n.x * r * 0.50, n.y * r * 0.43, n.z * r * 0.58
        R = furrow ** 1.5 * 0.95 + floor * 0.35 + 0.25 * smooth(0.3, 0.9, n.z) * furrow
        G = 0.30 + 0.55 * smooth(-0.35, 0.45, big + 0.5 * mid) + 0.15 * (1 - furrow) - 0.25 * floor
        idx[v.index] = rock.vert(x, y, z, R, G, 0.5 - 0.5 * n.z, (x + 0.5 * z) * 1.6 + 0.5, (y + 0.35 * z) * 1.6 + 0.5)
    for f in bm.faces:
        rock.tri(*[idx[v.index] for v in f.verts])
    bm.free()
    # Plasma-Bugkegel in zwei Schichten: Paraboloid um die Nase, dahinter ein langer, ausfransender Schweif
    SEG, ROWS = 44, 26
    for layer in range(2):
        k = 1.0 - 0.1 * layer
        tw = 0.5 + 0.9 * layer
        apex = 0.70 - 0.03 * layer
        rings = []
        for r in range(ROWS + 1):
            t = r / ROWS
            z = apex - (t ** 1.25) * 3.3
            if z > -0.25:
                rad = 0.80 * sqrt(clamp((apex - z) / (apex + 0.25))) + 0.006
            else:
                rad = 0.80 - 0.38 * ((-0.25 - z) / 2.35) ** 0.9
            ring = []
            for i in range(SEG + 1):
                a0 = (i % SEG) / SEG * 2 * pi
                lobe = cos(a0 * 6 + layer * 0.5)
                wob = 1 + (0.05 + 0.30 * t ** 1.5) * lobe + 0.06 * n3(cos(a0) * 2.0, sin(a0) * 2.0, t * 3.0 + layer * 5.0) * t
                a = a0 + tw * t
                zz = z - 0.22 * smooth(0.8, 1.0, t) * (1.0 if (i % SEG) % 2 else -0.4)
                R = (1 - t) ** 2.2
                G = (1 - t ** 1.6) * (0.75 + 0.25 * lobe * t)
                ring.append(plasma.vert(cos(a) * rad * wob * k, sin(a) * rad * wob * k, zz, R, G, t, i / SEG * 4.0, t * 5.0))
            rings.append(ring)
        plasma.loft(rings)
    return [rock, plasma]


# ---------------------------------------------------------------------------------------------------------------
# 5. Vorhut-Brocken mit Feuerschweif
# ---------------------------------------------------------------------------------------------------------------

def build_shards():
    parts = []
    for k in range(5):
        rock = Part('meteor_shard_%d_rock' % k, 'rock')
        plasma = Part('meteor_shard_%d_plasma' % k, 'plasma')
        L = 0.52 + 0.10 * ((k * 3) % 5) / 4
        W = 0.17 + 0.05 * ((k * 2) % 5) / 4
        roll = k * 1.31 + 0.4
        tumble_x, tumble_y = 0.22 * sin(k * 2.1), 0.2 * cos(k * 1.7)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
        idx = {}
        for v in bm.verts:
            n = v.co.normalized()
            # spitz nach vorn (Flugrichtung +Z), hinten stumpf abgebrochen
            taper = 1 - smooth(-0.2, 1.0, n.z) * 0.9
            fac = fbm(n.x + k * 3.1, n.y - k * 1.7, n.z + k, 2.2, 3)
            r = 1 + 0.26 * fac
            x = n.x * W * r * taper * (1 + 0.25 * sin(k + 1.0))
            y = n.y * W * r * taper * 0.8
            z = n.z * L * (1 + 0.1 * fac) * (0.8 if n.z < -0.6 else 1.0)
            # jeder Brocken anders gedreht: Rollen um die Flugachse, leichtes Taumeln
            x, y = _rot(x, y, roll)
            y, z = _rot(y, z, tumble_x)
            x, z = _rot(x, z, tumble_y)
            ridged = 1 - abs(fbm(n.x - k, n.y + 2.0 * k, n.z + 4.0, 2.9, 3)) * 2.2
            R = smooth(0.6, 0.95, ridged) * 0.8 + 0.5 * smooth(0.55, 1.0, n.z)
            G = 0.35 + 0.5 * smooth(-0.4, 0.4, fac)
            idx[v.index] = rock.vert(x, y, z, R, G, 0.5 - 0.5 * n.z, (x + 0.5 * z) * 2.2 + 0.5, (y + 0.35 * z) * 2.2 + 0.5)
        for f in bm.faces:
            rock.tri(*[idx[v.index] for v in f.verts])
        bm.free()
        # Feuerschweif: drei verdrehte Flammenlappen, lang auslaufend
        SEG, ROWS = 18, 20
        tail = 2.9 + 0.5 * ((k * 2) % 3)
        rings = []
        for r in range(ROWS + 1):
            t = r / ROWS
            z = 0.14 * L - t * tail
            env = sin(pi * min(1.0, t * 4) / 2) if t < 0.25 else 1.0
            ring = []
            for i in range(SEG + 1):
                a0 = (i % SEG) / SEG * 2 * pi
                rad = W * 1.55 * env * (1 - t) ** 0.75 * (1 + 0.3 * cos(a0 * 3 + 5.0 * t + k)) + 0.004
                x, y = _rot(cos(a0) * rad, sin(a0) * rad, roll + t * 2.2)
                ring.append(plasma.vert(x, y, z, (1 - t) ** 2.0, 1 - t ** 1.4, t, i / SEG * 2.0, t * 4.0))
            rings.append(ring)
        plasma.loft(rings)
        # glühender Kern im Schweif
        rings = []
        for r in range(9):
            t = r / 8
            z = -0.1 * L - t * tail * 0.6
            ring = []
            for i in range(7):
                a0 = (i % 6) / 6 * 2 * pi
                rad = W * 0.5 * (1 - t) ** 0.8 + 0.003
                ring.append(plasma.vert(cos(a0) * rad, sin(a0) * rad, z, 1.0 - 0.3 * t, 1.0 - 0.8 * t, t * 0.6, i / 6.0, t * 4.0))
            rings.append(ring)
        plasma.loft(rings)
        parts += [rock, plasma]
    return parts


export('vfx_fist_shockcone', build_shockcone())
export('vfx_fist_rapid_barrage', build_barrage())
export('vfx_trench_fissure', build_fissure())
export('vfx_meteor_colossus', build_colossus())
export('vfx_meteor_shards', build_shards())
print('VFX fertig:', OUT)
