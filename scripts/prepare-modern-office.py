"""Prepare versioned computer-office assets without touching previous artwork."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROLES = ('identify', 'demand', 'competition', 'profit', 'risk', 'summary')

def cutout(source):
    rgba = source.convert('RGBA')
    rgb = rgba.convert('RGB')
    pixels = rgb.get_flattened_data() if hasattr(rgb, 'get_flattened_data') else rgb.getdata()
    corner = rgb.getpixel((0, 0))
    dark = max(corner) < 30
    mask = Image.new('L', rgb.size)
    mask.putdata([255 if (max(p) < 26 if dark else min(p) > 237 and max(p) - min(p) < 20) else 0 for p in pixels])
    padded = ImageOps.expand(mask, border=1, fill=255)
    ImageDraw.floodfill(padded, (0, 0), 128)
    alpha = padded.crop((1, 1, rgb.width + 1, rgb.height + 1)).point(lambda v: 0 if v == 128 else 255)
    from PIL import ImageChops
    rgba.putalpha(ImageChops.multiply(alpha, rgba.getchannel('A')))
    return rgba

def prepare(source_dir, output_dir):
    sources = {name: source_dir / filename for name, filename in {
        'office': 'office-computers-v4.png', 'chair': 'office-chair-v4.png', 'atlas': 'computer-team-atlas-v4.png'
    }.items()}
    for path in sources.values():
        if not path.is_file(): raise FileNotFoundError(path)
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = [output_dir / f'{role}-computer-v4.webp' for role in ROLES]
    outputs += [output_dir / 'office-computers-v4.webp', output_dir / 'chair-computer-v4.webp']
    if any(path.exists() for path in outputs): raise FileExistsError('Use a new asset version; existing artwork is preserved')
    with Image.open(sources['atlas']) as atlas:
        if atlas.size != (1024, 1536): raise ValueError('Expected four-by-six 256px atlas')
        for row, role in enumerate(ROLES):
            strip = Image.new('RGBA', (1024, 256))
            for column in range(4):
                frame = cutout(atlas.crop((column*256, row*256, (column+1)*256, (row+1)*256)))
                if not frame.getbbox(): raise ValueError(f'Empty sprite: {role}/{column}')
                strip.paste(frame, (column*256, 0))
            strip.save(output_dir / f'{role}-computer-v4.webp', quality=92, method=6)
    with Image.open(sources['office']) as office:
        if office.size != (1536, 1024): raise ValueError('Room must preserve 3:2 world ratio')
        office.convert('RGB').save(output_dir / 'office-computers-v4.webp', quality=92, method=6)
    with Image.open(sources['chair']) as chair:
        rgba = cutout(chair)
        bounds = rgba.getbbox()
        if not bounds: raise ValueError('Empty chair')
        rgba.crop(bounds).save(output_dir / 'chair-computer-v4.webp', quality=92, method=6)
    manifest = {'model': 'gpt-image-2.6', 'provider': 'OpenAI Next (user-selected)', 'date': '2026-11-15',
                'source_sha256': {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in sources.items()},
                'assets': {path.name: {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in outputs}}
    (output_dir / 'office-modern-v4.manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.source, args.out)
