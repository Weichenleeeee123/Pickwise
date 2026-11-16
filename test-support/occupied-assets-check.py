"""Regression checks for uneven generated rows and registered chair composites."""
import importlib.util
from pathlib import Path
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location('occupied', Path(__file__).parents[1]/'scripts'/'prepare-occupied-office.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

atlas = Image.new('RGB', (1024,1536), 'white')
draw = ImageDraw.Draw(atlas)
starts = [15,262,493,740,988,1246]
for row, start in enumerate(starts):
    for col in range(4):
        x=col*256
        draw.ellipse((x+90,start,x+166,start+60),fill=(120,74,32))
        draw.rectangle((x+74,start+55,x+182,start+190),fill=(46,100,58))
        draw.ellipse((x+115,start+204,x+141,start+216),fill=(28,33,24))
bounds = module.detect_rows(atlas)
assert len(bounds)==7,bounds
for i,start in enumerate(starts):
    assert bounds[i] <= start and bounds[i+1] > start+216,(bounds,i,start)
    crop=atlas.crop((0,bounds[i],256,bounds[i+1]))
    frame=module.register(crop)
    box=frame.getbbox()
    assert box[1] >= 10 and box[3] <= 246,box
    assert box[3]-box[1] >= 210,box
print('Uneven row extraction retains whole head, chair, wheels and transparent margins.')
