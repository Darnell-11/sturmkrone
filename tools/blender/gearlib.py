# Hilfsfunktionen für Ausrüstungsmodelle in Blender (Blender-MCP: exec(open(pfad).read())).
# Körper: VRoid base_male.glb, Meter, Z oben, Vorderseite +Y. Teile werden aus der Haut des Körpers abgeleitet
# (Region ausschneiden, entlang der Normalen aufblasen), damit sie in der Ruhehaltung ohne Spalt und ohne Durchstich sitzen.
# Das Spiel überträgt die Skelett-Gewichte beim Laden vom nächsten Hautpunkt (entities/character/gear/glbGear.ts).
import bpy, bmesh, math, os
from mathutils import Vector

GEAR_DIR = r'C:\Users\asuns\Downloads\Stormnights\sturmkrone\public\models\gear'
os.makedirs(GEAR_DIR, exist_ok=True)

ROLES = {  # Materialrolle -> (Anzeigefarbe im Modell)
    'main': (0.45, 0.28, 0.14), 'trim': (0.8, 0.62, 0.2), 'leather': (0.35, 0.2, 0.1),
    'steel': (0.6, 0.62, 0.66), 'gold': (0.89, 0.69, 0.29), 'dark': (0.08, 0.07, 0.07), 'cloth': (0.8, 0.78, 0.7),
    'skin': (0.9, 0.72, 0.58), 'hair': (0.2, 0.14, 0.1),
}

def mat(role):
    m = bpy.data.materials.get(role)
    if not m:
        m = bpy.data.materials.new(role)
        m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        c = ROLES.get(role, (0.5, 0.5, 0.5))
        b.inputs['Base Color'].default_value = (*c, 1)
    return m

def body():
    return bpy.data.objects['Body']

def clear_gear():
    if bpy.context.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
    for o in list(bpy.data.objects):
        if o.name.startswith('G_'):
            bpy.data.objects.remove(o, do_unlink=True)

def region(name, pred, offset, mat_index=0, role='main', src=None):
    """Flächen (Haut des Körpers oder eines anderen Netzes src), deren Punkte alle pred(co) erfüllen, als neues Netz; offset(co) in m entlang der Normale."""
    src = src or body()
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bm.verts.ensure_lookup_table()
    keep = [f for f in bm.faces if (src is not None and (src.name != 'Body' or f.material_index == mat_index)) and all(pred(v.co) for v in f.verts)]
    drop = [f for f in bm.faces if f not in set(keep)]
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset(v.co)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat(role))
    return ob

def smooth(ob, levels=1, factor=0.5, repeat=2):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    if levels:
        m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = levels; m.render_levels = levels
        bpy.ops.object.modifier_apply(modifier=m.name)
    m = ob.modifiers.new('sm', 'SMOOTH'); m.factor = factor; m.iterations = repeat
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.shade_smooth()

def solid(ob, thickness):
    bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new('sol', 'SOLIDIFY'); m.thickness = thickness; m.offset = 1
    bpy.ops.object.modifier_apply(modifier=m.name)

def _view3d():
    for w in bpy.context.window_manager.windows:
        for a in w.screen.areas:
            if a.type == 'VIEW_3D':
                for r in a.regions:
                    if r.type == 'WINDOW':
                        return w, a, r
    return None

def unwrap(ob, margin=0.02):
    """UV-Inseln ohne Überlappung (Smart UV Project)."""
    if bpy.context.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')

def join(objs, name):
    for o in objs:
        uvs = o.data.uv_layers
        while len(uvs) > 1: uvs.remove(uvs[len(uvs) - 1])
        if len(uvs): uvs[0].name = 'UVMap'
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name; o.data.name = name
    return o

def export(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_yup=True,
                              export_apply=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
                              export_cameras=False, export_lights=False, export_draco_mesh_compression_enable=False)


# ---------- Schnitte und Lofts: saubere Ringflächen um Gliedmaßen ----------
import bisect

_skin_cache = {}

def skin_points():
    if 'p' not in _skin_cache:
        b = body()
        _skin_cache['p'] = [v.co.copy() for p in b.data.polygons if p.material_index == 0 for v in [b.data.vertices[i] for i in p.vertices]]
    return _skin_cache['p']

