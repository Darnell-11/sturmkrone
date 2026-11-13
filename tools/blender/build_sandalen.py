# Offene Riemen-Sandalen: Sohle, Spannriemen, Zehenband, Fersenriemen und Knöchelband mit Schnalle; der Fuß der Grundfigur bleibt zu sehen.
clear_gear()
parts = []
# Sohle: Unterseite des Fußes der Grundfigur, nach unten verdickt
sole = region('G_sohle', lambda c: c.z < 0.06, lambda c: 0.002, 0, 'leather'); keep_faces(sole, lambda f: f.normal.z < -0.3); smooth(sole, 1, 0.4, 2); solid(sole, -0.016); unwrap(sole); parts.append(sole)
# glatter Fuß der Grundfigur (die Haut ist dort grob)
skin = region('G_fuss', lambda c: c.z < 0.1, lambda c: 0.0035, 0, 'skin'); smooth(skin, 2, 0.5, 3); unwrap(skin); parts.append(skin)
# nackte Waden: decken die aufgemalten Socken der Grundfigur (Hautflächen, glatt)
wade = region('G_wade', lambda c: 0.09 < c.z < 0.40, lambda c: 0.006, 0, 'skin'); smooth(wade, 2, 0.5, 3); unwrap(wade); parts.append(wade)
for side in (-1, 1):
    n = 'L' if side < 0 else 'R'
    for k, (y0, w) in enumerate(((0.108, 0.014), (0.062, 0.018), (0.02, 0.02))):
        b = band_y('G_riemen%s%d' % (n, k), side, y0, w, 0.006 + 0.001 * k, 0.03, 'main', 40, 0.004)
        if b: unwrap(b); parts.append(b)
    # Knöchelband
    kn = loft('G_knoechel' + n, side, [0.12, 0.134, 0.148], lambda z: 0.011, 'main', thickness=0.004); unwrap(kn); parts.append(kn)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(side * 0.095, 0.0, 0.134)); sc = bpy.context.active_object
    sc.name = 'G_schnalle' + n; sc.scale = (0.01, 0.026, 0.026); sc.data.materials.append(mat('gold')); unwrap(sc); parts.append(sc)
sand = join(parts, 'G_sandalen')
export([sand], GEAR_DIR + r'\sandalen.glb')
print('sandalen', len(sand.data.polygons), [m.name for m in sand.data.materials], os.path.getsize(GEAR_DIR + r'\sandalen.glb'))
