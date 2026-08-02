"""生成 mine_tileset.png — 矿洞场景 8 瓦片（升级纹理版，地下视觉偏暗）

瓦片语义（与《地图资产管线规范-v0.6.md》一致）：
    gid 1 = 草地     绿底（矿洞入口外围）
    gid 2 = 泥土     棕褐底（矿洞周边）
    gid 3 = 石墙     深灰底 + 砖纹（矿洞外围石壁，碰撞）
    gid 4 = 水面     深蓝底 + 波纹（矿洞地下暗河，碰撞）
    gid 5 = 农田土   深棕底 + 垄沟（预留，矿洞中一般不用）
    gid 6 = 木地板   暖棕底（矿洞入口平台/楼梯）
    gid 7 = 小路     浅米色（矿洞外小径）
    gid 8 = 花丛     绿底 + 黄点（矿洞入口外小花）

说明（R1 风险消除）：
    mine_tileset.png 原无生成脚本。本脚本与 gen_farm_tileset.py 同风格。
    注意：矿洞内主要使用 placeholder 体系（gid 9-14 矿石/岩石），但 1-8 基础格
    仍需与其它地图一致，保证 Walls 层和 Ground 层在矿洞边界渲染正确。
    python tools/gen_mine_tileset.py          → tmp/mine_tileset.png（安全）
    python tools/gen_mine_tileset.py --force  → 覆盖 public/assets/tiles/mine_tileset.png

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

# 调色板与农场/小镇一致（瓦片语义稳定）
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
    rng = random.Random(idx * 307 + 89)  # 不同 seed → 纹理独立
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

    out_path = os.path.join(out_dir, "mine_tileset.png")
    img = Image.new("RGB", (N * TILE, TILE), (0, 0, 0))
    for i, (b, s, p, h) in enumerate(TILES):
        draw_tile(img, i, b, s, p, h)
    img.save(out_path)

    print(f"[OK] mine_tileset.png -> {out_path}")
    print(f"     尺寸: {img.size} ({img.width // TILE} 格 × {TILE}px/格)")
    print(f"     语义: 1=草地 2=泥土 3=石墙(coll/bricks) 4=水(coll/wave) 5=农田土(furrows) 6=木板 7=小路 8=花丛")
    if not args.force:
        print(f"     [安全模式] 未覆盖 public/ 下原始文件；需覆盖请加 --force")


if __name__ == "__main__":
    main()
