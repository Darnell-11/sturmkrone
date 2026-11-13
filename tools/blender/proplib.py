# Gemeinsame Bausteine für Modell-Skripte (Spiel-Koordinaten: Meter, Y oben, Z vorn; beim Export nach Blender gedreht).
#   exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())   (HERE und gearlib kommen aus headless.py)
# Materialname = Rolle; das Spiel setzt dafür seine Toon-Materialien ein. Teile tragen zylindrische oder ebene UVs,
# beim Export packt Blender alle Inseln ohne Überlappung in 0..1. Optional: Ambient-Occlusion je Eckpunkt (Farbattribut Col).
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, noise as bnoise

ROLE_COL = {'wood': (0.48, 0.31, 0.19), 'darkwood': (0.29, 0.18, 0.1), 'iron': (0.29, 0.2, 0.15),
            'bronze': (0.72, 0.41, 0.23), 'brass': (0.89, 0.69, 0.29), 'dark': (0.07, 0.06, 0.06)}

def rmat(role):
    m = bpy.data.materials.get(role)
    if not m:
        m = bpy.data.materials.new(role); m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = (*ROLE_COL.get(role, (0.5, 0.5, 0.5)), 1)
    return m

CONV = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # Spiel (x, y, z) -> Blender (x, -z, y)

