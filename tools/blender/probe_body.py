# Maße der Grundfigur ausgeben (Kopf, Schultern, Hände) – nur zum Planen neuer Teile
b = body()
pts = [v.co for v in b.data.vertices]
def box(name, pred):
    p = [v for v in pts if pred(v)]
    if not p:
        print(name, 'leer'); return
    xs = [v.x for v in p]; ys = [v.y for v in p]; zs = [v.z for v in p]
    print('%s x[%.3f %.3f] y[%.3f %.3f] z[%.3f %.3f] n=%d' % (name, min(xs), max(xs), min(ys), max(ys), min(zs), max(zs), len(p)))
box('kopf', lambda v: v.z > 1.52 and abs(v.x) < 0.14)
box('schaedel>1.65', lambda v: v.z > 1.65 and abs(v.x) < 0.14)
box('hals', lambda v: 1.45 < v.z < 1.55 and abs(v.x) < 0.06)
box('schulter_L', lambda v: 1.35 < v.z < 1.5 and 0.1 < v.x < 0.3)
box('arm_L', lambda v: 1.3 < v.z < 1.5 and v.x > 0.3)
box('hand_L', lambda v: 1.3 < v.z < 1.5 and v.x > 0.62)
box('torso', lambda v: 1.0 < v.z < 1.4 and abs(v.x) < 0.2)
print('bones/obj', [o.name for o in bpy.data.objects])
