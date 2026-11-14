# Kampfwaffen der Stile (Blender, headless): Säbel, Katana, Zweihänder, Kurzklinge, Faustpanzer (2 Stufen), Faji-Fokus.
# Raum der Handhalterung: Griff am Ursprung, Klinge entlang +Z (im Spiel +Y), Krümmung nach +X.
# Rollen: steel (Klinge, Stufenfarbe), gold (Beschläge), leather (Griffwicklung), dark (Dunkelstahl), cloth (Wickelband), glow (Edelsteine, Runen).
exec(open(os.path.join(HERE, 'armorlib.py'), encoding='utf-8').read())
clear_gear()

def blade(name, z0, length, w0, w1, thick, curve, fuller=0.55, sections=30, role='steel', edge='both', tip=0.07):
    """Klinge: Ringe aus 5 Punkten (Rücken, Fläche, Schneide). curve = seitliche Auslenkung der Spitze (parabelförmig)."""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
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
        if edge == 'both':
            pts = [(cx + h, 0.0), (cx + h * 0.55, th), (cx - h * 0.05, th * f), (cx - h * 0.55, th), (cx - h, 0.0), (cx - h * 0.55, -th), (cx - h * 0.05, -th * f), (cx + h * 0.55, -th)]
        else:  # eine Schneide (+x), dicker Rücken (-x)
            pts = [(cx + h, 0.0), (cx + h * 0.45, th * 0.85), (cx - h * 0.35, th), (cx - h * 0.95, th * 0.7), (cx - h, 0.0), (cx - h * 0.95, -th * 0.7), (cx - h * 0.35, -th), (cx + h * 0.45, -th * 0.85)]
        rings.append([bm.verts.new((px, py, z)) for px, py in pts])
    n = len(rings[0])
    for k in range(sections):
        for i in range(n):
            j = (i + 1) % n
            f2 = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            for l, (ii, kk) in zip(f2.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
                l[uv].uv = (ii / n, kk / sections)
    for ring in (rings[0],):
        try: bm.faces.new(ring)
        except ValueError: pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = solid_from_bm(name, bm, role, False)
    return ob

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

# ======================= Säbel (Entermesser) =======================
def saebel():
    P = []
    P.append(cylz('A_griff', 0.0158, -0.1, 0.1, 'leather'))
    P += wrap('A_draht', -0.095, 0.095, 0.0158, 8, 'gold', 0.0018)
    P.append(ball('A_knauf', 0.022, (0, 0, -0.118), 'gold', (1, 0.85, 1.1)))
    P.append(ball('A_knauf2', 0.008, (0, 0, -0.145), 'gold'))
    P.append(cylz('A_stange', 0.0085, 0.098, 0.098 + 0.0001, 'gold'))
    st = cylz('A_quer', 0.0088, -0.07, 0.07, 'gold', verts=12); xform(st, (0, 0, 0.108), (0, math.pi / 2, 0)); P.append(st)
    for s in (-1, 1): P.append(ball('A_kugel%d' % s, 0.0135, (s * 0.074, 0, 0.108), 'gold'))
    # Korbbügel um die Hand mit zwei Streben
    P.append(sweep('A_buegel', [(-0.07, 0, 0.108), (-0.098, 0, 0.04), (-0.088, 0, -0.06), (-0.04, 0, -0.118), (-0.012, 0, -0.128)], 0.0068, 8, 'gold'))
    P.append(sweep('A_buegel2', [(-0.052, 0, 0.103), (-0.07, 0, 0.03), (-0.062, 0, -0.05), (-0.03, 0, -0.108)], 0.0046, 7, 'gold'))
    P.append(sweep('A_ranke', [(-0.075, 0, 0.1), (-0.04, 0.0, 0.07), (-0.02, 0, 0.09), (-0.012, 0, 0.116)], 0.0036, 6, 'gold'))
    sh = cone_('A_schale', 0.038, 0.012, 0.034, (0, 0, 0.13), 'gold', verts=20); thicken(sh, 0.003); P.append(sh)
    P.append(gemstone('A_rubin', 0.0075, (-0.084, 0, 0.012), 'glow', stretch=1.2))
    P.append(blade('A_klinge', 0.12, 0.72, 0.052, 0.042, 0.0078, 0.13, 0.5, 30, 'steel'))
    # Zierstreifen (Hohlkehle) als dunkle Linie
    return P
build_model(saebel(), 'w_saebel', 'w_saebel')
clear_gear()

# ======================= Katana (Langklinge) =======================
def katana():
    P = []
    P.append(cylz('K_tsuka', 0.0168, -0.13, 0.115, 'cloth', verts=12))
    # Rautenwicklung
    P += wrap('K_wicklung', -0.125, 0.11, 0.0168, 14, 'dark', 0.0024)
    P.append(cylz('K_kashira', 0.0185, -0.147, -0.128, 'gold'))
    P.append(ball('K_kashira2', 0.0165, (0, 0, -0.147), 'gold', (1, 0.8, 0.6)))
    P.append(cylz('K_fuchi', 0.0185, 0.108, 0.125, 'gold'))
    # Stichblatt mit Durchbrüchen (vier Ringe)
    P.append(disc('K_tsuba', 0.045, 0.13, 0.006, 'dark', sx=1.0, sy=0.92))
    for k in range(4):
        a = math.pi / 2 * k + math.pi / 4
        P.append(gemstone('K_loch%d' % k, 0.0045, (0.031 * math.cos(a), 0.029 * math.sin(a), 0.13), 'gold', stretch=0.4))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.045, minor_radius=0.0035, major_segments=26, minor_segments=5, location=(0, 0, 0.13))
    t = bpy.context.active_object; t.name = 'K_tsubarand'; t.scale = (1, 0.92, 1); bpy.ops.object.transform_apply(scale=True); t.data.materials.append(mat('gold')); P.append(t)
    P.append(cylz('K_habaki', 0.0185, 0.133, 0.162, 'gold', verts=10))
    P.append(blade('K_klinge', 0.15, 0.86, 0.034, 0.027, 0.0075, 0.075, 0.5, 34, 'steel', edge='one', tip=0.06))
    # Hamon: heller Streifen entlang der Schneide
    return P
