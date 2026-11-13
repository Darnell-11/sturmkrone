# Stoffhose mit Faltenwurf: weite Beine, am Knie gebauscht; Bund mit Gürtelschlaufen. Zwei Fassungen:
#   stoffhose.glb         – knielang gebauscht (für Sandalen)
#   stoffhose_stiefel.glb – schmal in den Stiefelschaft gesteckt (unter 0,5 m liegt sie innerhalb des Schafts), darüber gebauscht
import numpy as np
def build(tucked, fname):
    clear_gear()
    parts = []
    zs = lambda a, b, n: [a + (b - a) * i / (n - 1) for i in range(n)]

    def folds(z, a):
        # senkrechte Falten, die sich nach unten verziehen, dazu Querknitter am Knie
        return 0.003 * math.sin(a * 6 + 0.8 * math.sin(z * 9)) + 0.0016 * math.sin(a * 11 - z * 13) + 0.0014 * math.sin(z * 40 + a * 2) * (1 if 0.45 < z < 0.7 else 0.2)

    def leg_extra(z, a):
        e = leg_extra0(z, a)
        k = max(0.0, min(1.0, (z - 0.93) / 0.1)); k = k * k * (3 - 2 * k)
        return e * (1 - 0.55 * k)    # am Bund eng, damit das Hemd darüber liegt

    def leg_extra0(z, a):
        t = (z - 0.36) / (1.0 - 0.36)
        base = 0.007 + 0.008 * np.sin(np.clip(t, 0, 1) * math.pi)      # in der Mitte am weitesten
        bloom = 0.014 * max(0.0, (0.46 - z) / 0.1)                       # unten gebauscht über dem Stiefelschaft
        if tucked:
            k = max(0.0, min(1.0, (z - 0.5) / 0.14)); k = k * k * (3 - 2 * k)
            return (0.003 + (base + bloom - 0.003) * k) + folds(z, a) * k
        return base + bloom + folds(z, a)

    for side in (-1, 1):
        n = 'L' if side < 0 else 'R'
        parts.append(loft2('G_bein' + n, side, zs(0.36, 1.03, 30), leg_extra, ('main',), bins=40, thickness=0.004))
    # Hosenbund über beide Beine
    parts.append(loft2('G_bund', 0, zs(0.99, 1.075, 4), lambda z, a: 0.011 + 0.002 * math.sin(a * 9), ('trim',), bins=64, thickness=0.004))
    # Gürtelschlaufen
    for k in range(7):
        a = k / 7 * 2 * math.pi
        s = section(0, 1.03, bins=48)
        if not s: continue
        cx, cy, r = s
        i = int(a / (2 * math.pi) * len(r)) % len(r)
        rr = r[i] + 0.03
        bpy.ops.mesh.primitive_cube_add(size=1, location=(cx + math.cos(a) * rr, cy + math.sin(a) * rr, 1.04))
        c = bpy.context.active_object; c.name = 'G_schlaufe%d' % k; c.scale = (0.014, 0.014, 0.05); c.rotation_euler = (0, 0, a); c.data.materials.append(mat('leather')); parts.append(c)
    for o in parts: unwrap(o)
    hose = join(parts, 'G_stoffhose')
    export([hose], os.path.join(GEAR_DIR, fname))
    print('hose', fname, len(hose.data.polygons))


build(False, 'stoffhose.glb')
build(True, 'stoffhose_stiefel.glb')
