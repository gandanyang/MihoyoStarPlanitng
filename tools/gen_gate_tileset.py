"""生成 gate_tileset.png — 大门场景 8 瓦片（纯占位平涂风格）

瓦片语义（与《地图资产管线规范-v0.6.md》一致，gid 1-8 纯平涂无纹理）：
    gid 1 = 草地     绿色底 + 深绿斑点
    gid 2 = 泥土     棕褐底 + 深褐斑点
    gid 3 = 石墙     灰色底 + 深灰斑点（碰撞，无砖纹）
    gid 4 = 水面     蓝色底 + 浅蓝斑点（碰撞，无波纹）
    gid 5 = 农田土   深棕底 + 深斑点（无垄沟）
    gid 6 = 木地板   浅棕底 + 斑点（无木纹）
    gid 7 = 小路     浅米黄底 + 浅斑点
    gid 8 = 花丛     绿色底 + 粉红花朵斑点

说明（R1 风险消除）：
    gate_tileset.png 原为占位资源，丢失后不可重建。本脚本提供确定性重建能力：
    python tools/gen_gate_tileset.py          → 输出到 tmp/gate_tileset.png（不覆盖现有）
    python tools/gen_gate_tileset.py --force  → 覆盖 public/assets/tiles/gate_tileset.png

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
N = 8  # 瓦片数

# 平涂风格调色板（与 gen_map_assets.py 占位瓦片一致）
TILES = [
    # (base, speck, pattern) — pattern=None 表示纯随机斑点平涂
    ((74, 124, 58),   (58, 100, 44),   None),          # gid 1 草地
    ((139, 107, 62),  (107, 75, 46),   None),          # gid 2 泥土
    ((107, 107, 107), (70, 70, 70),    None),          # gid 3 石墙
    ((58, 90, 139),   (74, 106, 155),  None),          # gid 4 水面
    ((74, 53, 37),    (50, 32, 21),    None),          # gid 5 农田土
    ((176, 136, 80),  (140, 100, 50),  None),          # gid 6 木地板
    ((196, 165, 116), (176, 145, 96),  None),          # gid 7 小路
    ((74, 124, 58),   (255, 102, 153), "flower"),      # gid 8 花丛
]


def draw_tile(img: Image.Image, idx: int, base, speck, pattern):
    rng = random.Random(idx * 137)
    x0 = idx * TILE
    # 打底色
    for y in range(TILE):
        for x in range(TILE):
            img.putpixel((x0 + x, y), base)
    # 随机斑点
    for _ in range(10):
        img.putpixel((x0 + rng.randint(0, TILE - 1), rng.randint(0, TILE - 1)), speck)
    # 模式叠加
    if pattern == "flower":
        for fx, fy in [(4, 4), (11, 5), (6, 11), (12, 12)]:
            for dx, dy in [(0, 0), (1, 0), (0, 1)]:
                px, py = x0 + fx + dx, fy + dy
                if 0 <= px < img.width and 0 <= py < TILE:
                    img.putpixel((px, py), speck)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="覆盖 public/assets/tiles/ 下原始文件")
    args = ap.parse_args()

    if args.force:
        out_dir = TILE_DIR
    else:
        out_dir = TMP_DIR
        os.makedirs(out_dir, exist_ok=True)

    out_path = os.path.join(out_dir, "gate_tileset.png")
    img = Image.new("RGB", (N * TILE, TILE), (0, 0, 0))
    for i, (b, s, p) in enumerate(TILES):
        draw_tile(img, i, b, s, p)
    img.save(out_path)

    print(f"[OK] gate_tileset.png -> {out_path}")
    print(f"     尺寸: {img.size} ({img.width // TILE} 格 × {TILE}px/格)")
    print(f"     语义: 1=草地 2=泥土 3=石墙(coll) 4=水(coll) 5=农田土 6=木地板 7=小路 8=花丛")


if __name__ == "__main__":
    main()
