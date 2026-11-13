# Langer Kapitäns-Gehrock: Rumpf mit Schoß und Rückenschlitz, offene Front mit Revers (Borte), Ärmel mit Aufschlägen,
# Stehkragen, goldene Schulterklappen mit Fransen, Knöpfe.
import numpy as np
clear_gear()
zs = lambda a, b, n: [a + (b - a) * i / (n - 1) for i in range(n)]
parts = []

def body_extra(z, a):
    flare = 0.09 * max(0.0, (1.02 - z) / 0.42) ** 1.5           # Schoß weitet sich nach unten
    waist = 0.030 + 0.004 * math.sin(a * 4)
    if z > 1.34:                                                  # nur ganz oben enger (kein Wulst um den Hals)
        k = min(1.0, (z - 1.34) / 0.1); waist = waist * (1 - 0.25 * k)
    fold = 0.004 * math.sin(a * 9 + z * 6) * max(0.0, (1.0 - z) / 0.4)
    return waist + flare + fold

def front_gap(z):
    if z > 1.40: return 0.0
    return 0.20 + 0.16 * max(0.0, (1.0 - z) / 0.45)             # Öffnung wird nach unten breiter

coat = loft2('G_rumpf', 0, zs(0.56, 1.44, 46), body_extra, ('main', 'trim'), bins=72, thickness=0.004, gap=front_gap, edge_role='trim',
             vent=lambda z: 0.07 if z < 0.93 else 0.0)
parts.append(coat)
# Innenweste: nur im Bereich der offenen Front, unter dem Mantel (Rolle cloth, Farbe aus der Ausrüstung)
weste = loft2('G_weste', 0, zs(0.95, 1.40, 18), lambda z, a: 0.018, ('cloth',), bins=72, thickness=0.003, front_only=lambda z: front_gap(z) + 0.16 if z < 1.40 else 0.2)
parts.append(weste)
# Ärmel mit Aufschlag
for side in (-1, 1):
    n = 'L' if side < 0 else 'R'
    parts.append(loft_x('G_aermel' + n, side, zs(0.15, 0.60, 14), lambda x: 0.019 - 0.002 * (x - 0.15) / 0.45, 'main', thickness=0.003))
    parts.append(loft_x('G_aufschlag' + n, side, zs(0.54, 0.605, 4), lambda x: 0.021, 'trim', thickness=0.003))
# Stehkragen
bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=0.062, radius2=0.078, depth=0.04, end_fill_type='NOTHING', location=(0, 0.002, 1.478))
col = bpy.context.active_object; col.name = 'G_kragen'; col.data.materials.append(mat('trim')); solid(col, 0.006); parts.append(col)
# Schulterklappen mit Fransen (Gold)
for s in (-1, 1):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.04, depth=0.009, location=(s * 0.176, 0.0, 1.488), rotation=(0, s * 0.35, 0))
    d = bpy.context.active_object; d.name = 'G_klappe%d' % s; d.data.materials.append(mat('gold')); parts.append(d)
    for k in range(9):
        a = (k / 8 - 0.5) * 2.2
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.0034, depth=0.04, location=(s * (0.2 + 0.006 * abs(a)), math.sin(a) * 0.04, 1.455), rotation=(0, s * 0.1, 0))
        f = bpy.context.active_object; f.name = 'G_franse%d_%d' % (s, k); f.data.materials.append(mat('gold')); parts.append(f)
# Knöpfe entlang der Öffnung
sec = {z: section(0, z, bins=72) for z in zs(0.74, 1.32, 7)}
for z, v in sec.items():
    if not v: continue
    cx, cy, r = v
    for sgn in (-1, 1):
        a = math.pi / 2 + sgn * (front_gap(z) + 0.05)
        i = int(a / (2 * math.pi) * 72) % 72
        rr = r[i] + body_extra(z, a) + 0.006
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.0085, location=(cx + math.cos(a) * rr, cy + math.sin(a) * rr, z))
        b = bpy.context.active_object; b.name = 'G_knopf'; b.data.materials.append(mat('gold')); parts.append(b)
for o in parts: unwrap(o)
rock = join(parts, 'G_gehrock')
export([rock], GEAR_DIR + r'\gehrock.glb')
print('gehrock', len(rock.data.polygons), [m.name for m in rock.data.materials], os.path.getsize(GEAR_DIR + r'\gehrock.glb'))
