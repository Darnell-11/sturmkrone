# Schwere Piraten-Stulpenstiefel (beide Füße). Aufruf in Blender: exec(open(pfad).read()) nach gearlib.py und geladenem base_male.glb.
import numpy as np
clear_gear()
parts = []
zs = lambda a, b, n: [a + (b - a) * i / (n - 1) for i in range(n)]
for side in (-1, 1):
    n = 'L' if side < 0 else 'R'
    parts.append(loft('G_schaft' + n, side, zs(0.11, 0.50, 14), lambda z: 0.007 + 0.004 * (z - 0.11) / 0.4, 'main', thickness=0.003, legacy=True))
    cz = [0.42, 0.45, 0.48, 0.51, 0.535, 0.545]; ce = [0.009, 0.012, 0.018, 0.024, 0.028, 0.023]
    parts.append(loft('G_stulpe' + n, side, cz, lambda z: float(np.interp(z, cz, ce)), 'trim', thickness=0.006, legacy=True))
    parts.append(loft('G_riemen1' + n, side, zs(0.318, 0.352, 3), lambda z: 0.012, 'leather', thickness=0.004, legacy=True))
    parts.append(loft('G_riemen2' + n, side, zs(0.185, 0.219, 3), lambda z: 0.010, 'leather', thickness=0.004, legacy=True))
foot = region('G_fuss', lambda c: c.z < 0.115, lambda c: 0.008, 4, 'main'); smooth(foot, 1, 0.4, 2)
sole = region('G_sohle', lambda c: c.z < 0.04, lambda c: 0.008, 4, 'dark'); keep_faces(sole, lambda f: f.normal.z < -0.45); smooth(sole, 1, 0.4, 2); solid(sole, 0.009)
for o in (foot, sole): unwrap(o)
bx = []
for s in (-1, 1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(s * 0.092, 0.0, 0.335))
    c = bpy.context.active_object; c.name = 'G_schnalle%d' % s; c.scale = (0.012, 0.03, 0.034); c.data.materials.append(mat('gold')); bx.append(c)
boots = join(parts + [foot, sole] + bx, 'G_stulpenstiefel')
export([boots], GEAR_DIR + r'\stulpenstiefel.glb')
print('boots', len(boots.data.polygons), os.path.getsize(GEAR_DIR + r'\stulpenstiefel.glb'))