build_model(katana(), 'w_katana', 'w_katana')
clear_gear()

# ======================= Zweihänder =======================
def zweihaender():
    P = []
    P.append(cylz('Z_griff', 0.0185, -0.22, 0.09, 'leather'))
    P += wrap('Z_draht', -0.215, 0.085, 0.0185, 11, 'gold', 0.0019)
    P.append(disc('Z_knauf', 0.034, -0.235, 0.014, 'gold', verts=22))
    P.append(ball('Z_knauf2', 0.026, (0, 0, -0.248), 'gold', (1, 1, 0.8)))
    P.append(gemstone('Z_stein', 0.012, (0, 0.0, -0.262), 'glow', stretch=1.4))
    # Parierstange mit geschwungenen Enden und Klauen
    P.append(cylz('Z_hals', 0.02, 0.09, 0.125, 'gold'))
    for s in (-1, 1):
        P.append(sweep('Z_quill%d' % s, [(0, 0, 0.108), (s * 0.07, 0, 0.108), (s * 0.135, 0, 0.12), (s * 0.165, 0, 0.15), (s * 0.158, 0, 0.19)], [0.0115, 0.0105, 0.009, 0.0065, 0.0016], 8, 'gold'))
        P.append(sweep('Z_klaue%d' % s, [(s * 0.1, 0, 0.108), (s * 0.12, 0, 0.082), (s * 0.115, 0, 0.055)], [0.0075, 0.005, 0.0016], 7, 'gold'))
        P.append(gemstone('Z_aug%d' % s, 0.0085, (s * 0.074, 0.008, 0.11), 'glow', stretch=1.1))
    bl = blade('Z_klinge', 0.125, 1.18, 0.085, 0.074, 0.011, 0.0, 0.42, 38, 'steel', tip=0.1)
    P.append(bl)
    # Blutrinne mit Runen
    for k in range(5):
        P.append(gemstone('Z_rune%d' % k, 0.0058, (0, 0.0, 0.27 + 0.13 * k), 'glow', stretch=1.8))
    return P
build_model(zweihaender(), 'w_zweihaender', 'w_zweihaender')
clear_gear()

# ======================= Kurzklinge (für die Doppelklingen) =======================
def kurzklinge():
    P = []
    P.append(cylz('D_griff', 0.0148, -0.085, 0.07, 'leather'))
    P += wrap('D_draht', -0.08, 0.065, 0.0148, 7, 'gold', 0.0017)
    P.append(ball('D_knauf', 0.02, (0, 0, -0.098), 'gold', (1, 1, 1.1)))
    st = cylz('D_stange', 0.0075, -0.055, 0.055, 'gold', verts=12); xform(st, (0, 0, 0.085), (0, math.pi / 2, 0)); P.append(st)
    for s in (-1, 1):
        P.append(sweep('D_horn%d' % s, [(s * 0.052, 0, 0.085), (s * 0.075, 0, 0.1), (s * 0.07, 0, 0.125)], [0.0058, 0.0044, 0.0014], 7, 'gold'))
    P.append(gemstone('D_stein', 0.007, (0, 0.012, 0.085), 'glow', stretch=1.1))
    P.append(blade('D_klinge', 0.095, 0.5, 0.058, 0.05, 0.0085, 0.09, 0.55, 28, 'steel', edge='one', tip=0.12))
    return P
