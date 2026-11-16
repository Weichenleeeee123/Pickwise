"""Register empty and occupied chair sprites on a common wheel baseline.

No network calls; originals and earlier asset versions are preserved.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from PIL import Image, ImageChops

spec = importlib.util.spec_from_file_location('modern_office', Path(__file__).with_name('prepare-modern-office.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ROLES = module.ROLES

def detect_rows(atlas):
    rgb = atlas.convert('RGB')
    width, height = rgb.size
    pixels = rgb.load()
    active = []
    for y in range(height):
        count = sum(1 for x in range(0,width,3) if min(pixels[x,y]) < 200)
        if count >= 4: active.append(y)
    runs = []
    for y in active:
        if not runs or y-runs[-1][1] > 3: runs.append([y,y])
        else: runs[-1][1]=y
    major = [i for i,run in enumerate(runs) if run[1]-run[0]>70]
    if len(major)!=6: raise ValueError(f'Expected six complete character rows, found {runs}')
    # Short disconnected feet/wheels belong to the preceding torso, rather
    # than disappearing when only large connected projection bands are kept.
    return [0] + [(runs[major[i+1]-1][1]+runs[major[i+1]][0])//2 for i in range(5)] + [height]

def register(source, empty=False, shared_bounds=None):
    rgba = module.cutout(source)
    bbox = shared_bounds or rgba.getbbox()
    if not bbox: raise ValueError('Empty chair sprite')
    # Chair geometry, not head height, defines the scaling and baseline.
    # Generated atlas cells retain fixed framing. Empty chair reference gets
    # its wheel/armrest silhouette mapped into the same occupied-chair bounds.
    canvas = Image.new('RGBA', (256, 256))
    if empty:
        crop = rgba.crop(bbox)
        crop.thumbnail((150, 146), Image.Resampling.LANCZOS)
        canvas.paste(crop, ((256-crop.width)//2, 238-crop.height))
    else:
        # Only correct small outer framing drift; preserve relative person/chair.
        width = bbox[2]-bbox[0]; height = bbox[3]-bbox[1]
        if height < 100: raise ValueError('Incomplete occupied chair frame')
        crop = rgba.crop(bbox)
        scale = min(218/height, 194/width)
        crop = crop.resize((round(width*scale), round(height*scale)), Image.Resampling.LANCZOS)
        canvas.paste(crop, ((256-crop.width)//2, 238-crop.height))
    return canvas

def prepare(room, empty, atlas, output):
    output.mkdir(parents=True, exist_ok=True)
    paths = [output/f'{role}-occupied-v6.webp' for role in ROLES] + [output/'chair-empty-v6.webp', output/'office-computers-v4.webp']
    if any(path.exists() for path in paths): raise FileExistsError('Existing assets preserved; choose another output directory')
    with Image.open(atlas) as image:
        if image.size != (1024,1536): raise ValueError('Expected 4x6 atlas of 256px square cells')
        row_bounds = detect_rows(image)
        for row, role in enumerate(ROLES):
            strip = Image.new('RGBA',(1024,256))
            frames = [module.cutout(image.crop((column*256,row_bounds[row],(column+1)*256,row_bounds[row+1]))) for column in range(4)]
            union = Image.new('L', frames[0].size)
            for frame in frames: union=ImageChops.lighter(union,frame.getchannel('A'))
            shared_bounds=union.getbbox()
            for column in range(4):
                frame = register(frames[column], shared_bounds=shared_bounds)
                strip.paste(frame,(column*256,0))
            strip.save(output/f'{role}-occupied-v6.webp',quality=92,method=6)
    with Image.open(empty) as image:
        register(image,empty=True).save(output/'chair-empty-v6.webp',quality=92,method=6)
    with Image.open(room) as image:
        if image.size != (1536,1024): raise ValueError('Expected 3:2 room')
        image.convert('RGB').save(output/'office-computers-v4.webp',quality=92,method=6)
    manifest={'model':'gpt-image-2.6','provider':'OpenAI Next (user-selected)','date':'2026-11-15',
              'source_sha256': {str(p.name):hashlib.sha256(p.read_bytes()).hexdigest() for p in [room,empty,atlas]},
              'row_bounds': row_bounds,
              'assets':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths}}
    (output/'office-v6.manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps(manifest,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--room',type=Path,required=True)
    parser.add_argument('--empty',type=Path,required=True)
    parser.add_argument('--atlas',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    prepare(args.room,args.empty,args.atlas,args.out)
