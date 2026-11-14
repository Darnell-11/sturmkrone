# Helme für Sturmkrone (Blender, headless): Ritterhelm, Drachenhelm, Kabuto, Krone, Kapuze, Himmelsreif.
# Raum: Kopfmitte (0, 0.003, 1.64), Stirn z ≈ 1.69, Scheitel 1.757, Vorderseite +Y. Alle Teile hängen im Spiel am Kopfknochen.
exec(open(os.path.join(HERE, 'armorlib.py'), encoding='utf-8').read())
clear_gear()
CY, CZ = 0.003, 1.64
P2 = math.pi

def dome(name, z0, z1, rs, role='steel', segs=40, sy=1.08, arc=None, th=0.0045, flat=False):
    """Kuppel aus Profil rs = [(Radius, Höhe über CZ)], Tiefe y etwas größer als Breite."""
    prof = [(r, CZ + h) for r, h in rs]
    ob = revolve(name, prof, segs=segs, role=role, y_scale=sy, arc=arc, loc=(0, CY, 0))
    if th: thicken(ob, th, 1)
    return ob

def ring_pts(r, z, a0, a1, n, sy=1.08):
    return [(r * math.cos(a0 + (a1 - a0) * i / n), CY + r * math.sin(a0 + (a1 - a0) * i / n) * sy, z) for i in range(n + 1)]

def band(name, r, z, h, a0=0.0, a1=2 * P2, th=0.006, role='gold', sy=1.08, segs=40):
    ob = revolve(name, [(r, z - h / 2), (r + th, z - h / 2), (r + th, z + h / 2), (r, z + h / 2)], segs=segs, role=role, y_scale=sy, arc=None if (a1 - a0) >= 2 * P2 - 1e-3 else (a0, a1), loc=(0, CY, 0))
    return bevel(ob, 0.0012, 1, 40)

def rivets(prefix, pts, r=0.0042, role='gold'):
    return [ball(prefix + str(i), r, p, role, segs=8, rings=5) for i, p in enumerate(pts)]

FRONT = P2 / 2

# ======================= Ritterhelm (Sallet mit Nasenbügel, Kamm und Federbusch) =======================
def ritterhelm():
    parts = []
    skull = dome('R_kalotte', 0, 0, [(0.112, 0.045), (0.116, 0.06), (0.114, 0.095), (0.104, 0.12), (0.082, 0.14), (0.052, 0.153), (0.02, 0.159), (0.0, 0.16)], 'steel')
    bevel(skull, 0.002, 2); parts.append(skull)
    # Nackenschale und Wangenklappen (vorn offen), etwas ausgestellt
    shell = dome('R_schale', 0, 0, [(0.118, 0.065), (0.121, 0.03), (0.123, -0.02), (0.128, -0.07), (0.136, -0.105)], 'steel', arc=(FRONT + 1.05, FRONT + 2 * P2 - 1.05), th=0.005)
    bevel(shell, 0.002, 2); parts.append(shell)
    parts.append(band('R_stirnband', 0.114, CZ + 0.056, 0.016, 0, 2 * P2, role='gold'))
    parts.append(band('R_nackenrand', 0.136, CZ - 0.104, 0.012, FRONT + 1.05, FRONT + 2 * P2 - 1.05, role='gold'))
    # Nasenbügel
    nb = plate('R_nase', [(-0.011, 0), (0.011, 0), (0.007, -0.075), (-0.007, -0.075)], 0.006, 'steel')
    xform(nb, (0, CY + 0.121, CZ + 0.062), (math.radians(-100), 0, 0)); bevel(nb, 0.0015, 1); parts.append(nb)
    # Kamm vom Stirnband über den Scheitel bis zum Nacken
    crest = plate('R_kamm', [(-0.115, -0.005), (-0.10, 0.015), (-0.05, 0.034), (0.0, 0.04), (0.05, 0.034), (0.10, 0.015), (0.115, -0.005), (0.09, 0.003), (-0.09, 0.003)], 0.012, 'gold')
    xform(crest, (0, CY, CZ + 0.15), (math.radians(90), 0, math.radians(90)), (1, 1.0, 1)); bevel(crest, 0.0015, 1); parts.append(crest)
    # Federbusch: gebogene Röhren mit Stoff-Rolle
    for k, (dx, lift) in enumerate(((0.0, 0.0), (0.012, -0.01), (-0.012, -0.01))):
        parts.append(sweep('R_busch%d' % k, [(dx, CY + 0.06, CZ + 0.165), (dx, CY - 0.02, CZ + 0.215 + lift), (dx, CY - 0.11, CZ + 0.215 + lift), (dx, CY - 0.19, CZ + 0.15 + lift), (dx, CY - 0.23, CZ + 0.07 + lift)], [0.014, 0.021, 0.022, 0.017, 0.006], 8, 'trim'))
    parts += rivets('R_niete', [(x, CY + math.sqrt(max(0, 0.116 ** 2 - x * x)) * 1.08 * 0.9, CZ + 0.056) for x in (-0.07, -0.035, 0.035, 0.07)])
    parts += [ball('R_knopf', 0.012, (0, CY, CZ + 0.162), 'gold')]
    return parts
