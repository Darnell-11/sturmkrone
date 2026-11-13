# Startet ein Modell-Skript ohne Blender-Oberfläche:
#   blender --background --python tools/blender/headless.py -- build_boots.py [weitere_skripte.py ...]
# Lädt gearlib.py und den Körper der Grundfigur (base_male.glb) und führt dann jedes angegebene Skript aus tools/blender/ aus.
import sys, os, bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
exec(open(os.path.join(HERE, 'gearlib.py'), encoding='utf-8').read())

if 'Body' not in bpy.data.objects:
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'public', 'assets', 'characters', 'vroid', 'base_male.glb'))
    if 'Icosphere' in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects['Icosphere'], do_unlink=True)

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not args:
    raise SystemExit('Aufruf: blender --background --python tools/blender/headless.py -- build_boots.py')
for name in args:
    path = name if os.path.isabs(name) else os.path.join(HERE, name)
    print('==', name)
    exec(compile(open(path, encoding='utf-8').read(), path, 'exec'))
