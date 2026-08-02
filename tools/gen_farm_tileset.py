"""生成 farm_tileset.png — 农场场景 8 瓦片（升级版带纹理：砖墙/波纹/垄沟）

瓦片语义（与《地图资产管线规范-v0.6.md》一致）：
    gid 1 = 草地     绿色底
    gid 2 = 泥土     棕褐底
    gid 3 = 石墙     深灰底 + 浅灰砖纹（碰撞，setCollision(3,4) 生效）
    gid 4 = 水面     深蓝底 + 亮蓝波纹（碰撞，玩家不可进入）
    gid 5 = 农田土   深棕底 + 三条垄沟（FarmSystem 可种植判定：此瓦片 = 已锄地）
    gid 6 = 木地板   暖棕底（无碰撞，房屋地板/门廊）
    gid 7 = 小路     浅米色底（无碰撞，人行步道）
    gid 8 = 花丛     绿色底 + 浅黄花点（无碰撞，装饰）

说明（R1 风险消除）：
    farm_tileset.png 原为无脚本的一次性资源，丢失后不可重建。本脚本提供确定性重建：
    python tools/gen_farm_tileset.py          → 输出到 tmp/farm_tileset.png（不覆盖现有）
    python tools/gen_farm_tileset.py --force  → 覆盖 public/assets/tiles/farm_tileset.png

输出尺寸：128×16（8 格 × 16 像素/格）

⚠️ 设计约束（v0.6 M1 farm 升级时保留的基底语义）：
    - gid 3 必须是深灰色（石墙视觉），否则 Walls 层现有碰撞视觉与语义不一致
    - gid 5 垄沟三条水平线必须存在，FarmState 以此判断"是否已锄地"
    - 本脚本仅生成基础 8 格；M1 后 9-13 格由 gen_farm_tileset_ext_v06.py 扩展（或直接 --extend 模式，待开发）
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

# 升级风格调色板（农场/小镇/矿洞视觉升级后，经像素采样得到的基准色）
TILES = [
    # idx (gid-1) = (base, speck, pattern, highlight)
    # base = 底色, speck = 随机斑点, pattern = 花纹类型, highlight = 花纹亮色
    ((96, 152, 72),   (82, 132, 58),   None,      None),          # gid 1 草地
    ((150, 112, 66),  (130, 94, 52),   None,      None),          # gid 2 泥土
    ((84, 84, 92),    (60, 60, 68),    "brick",   (156, 156, 164)),# gid 3 石墙（碰撞）
    ((52, 92, 140),   (62, 110, 168),  "water",   (110, 164, 216)),# gid 4 水面（碰撞）
    ((72, 46, 26),    (60, 36, 18),    "furrow",  (100, 68, 44)),  # gid 5 农田土（垄沟）
    ((190, 144, 84),  (168, 124, 68),  None,      None),          # gid 6 木地板
    ((210, 176, 124), (188, 156, 104), None,      None),          # gid 7 小路
    ((96, 152, 72),   (238, 214, 96),  "flower",  None),          # gid 8 花丛（浅黄花）
]


def draw_tile(img: Image.Image, idx: int, base, speck, pattern, highlight):
    rng = random.Random(idx * 211 + 17)
    x0 = idx * TILE
    # 打底色
    for y in range(TILE):
        for x in range(TILE):
            img.putpixel((x0 + x, y), base)
    # 随机斑点
    for _ in range(8):
        img.putpixel((x0 + rng.randint(0, TILE - 1), rng.randint(0, TILE - 1)), speck)
    if pattern is None:
        return
    hl = highlight or speck
    # 花纹叠加
    if pattern == "brick":
        # 砖墙：水平砖缝 2 条 + 竖缝错位
        for y in [5, 11]:
            for x in range(TILE):
                img.putpixel((x0 + x, y), hl)
        # 竖缝：上层 0~5 行在 x=3；下层 6~11 行在 x=11；底层 12+ 行在 x=7
        for y in range(0, 6):
            img.putpixel((x0 + 3, y), hl)
        for y in range(6, 12):
            img.putpixel((x0 + 11, y), hl)
        for y in range(12, 16):
            img.putpixel((x0 + 7, y), hl)
    elif pattern == "water":
        # 波纹：2~3 条波浪状亮色水平带
        for y in [3, 8, 13]:
            phase = rng.randint(0, 3)
            for x in range(TILE):
                if (x + phase) % 4 < 2:
                    img.putpixel((x0 + x, y), hl)
    elif pattern == "furrow":
        # 农田垄沟：三条水平深色垄线
        for y in [3, 7, 11]:
            for x in range(TILE):
                img.putpixel((x0 + x, y), hl)
    elif pattern == "flower":
        # 花丛：4 组 2×2 花点
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

    out_path = os.path.join(out_dir, "farm_tileset.png")
    img = Image.new("RGB", (N * TILE, TILE), (0, 0, 0))
    for i, (b, s, p, h) in enumerate(TILES):
        draw_tile(img, i, b, s, p, h)
    img.save(out_path)

    print(f"[OK] farm_tileset.png -> {out_path}")
    print(f"     尺寸: {img.size} ({img.width // TILE} 格 × {TILE}px/格)")
    print(f"     语义: 1=草地 2=泥土 3=石墙(coll/bricks) 4=水(coll/wave) 5=农田土(furrows) 6=木板 7=小路 8=花丛")
    if not args.force:
        print(f"     [安全模式] 未覆盖 public/ 下原始文件；需覆盖请加 --force")


if __name__ == "__main__":
    main()