build_model(ritterhelm(), 'helm_ritter2', 'helm_ritter2')

# ======================= Drachenhelm (Hörner, Rückenflosse, Wangenplatten, Glutaugen) =======================
clear_gear()
def drachenhelm():
    parts = []
    skull = dome('D_kalotte', 0, 0, [(0.114, 0.04), (0.119, 0.06), (0.117, 0.095), (0.106, 0.122), (0.082, 0.142), (0.05, 0.154), (0.0, 0.162)], 'main')
    bevel(skull, 0.002, 2); parts.append(skull)
    # Stirnplatte mit Brauenwulst (läuft vorn spitz nach unten)
    brow = plate('D_stirn', [(-0.1, 0), (-0.09, 0.03), (-0.04, 0.052), (0.0, 0.058), (0.04, 0.052), (0.09, 0.03), (0.1, 0), (0.03, -0.012), (0.0, -0.03), (-0.03, -0.012)], 0.008, 'steel')
    xform(brow, (0, CY + 0.108, CZ + 0.085), (math.radians(-20), 0, 0)); bevel(brow, 0.0015, 1); parts.append(brow)
    # Wangenschützer mit Dornen, links und rechts
    for s in (-1, 1):
        ck = plate('D_wange%d' % s, [(0, 0.075), (0.018, 0.03), (0.034, -0.03), (0.02, -0.085), (-0.012, -0.05), (-0.016, 0.02)], 0.007, 'steel')
        xform(ck, (s * 0.108, CY + 0.012, CZ - 0.04), (0, math.radians(90) * s, 0), (1, 1, 1)); bevel(ck, 0.0015, 1); parts.append(ck)
        # Hörner: nach hinten und oben geschwungen
        parts.append(sweep('D_horn%d' % s, [(s * 0.098, CY + 0.03, CZ + 0.105), (s * 0.15, CY + 0.012, CZ + 0.13), (s * 0.2, CY - 0.05, CZ + 0.185), (s * 0.225, CY - 0.13, CZ + 0.27), (s * 0.215, CY - 0.2, CZ + 0.335)], [0.024, 0.02, 0.0155, 0.0095, 0.0018], 9, 'gold'))
        parts.append(sweep('D_horn2_%d' % s, [(s * 0.082, CY - 0.02, CZ + 0.135), (s * 0.1, CY - 0.1, CZ + 0.18), (s * 0.115, CY - 0.18, CZ + 0.2)], [0.012, 0.009, 0.002], 7, 'gold'))
        parts.append(gemstone('D_auge%d' % s, 0.0095, (s * 0.052, CY + 0.114, CZ + 0.073), 'glow', stretch=1.6))
    # Rückenkamm aus Dornen
    for i in range(7):
        t = i / 6
        y = CY + 0.085 - 0.17 * t; z = CZ + 0.152 - 0.04 * t * t + (0.012 if i % 2 else 0)
        parts.append(cone_('D_dorn%d' % i, 0.012 - 0.0014 * i, 0.0006, 0.05 - 0.004 * i, (0, y, z + 0.022), 'steel', rot=(math.radians(-12 + 18 * t), 0, 0), verts=7))
    # Nackenfächer
    fan = dome('D_nacken', 0, 0, [(0.12, 0.04), (0.125, 0.0), (0.135, -0.05), (0.15, -0.095)], 'main', arc=(FRONT + 1.55, FRONT + 2 * P2 - 1.55), th=0.0045)
    bevel(fan, 0.002, 2); parts.append(fan)
    parts.append(band('D_rand', 0.12, CZ + 0.05, 0.012, 0, 2 * P2, role='gold'))
    return parts
