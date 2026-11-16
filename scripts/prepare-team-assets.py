"""Prepare the generated four-column, six-row Pickwise atlas for the web.

No API calls or credentials. Requires Pillow; preserves the source images.
"""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROLES = ("identify", "demand", "competition", "profit", "risk", "summary")


def cutout(cell):
    """Remove only near-white pixels connected to the exterior, not white clothing."""
    rgb = cell.convert("RGB")
    mask = Image.new("L", rgb.size)
    def exterior_background(pixel):
        near_white = min(pixel) >= 240 and max(pixel) - min(pixel) < 14
        near_black = max(pixel) <= 18 and max(pixel) - min(pixel) < 14
        return near_white or near_black

    mask.putdata([255 if exterior_background(pixel) else 0 for pixel in rgb.getdata()])
    # Padding connects all four edges, including separated background regions.
    exterior = ImageOps.expand(mask, border=1, fill=255)
    ImageDraw.floodfill(exterior, (0, 0), 128)
    exterior = exterior.crop((1, 1, rgb.width + 1, rgb.height + 1))
    alpha = exterior.point(lambda value: 0 if value == 128 else 255)
    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def prepare(atlas_path, office_path, chair_path, desk_path, roundtable_path, destination):
    atlas = Image.open(atlas_path).convert("RGB")
    if atlas.width % 4 or atlas.height % 6 or atlas.width // 4 != atlas.height // 6:
        raise ValueError("Atlas must have four columns and six rows of square cells")
    destination.mkdir(parents=True, exist_ok=True)
    outputs = [destination / f"{role}.webp" for role in ROLES] + [destination / name for name in ("office.webp", "chair.webp", "desk.webp", "roundtable.webp")]
    if any(path.exists() for path in outputs):
        raise FileExistsError("Use a new destination; existing assets will not be overwritten")
    size = atlas.width // 4
    for row, role in enumerate(ROLES):
        strip = Image.new("RGBA", (1024, 256), (0, 0, 0, 0))
        for column in range(4):
            cell = atlas.crop((column * size, row * size, (column + 1) * size, (row + 1) * size))
            frame = cutout(cell).resize((256, 256), Image.Resampling.LANCZOS)
            bbox = frame.getbbox()
            if not bbox or bbox[2] - bbox[0] < 32 or bbox[3] - bbox[1] < 64:
                raise ValueError(f"Missing or undersized character in {role} frame {column}")
            strip.paste(frame, (column * 256, 0))
        strip.save(destination / f"{role}.webp", "WEBP", quality=90, method=6)
    with Image.open(office_path) as office:
        office.convert("RGB").resize((1536, 1024), Image.Resampling.LANCZOS).save(destination / "office.webp", "WEBP", quality=85, method=6)
    for source, name in ((chair_path, "chair.webp"), (desk_path, "desk.webp"), (roundtable_path, "roundtable.webp")):
        with Image.open(source) as prop:
            cutout(prop).save(destination / name, "WEBP", quality=90, method=6)
    for path in outputs:
        with Image.open(path) as image:
            image.verify()
        print(f"{path}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--atlas", type=Path, required=True)
    parser.add_argument("--office", type=Path, required=True)
    parser.add_argument("--chair", type=Path, required=True)
    parser.add_argument("--desk", type=Path, required=True)
    parser.add_argument("--roundtable", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.atlas, args.office, args.chair, args.desk, args.roundtable, args.out)
