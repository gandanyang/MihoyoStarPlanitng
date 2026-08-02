"""生成 town_tileset.png — 小镇场景 16 瓦片（升级纹理版，与农场同风格）

瓦片语义（与《地图资产管线规范-v0.6.md》一致，1-8 保持不变）：
    gid 1 = 草地     绿底（小镇外围草皮）
    gid 2 = 泥土     棕褐底（建筑周边裸土）
    gid 3 = 石墙     深灰底 + 浅灰砖纹（建筑外墙、围墙，碰撞）
    gid 4 = 水面     深蓝底 + 波纹（小镇水渠/装饰水池，碰撞）
    gid 5 = 农田土   深棕底 + 垄沟（预留）
    gid 6 = 木地板   暖棕底（建筑室内地板）
    gid 7 = 小路     浅米色（主街人行步道）
    gid 8 = 花丛     绿底 + 黄点（花坛装饰）
    gid 9 = 屋顶     红棕瓦片顶（建筑，碰撞）
    gid 10 = 墙面    浅米石墙（建筑，碰撞）
    gid 11 = 门      深棕木门（建筑，碰撞）
    gid 12 = 窗      墙面+蓝窗（建筑，碰撞）
    gid 13 = 井      青石圆井（碰撞）
    gid 14 = 栅栏    木质围栏（碰撞）
    gid 15 = 路标    木牌（装饰）
    gid 16 = 灌木    绿丛（装饰）

说明（R1 风险消除）：
    town_tileset.png 原无生成脚本。本脚本与 gen_farm_tileset.py 调色板一致
    （农场/小镇视觉风格统一），提供确定性重建。
    python tools/gen_town_tileset.py          → tmp/town_tileset.png（安全）
    python tools/gen_town_tileset.py --force  → 覆盖 public/assets/tiles/town_tileset.png

输出尺寸：256×16（16 格 × 16 像素/格）
"""
import argparse
import os
import random
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILE_DIR = os.path.join(ROOT, "public", "assets", "tiles")
TMP_DIR = os.path.join(ROOT, "tmp")
TILE = 16
N = 16

