"""Extract complete, consistently registered inward-facing meeting sprites."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from PIL import Image, ImageChops

spec = importlib.util.spec_from_file_location('occupied', Path(__file__).with_name('prepare-occupied-office.py'))
occupied = importlib.util.module_from_spec(spec)
spec.loader.exec_module(occupied)

def prepare(atlas, output):
    output.mkdir(parents=True, exist_ok=True)
    targets = [output/f'{role}-standing-v7.webp' for role in occupied.ROLES]
    if any(path.exists() for path in targets):
        raise FileExistsError('Existing artwork preserved; choose a new output directory')
    with Image.open(atlas) as image:
        if image.size != (1024,1536): raise ValueError('Expected a 4x6 standing atlas')
        rows = occupied.detect_rows(image)
        for row, role in enumerate(occupied.ROLES):
            frames = [occupied.module.cutout(image.crop((column*256,rows[row],(column+1)*256,rows[row+1]))) for column in range(4)]
            union = Image.new('L', frames[0].size)
            for frame in frames: union=ImageChops.lighter(union,frame.getchannel('A'))
            box=union.getbbox()
            if not box or box[3]-box[1]<100: raise ValueError(f'Incomplete standing row: {role}')
            width,height=box[2]-box[0],box[3]-box[1]
            scale=min(218/height,194/width)
            strip=Image.new('RGBA',(1024,256))
            for column,frame in enumerate(frames):
                crop=frame.crop(box).resize((round(width*scale),round(height*scale)),Image.Resampling.LANCZOS)
                strip.paste(crop,(column*256+(256-crop.width)//2,238-crop.height))
            strip.save(output/f'{role}-standing-v7.webp',quality=92,method=6)
    manifest={'model':'gpt-image-2.6','provider':'OpenAI Next (user-selected)','date':'2026-11-15',
              'source_sha256':hashlib.sha256(atlas.read_bytes()).hexdigest(),'row_bounds':rows,
              'directions':['east','south','west','northeast','north','northwest'],
              'assets':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in targets}}
    (output/'office-standing-v7.manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps(manifest,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--atlas',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    prepare(args.atlas,args.out)
