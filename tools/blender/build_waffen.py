# Verziertes Entermesser (gebogener Handschutz, Säbelklinge) und Parierdolch (Glockenhandschutz, lange Parierstangen).
# Raum der Handhalterung: Griff am Ursprung, Klinge entlang +Z (im Spiel +Y), Krümmung nach +X.
clear_gear()

def blade_obj(name, z0, length, w0, w1, thick, curve, fuller=True, sections=24, role='steel'):
    """Klinge als Ringe aus 6 Punkten (Rücken, Schneide, Hohlkehle) entlang einer parabelförmigen Krümmung."""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    rings = []
    for k in range(sections + 1):
        t = k / sections
        z = z0 + length * t
        w = w0 + (w1 - w0) * t ** 0.9
        cx = curve * t * t
        tip = 1.0 if t < 0.94 else max(0.0, (1 - t) / 0.06)       # Spitze läuft aus
        h, th = w * 0.5 * tip, thick * 0.5 * (0.4 + 0.6 * tip)
        pts = [(cx + h, th), (cx + h * 0.2, th * (0.55 if fuller else 1.0)), (cx - h, 0.0), (cx + h * 0.2, -th * (0.55 if fuller else 1.0)), (cx + h, -th)]
        rings.append([bm.verts.new((px, py, z)) for px, py in pts])
    n = len(rings[0])
    for k in range(sections):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            for l, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
                l[uv].uv = (ii / n, kk / sections)
    bm.normal_update()
    if sum(f.normal.dot(f.calc_center_median() - Vector((0, 0, f.calc_center_median().z))) for f in bm.faces) < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    me.materials.append(mat(role))
    for p in me.polygons: p.use_smooth = False
    return ob

def tube(name, pts, r, role='gold', res=4):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = res; cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, c in zip(sp.bezier_points, pts):
        bp.co = c; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(o)
    cu.materials.append(mat(role))
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active

def cyl(name, r, depth, loc, role, rot=(0, 0, 0), verts=14):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(mat(role)); return o

def ball(name, r, loc, role, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=8, radius=r, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = scale; o.data.materials.append(mat(role)); return o

def grip(prefix, z0, z1, r, rings=6):
    parts = [cyl(prefix + 'griff', r, z1 - z0, (0, 0, (z0 + z1) / 2), 'leather')]
    for k in range(rings):
        z = z0 + (z1 - z0) * (k + 0.5) / rings
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.0021, major_segments=16, minor_segments=5, location=(0, 0, z))
        t = bpy.context.active_object; t.name = prefix + 'draht%d' % k; t.data.materials.append(mat('gold')); parts.append(t)
    return parts

# ---------- Entermesser ----------
cut = []
cut += grip('E_', -0.1, 0.1, 0.0155, 8)
cut.append(ball('E_knauf', 0.021, (0, 0, -0.118), 'gold', (1, 0.8, 1.1)))
cut.append(ball('E_knaufspitze', 0.008, (0, 0, -0.142), 'gold'))
# Parierstange mit eingerollten Enden
cut.append(cyl('E_stange', 0.0085, 0.14, (-0.002, 0, 0.108), 'gold', rot=(0, math.pi / 2, 0), verts=12))
for s in (-1, 1):
    cut.append(ball('E_kugel%d' % s, 0.0135, (s * 0.074 - 0.002, 0, 0.108), 'gold'))
# gebogener Handschutz (Korb): Bügel von der Stange um die Hand zum Knauf, dazu ein innerer Bogen
cut.append(tube('E_bugel', [(-0.07, 0, 0.108), (-0.095, 0, 0.04), (-0.085, 0, -0.06), (-0.04, 0, -0.118), (-0.012, 0, -0.125)], 0.0068))
cut.append(tube('E_bugel2', [(-0.05, 0, 0.102), (-0.066, 0, 0.03), (-0.058, 0, -0.05), (-0.03, 0, -0.105)], 0.0045))
cut.append(tube('E_ranke', [(-0.07, 0, 0.1), (-0.04, 0.0, 0.07), (-0.02, 0, 0.088), (-0.012, 0, 0.115)], 0.0035))
# Parierschale zur Klinge hin
bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.036, radius2=0.012, depth=0.03, location=(0.0, 0, 0.128), end_fill_type='NOTHING')
sh = bpy.context.active_object; sh.name = 'E_schale'; sh.data.materials.append(mat('gold')); solid(sh, 0.003); cut.append(sh)
# Klinge
cut.append(blade_obj('E_klinge', 0.12, 0.72, 0.05, 0.036, 0.0075, 0.12, True))
for o in cut: unwrap(o)
cm = join(cut, 'G_entermesser')
export([cm], GEAR_DIR + r'\entermesser.glb')
print('entermesser', len(cm.data.polygons), os.path.getsize(GEAR_DIR + r'\entermesser.glb'))

# ---------- Parierdolch ----------
d = []
d += grip('D_', -0.08, 0.05, 0.0135, 6)
d.append(ball('D_knauf', 0.0185, (0, 0, -0.096), 'gold', (1, 1, 1.15)))
d.append(cyl('D_stange', 0.0075, 0.17, (0, 0, 0.062), 'gold', rot=(0, math.pi / 2, 0), verts=12))
for s in (-1, 1):
    d.append(tube('D_horn%d' % s, [(s * 0.075, 0, 0.062), (s * 0.095, 0, 0.082), (s * 0.088, 0, 0.108)], 0.0058))
    d.append(ball('D_kugel%d' % s, 0.0105, (s * 0.09, 0, 0.112), 'gold'))
bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.05, radius2=0.012, depth=0.034, location=(0, 0, 0.082), end_fill_type='NOTHING')
cup = bpy.context.active_object; cup.name = 'D_glocke'; cup.data.materials.append(mat('gold')); solid(cup, 0.0035); d.append(cup)
d.append(blade_obj('D_klinge', 0.1, 0.3, 0.034, 0.02, 0.008, 0.0, True))
for o in d: unwrap(o)
dg = join(d, 'G_parierdolch')
export([dg], GEAR_DIR + r'\parierdolch.glb')
print('dolch', len(dg.data.polygons), os.path.getsize(GEAR_DIR + r'\parierdolch.glb'))