# 调色板与农场一致（视觉风格统一）——经像素探查 town_tileset.png 与 farm 同色板
# 每个瓦片：(base 底色, speck 杂点, pattern 图案, highlight 高光色)
TILES = [
    ((96, 152, 72),   (82, 132, 58),   None,      None),                 # 1 草地
    ((150, 112, 66),  (130, 94, 52),   None,      None),                 # 2 泥土
    ((84, 84, 92),    (60, 60, 68),    "brick",   (156, 156, 164)),      # 3 石墙
    ((52, 92, 140),   (62, 110, 168),  "water",   (110, 164, 216)),      # 4 水面
    ((72, 46, 26),    (60, 36, 18),    "furrow",  (100, 68, 44)),        # 5 农田土
    ((190, 144, 84),  (168, 124, 68),  None,      None),                 # 6 木地板
    ((210, 176, 124), (188, 156, 104), None,      None),                 # 7 小路
    ((96, 152, 72),   (238, 214, 96),  "flower",  None),                 # 8 花丛
    ((150, 72, 50),   (178, 96, 68),   "roof",    (210, 130, 96)),       # 9 屋顶
    ((214, 190, 150), (186, 160, 118), "wall",    (236, 218, 186)),      # 10 墙面
    ((120, 74, 42),   (150, 100, 60),  "door",    (168, 120, 78)),       # 11 门
    ((214, 190, 150), (120, 160, 205), "window",  (180, 214, 240)),      # 12 窗
    ((92, 92, 104),   (124, 124, 136), "well",    (150, 150, 160)),      # 13 井
    ((132, 90, 54),   (164, 120, 78),  "fence",   (188, 146, 100)),      # 14 栅栏
    ((152, 112, 72),  (82, 60, 40),    "sign",    (196, 160, 116)),      # 15 路标
    ((58, 108, 52),   (110, 172, 90),  "bush",    (150, 210, 120)),      # 16 灌木
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
    elif pattern == "roof":
        # 横向瓦片线 + 错位竖缝
        for y in [3, 7, 11]:
            for x in range(TILE):
                img.putpixel((x0 + x, y), hl)
        for seg, seam in [(0, 7), (1, 3), (2, 11), (3, 7)]:
            for y in range(seg * 4, seg * 4 + 4):
                img.putpixel((x0 + seam, y), hl)
    elif pattern == "wall":
        # 墙面砖纹（与石墙错开砖缝）
        for y in [4, 10]:
            for x in range(TILE):
                img.putpixel((x0 + x, y), hl)
        for y in range(0, 4):
            img.putpixel((x0 + 7, y), hl)
        for y in range(4, 10):
            img.putpixel((x0 + 3, y), hl)
            img.putpixel((x0 + 11, y), hl)
        for y in range(10, 16):
            img.putpixel((x0 + 7, y), hl)
    elif pattern == "door":
        # 门框 + 竖板纹 + 门把
        for x in [1, 14]:
            for y in range(1, 15):
                img.putpixel((x0 + x, y), hl)
        for y in [1, 14]:
            for x in range(2, 14):
                img.putpixel((x0 + x, y), hl)
        for x in [4, 8, 12]:
            for y in range(2, 14):
                img.putpixel((x0 + x, y), hl)
        for dy in range(2):
            for dx in range(2):
                img.putpixel((x0 + 11 + dx, 11 + dy), (230, 210, 160))
    elif pattern == "window":
        # 墙面底 + 蓝色窗格
        for x in range(3, 13):
            for y in range(3, 13):
                img.putpixel((x0 + x, y), (70, 110, 170))
        for x in range(3, 13):
            img.putpixel((x0 + x, 7), hl)
            img.putpixel((x0 + x, 8), hl)
        for y in range(3, 13):
            img.putpixel((x0 + 7, y), hl)
            img.putpixel((x0 + 8, y), hl)
        for x in range(3, 13):
            img.putpixel((x0 + x, 3), (236, 218, 186))
            img.putpixel((x0 + x, 12), (236, 218, 186))
        for y in range(3, 13):
            img.putpixel((x0 + 3, y), (236, 218, 186))
            img.putpixel((x0 + 12, y), (236, 218, 186))
    elif pattern == "well":
        # 石井圆环 + 中心深洞
        cx, cy = 7.5, 7.5
        for y in range(TILE):
            for x in range(TILE):
                d = (x - cx) ** 2 + (y - cy) ** 2
                if 4 * 4 <= d <= 6.5 * 6.5:
                    img.putpixel((x0 + x, y), hl)
                elif d < 4 * 4:
                    img.putpixel((x0 + x, y), (50, 50, 58))
    elif pattern == "fence":
        # 两条横杠 + 竖栏
        for y in [4, 11]:
            for x in range(TILE):
                img.putpixel((x0 + x, y), hl)
        for x in [2, 7, 12]:
            for y in range(1, 15):
                img.putpixel((x0 + x, y), hl)
    elif pattern == "sign":
        # 竖杆 + 牌面 + 文字点
        for y in range(8, 16):
            for x in range(6, 10):
                img.putpixel((x0 + x, y), (100, 74, 44))
        for y in range(2, 9):
            for x in range(2, 14):
                img.putpixel((x0 + x, y), hl)
        for y in range(2, 9):
            img.putpixel((x0 + 2, y), (120, 90, 52))
            img.putpixel((x0 + 13, y), (120, 90, 52))
        for x in [4, 6, 8, 10]:
            img.putpixel((x0 + x, 4), (100, 74, 44))
            img.putpixel((x0 + x, 6), (100, 74, 44))
    elif pattern == "bush":
        # 深绿底 + 浅绿簇
        for bx, by in [(4, 5), (10, 4), (6, 10), (11, 11)]:
            for dx in range(-1, 2):
                for dy in range(-1, 2):
                    px, py = x0 + bx + dx, by + dy
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
    print(f"     语义: 1=草地 2=泥土 3=石墙 4=水 5=农田土 6=木板 7=小路 8=花丛 9=屋顶 10=墙面 11=门 12=窗 13=井 14=栅栏 15=路标 16=灌木")
    if not args.force:
        print(f"     [安全模式] 未覆盖 public/ 下原始文件；需覆盖请加 --force")


if __name__ == "__main__":
    main()
