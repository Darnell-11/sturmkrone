# Hero-Props für Schiffe und Häfen: Kanone auf Holzlafette, Anker, Laterne, Fass, Kiste (das Steuerrad liegt in build_ships.py).
#   blender --background --python tools/blender/headless.py -- build_worldprops.py
# Alle Teile entstehen in SPIEL-Koordinaten (Meter, Y oben, Z vorn) und werden beim Export nach Blender (Z oben) gedreht.
# Materialname = Rolle (wood, darkwood, iron, bronze, brass, dark); das Spiel setzt dafür seine Toon-Materialien ein.
# UV: jedes Teil bekommt zylindrische/ebene UVs, danach packt Blender alle Inseln ohne Überlappung in 0..1.
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

WORLD_DIR = os.path.join(ROOT, 'public', 'models', 'world')
os.makedirs(WORLD_DIR, exist_ok=True)
clear_gear()

exec(open(os.path.join(HERE, 'proplib.py'), encoding='utf-8').read())

# ======================= Kanone =======================
# Mündung +Z, oben +Y, Rohrachse durch den Ursprung; Boden der Räder bei y = -0.55
def build_kanone():
    m = Model('kanone')
    prof = [(0.0, -0.66), (0.07, -0.64), (0.13, -0.58), (0.19, -0.5), (0.215, -0.42), (0.215, -0.2), (0.195, 0.0), (0.175, 0.25),
            (0.155, 0.45), (0.15, 0.55), (0.165, 0.58), (0.2, 0.62), (0.205, 0.7), (0.15, 0.71), (0.11, 0.69)]
    m.lathe('bronze', prof, AX, seg=14)
    m.sphere('bronze', 0.075, TR(z=-0.7), seg=12)                               # Traubenknopf
    rad = lambda z: next((prof[k][0] + (prof[k + 1][0] - prof[k][0]) * (z - prof[k][1]) / (prof[k + 1][1] - prof[k][1]) for k in range(len(prof) - 1) if prof[k][1] <= z <= prof[k + 1][1]), 0.2)
    for z in (-0.28, 0.12, 0.42):
        m.torus('iron', rad(z) + 0.012, 0.022, AX @ TR(y=z), seg=14, sec=5)       # Eisenbänder
    m.lathe('dark', [(0.0, 0.705), (0.105, 0.705)], AX, seg=10, caps=False)       # Mündungsloch
    m.cyl('iron', 0.045, 0.74, TR(z=-0.05, rz=math.pi / 2), seg=10)               # Schildzapfen
    m.torus('iron', 0.045, 0.012, TR(y=0.2, z=-0.62, rx=math.pi / 2), seg=12, sec=5)  # Brooktau-Ring
    for sx in (-1, 1):
        m.box('darkwood', (0.11, 0.3, 1.2), TR(x=sx * 0.21, y=-0.28, z=-0.04))     # Wangen
        m.box('darkwood', (0.11, 0.16, 0.42), TR(x=sx * 0.21, y=-0.38, z=0.46))   # Stufe vorn
        m.box('darkwood', (0.11, 0.22, 0.3), TR(x=sx * 0.21, y=-0.22, z=-0.64))   # Schwanz hinten
        m.cyl('darkwood', 0.15, 0.09, TR(x=sx * 0.31, y=-0.4, z=0.3, rz=math.pi / 2), seg=10)   # Vorderrad
        m.cyl('darkwood', 0.115, 0.09, TR(x=sx * 0.31, y=-0.44, z=-0.5, rz=math.pi / 2), seg=10) # Hinterrad
        m.cyl('iron', 0.04, 0.05, TR(x=sx * 0.36, y=-0.4, z=0.3, rz=math.pi / 2), seg=8)        # Radnabe
        m.cyl('iron', 0.032, 0.05, TR(x=sx * 0.36, y=-0.44, z=-0.5, rz=math.pi / 2), seg=8)
        m.box('iron', (0.12, 0.05, 0.28), TR(x=sx * 0.21, y=-0.12, z=-0.1))       # Eisenband über der Wange
    m.cyl('iron', 0.03, 0.62, TR(y=-0.4, z=0.3, rz=math.pi / 2), seg=8)           # Achsen
    m.cyl('iron', 0.025, 0.62, TR(y=-0.44, z=-0.5, rz=math.pi / 2), seg=8)
    m.box('darkwood', (0.42, 0.08, 0.08), TR(y=-0.22, z=0.15))                     # Querriegel
    m.box('darkwood', (0.42, 0.08, 0.08), TR(y=-0.2, z=-0.35))
    m.box('wood', (0.26, 0.09, 0.3), TR(y=-0.14, z=-0.36, rx=-0.12))               # Keil unter dem Rohr
    m.export(os.path.join(WORLD_DIR, 'kanone.glb'))