build_model(drachenhelm(), 'helm_drache2', 'helm_drache2')

# ======================= Kabuto (Schalenhelm mit Rippen, Nackenschutz, Stirnschirm, Mondzier) =======================
clear_gear()
def kabuto():
    parts = []
    bowl = dome('K_schale', 0, 0, [(0.112, 0.045), (0.117, 0.07), (0.113, 0.1), (0.098, 0.128), (0.07, 0.148), (0.035, 0.158), (0.0, 0.162)], 'dark')
    bevel(bowl, 0.002, 2); parts.append(bowl)
    # Rippen von der Spitze zum Rand
    for i in range(12):
        a = 2 * P2 * i / 12
        pts = [(0.0, CY, CZ + 0.168)] + [((0.113 * math.sin(t * 1.3 + 0.02)) * math.cos(a), CY + (0.113 * math.sin(t * 1.3 + 0.02)) * math.sin(a) * 1.08, CZ + 0.165 - 0.12 * t) for t in (0.2, 0.45, 0.7, 0.95)]
        parts.append(sweep('K_rippe%d' % i, pts, [0.003, 0.004, 0.0045, 0.0045, 0.0045], 5, 'gold', cap=False))
    parts.append(band('K_rand', 0.119, CZ + 0.045, 0.014, 0, 2 * P2, role='gold'))
    # Stirnschirm (Mabizashi) und Wangenflügel (Fukigaeshi)
    peak = plate('K_schirm', [(-0.108, 0), (-0.085, 0.034), (0, 0.048), (0.085, 0.034), (0.108, 0), (0.06, -0.022), (-0.06, -0.022)], 0.008, 'dark')
    xform(peak, (0, CY + 0.1, CZ + 0.052), (math.radians(-65), 0, 0)); bevel(peak, 0.0015, 1); parts.append(peak)
    parts.append(plate('K_zier_leer', [(0, 0), (0.001, 0), (0.001, 0.001)], 0.001, 'gold'))
    # Mondzier (Maedate): Sichel mit Mittelspitze
    cres = []
    for i in range(0, 17):
        t = P2 * (0.1 + 0.8 * i / 16)
        cres.append((0.105 * math.cos(t), 0.075 * math.sin(t) + 0.02))
    for i in range(16, -1, -1):
        t = P2 * (0.1 + 0.8 * i / 16)
        cres.append((0.075 * math.cos(t), 0.052 * math.sin(t) + 0.0))
    mz = plate('K_mond', cres, 0.01, 'gold')
    xform(mz, (0, CY + 0.12, CZ + 0.112), (math.radians(90), 0, 0)); bevel(mz, 0.0015, 1); parts.append(mz)
    parts.append(cone_('K_spitze', 0.012, 0.0006, 0.06, (0, CY + 0.12, CZ + 0.2), 'gold', verts=8))
    # Nackenschutz aus vier übereinander gelegten, ausgestellten Reihen mit Schnürung
    for k in range(4):
        r0 = 0.121 + 0.012 * k; z0 = CZ + 0.04 - 0.03 * k
        sh = dome('K_nacken%d' % k, 0, 0, [(r0 - 0.002, 0.0), (r0 + 0.018, -0.032)], 'dark' if k % 2 == 0 else 'main', arc=(FRONT + 0.85, FRONT + 2 * P2 - 0.85), th=0.004)
        xform(sh, (0, 0, -0.03 * k + 0.04 - 0.0))
        bevel(sh, 0.0015, 1); parts.append(sh)
        parts.append(band('K_nrand%d' % k, r0 + 0.018, z0 - 0.032, 0.006, FRONT + 0.85, FRONT + 2 * P2 - 0.85, role='gold'))
    # Seitliche Wangenflügel
    for s in (-1, 1):
        fl = plate('K_flügel%d' % s, [(0, 0.045), (0.03, 0.02), (0.05, -0.02), (0.03, -0.065), (-0.012, -0.04), (-0.015, 0.02)], 0.006, 'dark')
        xform(fl, (s * 0.116, CY + 0.045, CZ + 0.0), (math.radians(8), math.radians(90) * s - s * 0.5, 0)); bevel(fl, 0.0015, 1); parts.append(fl)
    return parts
