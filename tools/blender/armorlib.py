# Hilfen für Rüstungs- und Waffenmodelle (Hartflächen): Drehkörper, Platten, Röhren, Fasen, Spiegeln.
# Wird von den Skripten per exec geladen (nach gearlib.py). Meter, Z oben, Vorderseite +Y, Kopfmitte (0, 0.003, 1.64).
import bpy, bmesh, math
from mathutils import Vector, Matrix

ROLES.update({'glow': (0.5, 0.85, 1.0), 'steel2': (0.38, 0.4, 0.45)})

def _link(name, me, role, smooth):
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat(role))
    for p in me.polygons: p.use_smooth = smooth
    return ob

def solid_from_bm(name, bm, role='main', smooth=True):
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    return _link(name, me, role, smooth)

def revolve(name, profile, segs=36, role='main', smooth=True, closed=False, x_scale=1.0, y_scale=1.0, arc=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Drehkörper um die Z-Achse aus Profilpunkten (Radius, Höhe) von unten nach oben; arc = (von, bis) Winkel für Teilschalen."""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    a0, a1 = arc if arc else (0.0, 2 * math.pi)
    full = arc is None
    n = segs if full else segs + 1
    rings = []
    for (r, z) in profile:
        row = []
        for i in range(n):
            t = a0 + (a1 - a0) * (i / segs)
            row.append(bm.verts.new((r * math.cos(t) * x_scale, r * math.sin(t) * y_scale, z)))
        rings.append(row)
    m = len(profile)
    for k in range(m - 1):
        for i in range(segs if full else segs):
            j = (i + 1) % n
            f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            for l, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
                l[uv].uv = (ii / segs, kk / (m - 1))
    bm.normal_update()
    ob = solid_from_bm(name, bm, role, smooth)
    # Normalen nach außen: Mittelpunkt prüfen
    fix_normals(ob)
    xform(ob, loc, rot)
    return ob

def fix_normals(ob, outward=True):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free()

def xform(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """Lage, Drehung (Bogenmaß, XYZ), Maßstab in die Punkte einrechnen."""
    M = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Diagonal(Vector((*scale, 1)))
    ob.data.transform(M)
    return ob

def plate(name, outline, thick=0.006, role='main', smooth=False, z=0.0):
    """Platte aus einem Umriss (x, y) mit Dicke in z (Mitte bei z)."""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new((x, y, z - thick / 2)) for x, y in outline]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [v for v in r['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, thick), verts=top)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = solid_from_bm(name, bm, role, smooth)
    return ob

def sweep(name, pts, radii, sides=8, role='gold', smooth=True, cap=True):
    """Röhre entlang eines Linienzugs mit wechselndem Radius (Hörner, Spitzen, Ranken)."""
    pts = [Vector(p) for p in pts]
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        u = t.cross(a).normalized(); v = t.cross(u).normalized()
        rr = radii[i] if isinstance(radii, (list, tuple)) else radii
        rings.append([bm.verts.new(p + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * rr) for k in range(sides)])
    for i in range(len(pts) - 1):
        for k in range(sides):
            j = (k + 1) % sides
            f = bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]))
            for l, (kk, ii) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                l[uv].uv = (kk / sides, ii / max(1, len(pts) - 1))
    if cap:
        for ring in (rings[0], rings[-1]):
            try: bm.faces.new(ring)
            except ValueError: pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return solid_from_bm(name, bm, role, smooth)

def box(name, size, loc=(0, 0, 0), role='main', rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    ob = solid_from_bm(name, bm, role, False)
    xform(ob, loc, rot)
    unwrap(ob)
    return ob

def ball(name, r, loc, role='gold', scale=(1, 1, 1), segs=14, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    o.data.materials.append(mat(role))
    bpy.ops.object.transform_apply(scale=True)
    for p in o.data.polygons: p.use_smooth = True
    return o

def cone_(name, r1, r2, h, loc, role='gold', rot=(0, 0, 0), verts=12):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(mat(role))
    for p in o.data.polygons: p.use_smooth = True
    return o

def gemstone(name, r, loc, role='glow', rot=(0, 0, 0), stretch=1.5):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.scale = (1, 1, stretch); o.data.materials.append(mat(role))
    bpy.ops.object.transform_apply(scale=True)
    for p in o.data.polygons: p.use_smooth = False
    return o

def bevel(ob, width=0.002, segs=2, angle=35):
    """Kanten fasen (Hartflächen) und danach nach Winkel glätten."""
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    m = ob.modifiers.new('bv', 'BEVEL'); m.width = width; m.segments = segs; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(angle)
    bpy.ops.object.modifier_apply(modifier=m.name)
    shade(ob, angle)
    return ob

def subsurf(ob, levels=1):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    m = ob.modifiers.new('ss', 'SUBSURF'); m.levels = levels; m.render_levels = levels
    bpy.ops.object.modifier_apply(modifier=m.name)
    return ob

def thicken(ob, t, offset=1):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    m = ob.modifiers.new('sol', 'SOLIDIFY'); m.thickness = t; m.offset = offset
    bpy.ops.object.modifier_apply(modifier=m.name)
    return ob

def shade(ob, angle=35):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        try: bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
        except Exception:
            for p in ob.data.polygons: p.use_smooth = True

def mirror(ob, name=None, role=None):
    """Spiegelkopie an der Mittelebene x = 0 (Normalen werden neu ausgerichtet)."""
    me = ob.data.copy()
    me.transform(Matrix.Diagonal(Vector((-1, 1, 1, 1))))
    o2 = bpy.data.objects.new(name or ob.name + '_m', me)
    bpy.context.collection.objects.link(o2)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return o2

def pair(objs):
    """Jedes Objekt und seine Spiegelkopie (für Schultern, Hörner, Wangen)."""
    out = []
    for o in objs:
        out.append(o); out.append(mirror(o))
    return out

def wedge_row(prefix, n, builder):
    return [builder(i) for i in range(n)]

def build_model(parts, name, filename):
    for o in parts:
        if not o.data.uv_layers: unwrap(o)
    ob = join(parts, 'G_' + name)
    export([ob], GEAR_DIR + '\\' + filename + '.glb')
    print(name, len(ob.data.polygons), [m.name for m in ob.data.materials], os.path.getsize(GEAR_DIR + '\\' + filename + '.glb'))
    return ob


def shell_x(name, rows, a0, a1, cy=0.045, cz=1.40, segs=18, role='steel', smooth=True, th=0.0045):
    """Halbschale um die Armachse (X): rows = [(x, Radius)], Winkel a0..a1 in der YZ-Ebene von +Y nach +Z (Bogenmaß). Für Schulterlamellen."""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    rings = []
    for (x, r) in rows:
        rings.append([bm.verts.new((x, cy + r * math.cos(a0 + (a1 - a0) * i / segs), cz + r * math.sin(a0 + (a1 - a0) * i / segs))) for i in range(segs + 1)])
    for k in range(len(rows) - 1):
        for i in range(segs):
            f = bm.faces.new((rings[k][i], rings[k][i + 1], rings[k + 1][i + 1], rings[k + 1][i]))
            for l, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
                l[uv].uv = (ii / segs, kk / max(1, len(rows) - 1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = solid_from_bm(name, bm, role, smooth)
    # Normalen nach außen (weg von der Armachse)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    flip = sum(1 for f in bm.faces if f.normal.dot(f.calc_center_median() - Vector((f.calc_center_median().x, cy, cz))) < 0) > len(bm.faces) / 2
    if flip: bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free()
    if th: thicken(ob, th, 1)
    return ob