class Model:
    def __init__(self, name):
        self.name = name; self.bms = {}

    def _bm(self, role):
        if role not in self.bms:
            b = bmesh.new(); b.loops.layers.uv.new('UVMap'); self.bms[role] = b
        return self.bms[role]

    def _finish(self, bm, faces, smooth):
        """Flächen nach außen drehen (Summe über die Teilform) und Glättung setzen."""
        verts = {v for f in faces for v in f.verts}
        c = sum((v.co for v in verts), Vector()) / max(1, len(verts))
        bm.normal_update()
        if sum(f.normal.dot(f.calc_center_median() - c) for f in faces) < 0:
            bmesh.ops.reverse_faces(bm, faces=faces)
        for f in faces: f.smooth = smooth

    def _face(self, bm, uv, vs, uvs):
        f = bm.faces.new(vs)
        for l, p in zip(f.loops, uvs): l[uv].uv = p
        return f

    def lathe(self, role, prof, T=Matrix.Identity(4), seg=16, smooth=True, caps=True):
        """Drehkörper um die lokale Y-Achse; prof = [(radius, höhe), ...]; T setzt ihn in den Raum."""
        bm = self._bm(role); uv = bm.loops.layers.uv['UVMap']
        n = len(prof); faces = []
        lens = [0.0]
        for k in range(1, n): lens.append(lens[-1] + math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]))
        tot = max(lens[-1], 1e-6)
        rings = []
        for r, h in prof:
            rings.append([bm.verts.new(T @ Vector((r * math.cos(2 * math.pi * i / seg), h, r * math.sin(2 * math.pi * i / seg)))) for i in range(seg + 1)])
        for k in range(n - 1):
            for i in range(seg):
                faces.append(self._face(bm, uv, (rings[k][i], rings[k][i + 1], rings[k + 1][i + 1], rings[k + 1][i]),
                                        ((i / seg, lens[k] / tot), ((i + 1) / seg, lens[k] / tot), ((i + 1) / seg, lens[k + 1] / tot), (i / seg, lens[k + 1] / tot))))
        if caps:
            for end in (0, n - 1):
                r, h = prof[end]
                if r < 1e-4: continue
                ctr = bm.verts.new(T @ Vector((0, h, 0)))
                ring = [bm.verts.new(T @ Vector((r * math.cos(2 * math.pi * i / seg), h, r * math.sin(2 * math.pi * i / seg)))) for i in range(seg + 1)]
                for i in range(seg):
                    a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
                    faces.append(self._face(bm, uv, (ctr, ring[i], ring[i + 1]), ((0.5, 0.5), (0.5 + 0.5 * math.cos(a0), 0.5 + 0.5 * math.sin(a0)), (0.5 + 0.5 * math.cos(a1), 0.5 + 0.5 * math.sin(a1)))))
        # Seitenflächen und Deckel getrennt ausrichten (Deckel haben eigene Punkte)
        side = faces[:(n - 1) * seg]
        self._finish(bm, side, smooth)
        self._finish(bm, faces[(n - 1) * seg:], False) if len(faces) > (n - 1) * seg else None

    def cyl(self, role, r, length, T, seg=12, smooth=True):
        """Zylinder entlang der lokalen Y-Achse, mittig."""
        self.lathe(role, [(r, -length / 2), (r, length / 2)], T, seg, smooth)

    def sphere(self, role, r, T, seg=12):
        prof = [(r * math.sin(math.pi * k / 8), -r * math.cos(math.pi * k / 8)) for k in range(0, 9)]
        self.lathe(role, prof, T, seg, True, caps=False)

    def box(self, role, size, T):
        bm = self._bm(role); uv = bm.loops.layers.uv['UVMap']
        sx, sy, sz = (s / 2 for s in size)
        P = [T @ Vector((x * sx, y * sy, z * sz)) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
        V = [bm.verts.new(p) for p in P]
        ix = lambda x, y, z: V[(x * 4) + (y * 2) + z]    # 0/1-Indizes
        quads = [((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)), ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)),
                 ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)), ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)),
                 ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)), ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1))]
        faces = []
        for q in quads:
            faces.append(self._face(bm, uv, [ix(*c) for c in q], ((0, 0), (1, 0), (1, 1), (0, 1))))
        self._finish(bm, faces, False)

    def torus(self, role, R, r, T, seg=20, sec=8, arc=2 * math.pi):
        """Ring in der lokalen XZ-Ebene (Achse Y); arc < 2π = offener Bogen."""
        bm = self._bm(role); uv = bm.loops.layers.uv['UVMap']
        full = arc >= 2 * math.pi - 1e-6
        ns = seg if full else seg + 1
        grid = []
        for i in range(ns + (1 if full else 0)):
            a = arc * i / seg
            row = []
            for j in range(sec + 1):
                b = 2 * math.pi * j / sec
                rr = R + r * math.cos(b)
                row.append(bm.verts.new(T @ Vector((rr * math.cos(a), r * math.sin(b), rr * math.sin(a)))))
            grid.append(row)
        faces = []
        for i in range(len(grid) - 1):
            for j in range(sec):
                faces.append(self._face(bm, uv, (grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]),
                                        ((i / seg, j / sec), ((i + 1) / seg, j / sec), ((i + 1) / seg, (j + 1) / sec), (i / seg, (j + 1) / sec))))
        self._finish(bm, faces, True)

    def export(self, path):
        objs = []
        for role, bm in self.bms.items():
            me = bpy.data.meshes.new(f'{self.name}_{role}'); bm.to_mesh(me); bm.free()
            me.transform(CONV)
            ob = bpy.data.objects.new(f'G_{self.name}_{role}', me); bpy.context.collection.objects.link(ob)
            me.materials.append(rmat(role))
            objs.append(ob)
        o = join(objs, f'G_{self.name}')
        # UV-Inseln ohne Überlappung packen
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(margin=0.004, rotate=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        export([o], path)
        print(self.name, 'Dreiecke', sum(len(p.vertices) - 2 for p in o.data.polygons), 'Bytes', os.path.getsize(path))

def TR(x=0, y=0, z=0, rx=0, ry=0, rz=0):
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X')

AX = TR(rx=math.pi / 2)      # lokale Y-Achse -> Spiel +Z
AXX = TR(rz=-math.pi / 2)    # lokale Y-Achse -> Spiel +X

ROLE_COL.update({'trunk': (0.37, 0.27, 0.17), 'leaf': (0.25, 0.55, 0.22), 'leaf2': (0.35, 0.62, 0.25), 'leaf3': (0.18, 0.45, 0.2), 'nut': (0.35, 0.24, 0.13), 'rock': (0.55, 0.53, 0.5), 'drift': (0.62, 0.58, 0.5), 'plaster': (0.88, 0.82, 0.7), 'thatch': (0.66, 0.56, 0.3), 'stone': (0.6, 0.58, 0.54), 'glow': (1.0, 0.75, 0.3), 'rope': (0.72, 0.62, 0.4), 'gold': (0.89, 0.69, 0.29), 'paint': (0.6, 0.15, 0.12), 'paint': (0.18, 0.43, 0.31), 'wall': (0.88, 0.82, 0.7), 'roof': (0.55, 0.3, 0.2), 'stonelight': (0.77, 0.74, 0.67)})


# ---------- Erweiterungen: Röhren, Blätter, Blobs, Felsen, Ambient-Occlusion ----------
def _m_leaf(self, role, pts, uvs=None):
    """Doppelseitige Blattfläche (Dreieck oder Viereck), damit sie von beiden Seiten gezeichnet wird."""
    bm = self._bm(role); uv = bm.loops.layers.uv['UVMap']
    vs = [bm.verts.new(Vector(p)) for p in pts]
    n = len(vs)
    uvs = uvs or ([(0, 0), (1, 0), (0.5, 1)] if n == 3 else [(0, 0), (1, 0), (1, 1), (0, 1)])
    f1 = self._face(bm, uv, vs, uvs)
    vs2 = [bm.verts.new(Vector(p)) for p in reversed(pts)]
    f2 = self._face(bm, uv, vs2, list(reversed(uvs)))
    bm.normal_update()
    for f in (f1, f2): f.smooth = False
Model.leaf = _m_leaf

def _m_tube(self, role, path, radii, seg=8, smooth=True, caps=True, vscale=0.35, flare=None):
    """Röhre entlang einer Kurve (Liste Spiel-Punkte) mit Radius je Punkt; u läuft um den Stamm, v entlang (Borken-Shader)."""
    bm = self._bm(role); uv = bm.loops.layers.uv['UVMap']
    pts = [Vector(p) for p in path]; n = len(pts)
    ref = Vector((0, 0, 1))
    rings = []; faces = []; lens = [0.0]
    for k in range(1, n): lens.append(lens[-1] + (pts[k] - pts[k - 1]).length)
    for k in range(n):
        t = (pts[min(k + 1, n - 1)] - pts[max(k - 1, 0)]).normalized()
        nn = ref.cross(t)
        if nn.length < 1e-4: nn = Vector((1, 0, 0)).cross(t)
        nn.normalize(); bb = t.cross(nn).normalized()
        r = radii[k]
        rings.append([bm.verts.new(pts[k] + (nn * math.cos(2 * math.pi * i / seg) + bb * math.sin(2 * math.pi * i / seg)) * r) for i in range(seg + 1)])
    for k in range(n - 1):
        for i in range(seg):
            faces.append(self._face(bm, uv, (rings[k][i], rings[k][i + 1], rings[k + 1][i + 1], rings[k + 1][i]),
                                    ((i / seg, lens[k] * vscale), ((i + 1) / seg, lens[k] * vscale), ((i + 1) / seg, lens[k + 1] * vscale), (i / seg, lens[k + 1] * vscale))))
    side = faces[:]
    if caps:
        for end, k in ((0, 0), (1, n - 1)):
            if radii[k] < 1e-3: continue
            ctr = bm.verts.new(pts[k])
            ring = [bm.verts.new(v.co.copy()) for v in rings[k]]
            for i in range(seg):
                a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
                faces.append(self._face(bm, uv, (ctr, ring[i], ring[i + 1]), ((0.5, 0.5), (0.5 + 0.5 * math.cos(a0), 0.5 + 0.5 * math.sin(a0)), (0.5 + 0.5 * math.cos(a1), 0.5 + 0.5 * math.sin(a1)))))
    self._finish(bm, side, smooth)
    if len(faces) > len(side): self._finish(bm, faces[len(side):], False)
Model.tube = _m_tube

def _box_uv(f, uv, scale=0.5):
    """Ebene UVs je Fläche nach der Hauptachse der Normalen (Boxprojektion)."""
    n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
    for l in f.loops:
        c = l.vert.co
        l[uv].uv = ((c[1] if ax == 0 else c[0]) * scale, (c[1] if ax == 2 else c[2] if ax == 0 else c[2]) * scale)

def _m_blob(self, role, r, T, subdiv=2, noise=0.18, seed=0, squash=1.0, flat=False):
    """Unregelmäßiger Klumpen (Laubcluster, Busch): Ikosphäre mit Rauschen entlang der Normalen."""
    bm = self._bm(role); uv = bm.loops.layers.uv['UVMap']
    res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    vs = res['verts']
    for v in vs:
        d = v.co.normalized()
        k = 1.0 + noise * (bnoise.noise(d * 1.7 + Vector((seed * 3.1, seed * 1.3, seed * 5.7))) * 1.6)
        v.co = Vector((d.x * k * r, d.y * k * r * squash, d.z * k * r))
    bmesh.ops.transform(bm, matrix=T, verts=vs)
    faces = list({f for v in vs for f in v.link_faces})
    bm.normal_update()
    for f in faces: _box_uv(f, uv); f.smooth = not flat
Model.blob = _m_blob

def _m_rock(self, role, pts, T, bevel=0.06, seed=0):
    """Fels: konvexe Hülle um Punkte, Kanten abgeschrägt (Bevel), flach schattiert, Boxprojektions-UVs."""
    bm = self._bm(role); uv = bm.loops.layers.uv['UVMap']
    vs = [bm.verts.new(T @ Vector(p)) for p in pts]
    res = bmesh.ops.convex_hull(bm, input=vs, use_existing_faces=False)
    interior = {g for g in res.get('geom_interior', []) + res.get('geom_unused', []) if isinstance(g, bmesh.types.BMVert) and g.is_valid}
    hullv = {v for f in res['geom'] if isinstance(f, bmesh.types.BMFace) for v in f.verts}
    bmesh.ops.delete(bm, geom=list(interior - hullv), context='VERTS')
    hull_edges = list({e for f in res['geom'] if isinstance(f, bmesh.types.BMFace) and f.is_valid for e in f.edges})
    hull_faces0 = [f for f in res['geom'] if isinstance(f, bmesh.types.BMFace) and f.is_valid]
    c = sum((v.co for v in {v for f in hull_faces0 for v in f.verts}), Vector()) / max(1, len({v for f in hull_faces0 for v in f.verts}))
    bm.normal_update()
    if sum(f.normal.dot(f.calc_center_median() - c) for f in hull_faces0) < 0: bmesh.ops.reverse_faces(bm, faces=hull_faces0)
    if bevel > 0:
        b = bmesh.ops.bevel(bm, geom=hull_edges, offset=bevel, segments=1, profile=0.5, affect='EDGES')
        faces = [f for f in b['faces']] + [f for f in hull_faces0 if f.is_valid]
    else:
        faces = [f for f in hull_faces0 if f.is_valid]
    bm.normal_update()
    for f in set(faces):
        if f.is_valid: f.smooth = False; _box_uv(f, uv)
Model.rock = _m_rock

def _m_ao(self, fn):
    """AO je Eckpunkt: fn(rolle, Spiel-Punkt) -> 0..1 (dunkel = verschattet). Wird beim Export als Farbattribut Col geschrieben."""
    self.ao_fn = fn
Model.ao = _m_ao
Model.ao_fn = None

def _m_export2(self, path):
    objs = []
    for role, bm in self.bms.items():
        if self.ao_fn:
            lay = bm.loops.layers.float_color.new('Col')
            for f in bm.faces:
                for l in f.loops:
                    v = max(0.0, min(1.0, self.ao_fn(role, l.vert.co)))
                    l[lay] = (v, v, v, 1.0)
        me = bpy.data.meshes.new(f'{self.name}_{role}'); bm.to_mesh(me); bm.free()
        me.transform(CONV)
        if self.ao_fn and 'Col' in me.color_attributes: me.color_attributes.active_color = me.color_attributes['Col']
        ob = bpy.data.objects.new(f'G_{self.name}_{role}', me); bpy.context.collection.objects.link(ob)
        me.materials.append(rmat(role))
        objs.append(ob)
    o = join(objs, f'G_{self.name}')
    if self.ao_fn and 'Col' in o.data.color_attributes:
        o.data.color_attributes.active_color = o.data.color_attributes['Col']
        o.data.color_attributes.render_color_index = o.data.color_attributes.find('Col')
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=0.002, rotate=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False,
                              export_vertex_color='ACTIVE', export_vertex_color_name='Col', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
                              export_draco_mesh_compression_enable=False)
    print(self.name, 'Dreiecke', sum(len(p.vertices) - 2 for p in o.data.polygons), 'Bytes', os.path.getsize(path))