build_model(kabuto(), 'helm_kabuto2', 'helm_kabuto2')

# ======================= Krone (Reif mit Zacken, Bügeln und Juwelen) =======================
clear_gear()
def krone():
    parts = []
    parts.append(band('C_reif', 0.108, CZ + 0.105, 0.034, 0, 2 * P2, role='gold', th=0.008))
    parts.append(band('C_reif2', 0.108, CZ + 0.083, 0.008, 0, 2 * P2, role='trim', th=0.01))
    n = 9
    for i in range(n):
        a = 2 * P2 * i / n
        big = i % 3 == 0
        x, y = 0.114 * math.cos(a), CY + 0.114 * math.sin(a) * 1.05
        parts.append(cone_('C_zacke%d' % i, 0.016, 0.003, 0.07 if big else 0.048, (x, y, CZ + 0.14 + (0.014 if big else 0)), 'gold', verts=7))
        parts.append(gemstone('C_stein%d' % i, 0.0085 if big else 0.006, (x * 1.06, y + (0.003 if False else 0), CZ + 0.108), 'glow' if big else 'trim', stretch=1.2))
        parts.append(ball('C_perle%d' % i, 0.0075, (x, y, CZ + 0.186 + (0.014 if big else -0.006)), 'cloth', segs=8, rings=5))
    # Bügel über den Scheitel
    for ang in (0.0, P2 / 2):
        pts = []
        for k in range(9):
            t = P2 * k / 8
            pts.append((0.108 * math.cos(t) * math.cos(ang), CY + 0.108 * math.cos(t) * math.sin(ang), CZ + 0.125 + 0.07 * math.sin(t)))
        parts.append(sweep('C_buegel%d' % int(ang * 10), pts, 0.0072, 8, 'gold'))
    parts.append(ball('C_apfel', 0.017, (0, CY, CZ + 0.205), 'gold'))
    parts.append(gemstone('C_kreuz', 0.01, (0, CY, CZ + 0.235), 'glow', stretch=1.7))
    cap = dome('C_polster', 0, 0, [(0.104, 0.09), (0.104, 0.12), (0.092, 0.14), (0.062, 0.157), (0.0, 0.168)], 'main', th=0.0035)
    parts.append(cap)
    return parts
P = krone()
for o in P: xform(o, (0, 0, -0.048))
build_model(P, 'helm_krone2', 'helm_krone2')

