"""生成 town_tileset.png — 小镇场景 8 瓦片（升级纹理版，与农场同风格）

瓦片语义（与《地图资产管线规范-v0.6.md》一致）：
    gid 1 = 草地     绿底（小镇外围草皮）
    gid 2 = 泥土     棕褐底（建筑周边裸土）
    gid 3 = 石墙     深灰底 + 浅灰砖纹（建筑外墙、围墙，碰撞）
    gid 4 = 水面     深蓝底 + 波纹（小镇水渠/装饰水池，碰撞）
    gid 5 = 农田土   深棕底 + 垄沟（预留，暂未在 town.json 使用）
    gid 6 = 木地板   暖棕底（商店室内地板）
    gid 7 = 小路     浅米色（主街人行步道）
    gid 8 = 花丛     绿底 + 黄点（花坛装饰）

说明（R1 风险消除）：
    town_tileset.png 原无生成脚本。本脚本与 gen_farm_tileset.py 调色板一致
    （农场/小镇视觉风格统一），提供确定性重建。
    python tools/gen_town_tileset.py          → tmp/town_tileset.png（安全）
    python tools/gen_town_tileset.py --force  → 覆盖 public/assets/tiles/town_tileset.png

输出尺寸：128×16（8 格 × 16 像素/格）
"""
import argparse
import os
import random
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILE_DIR = os.path.join(ROOT, "public", "assets", "tiles")
TMP_DIR = os.path.join(ROOT, "tmp")
TILE = 16
N = 8

# 调色板与农场一致（视觉风格统一）——经像素探查 town_tileset.png 与 farm 同色板
TILES = [
    ((96, 152, 72),   (82, 132, 58),   None,      None),
    ((150, 112, 66),  (130, 94, 52),   None,      None),
    ((84, 84, 92),    (60, 60, 68),    "brick",   (156, 156, 164)),
    ((52, 92, 140),   (62, 110, 168),  "water",   (110, 164, 216)),
    ((72, 46, 26),    (60, 36, 18),    "furrow",  (100, 68, 44)),
    ((190, 144, 84),  (168, 124, 68),  None,      None),
    ((210, 176, 124), (188, 156, 104), None,      None),
    ((96, 152, 72),   (238, 214, 96),  "flower",  None),
]


def draw_tile(img: Image.Image, idx: int, base, speck, pattern, highlight):
    rng = random.Random(idx * 271 + 41)  # 与 farm 使用不同 seed → 纹理位置错开
    x0 = idx * TILE
    for y in range(TILE):
        for x in range(TILE):
            img.putpixel((x0 + x, y), base)
    for _ in range(8):
        img.putpixel((x0 + rng.randint(0, TILE - 1), rng.randint(0, TILE - 1)), speck)
    if pattern is None:
        return
    hl = highlight or speck
    if pattern == "brick":
        for y in [5, 11]:
            for x in range(TILE):
                img.putpixel((x0 + x, y), hl)
        for y in range(0, 6):
            img.putpixel((x0 + 3, y), hl)
        for y in range(6, 12):
            img.putpixel((x0 + 11, y), hl)
        for y in range(12, 16):
            img.putpixel((x0 + 7, y), hl)
    elif pattern == "water":
        for y in [3, 8, 13]:
            phase = rng.randint(0, 3)
            for x in range(TILE):
                if (x + phase) % 4 < 2:
                    img.putpixel((x0 + x, y), hl)
    elif pattern == "furrow":
        for y in [3, 7, 11]:
            for x in range(TILE):
                img.putpixel((x0 + x, y), hl)
    elif pattern == "flower":
        for fx, fy in [(4, 4), (11, 5), (6, 11), (12, 12)]:
            for dx, dy in [(0, 0), (1, 0), (0, 1)]:
                px, py = x0 + fx + dx, fy + dy
                if 0 <= px < img.width and 0 <= py < TILE:
                    img.putpixel((px, py), hl)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="覆盖 public/assets/tiles/ 下原始文件")
    args = ap.parse_args()

    if args.force:
        out_dir = TILE_DIR
    else:
        out_dir = TMP_DIR
        os.makedirs(out_dir, exist_ok=True)

    out_path = os.path.join(out_dir, "town_tileset.png")
    img = Image.new("RGB", (N * TILE, TILE), (0, 0, 0))
    for i, (b, s, p, h) in enumerate(TILES):
        draw_tile(img, i, b, s, p, h)
    img.save(out_path)

    print(f"[OK] town_tileset.png -> {out_path}")
    print(f"     尺寸: {img.size} ({img.width // TILE} 格 × {TILE}px/格)")
    print(f"     语义: 1=草地 2=泥土 3=石墙(coll/bricks) 4=水(coll/wave) 5=农田土(furrows) 6=木板 7=小路 8=花丛")
    if not args.force:
        print(f"     [安全模式] 未覆盖 public/ 下原始文件；需覆盖请加 --force")


if __name__ == "__main__":
    main()