Model.export = _m_export2

def frond(m, role, base, direction, length, width, rise, droop, n=8, leaf_len=0.5, spread=0.5, side_roles=None):
    """Palmwedel/Farn: gebogene Mittelrippe, beidseits Fiederblättchen. direction = Einheitsvektor in XZ, base = Spiel-Punkt."""
    base = Vector(base); d = Vector((direction[0], 0, direction[1])).normalized(); side = Vector((-d.z, 0, d.x))
    pts = []
    for k in range(n + 1):
        t = k / n
        pts.append(base + d * (length * t) + Vector((0, rise * t - droop * t * t, 0)))
    for k in range(1, n + 1):
        t = k / n
        p = pts[k]; tang = (pts[k] - pts[k - 1]).normalized()
        w = width * (1.0 - 0.55 * t) * (0.55 + 0.7 * math.sin(math.pi * min(1.0, t * 1.15)))
        for s in (-1, 1):
            out = (side * s * spread + tang * 0.9 - Vector((0, 0.35 + 0.5 * t, 0))).normalized()
            ln = leaf_len * (1.0 - 0.4 * t)
            a = pts[k - 1].lerp(p, 0.06); b = pts[k - 1].lerp(p, 0.94)
            # Fiederblatt als schmales Viereck: Spitze nach außen und leicht nach vorn, Ränder nach unten gebogen
            ta = a + out * ln * 0.82 + tang * (leaf_len * 0.12)
            tb = b + out * ln + tang * (leaf_len * 0.3)
            m.leaf(role, [a, b, tb, ta], [(0, 0), (1, 0), (0.85, 1), (0.1, 1)])
    return pts
