# Schulterpanzer (Blender, headless): Lamellen, Drachen, Flügel. Linke Schulter modelliert (x > 0), rechts gespiegelt.
exec(open(os.path.join(HERE, 'armorlib.py'), encoding='utf-8').read())
clear_gear()
AY, AZ = 0.045, 1.405          # Mitte des Oberarms in der Schulterhöhe
JX = 0.14                      # Schultergelenk

def cap(name, role, r=0.092, x=JX, flat=0.78, sq=1.0):
    """Kappe über dem Gelenk: obere Halbkugel (leicht gedrückt)."""
    prof = [(r * math.sin(t), r * math.cos(t) * flat) for t in [i * (math.pi / 2) / 8 for i in range(0, 9)]]
    prof = [(rr, hh) for rr, hh in prof]
    prof.sort(key=lambda p: p[1])
    ob = revolve(name, [(rr, hh + AZ - 0.004) for rr, hh in prof], segs=28, role=role, y_scale=sq, loc=(x, AY, 0))
    thicken(ob, 0.005, 1)
    return ob

def lamellen():
    P = []
    c = cap('S_kappe', 'steel', 0.088, JX + 0.01, 0.8)
    bevel(c, 0.002, 2); P.append(c)
    for i in range(4):
        x0 = JX + 0.035 + 0.032 * i
        s = shell_x('S_lamelle%d' % i, [(x0, 0.074 + 0.006 * i), (x0 + 0.038, 0.082 + 0.006 * i), (x0 + 0.05, 0.088 + 0.006 * i)], math.radians(-35), math.radians(215), AY, AZ, 20, 'steel' if i % 2 == 0 else 'main')
        bevel(s, 0.0016, 1); P.append(s)
        P.append(shell_x('S_rand%d' % i, [(x0 + 0.044, 0.0865 + 0.006 * i), (x0 + 0.052, 0.0895 + 0.006 * i)], math.radians(-35), math.radians(215), AY, AZ, 20, 'gold', th=0.003))
        for k in range(5):
            a = math.radians(-20 + 230 * k / 4)
            P.append(ball('S_niete%d_%d' % (i, k), 0.0042, (x0 + 0.02, AY + (0.0865 + 0.006 * i) * math.cos(a), AZ + (0.0865 + 0.006 * i) * math.sin(a)), 'gold', segs=8, rings=5))
    # Kragenspange am Hals
    P.append(shell_x('S_gold', [(JX - 0.02, 0.09), (JX + 0.02, 0.094)], math.radians(30), math.radians(150), AY, AZ, 16, 'gold', th=0.003))
    out = P + [mirror(o) for o in P]
    return out
build_model(lamellen(), 'schulter_lamellen2', 'schulter_lamellen2')

clear_gear()
def drachen():
    P = []
    c = cap('T_kappe', 'main', 0.092, JX + 0.012, 0.85, 1.02)
    bevel(c, 0.002, 2); P.append(c)
    for i in range(3):
        x0 = JX + 0.04 + 0.036 * i
        s = shell_x('T_platte%d' % i, [(x0, 0.078 + 0.005 * i), (x0 + 0.04, 0.088 + 0.007 * i), (x0 + 0.056, 0.094 + 0.007 * i)], math.radians(-30), math.radians(210), AY, AZ, 20, 'steel' if i != 1 else 'main')
        bevel(s, 0.0016, 1); P.append(s)
        P.append(shell_x('T_rand%d' % i, [(x0 + 0.048, 0.0925 + 0.007 * i), (x0 + 0.058, 0.0965 + 0.007 * i)], math.radians(-30), math.radians(210), AY, AZ, 20, 'gold', th=0.003))
    # Dornen auf dem Kamm: drei große, nach außen und hinten gebogen
    for k, (xo, yo, h, lean) in enumerate(((0.19, 0.055, 0.085, 0.6), (0.245, 0.04, 0.07, 0.7), (0.145, 0.07, 0.065, 0.4))):
        P.append(sweep('T_dorn%d' % k, [(xo, AY + yo, AZ + 0.085), (xo + 0.02 * lean, AY + yo - 0.03, AZ + 0.085 + h * 0.5), (xo + 0.05 * lean, AY + yo - 0.07, AZ + 0.085 + h)], [0.021 - 0.002 * k, 0.012, 0.0014], 8, 'gold'))
    P.append(gemstone('T_glut', 0.0145, (JX + 0.075, AY + 0.0, AZ + 0.098), 'glow', stretch=1.4))
    out = P + [mirror(o) for o in P]
    return out
build_model(drachen(), 'schulter_drache3', 'schulter_drache3')

clear_gear()
def fluegel():
    P = []
    c = cap('F_kappe', 'steel', 0.09, JX + 0.01, 0.8)
    bevel(c, 0.002, 2); P.append(c)
    P.append(shell_x('F_gold', [(JX + 0.075, 0.085), (JX + 0.105, 0.0905)], math.radians(-30), math.radians(210), AY, AZ, 20, 'gold', th=0.003))
    P.append(shell_x('F_gold2', [(JX + 0.12, 0.083), (JX + 0.14, 0.087)], math.radians(-30), math.radians(210), AY, AZ, 20, 'gold', th=0.003))
    P.append(shell_x('F_schale', [(JX + 0.1, 0.084), (JX + 0.18, 0.09)], math.radians(-30), math.radians(210), AY, AZ, 20, 'main', th=0.004))
    # Federfächer: sieben Federn aus dem Rücken der Kappe, nach oben-hinten fächernd
    for k in range(7):
        f = k / 6
        L = 0.2 - 0.07 * abs(f - 0.35)
        outline = [(0, 0), (L * 0.3, 0.026), (L * 0.75, 0.022), (L, 0.0), (L * 0.75, -0.016), (L * 0.3, -0.018)]
        ft = plate('F_feder%d' % k, outline, 0.004, 'cloth' if k % 2 == 0 else 'steel')
        ang = math.radians(38 + 70 * f)
        xform(ft, (JX + 0.03 + 0.012 * k, AY - 0.016 - 0.012 * k, AZ + 0.06), (math.radians(90), 0, ang + math.radians(180)))
        bevel(ft, 0.001, 1); P.append(ft)
    P.append(gemstone('F_stein', 0.012, (JX + 0.06, AY + 0.04, AZ + 0.07), 'glow', stretch=1.4))
    out = P + [mirror(o) for o in P]
    return out
build_model(fluegel(), 'schulter_fluegel3', 'schulter_fluegel3')