def section(side, z, half=0.024, bins=48, xrange=None, legacy=False):
    """Querschnitt der Haut eines Beins (side = -1 links/+1 rechts im Blender-Raum x<0 / x>0) bei Höhe z: Mitte und Radius je Winkel."""
    if legacy: half = 0.014
    pts = [p for p in skin_points() if abs(p.z - z) < half and (side == 0 or p.x * side > 0.005) and (xrange is None or xrange[0] < p.x * side < xrange[1])]
    # Rumpf auf Schulterhöhe ohne die Arme (T-Pose): sonst weitet sich der Schnitt bis zu den Handgelenken
    lim = 0.2 if side else (0.165 if z > 1.3 else 0.24)
    pts = [p for p in pts if abs(p.x) < lim]
    if not pts: return None
    xs = [p.x for p in pts]; ys = [p.y for p in pts]
    cx = (min(xs) + max(xs)) / 2; cy = (min(ys) + max(ys)) / 2
    r = [0.0] * bins
    for p in pts:
        a = math.atan2(p.y - cy, p.x - cx) % (2 * math.pi)
        i = int(a / (2 * math.pi) * bins) % bins
        r[i] = max(r[i], math.hypot(p.x - cx, p.y - cy))
    # Lücken füllen, glätten
    for _ in range(6):
        for i in range(bins):
            if r[i] == 0: r[i] = (r[i - 1] + r[(i + 1) % bins]) / 2 if r[i - 1] and r[(i + 1) % bins] else 0
    m = max(r)
    r = [x if x else m * 0.9 for x in r]
    # Ausreißer nach innen (dünn besetzte Schnitte) durch Maximum über die Nachbarn beheben, dann glätten
    if not legacy: r = [max(r[(i + d) % bins] for d in (-2, -1, 0, 1, 2)) for i in range(bins)]
    for _ in range(2 if legacy else 3):
        r = [(r[i - 1] + 2 * r[i] + r[(i + 1) % bins]) / 4 for i in range(bins)]
    return cx, cy, r

