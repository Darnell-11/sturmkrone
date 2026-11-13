# Dreispitz: Filzkuppel mit Hutband, dreifach hochgeschlagene Krempe mit Goldborte, Kokarde und Federn.
clear_gear()
parts = []
Z0 = 1.655; CY = 0.03; RIN = 0.113
bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
NT, NR = 96, 10
rows = []
def w(t): return 0.5 - 0.5 * math.cos(3 * t)
for k in range(NR + 1):
    u = k / NR
    row = []
    for i in range(NT):
        t = 2 * math.pi * i / NT
        rout = 0.17 + 0.075 * (1 - w(t)) ** 1.3
        r = RIN + (rout - RIN) * u
        z = Z0 + 0.085 * w(t) * (u ** 1.5) + 0.006 * math.sin(u * 3)
        row.append(bm.verts.new((r * math.sin(t), CY + r * math.cos(t), z)))
    rows.append(row)
for k in range(NR):
    for i in range(NT):
        j = (i + 1) % NT
        f = bm.faces.new((rows[k][i], rows[k][j], rows[k + 1][j], rows[k + 1][i]))
        f.material_index = 1 if k >= NR - 1 else 0
        for l, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
            l[uv].uv = (ii / NT, kk / NR)
bm.normal_update()
if sum(f.normal.z for f in bm.faces) < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces)
me = bpy.data.meshes.new('G_krempe'); bm.to_mesh(me); bm.free()
brim = bpy.data.objects.new('G_krempe', me); bpy.context.collection.objects.link(brim)
me.materials.append(mat('dark')); me.materials.append(mat('trim'))
solid(brim, 0.005)
for p in me.polygons: p.use_smooth = True
parts.append(brim)

# Kuppel (Drehkörper) mit Hutband
prof = [(RIN, 0.0), (RIN + 0.004, 0.03), (RIN - 0.002, 0.062), (RIN - 0.02, 0.082), (RIN - 0.055, 0.09), (0.03, 0.093), (0.0, 0.094)]
bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
NS = 48
rings = []
for (r, h) in prof:
    rings.append([bm.verts.new((r * math.sin(2 * math.pi * i / NS), CY + r * math.cos(2 * math.pi * i / NS), Z0 + h)) for i in range(NS)])
for k in range(len(prof) - 1):
    for i in range(NS):
        j = (i + 1) % NS
        f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
        f.material_index = 1 if k == 0 else 0
        for l, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
            l[uv].uv = (ii / NS, kk / (len(prof) - 1))
bm.normal_update()
if sum(f.normal.z for f in bm.faces) < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces)
me = bpy.data.meshes.new('G_kuppel'); bm.to_mesh(me); bm.free()
crown = bpy.data.objects.new('G_kuppel', me); bpy.context.collection.objects.link(crown)
me.materials.append(mat('dark')); me.materials.append(mat('leather'))
solid(crown, 0.004)
for p in me.polygons: p.use_smooth = True
parts.append(crown)

# Kokarde vorn und Federn
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.017, location=(0, CY + 0.178, Z0 + 0.012))
ck = bpy.context.active_object; ck.name = 'G_kokarde'; ck.scale = (1, 0.5, 1); ck.data.materials.append(mat('gold')); parts.append(ck)

def feder(name, pts, r):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 3; cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, c in zip(sp.bezier_points, pts):
        bp.co = c; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(o)
    cu.materials.append(mat('cloth'))
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active

for k, (dx, dy, lift) in enumerate(((0.0, 0.0, 0.0), (0.012, -0.02, 0.01), (-0.012, -0.02, 0.01))):
    parts.append(feder('G_feder%d' % k, [(0.09 + dx, CY + 0.13, Z0 + 0.03), (0.15 + dx, CY + 0.07 + dy, Z0 + 0.13 + lift), (0.17 + dx, CY - 0.04 + dy, Z0 + 0.18 + lift), (0.13 + dx, CY - 0.12 + dy, Z0 + 0.16 + lift)], 0.0075 - 0.0012 * k))
for o in parts: unwrap(o)
hat = join(parts, 'G_dreispitz')
export([hat], GEAR_DIR + r'\dreispitz.glb')
print('dreispitz', len(hat.data.polygons), [m.name for m in hat.data.materials], os.path.getsize(GEAR_DIR + r'\dreispitz.glb'))