# ======================= Kapuze (weiche Kappe mit Spitze und Halstuch) =======================
clear_gear()
def kapuze():
    parts = []
    prof = [(0.142, -0.125), (0.131, -0.085), (0.123, -0.035), (0.12, 0.025), (0.118, 0.075), (0.11, 0.115), (0.09, 0.145), (0.056, 0.164), (0.022, 0.174), (0.0, 0.178)]
    def rad(z):  # Hüllradius der Kapuze in Höhe z (über CZ)
        for (r0, h0), (r1, h1) in zip(prof, prof[1:]):
            if h0 <= z <= h1: return r0 + (r1 - r0) * (z - h0) / (h1 - h0)
        return prof[-1][0]
    hood = revolve('H_kapuze', [(r, CZ + h) for r, h in prof], segs=48, role='main', y_scale=1.12, loc=(0, CY, 0))
    # ovale Gesichtsöffnung vorn herausschneiden
    ex, ez, ecx, ecz = 0.092, 0.094, 0.0, 0.0
    bm = bmesh.new(); bm.from_mesh(hood.data); bm.faces.ensure_lookup_table()
    drop = []
    for f in bm.faces:
        c = f.calc_center_median()
        if c.y > CY + 0.02 and ((c.x - ecx) / ex) ** 2 + ((c.z - CZ - ecz) / ez) ** 2 < 1.0:
            drop.append(f)
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(hood.data); bm.free()
    me = hood.data
    # Spitze nach hinten ziehen, leichte Falten
    for v in me.vertices:
        d = max(0.0, (v.co.z - (CZ + 0.05)) / 0.14)
        v.co.y -= 0.06 * d * d
        a = math.atan2(v.co.y - CY, v.co.x)
        v.co.x += math.sin(a * 6) * 0.0035
    thicken(hood, 0.007, 1); subsurf(hood, 1); shade(hood, 60); parts.append(hood)
    # Rand der Öffnung als dicke Borte
    pts = []
    for k in range(25):
        t = 2 * P2 * k / 24
        x = ecx + (ex + 0.002) * math.cos(t); z = CZ + ecz + (ez + 0.002) * math.sin(t)
        r = rad(z - CZ)
        y = CY + 1.12 * math.sqrt(max(0.0001, r * r - x * x)) + 0.004
        pts.append((x, y, z))
    parts.append(sweep('H_saum', pts, 0.0085, 7, 'trim', cap=False))
    sc = revolve('H_tuch', [(0.082, CZ - 0.2), (0.108, CZ - 0.172), (0.12, CZ - 0.15), (0.108, CZ - 0.128), (0.085, CZ - 0.12)], segs=36, role='trim', y_scale=1.0, loc=(0, CY, 0))
    thicken(sc, 0.006, 1); subsurf(sc, 1); shade(sc, 60); parts.append(sc)
    return parts
build_model(kapuze(), 'helm_kapuze2', 'helm_kapuze2')

# ======================= Himmelsreif (Reif mit Flügeln und Juwel) =======================
clear_gear()
def himmelsreif():
    parts = []
    parts.append(band('E_reif', 0.106, CZ + 0.108, 0.02, 0, 2 * P2, role='gold', th=0.0055))
    parts.append(gemstone('E_juwel', 0.016, (0, CY + 0.118, CZ + 0.108), 'glow', rot=(0, 0, 0), stretch=1.5))
    parts.append(band('E_borte', 0.106, CZ + 0.126, 0.004, 0, 2 * P2, role='trim', th=0.0065))
    # Flügelfedern an den Schläfen, fächerförmig nach hinten oben
    for s in (-1, 1):
        for k in range(7):
            f = k / 6
            L = 0.17 - 0.07 * f + (0.02 if k == 0 else 0)
            ang = math.radians(25 + 62 * f)
            outline = [(0, 0), (L * 0.35, 0.021 - 0.005 * f), (L * 0.78, 0.017 - 0.004 * f), (L, 0.0), (L * 0.78, -0.012), (L * 0.35, -0.014)]
            ft = plate('E_feder%d_%d' % (s, k), outline, 0.0035, 'cloth' if k % 2 == 0 else 'steel')
            xform(ft, (s * 0.103, CY + 0.012 - 0.016 * k, CZ + 0.112 + 0.01 * k), (math.radians(8 + 5 * f) * 0, math.radians(0), s * ang + (P2 if s < 0 else 0)), (1, 1, 1))
            bevel(ft, 0.0009, 1); parts.append(ft)
    return parts
