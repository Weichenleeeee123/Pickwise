"""Extract four independently drawn walking directions without altering sources."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageOps

spec = importlib.util.spec_from_file_location('team_assets', Path(__file__).with_name('prepare-team-assets.py'))
team_assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(team_assets)
DIRECTIONS = ['south', 'west', 'east', 'north']

def clean_cutout(cell):
    rgb = cell.convert('RGB')
    mask = Image.new('L', rgb.size)
    mask.putdata([255 if min(pixel) >= 213 and max(pixel) - min(pixel) < 32 else 0 for pixel in rgb.getdata()])
    padded = ImageOps.expand(mask, border=1, fill=255)
    ImageDraw.floodfill(padded, (0, 0), 128)
    exterior = padded.crop((1, 1, rgb.width + 1, rgb.height + 1))
    alpha = exterior.point(lambda v: 0 if v == 128 else 255)
    # Generated paper texture can leave detached specks outside the silhouette.
    pixels = alpha.load()
    seen = set()
    for y in range(rgb.height):
        for x in range(rgb.width):
            if not pixels[x, y] or (x, y) in seen:
                continue
            stack, component = [(x, y)], []
            seen.add((x, y))
            while stack:
                a, b = stack.pop()
                component.append((a, b))
                for nx, ny in [(a-1,b),(a+1,b),(a,b-1),(a,b+1)]:
                    if 0 <= nx < rgb.width and 0 <= ny < rgb.height and (nx,ny) not in seen and pixels[nx,ny]:
                        seen.add((nx,ny)); stack.append((nx,ny))
            if len(component) < 18:
                for a,b in component:
                    pixels[a,b] = 0
    result = rgb.convert('RGBA')
    result.putalpha(alpha)
    return result

def row_bounds(image):
    rgb = image.convert('RGB')
    active = []
    for y in range(image.height):
        if sum(min(rgb.getpixel((x, y))) < 190 for x in range(0, image.width, 3)) > 5:
            active.append(y)
    runs = []
    for y in active:
        if not runs or y - runs[-1][1] > 5:
            runs.append([y, y])
        else:
            runs[-1][1] = y
    major = [index for index, run in enumerate(runs) if run[1] - run[0] > 90]
    if len(major) != 4:
        raise ValueError(f'Expected four complete direction rows: {runs}')
    return [0] + [(runs[major[i + 1] - 1][1] + runs[major[i + 1]][0]) // 2 for i in range(3)] + [image.height]

def prepare(source, destination):
    if destination.exists():
        raise FileExistsError(f'Existing artwork preserved: {destination}')
    with Image.open(source) as image:
        if image.size != (1024, 1024):
            raise ValueError('Expected a 4 by 4 atlas of 256-pixel cells')
        bounds = row_bounds(image)
        sheet = Image.new('RGBA', (1024, 1024))
        for row in range(4):
            frames = [clean_cutout(image.crop((col * 256, bounds[row], (col + 1) * 256, bounds[row + 1]))) for col in range(4)]
            union = Image.new('L', frames[0].size)
            for frame in frames:
                union = ImageChops.lighter(union, frame.getchannel('A'))
            box = union.getbbox()
            if not box or box[3] - box[1] < 120:
                raise ValueError(f'Incomplete walking row {DIRECTIONS[row]}')
            width, height = box[2] - box[0], box[3] - box[1]
            scale = min(218 / height, 194 / width)
            for col, frame in enumerate(frames):
                crop = frame.crop(box).resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
                sheet.paste(crop, (col * 256 + (256 - crop.width) // 2, row * 256 + 238 - crop.height))
        destination.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(destination, quality=92, method=6)
    record = {'source': str(source), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'directions': DIRECTIONS, 'frames_per_direction': 4, 'row_bounds': bounds,
              'size': [1024, 1024], 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}
    destination.with_suffix('.manifest.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
    print(json.dumps({'asset': str(destination), 'row_bounds': bounds}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.source, args.out)