# ======================= Steuerrad =======================
# Rad in der XY-Ebene, Achse +Z
def build_steuerrad():
    m = Model('steuerrad')
    ZA = TR(rx=math.pi / 2)                                       # Ring in der XY-Ebene (lokale Y-Achse -> Z)
    m.torus('wood', 0.46, 0.04, ZA, seg=28, sec=8)                  # Felge
    m.torus('wood', 0.2, 0.025, ZA, seg=20, sec=6)                  # Innenring
    for i in range(8):
        a = i * math.pi / 4
        m.box('wood', (0.045, 0.62, 0.045), TR(x=-math.sin(a) * 0.31, y=math.cos(a) * 0.31, rz=a))                  # Speiche innen
        m.lathe('wood', [(0.03, -0.21), (0.036, -0.16), (0.05, -0.1), (0.036, -0.04), (0.03, 0.12), (0.045, 0.14), (0.0, 0.2)],
                TR(x=-math.sin(a) * 0.65, y=math.cos(a) * 0.65, rz=a), seg=8)                                    # gedrehter Griff
    m.cyl('brass', 0.11, 0.14, AX, seg=14)                          # Nabe
    m.cyl('brass', 0.05, 0.3, AX, seg=10)                           # Welle
    m.torus('brass', 0.11, 0.015, TR(z=0.07, rx=math.pi / 2), seg=14, sec=5)
    m.sphere('brass', 0.045, TR(z=0.17), seg=10)                    # Knauf
    m.export(os.path.join(WORLD_DIR, 'steuerrad.glb'))

# ======================= Anker =======================
# Admiralitätsanker, Ring oben (y = +0.95), Kronen-Spitze unten, Stock quer in Z
def build_anker():
    m = Model('anker')
    m.torus('iron', 0.11, 0.03, TR(y=0.9, rz=math.pi / 2), seg=16, sec=6)       # Ring (in der Ebene der Arme)
    m.lathe('iron', [(0.045, 0.78), (0.05, 0.7), (0.06, 0.0), (0.075, -0.55), (0.06, -0.62)], TR(), seg=10)   # Schaft (leicht verjüngt)
    m.cyl('iron', 0.032, 1.0, TR(y=0.58, rz=math.pi / 2), seg=8)                 # Stock (quer zu den Armen)
    for sz in (-1, 1):
        m.sphere('iron', 0.045, TR(x=sz * 0.5, y=0.58), seg=8)                    # Stockkugeln
    # Arme als Bögen unten: zwei Viertelkreis-Stücke links und rechts, jeweils mit Fluke
    for sz in (-1, 1):
        # einfache, saubere Näherung: gebogener Arm aus kurzen Zylindern
        steps = 8
        prev = Vector((0, -0.66, 0))
        for k in range(1, steps + 1):
            t = k / steps; ang = t * math.radians(70)
            cur = Vector((0, -0.66 + 0.48 * math.sin(ang) * 0.9, sz * 0.52 * (1 - math.cos(ang)) / (1 - math.cos(math.radians(70))) * 0.9))
            d = cur - prev; Lh = d.length
            mid = (cur + prev) / 2
            rot = Vector((0, 1, 0)).rotation_difference(d.normalized()).to_matrix().to_4x4()
            m.lathe('iron', [(0.05 * (1 - 0.3 * (k - 1) / steps), -Lh / 2 - 0.004), (0.05 * (1 - 0.3 * k / steps), Lh / 2 + 0.004)], Matrix.Translation(mid) @ rot, seg=8)
            prev = cur
        tip = prev
        # Fluke: Schaufel in Verlängerung des Arms, nach innen geneigt
        dn = d.normalized()
        rot = Vector((0, 1, 0)).rotation_difference(dn).to_matrix().to_4x4()
        m.box('iron', (0.045, 0.3, 0.24), Matrix.Translation(tip + dn * 0.1) @ rot)
        m.lathe('iron', [(0.0, 0.0), (0.075, -0.07), (0.0, -0.14)], Matrix.Translation(tip + dn * 0.27) @ rot @ TR(rx=math.pi / 2 * 0), seg=6)
    m.export(os.path.join(WORLD_DIR, 'anker.glb'))

