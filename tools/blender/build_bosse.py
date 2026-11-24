# Ausrüstung der sechs Raid-Endbosse (Blender, headless): je Boss eine Kopfbedeckung und eigene Waffen.
#   England    – Blackwood:   Admiralszweispitz mit Federbusch, Marinesäbel, Steinschlosspistole
#   Niederlande– Van Der Berg: Morion mit Federn und Kamm, Hellebarde
#   Deutschland– Eisenstein:   Topfhelm mit Adlerschwingen, Zweihänder
#   Frankreich – De Valois:    Kavalierhut mit Federn und Lilienbrosche, Rapier mit Prunkgefäß
#   Kurogane   – Schattenfürst: Kabuto mit Dämonenmaske und Mondsichel, Katana und Wakizashi
#   Marine     – Valken:       Admiralsmütze mit Anker, Kanonenfaust (Panzerhandschuh mit Geschützrohr)
# Aufruf: blender --background --python tools/blender/headless.py -- build_bosse.py
# Raum der Köpfe: Kopfmitte (0, 0.003, 1.64), Vorderseite +Y. Waffen: Griff am Ursprung, Klinge entlang +Z (im Spiel +Y); Faustwaffen: Knöchel nach +Y, dann 180° um Z.
# Rollen (Materialnamen): steel, gold, leather, dark, cloth, main, trim, glow – das Spiel setzt Oberfläche und Farbe je Rolle (data/gear.ts, Sets `boss_*`).
exec(open(os.path.join(HERE, 'armorlib.py'), encoding='utf-8').read())
clear_gear()

BOSS_DIR = os.path.join(ROOT, 'public', 'models', 'bosses')
os.makedirs(BOSS_DIR, exist_ok=True)
CY, CZ = 0.003, 1.64
P2 = math.pi
FRONT = P2 / 2

def build_boss(parts, name):
    for o in parts:
        if not o.data.uv_layers: unwrap(o)
    ob = join(parts, 'G_' + name)
    path = os.path.join(BOSS_DIR, name + '.glb')
    export([ob], path)
    print('BOSS', name, len(ob.data.polygons), 'Flächen', os.path.getsize(path), 'Byte')
    clear_gear()
    return ob

# ---------- Hilfen (aus build_helme.py und build_waffen2.py) ----------
def dome(name, rs, role='steel', segs=40, sy=1.08, arc=None, th=0.0045, xs=1.0):
    prof = [(r, CZ + h) for r, h in rs]
    ob = revolve(name, prof, segs=segs, role=role, x_scale=xs, y_scale=sy, arc=arc, loc=(0, CY, 0))
    if th: thicken(ob, th, 1)
    return ob

def band(name, r, z, h, a0=0.0, a1=2 * P2, th=0.006, role='gold', sy=1.08, segs=40, xs=1.0):
    ob = revolve(name, [(r, z - h / 2), (r + th, z - h / 2), (r + th, z + h / 2), (r, z + h / 2)], segs=segs, role=role, x_scale=xs, y_scale=sy,
                 arc=None if (a1 - a0) >= 2 * P2 - 1e-3 else (a0, a1), loc=(0, CY, 0))
    return bevel(ob, 0.0012, 1, 40)

def lift(ob, fn):
    """Punkte anheben: fn(x, y, z) -> dz (y gemessen von der Kopfmitte). Für aufgebogene Krempen."""
    for v in ob.data.vertices:
        v.co.z += fn(v.co.x, v.co.y - CY, v.co.z)
    ob.data.update()
    return ob

def blade(name, z0, length, w0, w1, thick, curve, fuller=0.55, sections=30, role='steel', edge='both', tip=0.07, hamon=0.11, hseed=0.0):
    """Klinge: Ringe aus 8 Punkten (Rücken, Fläche, Schneide). curve = seitliche Auslenkung der Spitze (parabelförmig).
    4.4B: Schneide und Klingenfläche sind getrennte Teile – die Schneide (Rolle 'edge', heller polierter Stahl) endet an einer welligen
    Härtungslinie (Hamon, Stärke `hamon`); bei zweischneidigen Klingen auf beiden Seiten. Gibt eine Liste [Fläche, Schneide] zurück."""
    rings = []
    for k in range(sections + 1):
        t = k / sections
        z = z0 + length * t
        w = w0 + (w1 - w0) * t ** 0.85
        cx = curve * t * t
        tp = 1.0 if t < 1 - tip else max(0.0, (1 - t) / tip)       # Spitze läuft aus
        h = w * 0.5 * (tp ** 0.6 if t > 1 - tip else 1.0)
        th = thick * 0.5 * (0.45 + 0.55 * tp)
        f = fuller
        # Hamon: die Grenze zwischen Schneide und Fläche wellt sich in unregelmäßigen Bögen (zwei Frequenzen)
        wv = hamon * (math.sin(t * 38.0 + hseed) * 0.65 + math.sin(t * 91.0 + 1.7 + hseed) * 0.35)
        if edge == 'both':
            a = 0.55 + wv
            pts = [(cx + h, 0.0), (cx + h * a, th), (cx - h * 0.05, th * f), (cx - h * a, th), (cx - h, 0.0), (cx - h * a, -th), (cx - h * 0.05, -th * f), (cx + h * a, -th)]
        else:  # eine Schneide (+x), dicker Rücken (-x)
            a = 0.45 + wv
            pts = [(cx + h, 0.0), (cx + h * a, th * 0.85), (cx - h * 0.35, th), (cx - h * 0.95, th * 0.7), (cx - h, 0.0), (cx - h * 0.95, -th * 0.7), (cx - h * 0.35, -th), (cx + h * a, -th * 0.85)]
        rings.append([(px, py, z) for px, py in pts])
    n = len(rings[0])
    edge_q = {7, 0} | ({3, 4} if edge == 'both' else set())
    def part(nm, want_edge, rl):
        bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
        vs = [[bm.verts.new(p) for p in ring] for ring in rings]
        for k in range(sections):
            for i in range(n):
                if (i in edge_q) != want_edge: continue
                j = (i + 1) % n
                f2 = bm.faces.new((vs[k][i], vs[k][j], vs[k + 1][j], vs[k + 1][i]))
                for l, (ii, kk) in zip(f2.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
                    l[uv].uv = (ii / n, kk / sections)
        if not want_edge:
            try: bm.faces.new(vs[0])
            except ValueError: pass
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return solid_from_bm(nm, bm, rl, False)
    return [part(name, False, role), part(name + '_schneide', True, 'edge')]

def cylz(name, r, z0, z1, role, x=0.0, y=0.0, verts=14):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=z1 - z0, location=(x, y, (z0 + z1) / 2))
    o = bpy.context.active_object; o.name = name; o.data.materials.append(mat(role))
    for p in o.data.polygons: p.use_smooth = True
    return o