P = himmelsreif()
for o in P: xform(o, (0, 0, -0.04))
build_model(P, 'helm_engel2', 'helm_engel2')

# ======================= Hörnerhelm (Nordmänner: Schale, Nasenbügel, Pelzrand, gebogene Hörner) =======================
clear_gear()
def hoernerhelm():
    parts = []
    bowl = dome('V_schale', 0, 0, [(0.113, 0.04), (0.118, 0.065), (0.114, 0.1), (0.1, 0.128), (0.074, 0.148), (0.04, 0.158), (0.0, 0.163)], 'steel')
    bevel(bowl, 0.002, 2); parts.append(bowl)
    parts.append(band('V_rand', 0.119, CZ + 0.043, 0.02, 0, 2 * P2, role='gold', th=0.006))
    parts.append(band('V_band', 0.116, CZ + 0.085, 0.01, 0, 2 * P2, role='gold', th=0.005))
    # Nasenbügel und Brauenbögen
    nb = plate('V_nase', [(-0.012, 0), (0.012, 0), (0.008, -0.082), (-0.008, -0.082)], 0.006, 'steel')
    xform(nb, (0, CY + 0.123, CZ + 0.055), (math.radians(-98), 0, 0)); bevel(nb, 0.0015, 1); parts.append(nb)
    for s in (-1, 1):
        parts.append(sweep('V_braue%d' % s, [(s * 0.012, CY + 0.12, CZ + 0.052), (s * 0.05, CY + 0.108, CZ + 0.046), (s * 0.092, CY + 0.07, CZ + 0.04)], [0.007, 0.0062, 0.005], 7, 'gold'))
        # Hörner aus Bein: weit nach außen, dann steil nach oben
        parts.append(sweep('V_horn%d' % s, [(s * 0.1, CY + 0.0, CZ + 0.085), (s * 0.15, CY + 0.0, CZ + 0.09), (s * 0.205, CY + 0.0, CZ + 0.12), (s * 0.24, CY + 0.0, CZ + 0.185), (s * 0.245, CY + 0.0, CZ + 0.27)], [0.026, 0.023, 0.018, 0.011, 0.002], 10, 'trim'))
        parts.append(ball('V_hornkappe%d' % s, 0.03, (s * 0.1, CY, CZ + 0.085), 'gold', (0.8, 1, 1), segs=12, rings=7))
    # Pelzrand: wellige Krause unter der Schale (Rolle cloth)
    fur = revolve('V_fell', [(0.126, CZ + 0.03), (0.138, CZ + 0.012), (0.142, CZ - 0.01), (0.136, CZ - 0.03), (0.118, CZ - 0.04)], segs=44, role='cloth', y_scale=1.08, loc=(0, CY, 0))
    me = fur.data
    for v in me.vertices:
        a = math.atan2(v.co.y - CY, v.co.x)
        k = 1 + 0.045 * math.sin(a * 17) + 0.025 * math.sin(a * 31 + 1)
        v.co.x = v.co.x * k; v.co.y = CY + (v.co.y - CY) * k
    thicken(fur, 0.006, 1); subsurf(fur, 1); shade(fur, 60); parts.append(fur)
    for i in range(7):
        a = 2 * P2 * i / 7 + 0.3
        parts += [ball('V_niete%d' % i, 0.0045, (0.119 * math.cos(a), CY + 0.119 * math.sin(a) * 1.08, CZ + 0.085), 'gold', segs=8, rings=5)]
    return parts
build_model(hoernerhelm(), 'helm_hoerner2', 'helm_hoerner2')