build_model(kurzklinge(), 'w_kurzklinge', 'w_kurzklinge')
clear_gear()

# ======================= Faustpanzer =======================
def faust(tier):
    """Panzerhandschuh um die Faust (Achse Y = Schlagrichtung): Lederband, Knöchelplatte, ab Stufe 2 Dornen und Edelstein."""
    P = []
    # Handgelenkband und Handrücken als Ring um die Y-Achse
    def ringy(name, r, y0, y1, role, th=0.006, segs=20, sx=1.0, sz=1.0):
        o = revolve(name, [(r, y0), (r + th, y0), (r + th, y1), (r, y1)], segs=segs, role=role, x_scale=sx, y_scale=sz)
        xform(o, (0, 0, 0), (-math.pi / 2, 0, 0))   # Z-Achse -> Y-Achse
        return o
    P.append(ringy('F_band', 0.052, -0.07, -0.018, 'leather', 0.007, 22, 1.0, 0.88))
    P.append(ringy('F_wickel', 0.0535, -0.058, -0.03, 'cloth', 0.004, 22, 1.0, 0.88))
    P.append(ringy('F_ruecken', 0.056, -0.018, 0.04, 'steel' if tier > 0 else 'leather', 0.006, 22, 1.0, 0.88))
    # Knöchelleiste mit vier Kugelköpfen
    P.append(ringy('F_knoechel', 0.058, 0.036, 0.062, 'steel' if tier > 0 else 'dark', 0.008, 22, 1.0, 0.88))
    n = 4
    for k in range(n):
        a = math.radians(-60 + 120 * k / (n - 1))
        x, z = 0.0665 * math.sin(a), 0.0665 * 0.88 * math.cos(a)
        P.append(ball('F_kopf%d' % k, 0.0105, (x, 0.062, z), 'gold' if tier > 1 else 'steel', segs=10, rings=6))
        if tier > 1:
            P.append(cone_('F_dorn%d' % k, 0.009, 0.0008, 0.05, (x, 0.098, z), 'steel', rot=(-math.pi / 2, 0, 0), verts=7))
    if tier > 0:
        # Zierplatte auf dem Handrücken mit Edelstein
        pl = plate('F_platte', [(-0.03, -0.034), (0.03, -0.034), (0.038, 0.02), (0.0, 0.046), (-0.038, 0.02)], 0.007, 'gold' if tier > 1 else 'steel')
        xform(pl, (0, 0, 0.0), (0, 0, 0))
        xform(pl, (0, 0.0, 0.0605), (-math.pi / 2, 0, 0)); bevel(pl, 0.0012, 1); P.append(pl)
        P.append(gemstone('F_stein', 0.0105, (0, 0.012, 0.066), 'glow', stretch=1.0))
    # Armschiene Richtung Ellbogen
    if tier > 0:
        for k in range(3):
            P.append(ringy('F_schiene%d' % k, 0.056 + 0.002 * k, -0.15 + 0.03 * k, -0.115 + 0.03 * k, 'steel', 0.005, 22, 1.0, 0.88))
    return P
def faust_fix(P):
    for o in P: xform(o, (0, 0, 0), (0, 0, math.pi))   # Knöchel zeigen im Spiel nach +Z
    return P
build_model(faust_fix(faust(0)), 'w_faust_leder', 'w_faust_leder')
clear_gear()
build_model(faust_fix(faust(1)), 'w_faust_stahl', 'w_faust_stahl')
clear_gear()
build_model(faust_fix(faust(2)), 'w_faust_dorn', 'w_faust_dorn')
clear_gear()

# ======================= Faji-Fokus (Kristall in goldener Fassung) =======================
def fokus():
    P = []
    # Handgriffhülse unten, drei Krallen halten den Kristall
    P.append(cylz('O_huelse', 0.02, 0.02, 0.07, 'gold', verts=14))
    P.append(cylz('O_ring', 0.027, 0.07, 0.082, 'gold', verts=16))
    for k in range(4):
        a = math.pi / 2 * k + math.pi / 4
        pts = [(0.022 * math.cos(a), 0.022 * math.sin(a), 0.08), (0.05 * math.cos(a), 0.05 * math.sin(a), 0.14), (0.062 * math.cos(a), 0.062 * math.sin(a), 0.22), (0.038 * math.cos(a), 0.038 * math.sin(a), 0.285)]
        P.append(sweep('O_kralle%d' % k, pts, [0.007, 0.0065, 0.0055, 0.0016], 7, 'gold'))
    c = gemstone('O_kristall', 0.058, (0, 0, 0.175), 'glow', stretch=1.45)
    P.append(c)
    P.append(gemstone('O_kern', 0.03, (0, 0, 0.175), 'steel', stretch=1.45))
    return P
build_model(fokus(), 'w_fokus', 'w_fokus')