def loft(name, side, zs, extra, role='main', bins=48, thickness=0.0, cap=None, uvscale=(1.0, 1.0), legacy=False):
    """Geschlossener Ringschlauch um das Bein: extra(z) = Abstand zur Haut in m. Zylindrische UVs (u = Winkel, v = Höhe)."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    rings = []
    for z in zs:
        s = section(side, z, legacy=legacy)
        if not s: continue
        cx, cy, r = s
        e = extra(z)
        rings.append([bm.verts.new((cx + math.cos(2 * math.pi * i / bins) * (r[i] + e), cy + math.sin(2 * math.pi * i / bins) * (r[i] + e), z)) for i in range(bins)])
    zmin, zmax = zs[0], zs[-1]
    for k in range(len(rings) - 1):
        for i in range(bins):
            j = (i + 1) % bins
            f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            for l, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
                l[uv].uv = (ii / bins * uvscale[0], kk / max(1, len(rings) - 1) * uvscale[1])
    bm.normal_update()
    # Normalen nach außen (Mitte des Rings)
    c = sum((v.co for v in bm.verts), Vector()) / max(1, len(bm.verts))
    if sum(f.normal.dot(f.calc_center_median() - Vector((c.x, c.y, f.calc_center_median().z))) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    me.materials.append(mat(role))
    if thickness: solid(ob, thickness)
    bpy.ops.object.shade_smooth() if False else None
    for p in me.polygons: p.use_smooth = True
    return ob


def keep_faces(ob, pred):
    """Nur Flächen behalten, für die pred(face) gilt (z. B. Unterseiten für eine Sohle)."""
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.normal_update()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not pred(f)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(ob.data); bm.free()


def loft2(name, side, zs, extra, roles=('main',), bins=48, thickness=0.0, gap=None, edge_role=None, vent=None, front_only=None):
    """Wie loft, aber extra(z, a) darf vom Winkel abhängen (Falten), gap(z) = halber Öffnungswinkel vorn (Mantelfront, 0 = geschlossen).
    Flächen an der Öffnung bekommen das Material edge_role (Borte / Revers)."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    rings = []
    two = extra.__code__.co_argcount >= 2
    for z in zs:
        s = section(side, z, half=0.024, bins=bins)
        if not s: continue
        cx, cy, r = s
        row = []
        for i in range(bins):
            a = 2 * math.pi * i / bins
            e = extra(z, a) if two else extra(z)
            row.append(bm.verts.new((cx + math.cos(a) * (r[i] + e), cy + math.sin(a) * (r[i] + e), z)))
        rings.append(row)
    n = len(rings)
    for k in range(n - 1):
        z = zs[min(k, len(zs) - 1)]
        g = gap(z) if gap else 0
        for i in range(bins):
            j = (i + 1) % bins
            a_mid = 2 * math.pi * (i + 0.5) / bins
            # Vorderseite = +Y = Winkel 90°
            d = abs(((a_mid - math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi)
            if g and d < g: continue
            if front_only and d > front_only(z): continue
            if vent and abs(((a_mid + math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi) < vent(z): continue
            f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            if edge_role and g and d < g + 2 * math.pi / bins * 1.6: f.material_index = 1
            for l, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
                l[uv].uv = (ii / bins, kk / max(1, n - 1))
    bm.normal_update()
    c = sum((v.co for v in bm.verts), Vector()) / max(1, len(bm.verts))
    if sum(f.normal.dot(f.calc_center_median() - Vector((c.x, c.y, f.calc_center_median().z))) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    for r in roles: me.materials.append(mat(r))
    if thickness: solid(ob, thickness)
    for p in me.polygons: p.use_smooth = True
    return ob

def section_x(side, x, half=0.026, bins=32):
    """Querschnitt des Arms (T-Pose, Arm entlang x) bei x: Mitte (y, z) und Radius je Winkel in der y-z-Ebene."""
    pts = [p for p in skin_points() if abs(p.x * side - x) < half and p.z > 1.2]
    if not pts: return None
    ys = [p.y for p in pts]; zs = [p.z for p in pts]
    cy = (min(ys) + max(ys)) / 2; cz = (min(zs) + max(zs)) / 2
    r = [0.0] * bins
    for p in pts:
        a = math.atan2(p.z - cz, p.y - cy) % (2 * math.pi)
        i = int(a / (2 * math.pi) * bins) % bins
        r[i] = max(r[i], math.hypot(p.y - cy, p.z - cz))
    m = max(r)
    for _ in range(4):
        for i in range(bins):
            if r[i] == 0: r[i] = (r[i - 1] + r[(i + 1) % bins]) / 2
    r = [v if v else m * 0.9 for v in r]
    # Ausreißer nach innen (dünn besetzte Schnitte am Unterarm) beheben: Maximum über die Nachbarn, dann glätten
    r = [max(r[(i + d) % bins] for d in (-2, -1, 0, 1, 2)) for i in range(bins)]
    for _ in range(3):
        r = [(r[i - 1] + 2 * r[i] + r[(i + 1) % bins]) / 4 for i in range(bins)]
    return cy, cz, r

def loft_x(name, side, xs, extra, role='main', bins=32, thickness=0.0):
    """Ärmel: Ringe um den Arm entlang x."""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap'); rings = []
    for x in xs:
        s = section_x(side, x, bins=bins)
        if not s: continue
        cy, cz, r = s
        e = extra(x)
        rings.append([bm.verts.new((x * side, cy + math.cos(2 * math.pi * i / bins) * (r[i] + e), cz + math.sin(2 * math.pi * i / bins) * (r[i] + e))) for i in range(bins)])
    n = len(rings)
    for k in range(n - 1):
        for i in range(bins):
            j = (i + 1) % bins
            f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            for l, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
                l[uv].uv = (ii / bins, kk / max(1, n - 1))
    bm.normal_update()
    c = sum((v.co for v in bm.verts), Vector()) / max(1, len(bm.verts))
    if sum(f.normal.dot(f.calc_center_median() - Vector((f.calc_center_median().x, c.y, c.z))) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    me.materials.append(mat(role))
    if thickness: solid(ob, thickness)
    for p in me.polygons: p.use_smooth = True
    return ob


def shoe_points():
    b = body()
    return [b.data.vertices[i].co.copy() for p in b.data.polygons if p.material_index == 4 for i in p.vertices]

def band_y(name, side, y0, width=0.016, extra=0.005, zmin=0.026, role='main', bins=40, thick=0.004):
    """Riemen quer über den Fuß bei y0 (Schuh der Grundfigur als Form): Bogen von einer Sohlenkante über den Spann zur anderen."""
    pts = [p for p in shoe_points() if p.x * side > 0 and abs(p.y - y0) < 0.02]
    if len(pts) < 6: return None
    xs = [p.x for p in pts]; zs_ = [p.z for p in pts]
    cx = (min(xs) + max(xs)) / 2; cz = (min(zs_) + max(zs_)) / 2
    r = [0.0] * bins
    for p in pts:
        a = math.atan2(p.z - cz, p.x - cx) % (2 * math.pi)
        i = int(a / (2 * math.pi) * bins) % bins
        r[i] = max(r[i], math.hypot(p.x - cx, (p.z - cz) * 1.0))
    m = max(r)
    for _ in range(4):
        for i in range(bins):
            if r[i] == 0: r[i] = (r[i - 1] + r[(i + 1) % bins]) / 2
    r = [v if v else m * 0.8 for v in r]
    r = [max(r[(i + d) % bins] for d in (-1, 0, 1)) for i in range(bins)]
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    keep = [i for i in range(bins) if cz + math.sin(2 * math.pi * i / bins) * (r[i] + extra) > zmin]
    # zusammenhängenden Bereich (oberer Bogen) in Reihenfolge
    keep.sort()
    cols = []
    for ys in (y0 - width / 2, y0 + width / 2):
        cols.append([bm.verts.new((cx + math.cos(2 * math.pi * i / bins) * (r[i] + extra), ys, cz + math.sin(2 * math.pi * i / bins) * (r[i] + extra))) for i in keep])
    for a_, i in enumerate(keep[:-1]):
        if keep[a_ + 1] != i + 1: continue
        f = bm.faces.new((cols[0][a_], cols[0][a_ + 1], cols[1][a_ + 1], cols[1][a_]))
        for l, (u, v) in zip(f.loops, ((a_ / len(keep), 0), ((a_ + 1) / len(keep), 0), ((a_ + 1) / len(keep), 1), (a_ / len(keep), 1))):
            l[uv].uv = (u, v)
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    me.materials.append(mat(role))
    solid(ob, thick)
    for p in me.polygons: p.use_smooth = True
    return ob