# ======================= Laterne =======================
# Hängelaterne, Mittelpunkt der Flamme im Ursprung, Aufhängering oben
def build_laterne():
    m = Model('laterne')
    r, hh = 0.27, 0.34
    m.lathe('iron', [(0.05, hh + 0.2), (0.14, hh + 0.14), (r * 1.05, hh + 0.02), (r * 1.05, hh), (r * 0.6, hh + 0.01)], TR(), seg=8)      # Dach (Kegel)
    m.sphere('brass', 0.05, TR(y=hh + 0.21), seg=8)                                                                                     # Knauf
    m.torus('iron', 0.1, 0.018, TR(y=hh + 0.3, rx=math.pi / 2), seg=12, sec=5)                                                           # Aufhängering
    m.lathe('iron', [(r * 0.8, -hh), (r * 0.95, -hh - 0.06), (r * 0.7, -hh - 0.1), (0.1, -hh - 0.14)], TR(), seg=8)                      # Boden
    m.lathe('brass', [(r * 0.95, -hh + 0.01), (r * 0.95, -hh + 0.05)], TR(), seg=8, caps=False)                                          # Messingband
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        m.box('iron', (0.035, hh * 2, 0.035), TR(x=math.cos(a) * r * 0.92, z=math.sin(a) * r * 0.92, ry=-a))
    m.cyl('iron', 0.012, hh * 2, TR(y=0.0), seg=6)                                                                                       # Mittelstab (hält die Flamme)
    m.torus('iron', r * 0.92, 0.014, TR(y=hh * 0.7), seg=8, sec=4)                                                                       # Querring oben
    m.torus('iron', r * 0.92, 0.014, TR(y=-hh * 0.7), seg=8, sec=4)
    m.export(os.path.join(WORLD_DIR, 'laterne.glb'))

# ======================= Fass =======================
# Boden bei y = 0, Höhe 0.8, größter Radius 0.36 in der Mitte; Reifen aus Eisen
def build_fass():
    m = Model('fass')
    H = 0.8
    prof = []
    for k in range(0, 11):
        t = k / 10
        prof.append((0.31 + 0.05 * math.sin(math.pi * t) ** 1.2, H * t))
    prof[0] = (0.29, 0.0); prof[-1] = (0.29, H)
    m.lathe('wood', prof, TR(), seg=16)
    m.lathe('wood', [(0.0, H - 0.02), (0.27, H - 0.03), (0.28, H - 0.005)], TR(), seg=16, caps=False)          # eingelassener Deckel
    m.lathe('wood', [(0.0, H - 0.03), (0.27, H - 0.03)], TR(), seg=16, caps=False)
    ra = lambda y: 0.31 + 0.05 * math.sin(math.pi * y / H) ** 1.2
    for y in (0.07, 0.23, 0.57, 0.73):
        m.torus('iron', ra(y) + 0.004, 0.018, TR(y=y), seg=16, sec=4)
    m.cyl('darkwood', 0.035, 0.03, TR(y=H * 0.5, z=ra(H * 0.5) - 0.005, rx=math.pi / 2), seg=8)           # Spundloch
    m.export(os.path.join(WORLD_DIR, 'fass.glb'))

# ======================= Kiste =======================
# Boden bei y = 0, 1 x 0.85 x 1; Bretter, Eisenecken, Deckelleisten
def build_kiste():
    m = Model('kiste')
    w, h = 1.0, 0.85
    for i in range(5):                                                       # Bretter außen (leicht versetzt = Fugen)
        y = h * (i + 0.5) / 5
        m.box('wood', (w, h / 5 - 0.012, w), TR(y=y))
    m.box('darkwood', (w + 0.02, 0.06, w + 0.02), TR(y=h + 0.005))           # Deckel
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box('iron', (0.1, h + 0.04, 0.1), TR(x=sx * (w / 2 - 0.02), y=h / 2, z=sz * (w / 2 - 0.02)))   # Eckbeschläge
    for z in (-0.28, 0.28):
        m.box('darkwood', (w + 0.04, 0.04, 0.1), TR(y=h + 0.04, z=z))        # Deckelleisten
    for sx in (-1, 1):
        m.box('iron', (0.03, 0.05, 0.22), TR(x=sx * (w / 2 + 0.01), y=h * 0.62))   # Griffbeschlag
    m.box('brass', (0.12, 0.1, 0.03), TR(y=h * 0.7, z=w / 2 + 0.015))        # Schloss
    m.box('iron', (0.04, 0.04, 0.03), TR(y=h * 0.67, z=w / 2 + 0.032))
    m.export(os.path.join(WORLD_DIR, 'kiste.glb'))

for fn in (build_kanone, build_anker, build_laterne, build_fass, build_kiste):  # Steuerrad: build_ships.py (detailliertere Fassung)
    clear_gear()
    fn()