def wrap(prefix, z0, z1, r, n, role='dark', rr=0.0022):
    out = []
    for k in range(n):
        z = z0 + (z1 - z0) * (k + 0.5) / n
        bpy.ops.mesh.primitive_torus_add(major_radius=r + 0.0006, minor_radius=rr, major_segments=16, minor_segments=5, location=(0, 0, z))
        t = bpy.context.active_object; t.name = prefix + str(k); t.data.materials.append(mat(role)); out.append(t)
    return out

def disc(name, r, z, th, role, x=0.0, y=0.0, verts=24, sx=1.0, sy=1.0):
    o = cylz(name, r, z - th / 2, z + th / 2, role, x, y, verts)
    o.scale = (sx, sy, 1); bpy.ops.object.transform_apply(scale=True)
    return o

def feather(name, pts, width, role='cloth', thick=0.0035, side=None):
    """Flache Feder: Band entlang der Punkte (Breite läuft zur Spitze hin aus), dünn verdickt."""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    n = len(pts); rows = []
    for i, p in enumerate(pts):
        t = (Vector(pts[min(i + 1, n - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        sd = Vector(side) if side else t.cross(Vector((0, 1, 0)))
        if sd.length < 0.25: sd = Vector((1, 0, 0))
        sd.normalize()
        u = i / (n - 1)
        w = width * (math.sin(math.pi * min(1.0, 0.06 + 0.94 * u)) ** 0.55)
        rows.append((bm.verts.new(Vector(p) + sd * w * 0.5), bm.verts.new(Vector(p) - sd * w * 0.5)))
    for i in range(n - 1):
        f = bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
        for l, (jj, ii) in zip(f.loops, ((0, i), (1, i), (1, i + 1), (0, i + 1))):
            l[uv].uv = (jj, ii / (n - 1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = solid_from_bm(name, bm, role, True)
    return thicken(ob, thick, 0)

def bake(parts):
    """Objektlage in die Netzpunkte einrechnen (damit spätere Drehungen alle Teile gleich treffen)."""
    for o in parts:
        if o.location.length > 1e-9 or o.rotation_euler.x or o.rotation_euler.y or o.rotation_euler.z:
            o.data.transform(o.matrix_world)
            o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0)
    return parts

def plume(prefix, base, tips, role='cloth', r0=0.012, n=3, spread=0.035):
    """Federbusch: n gebogene Röhren vom Ansatz `base` zu den Spitzen `tips` (Liste von Punkten pro Feder)."""
    out = []
    for i, pts in enumerate(tips):
        out.append(sweep('%s%d' % (prefix, i), pts, [r0, r0 * 1.5, r0 * 1.6, r0 * 1.1, 0.002][:len(pts)] if len(pts) <= 5 else r0, 8, role))
    return out

# =====================================================================================================
# 1 · ENGLAND – Lord-Admiral Blackwood
# =====================================================================================================
def blackwood_head():
    P = []
    # Admiralszweispitz: flache Haube, vorn und hinten hochgeklappte Krempe, die an den Seiten in zwei Spitzen ausläuft (quer getragen)
    P.append(dome('B_haube', [(0.108, 0.05), (0.112, 0.085), (0.106, 0.12), (0.085, 0.142), (0.045, 0.152), (0.0, 0.154)], 'main', th=0.004))
    XS = 1.5
    def fold(name, a0, a1):
        ob = revolve(name, [(0.112, CZ + 0.07), (0.128, CZ + 0.13), (0.136, CZ + 0.205)], segs=26, role='main', x_scale=XS, y_scale=1.0, arc=(a0, a1), loc=(0, CY, 0))
        lift(ob, lambda x, y, z: 0.085 * (abs(x) / 0.2) ** 2 * ((z - (CZ + 0.07)) / 0.135) - 0.03 * ((z - (CZ + 0.07)) / 0.135) * (1 - abs(x) / 0.2) ** 2 * (1 if abs(x) < 0.2 else 0))
        thicken(ob, 0.0045, 1); bevel(ob, 0.0013, 1, 40)
        return ob
    P.append(fold('B_front', FRONT - 1.62, FRONT + 1.62))
    P.append(fold('B_back', FRONT + P2 - 1.62, FRONT + P2 + 1.62))
    P.append(band('B_band', 0.113, CZ + 0.082, 0.022, role='gold', xs=1.0))
    # goldene Tresse oben an der Falte (vorn und hinten)
    for off in (0.0, P2):
        pts = []
        for i in range(15):
            a = FRONT + off - 1.5 + 3.0 * i / 14
            x, y = 0.136 * XS * math.cos(a), CY + 0.136 * math.sin(a)
            pts.append((x, y, CZ + 0.205 + 0.085 * (abs(x) / 0.2) ** 2 - 0.03 * (1 - abs(x) / 0.2) ** 2 * (1 if abs(x) < 0.2 else 0) + 0.004))
        P.append(sweep('B_tresse%d' % int(off), pts, 0.0058, 6, 'gold'))
    # Kokarde mit Glasknopf vorn
    c = disc('B_kokarde', 0.034, 0, 0.008, 'gold', verts=20); xform(c, (0, CY + 0.152, CZ + 0.15), (math.pi / 2, 0, 0)); c.location = (0, 0, 0); P.append(c)
    P.append(ball('B_knopf', 0.014, (0, CY + 0.16, CZ + 0.15), 'glow', segs=10, rings=6))
    # weißer Federbusch an der rechten Spitze, nach hinten fallend
    for k, (dx, dz) in enumerate(((0.0, 0.0), (0.018, 0.02), (-0.018, 0.012), (0.036, 0.034), (-0.034, 0.024))):
        pts = [(0.23 + dx * 0.3, CY, CZ + 0.17), (0.24 + dx, CY - 0.06, CZ + 0.25 + dz), (0.235 + dx, CY - 0.16, CZ + 0.29 + dz), (0.225 + dx, CY - 0.26, CZ + 0.26 + dz), (0.22 + dx, CY - 0.33, CZ + 0.19 + dz)]
        P.append(feather('B_feder%d' % k, pts, 0.05, 'cloth', side=(1, 0, 0.35)))
    return P
build_boss(blackwood_head(), 'blackwood_head')

def blackwood_saebel():
    P = []
    P.append(cylz('S_griff', 0.0158, -0.1, 0.1, 'leather'))
    P += wrap('S_draht', -0.095, 0.095, 0.0158, 9, 'gold', 0.0017)
    P.append(ball('S_knauf', 0.024, (0, 0, -0.118), 'gold', (1, 0.85, 1.1)))
    P.append(gemstone('S_stein', 0.012, (0, 0.0, -0.14), 'glow', stretch=1.0))
    P.append(cylz('S_hals', 0.011, 0.098, 0.118, 'gold'))
    st = cylz('S_quer', 0.0085, -0.075, 0.075, 'gold', verts=12); xform(st, (0, 0, 0.115), (0, math.pi / 2, 0)); P.append(st)
    for s in (-1, 1): P.append(ball('S_kugel%d' % s, 0.0145, (s * 0.078, 0, 0.115), 'gold'))
    # Korbbügel und Schale: Admiralssäbel
    P.append(sweep('S_buegel', [(-0.075, 0, 0.115), (-0.105, 0, 0.05), (-0.095, 0, -0.06), (-0.045, 0, -0.12), (-0.012, 0, -0.13)], 0.0072, 8, 'gold'))
    P.append(sweep('S_buegel2', [(-0.055, 0, 0.11), (-0.075, 0, 0.03), (-0.066, 0, -0.05), (-0.032, 0, -0.11)], 0.005, 7, 'gold'))
    sh = cone_('S_schale', 0.044, 0.014, 0.04, (0, 0, 0.138), 'gold', verts=22); thicken(sh, 0.003); P.append(sh)
    P.append(gemstone('S_saphir', 0.0085, (-0.09, 0, 0.012), 'glow', stretch=1.2))
    P += blade('S_klinge', 0.13, 0.82, 0.05, 0.04, 0.0078, 0.13, 0.5, 34, 'steel', edge='one', tip=0.1, hamon=0.06)
    # Blaue Quaste am Gefäß
    P.append(sweep('S_quaste', [(0.0, 0.0, -0.14), (0.01, 0.01, -0.2), (0.012, 0.016, -0.27)], [0.012, 0.014, 0.004], 7, 'cloth'))
    return P
build_boss(blackwood_saebel(), 'blackwood_saebel')

def blackwood_pistole():
    P = []
    # Griffstück mit Kolben, Schloss, Abzug und langem Lauf mit Mündungstrichter (Lauf zeigt nach +Z, der Griff liegt in der Faust)
    P.append(sweep('P_griff', [(0, -0.03, -0.12), (0, -0.012, -0.05), (0, 0.0, 0.03)], [0.026, 0.021, 0.019], 10, 'leather'))
    P.append(ball('P_kolbenkappe', 0.03, (0, -0.036, -0.126), 'gold', (1, 1, 0.8)))
    P.append(box('P_schloss', (0.022, 0.05, 0.07), (0.0, 0.0, 0.07), 'gold'))
    # Steinschloss (4.4B): S-förmiger Hahn mit Feuerstein in den Backen, Batterie mit Schlagfläche, Zündpfanne und Feder
    P.append(sweep('P_hahn', [(0.014, 0.0, 0.085), (0.016, 0.022, 0.095), (0.016, 0.036, 0.112), (0.015, 0.04, 0.128)], [0.0052, 0.0045, 0.0038, 0.0034], 6, 'steel'))
    P.append(box('P_backe', (0.009, 0.012, 0.016), (0.015, 0.042, 0.136), 'steel'))
    P.append(box('P_stein', (0.007, 0.008, 0.011), (0.015, 0.038, 0.147), 'dark'))
    P.append(box('P_batterie', (0.008, 0.034, 0.007), (0.014, 0.03, 0.158), 'steel', (0.35, 0, 0)))
    P.append(box('P_pfanne', (0.014, 0.007, 0.018), (0.012, 0.012, 0.152), 'gold'))
    P.append(cylz('P_feder', 0.003, 0.14, 0.175, 'steel', x=0.014, y=-0.012, verts=6))
    P.append(sweep('P_abzugsbuegel', [(0, 0.012, 0.045), (0, 0.045, 0.02), (0, 0.045, -0.035), (0, 0.012, -0.045)], 0.0045, 6, 'gold'))
    # konischer Lauf mit achtkantiger Kammer
    P.append(cylz('P_kammer', 0.0172, 0.07, 0.15, 'steel', verts=8))
    P.append(revolve('P_lauf', [(0.0158, 0.15), (0.0138, 0.42), (0.0001, 0.42)], segs=16, role='steel'))
    P.append(cylz('P_muendung', 0.026, 0.40, 0.43, 'gold', verts=14))
    for z in (0.14, 0.25, 0.34): P.append(cylz('P_ring%d' % int(z * 100), 0.019, z, z + 0.016, 'gold', verts=14))
    P.append(gemstone('P_stein', 0.009, (0.0, 0.0, -0.058), 'glow', stretch=1.1))
    return P
build_boss(blackwood_pistole(), 'blackwood_pistole')

# =====================================================================================================
# 2 · NIEDERLANDE – Generalgouverneur Van Der Berg
# =====================================================================================================
def vdb_head():
    P = []
    P.append(dome('V_kalotte', [(0.108, 0.04), (0.114, 0.075), (0.108, 0.115), (0.09, 0.145), (0.055, 0.162), (0.0, 0.168)], 'steel', th=0.0045))
    # Krempe: aufgebogen vorn und hinten (Morion)
    br = revolve('V_krempe', [(0.108, CZ + 0.052), (0.18, CZ + 0.05), (0.25, CZ + 0.056), (0.265, CZ + 0.064)], segs=48, role='steel', y_scale=1.0, loc=(0, CY, 0))
    lift(br, lambda x, y, z: 0.09 * min(1.0, abs(y) / 0.24) ** 2.2 - 0.004 * (x / 0.2) ** 2)
    thicken(br, 0.0045, 1); bevel(br, 0.0015, 1); P.append(br)
    # Kamm vom Stirnrand über den Scheitel zum Nacken
    crest = plate('V_kamm', [(-0.125, -0.005), (-0.1, 0.02), (-0.05, 0.045), (0.0, 0.055), (0.05, 0.045), (0.1, 0.02), (0.125, -0.005), (0.09, 0.005), (-0.09, 0.005)], 0.011, 'gold')
    xform(crest, (0, CY, CZ + 0.155), (math.radians(90), 0, math.radians(90))); bevel(crest, 0.0015, 1); P.append(crest)
    P.append(band('V_band', 0.115, CZ + 0.058, 0.02, role='gold'))
    for i in range(9):
        a = i / 9 * 2 * P2
        P.append(ball('V_niete%d' % i, 0.0055, (0.12 * math.cos(a), CY + 0.12 * math.sin(a) * 1.08, CZ + 0.058), 'gold', segs=8, rings=5))
    P.append(ball('V_knopf', 0.016, (0, CY, CZ + 0.172), 'gold'))
    # orangefarbene Straußenfedern nach hinten
    for k, (dx, dz) in enumerate(((0.0, 0.0), (0.03, -0.02), (-0.03, -0.02), (0.055, -0.045), (-0.055, -0.045))):
        pts = [(dx * 0.3, CY - 0.06, CZ + 0.17), (dx, CY - 0.13, CZ + 0.25 + dz), (dx * 1.5, CY - 0.23, CZ + 0.27 + dz), (dx * 2.0, CY - 0.32, CZ + 0.22 + dz), (dx * 2.3, CY - 0.37, CZ + 0.15 + dz)]
        P.append(feather('V_feder%d' % k, pts, 0.055, 'cloth', side=(1, 0, 0.3)))
    return P
build_boss(vdb_head(), 'vanderberg_head')

def vdb_hellebarde():
    P = []
    # Schaft (Griff in der Mitte bei z = 0), Schuh und Dorn unten, Kopf oben
    P.append(cylz('H_schaft', 0.0225, -0.62, 1.42, 'leather', verts=12))
    P += wrap('H_band', -0.12, 0.12, 0.0225, 6, 'gold', 0.0022)
    P.append(cylz('H_schuh', 0.0285, -0.7, -0.6, 'steel', verts=12))
    P.append(cone_('H_dorn', 0.0285, 0.003, 0.22, (0, 0, -0.81), 'steel', rot=(math.pi, 0, 0), verts=10))
    # Zwinge und Kopf
    P.append(cylz('H_tuelle', 0.032, 1.30, 1.50, 'steel', verts=12))
    P.append(cylz('H_tuellering', 0.036, 1.29, 1.31, 'gold', verts=12)); P.append(cylz('H_tuellering2', 0.036, 1.49, 1.51, 'gold', verts=12))
    P += blade('H_spitze', 1.5, 0.34, 0.07, 0.07, 0.014, 0.0, 0.55, 20, 'steel', 'both', 0.35, hamon=0.03)
    # Beilblatt (halbmondförmig, zur +X-Seite) und Haken (zur -X-Seite)
    axe = plate('H_beil', [(0.02, 1.30), (0.16, 1.26), (0.28, 1.33), (0.34, 1.46), (0.31, 1.6), (0.21, 1.67), (0.1, 1.6), (0.075, 1.5), (0.05, 1.42)], 0.013, 'steel')
    xform(axe, (0, 0, 0), (math.pi / 2, 0, 0)); xform(axe, (0, 0, 0), (0, 0, math.pi / 2)); P.append(axe)
    fluke = plate('H_haken', [(-0.02, 1.36), (-0.12, 1.38), (-0.22, 1.45), (-0.2, 1.52), (-0.1, 1.48), (-0.02, 1.47)], 0.012, 'steel')
    xform(fluke, (0, 0, 0), (math.pi / 2, 0, 0)); xform(fluke, (0, 0, 0), (0, 0, math.pi / 2)); P.append(fluke)
    P.append(gemstone('H_stein', 0.014, (0.0, 0.0, 1.28), 'glow', stretch=1.0))
    # Orange Quaste unter dem Kopf
    P.append(sweep('H_quaste', [(0.03, 0.0, 1.27), (0.07, 0.0, 1.13), (0.075, 0.0, 1.0)], [0.011, 0.016, 0.005], 7, 'cloth'))
    return P
build_boss(vdb_hellebarde(), 'vanderberg_hellebarde')

# =====================================================================================================
# 3 · DEUTSCHLAND – Großkomtur von Eisenstein
# =====================================================================================================
def eisenstein_head():
    P = []
    # Topfhelm: Zylinder mit flacher Haube, im Kopfbereich weit genug für Haare und Gesicht
    body = dome('E_helm', [(0.138, -0.125), (0.14, -0.09), (0.14, 0.0), (0.138, 0.07), (0.13, 0.12), (0.1, 0.152), (0.055, 0.165), (0.0, 0.168)], 'steel', segs=40, sy=1.04, th=0.006)
    bevel(body, 0.002, 2); P.append(body)
    P.append(band('E_rand', 0.14, CZ - 0.122, 0.014, role='gold', sy=1.04))
    P.append(band('E_band', 0.141, CZ + 0.06, 0.016, role='gold', sy=1.04))
    # Sehschlitz (dunkles Band) und Kreuzverstärkung in Gold
    slit = plate('E_schlitz', [(-0.095, -0.011), (0.095, -0.011), (0.095, 0.011), (-0.095, 0.011)], 0.004, 'dark')
    xform(slit, (0, CY + 0.147, CZ + 0.012), (math.radians(90), 0, 0)); P.append(slit)
    vbar = plate('E_kreuz', [(-0.012, -0.095), (0.012, -0.095), (0.012, 0.115), (-0.012, 0.115)], 0.005, 'gold')
    xform(vbar, (0, CY + 0.15, CZ + 0.015), (math.radians(90), 0, 0)); P.append(vbar)
    for i in range(5):
        for s in (-1, 1):
            P.append(ball('E_loch%d_%d' % (i, s), 0.0045, (s * (0.035 + 0.012 * i) * (1 if i else 0.5), CY + 0.147, CZ - 0.07 + 0.012 * (i % 2)), 'dark', segs=8, rings=5))
    # Adlerschwingen links und rechts: je drei breite Schwungfedern, nach außen und oben gefächert (Breitseite zeigt nach vorn)
    for sd in (-1, 1):
        for k in range(3):
            th = math.radians(24 + 22 * k)
            ln = 0.25 - 0.045 * k
            x0, z0 = sd * 0.136, CZ + 0.045 + 0.028 * k
            dx, dz = sd * math.cos(th), math.sin(th)
            pts = [(x0, CY, z0), (x0 + dx * ln * 0.5, CY - 0.012, z0 + dz * ln * 0.5 + 0.01), (x0 + dx * ln, CY - 0.025, z0 + dz * ln)]
            P.append(feather('E_schwinge%d_%d' % (sd, k), pts, 0.085, 'steel' if k % 2 == 0 else 'dark', thick=0.006, side=(-sd * math.sin(th), 0, math.cos(th))))
    # schwarzer Federkamm
    for k, dz in enumerate((0.0, 0.015, 0.03, 0.045)):
        pts = [(0, CY + 0.04, CZ + 0.165), (0, CY - 0.02, CZ + 0.235 + dz), (0, CY - 0.1, CZ + 0.255 + dz), (0, CY - 0.17, CZ + 0.215 + dz), (0, CY - 0.21, CZ + 0.16 + dz)]
        P.append(feather('E_kamm%d' % k, pts, 0.05, 'cloth', side=(1, 0, 0)))
    return P
build_boss(eisenstein_head(), 'eisenstein_head')

def eisenstein_zweihaender():
    P = []
    P.append(cylz('Z_griff', 0.021, -0.27, 0.1, 'leather'))
    P += wrap('Z_draht', -0.26, 0.095, 0.021, 13, 'dark', 0.0022)
    P.append(disc('Z_knauf', 0.045, -0.29, 0.02, 'gold', verts=26))
    P.append(ball('Z_knauf2', 0.034, (0, 0, -0.305), 'steel', (1, 1, 0.85)))
    P.append(gemstone('Z_stein', 0.016, (0, 0.0, -0.33), 'glow', stretch=1.1))
    P.append(cylz('Z_hals', 0.026, 0.1, 0.145, 'gold'))
    # breite Parierstange mit nach unten gebogenen Enden und Kreuzdurchbruch
    for s in (-1, 1):
        P.append(sweep('Z_arm%d' % s, [(0, 0, 0.122), (s * 0.08, 0, 0.122), (s * 0.17, 0, 0.115), (s * 0.215, 0, 0.09), (s * 0.225, 0, 0.055)], [0.019, 0.017, 0.015, 0.012, 0.004], 8, 'steel'))
        P.append(ball('Z_endkugel%d' % s, 0.022, (s * 0.2, 0, 0.1), 'gold', segs=10, rings=6))
        P.append(plate('Z_zierblech%d' % s, [(0, 0.0), (s * 0.12, 0.0), (s * 0.16, 0.04), (s * 0.06, 0.07), (0, 0.045)], 0.007, 'gold'))
        xform(P[-1], (0, 0.0, 0.07), (math.pi / 2, 0, 0))
    P += blade('Z_klinge', 0.145, 1.42, 0.115, 0.095, 0.0145, 0.0, 0.4, 48, 'steel', tip=0.08, hamon=0.05, hseed=0.9)
    # goldenes Kreuz und Runen in der Klinge
    P.append(plate('Z_kreuzv', [(-0.011, 0.25), (0.011, 0.25), (0.011, 0.5), (-0.011, 0.5)], 0.003, 'gold')); xform(P[-1], (0, 0.0079, 0), (math.pi / 2, 0, 0)); xform(P[-1], (0, 0, 0.0), (0, 0, 0))
    P.append(plate('Z_kreuzh', [(-0.05, 0.4), (0.05, 0.4), (0.05, 0.42), (-0.05, 0.42)], 0.003, 'gold')); xform(P[-1], (0, 0.0079, 0), (math.pi / 2, 0, 0))
    for k in range(5): P.append(gemstone('Z_rune%d' % k, 0.0065, (0, 0.0, 0.62 + 0.15 * k), 'glow', stretch=1.7))
    return P
build_boss(eisenstein_zweihaender(), 'eisenstein_zweihaender')

# =====================================================================================================
# 4 · FRANKREICH – Marquis-Amiral De Valois
# =====================================================================================================
def valois_head():
    P = []
    P.append(dome('D_krone', [(0.106, 0.045), (0.112, 0.085), (0.108, 0.13), (0.095, 0.17), (0.05, 0.19), (0.0, 0.195)], 'main', th=0.004))
    # breite Krempe mit einseitig hochgestecktem Rand (links hoch, rechts nach unten geschwungen)
    br = revolve('D_krempe', [(0.108, CZ + 0.05), (0.2, CZ + 0.046), (0.27, CZ + 0.05), (0.3, CZ + 0.056)], segs=52, role='main', y_scale=0.96, loc=(0, CY, 0))
    lift(br, lambda x, y, z: (0.13 * max(0.0, -x / 0.3) ** 1.8) - 0.035 * max(0.0, x / 0.3) ** 1.5 + 0.015 * (abs(y) / 0.3) ** 2)
    thicken(br, 0.004, 1); P.append(br)
    P.append(band('D_band', 0.109, CZ + 0.072, 0.02, role='gold'))
    for i in range(12):
        a = i / 12 * 2 * P2
        P.append(ball('D_perle%d' % i, 0.0048, (0.114 * math.cos(a), CY + 0.114 * math.sin(a) * 1.08, CZ + 0.072), 'cloth', segs=8, rings=5))
    # Lilienbrosche an der hochgesteckten Seite
    cx, cy, cz = -0.235, CY + 0.03, CZ + 0.15
    P.append(disc('D_brosche', 0.032, cz, 0.008, 'gold', x=cx, y=cy, verts=20)); xform(P[-1], (0, 0, 0), (0, 0, 0))
    P.append(ball('D_lilie_m', 0.018, (cx, cy + 0.006, cz + 0.012), 'glow', (0.7, 0.5, 1.5), 10, 6))
    for s in (-1, 1): P.append(ball('D_lilie_s%d' % s, 0.013, (cx + s * 0.017, cy + 0.006, cz + 0.002), 'glow', (0.5, 0.4, 1.2), 10, 6))
    P.append(ball('D_lilie_u', 0.011, (cx, cy + 0.006, cz - 0.018), 'gold', segs=8, rings=5))
    # üppiger Federbusch (weiß), über die hochgesteckte Seite nach hinten fallend
    for k, (dx, dz) in enumerate(((0.0, 0.0), (-0.025, 0.012), (0.025, -0.012), (-0.05, 0.02), (0.05, -0.025), (-0.075, 0.015))):
        pts = [(cx + dx * 0.3, cy - 0.01, cz + 0.015), (cx + dx - 0.02, CY - 0.06, cz + 0.11 + dz), (cx + dx - 0.04, CY - 0.17, cz + 0.12 + dz), (cx + dx - 0.05, CY - 0.27, cz + 0.06 + dz), (cx + dx - 0.05, CY - 0.33, cz - 0.03 + dz)]
        P.append(feather('D_feder%d' % k, pts, 0.055, 'cloth', side=(1, 0, 0.35)))
    return P
build_boss(valois_head(), 'devalois_head')

def valois_rapier():
    P = []
    P.append(cylz('R_griff', 0.0125, -0.1, 0.085, 'cloth'))
    P += wrap('R_draht', -0.095, 0.08, 0.0125, 9, 'gold', 0.0014)
    # Lilienknauf
    P.append(ball('R_knauf', 0.02, (0, 0, -0.112), 'gold', (1, 1, 1.15)))
    P.append(ball('R_knauf2', 0.0085, (0, 0, -0.142), 'gold'))
    for s in (-1, 1): P.append(ball('R_blatt%d' % s, 0.011, (s * 0.016, 0, -0.12), 'gold', (0.6, 0.7, 1.4), 8, 5))
    # Glocke (Stichblatt) mit Schale, gebogene Parierstangen, Bügel und zwei Seitenringe
    sh = cone_('R_glocke', 0.058, 0.016, 0.05, (0, 0, 0.115), 'gold', verts=26); thicken(sh, 0.0026); P.append(sh)
    P.append(cylz('R_hals', 0.0092, 0.088, 0.104, 'gold'))
    st = cylz('R_quer', 0.0068, -0.09, 0.09, 'gold', verts=10); xform(st, (0, 0, 0.14), (0, math.pi / 2, 0)); P.append(st)
    P.append(sweep('R_quill_l', [(-0.085, 0, 0.14), (-0.115, 0, 0.165), (-0.11, 0, 0.2)], [0.0065, 0.0055, 0.0016], 7, 'gold'))
    P.append(sweep('R_quill_r', [(0.085, 0, 0.14), (0.12, 0, 0.12), (0.115, 0, 0.085)], [0.0065, 0.0055, 0.0016], 7, 'gold'))
    P.append(sweep('R_buegel', [(0.0, 0.0, 0.14), (0.0, -0.075, 0.08), (0.0, -0.085, -0.04), (0.0, -0.04, -0.105)], 0.0065, 8, 'gold'))
    for s in (-1, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.034, minor_radius=0.0042, major_segments=22, minor_segments=6, location=(0, s * 0.055, 0.125), rotation=(0, math.pi / 2, 0))
        t = bpy.context.active_object; t.name = 'R_ring%d' % s; t.data.materials.append(mat('gold')); P.append(t)
    P.append(gemstone('R_saphir', 0.0085, (0, -0.075, 0.04), 'glow', stretch=1.0))
    P += blade('R_klinge', 0.145, 1.0, 0.021, 0.0095, 0.0075, 0.0, 0.72, 38, 'steel', tip=0.1, hamon=0.05)
    return P
build_boss(valois_rapier(), 'devalois_rapier')

# =====================================================================================================
# 5 · KUROGANE – Schattenfürst Kurogane
# =====================================================================================================
def kurogane_head():
    P = []
    # Kabuto: gewölbte Haube mit Grat, Stirnschild, Nackenschutz aus drei Lamellen, Mondsichel-Zier und Dämonenmaske
    P.append(dome('K_haube', [(0.112, 0.03), (0.118, 0.07), (0.112, 0.115), (0.095, 0.15), (0.055, 0.17), (0.0, 0.177)], 'dark', segs=36, th=0.0045))
    for i in range(14):
        a = i / 14 * 2 * P2
        P.append(ball('K_niete%d' % i, 0.0042, (0.118 * math.cos(a), CY + 0.118 * math.sin(a) * 1.08, CZ + 0.075), 'gold', segs=8, rings=5))
    P.append(band('K_stirn', 0.12, CZ + 0.05, 0.026, a0=FRONT - 1.5, a1=FRONT + 1.5, role='steel'))
    P.append(band('K_rot', 0.124, CZ + 0.082, 0.01, role='cloth'))
    # Nackenschutz (Shikoro): drei fächerartig ausgestellte Lamellenringe
    for k in range(3):
        sh = dome('K_shikoro%d' % k, [(0.123 + 0.012 * k, 0.0 - 0.032 * k), (0.138 + 0.016 * k, -0.026 - 0.032 * k), (0.15 + 0.02 * k, -0.05 - 0.032 * k)], 'dark' if k % 2 == 0 else 'steel2', arc=(FRONT + 0.95, FRONT + 2 * P2 - 0.95), th=0.004, segs=24)
        bevel(sh, 0.0012, 1); P.append(sh)
        P.append(band('K_zier%d' % k, 0.15 + 0.02 * k, CZ - 0.05 - 0.032 * k, 0.008, a0=FRONT + 0.95, a1=FRONT + 2 * P2 - 0.95, role='cloth', th=0.002))
    # Mondsichel (Maedate) auf der Stirn und zwei Hörner
    cres = plate('K_sichel', [(-0.13, 0.0), (-0.115, 0.05), (-0.07, 0.115), (0.0, 0.14), (0.07, 0.115), (0.115, 0.05), (0.13, 0.0), (0.095, 0.045), (0.055, 0.085), (0.0, 0.1), (-0.055, 0.085), (-0.095, 0.045)], 0.008, 'gold')
    xform(cres, (0, CY + 0.125, CZ + 0.1), (math.radians(90), 0, 0)); bevel(cres, 0.0015, 1); P.append(cres)
    for s in (-1, 1):
        P.append(sweep('K_horn%d' % s, [(s * 0.07, CY + 0.05, CZ + 0.15), (s * 0.11, CY + 0.04, CZ + 0.2), (s * 0.14, CY + 0.02, CZ + 0.245), (s * 0.145, CY, CZ + 0.28)], [0.019, 0.015, 0.01, 0.002], 8, 'gold'))
    P.append(gemstone('K_stirnstein', 0.011, (0, CY + 0.128, CZ + 0.085), 'glow', stretch=1.2))
    # Halbmaske (Menpō) mit Reißzähnen: umschließt Wangen, Nase, Mund und Kinn
    mk = dome('K_maske', [(0.1, -0.115), (0.113, -0.095), (0.12, -0.075), (0.117, -0.058), (0.11, -0.05)], 'dark', segs=26, arc=(FRONT - 1.0, FRONT + 1.0), sy=1.1, th=0.004)
    bevel(mk, 0.0015, 1); P.append(mk)
    P.append(band('K_maskenrand', 0.116, CZ - 0.054, 0.008, a0=FRONT - 1.0, a1=FRONT + 1.0, role='gold', th=0.002))
    for s in (-1, 1):
        P.append(cone_('K_zahn%d' % s, 0.008, 0.001, 0.034, (s * 0.032, CY + 0.12, CZ - 0.083), 'steel', rot=(math.radians(180), 0, 0), verts=7))
        P.append(gemstone('K_wange%d' % s, 0.009, (s * 0.07, CY + 0.098, CZ - 0.085), 'glow', stretch=0.8))
    P.append(cone_('K_nase', 0.016, 0.003, 0.05, (0, CY + 0.13, CZ - 0.02), 'dark', rot=(math.radians(-90), 0, 0), verts=8))
    return P
build_boss(kurogane_head(), 'kurogane_head')

def kurogane_katana(name, length, curve, wrapcol):
    P = []
    P.append(cylz(name + '_tsuka', 0.0168, -0.13, 0.115, wrapcol, verts=12))
    P += wrap(name + '_wicklung', -0.125, 0.11, 0.0168, 14, 'dark', 0.0024)
    P.append(cylz(name + '_kashira', 0.0185, -0.147, -0.128, 'gold'))
    P.append(ball(name + '_kashira2', 0.0165, (0, 0, -0.147), 'gold', (1, 0.8, 0.6)))
    P.append(cylz(name + '_fuchi', 0.0185, 0.108, 0.125, 'gold'))
    P.append(disc(name + '_tsuba', 0.05, 0.132, 0.007, 'dark', sx=1.0, sy=0.92))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.05, minor_radius=0.0042, major_segments=28, minor_segments=5, location=(0, 0, 0.132))
    t = bpy.context.active_object; t.name = name + '_tsubarand'; t.scale = (1, 0.92, 1); bpy.ops.object.transform_apply(scale=True); t.data.materials.append(mat('gold')); P.append(t)
    for k in range(4):
        a = math.pi / 2 * k + math.pi / 4
        P.append(gemstone(name + '_loch%d' % k, 0.0048, (0.034 * math.cos(a), 0.031 * math.sin(a), 0.132), 'glow', stretch=0.4))
    P.append(cylz(name + '_habaki', 0.0185, 0.135, 0.165, 'gold', verts=10))
    P += blade(name + '_klinge', 0.16, length, 0.036, 0.029, 0.0078, curve, 0.5, 48, 'steel', edge='one', tip=0.06, hamon=0.14)
    # blutrote Schnur mit Quaste am Knauf
    P.append(sweep(name + '_schnur', [(0.0, 0.0, -0.15), (0.02, 0.0, -0.22), (0.03, 0.0, -0.3), (0.028, 0.0, -0.36)], [0.004, 0.0045, 0.0045, 0.012], 7, 'cloth'))
    return P
build_boss(kurogane_katana('KA', 0.9, 0.085, 'cloth'), 'kurogane_katana')
build_boss(kurogane_katana('KW', 0.6, 0.06, 'dark'), 'kurogane_wakizashi')

# =====================================================================================================
# 6 · MARINE – Großadmiral & Oberster Gefängniswärter Valken
# =====================================================================================================
def valken_head():
    P = []
    # Admiralsmütze: hoher flacher Deckel, breites Kopfband, mächtiger Schirm mit Eichenlaub, Anker-Abzeichen, Kinnriemen
    P.append(dome('M_band', [(0.108, 0.0), (0.112, 0.02), (0.112, 0.07), (0.115, 0.095)], 'main', th=0.004, segs=36))
    P.append(dome('M_deckel', [(0.115, 0.09), (0.14, 0.11), (0.152, 0.13), (0.15, 0.145), (0.1, 0.152), (0.0, 0.155)], 'cloth', th=0.0045, segs=40, sy=1.08))
    P.append(band('M_tresse', 0.114, CZ + 0.028, 0.03, role='gold', segs=36))
    P.append(band('M_rand', 0.153, CZ + 0.13, 0.012, role='gold', segs=40, th=0.003))
    vz = plate('M_schirm', [(-0.115, 0.0), (-0.135, 0.06), (-0.075, 0.115), (0.0, 0.125), (0.075, 0.115), (0.135, 0.06), (0.115, 0.0)], 0.006, 'dark')
    xform(vz, (0, CY + 0.09, CZ + 0.042), (math.radians(-16), 0, 0)); bevel(vz, 0.0015, 1); P.append(vz)
    for s in (-1, 1):
        P.append(sweep('M_laub%d' % s, [(s * 0.02, CY + 0.12, CZ + 0.06), (s * 0.075, CY + 0.15, CZ + 0.075), (s * 0.115, CY + 0.17, CZ + 0.068)], 0.006, 7, 'gold'))
        for k in range(3): P.append(ball('M_blatt%d_%d' % (s, k), 0.0075, (s * (0.04 + 0.035 * k), CY + 0.135 + 0.014 * k, CZ + 0.07), 'gold', (1, 0.5, 1), 8, 5))
    # Anker-Abzeichen vorn: Schaft, Stock, Arme, Ring
    ax, ay, az = 0.0, CY + 0.132, CZ + 0.05
    S = 1.05
    P.append(sweep('M_ankerschaft', [(ax, ay, az - 0.038 * S), (ax, ay, az + 0.042 * S)], 0.0075, 8, 'gold'))
    P.append(sweep('M_ankerarm', [(-0.04 * S, ay, az - 0.012 * S), (-0.026 * S, ay, az - 0.038 * S), (0, ay, az - 0.046 * S), (0.026 * S, ay, az - 0.038 * S), (0.04 * S, ay, az - 0.012 * S)], 0.0068, 8, 'gold'))
    P.append(sweep('M_ankerstock', [(-0.028 * S, ay, az + 0.026 * S), (0.028 * S, ay, az + 0.026 * S)], 0.0068, 8, 'gold'))
    P.append(ball('M_ankerring', 0.0105, (ax, ay, az + 0.056 * S), 'gold', segs=8, rings=5))
    P.append(gemstone('M_ankerstein', 0.011, (ax, ay + 0.004, az - 0.002), 'glow', stretch=1.0))
    # eiserne Gefängniswärter-Haube unter dem Schirm: Stahlband mit Nieten und Schlüsselring
    P.append(band('M_eisen', 0.111, CZ + 0.002, 0.018, role='steel', segs=36, th=0.005))
    for i in range(10):
        a = i / 10 * 2 * P2
        P.append(ball('M_niete%d' % i, 0.0046, (0.118 * math.cos(a), CY + 0.118 * math.sin(a) * 1.08, CZ + 0.002), 'gold', segs=8, rings=5))
    # Kinnriemen aus Leder (beidseitig)
    for s in (-1, 1):
        P.append(sweep('M_riemen%d' % s, [(s * 0.105, CY + 0.03, CZ + 0.0), (s * 0.108, CY + 0.07, CZ - 0.08), (s * 0.04, CY + 0.11, CZ - 0.135)], 0.0045, 7, 'leather'))
    return P
build_boss(valken_head(), 'valken_head')

def valken_kanone():
    P = []
    # Panzerhandschuh um die Faust (Achse Y = Schlagrichtung), darauf ein Geschützrohr; danach 180° um Z (Knöchel nach +Z im Spiel)
    def ringy(name, r, y0, y1, role, th=0.007, segs=22, sx=1.0, sz=1.0):
        o = revolve(name, [(r, y0), (r + th, y0), (r + th, y1), (r, y1)], segs=segs, role=role, x_scale=sx, y_scale=sz)
        xform(o, (0, 0, 0), (-math.pi / 2, 0, 0))
        return o
    P.append(ringy('N_band', 0.062, -0.13, -0.04, 'dark', 0.01, 24, 1.0, 0.9))
    P.append(ringy('N_schiene1', 0.068, -0.2, -0.13, 'steel', 0.008, 24, 1.0, 0.9))
    P.append(ringy('N_schiene2', 0.075, -0.27, -0.2, 'steel', 0.008, 24, 1.0, 0.9))
    P.append(ringy('N_ruecken', 0.07, -0.04, 0.05, 'steel', 0.012, 24, 1.0, 0.9))
    P.append(ringy('N_knoechel', 0.076, 0.05, 0.1, 'dark', 0.014, 24, 1.0, 0.9))
    P.append(ball('N_faust', 0.085, (0, 0.02, 0.0), 'steel', (0.95, 1.0, 0.9), 16, 10))
    for k in range(4):
        a = math.radians(-60 + 120 * k / 3)
        x, z = 0.095 * math.sin(a), 0.085 * math.cos(a)
        P.append(ball('N_kopf%d' % k, 0.017, (x, 0.1, z), 'gold', segs=10, rings=6))
    # Geschützrohr oben auf dem Handrücken mit Mündung, Ringen und Gluthülse
    r0 = 0.052
    P.append(cylz('N_rohr', r0, 0.0, 0.5, 'dark', x=0.0, y=0.0, verts=18)); bake([P[-1]]); xform(P[-1], (0, 0.1 - 0.25 + 0.25, 0.1), (-math.pi / 2, 0, 0)); xform(P[-1], (0, 0.0, 0), (0, 0, 0))
    for y in (0.08, 0.22, 0.36):
        o = cylz('N_ring%d' % int(y * 100), r0 + 0.012, 0.0, 0.03, 'gold', verts=18); bake([o]); xform(o, (0, y, 0.1), (-math.pi / 2, 0, 0)); P.append(o)
    mu = cylz('N_muendung', r0 + 0.02, 0.0, 0.05, 'steel', verts=18); bake([mu]); xform(mu, (0, 0.575, 0.1), (-math.pi / 2, 0, 0)); P.append(mu)
    gl = cylz('N_glut', r0 - 0.014, 0.0, 0.012, 'glow', verts=14); bake([gl]); xform(gl, (0, 0.6, 0.1), (-math.pi / 2, 0, 0)); P.append(gl)
    P.append(ball('N_pulverkammer', 0.062, (0, 0.0, 0.11), 'steel', (1, 1.3, 0.9), 14, 8))
    # Anker-Prägung auf dem Handrücken (Gold) und Kettenglieder am Handgelenk
    P.append(plate('N_platte', [(-0.034, -0.034), (0.034, -0.034), (0.042, 0.025), (0.0, 0.05), (-0.042, 0.025)], 0.008, 'gold'))
    xform(P[-1], (0, 0.0, 0.0), (0, 0, 0)); xform(P[-1], (0, -0.02, 0.0865), (0, 0, 0)); xform(P[-1], (0, 0, 0), (0, 0, 0))
    for k in range(5):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.026, minor_radius=0.007, major_segments=14, minor_segments=5, location=(0.0, -0.1 - 0.035 * k, -0.075), rotation=(math.pi / 2 if k % 2 else 0, 0, math.pi / 2 if k % 2 == 0 else 0))
        t = bpy.context.active_object; t.name = 'N_kette%d' % k; t.data.materials.append(mat('steel')); P.append(t)
    bake(P)
    for o in P: xform(o, (0, 0, 0), (0, 0, math.pi))   # Knöchel und Rohr zeigen im Spiel nach +Z
    return P
build_boss(valken_kanone(), 'valken_kanone')
print('Boss-Modelle fertig:', sorted(os.listdir(BOSS_DIR)))
