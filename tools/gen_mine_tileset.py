"""生成 mine_tileset.png — 矿洞场景 16 瓦片（升级纹理版，地下视觉偏暗）

瓦片语义（与《地图资产管线规范-v0.6.md》一致，1-8 保持不变）：
    gid 1 = 草地     绿底（矿洞入口外围）
    gid 2 = 泥土     棕褐底（矿洞地面）
    gid 3 = 石墙     深灰底 + 砖纹（矿洞外围石壁，碰撞）
    gid 4 = 水面     深蓝底 + 波纹（矿洞地下暗河，碰撞）
    gid 5 = 农田土   深棕底 + 垄沟（预留）
    gid 6 = 木地板   暖棕底（矿洞入口平台/楼梯）
    gid 7 = 小路     浅米色（矿洞外小径）
    gid 8 = 花丛     绿底 + 黄点（矿洞入口外小花）
    gid 9 = 岩壁     深灰岩石（矿洞主体墙壁，碰撞）
    gid 10 = 矿柱    粗石柱（矿洞支撑，碰撞）
    gid 11 = 轨道    铁轨（矿车轨道，不碰撞）
    gid 12 = 矿石堆  带晶体矿石（碰撞）
    gid 13 = 木箱    棕色木箱（碰撞）
    gid 14 = 木板    深棕木板地（入口平台，不碰撞）
    gid 15 = 碎石    灰色碎石（地面装饰，不碰撞）
    gid 16 = 矿车    木制矿车（装饰，不碰撞）

说明（R1 风险消除）：
    mine_tileset.png 原无生成脚本。本脚本与 gen_farm_tileset.py 同风格。
    python tools/gen_mine_tileset.py          → tmp/mine_tileset.png（安全）
    python tools/gen_mine_tileset.py --force  → 覆盖 public/assets/tiles/mine_tileset.png

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
    ((74, 68, 66),    (102, 96, 92),   "rock",    (128, 122, 116)),      # 9 岩壁
    ((98, 92, 90),    (132, 126, 120), "pillar",  (158, 152, 146)),      # 10 矿柱
    ((112, 100, 88),  (186, 186, 192), "rail",    (210, 210, 216)),      # 11 轨道
    ((88, 80, 78),    (210, 178, 66),  "ore",     (240, 220, 120)),      # 12 矿石堆
    ((124, 86, 50),   (172, 132, 82),  "crate",   (196, 156, 104)),      # 13 木箱
    ((150, 112, 66),  (118, 86, 48),   None,      None),                 # 14 木板
    ((108, 100, 94),  (146, 138, 130), "gravel",  (168, 160, 152)),      # 15 碎石
    ((96, 66, 44),    (60, 40, 26),    "minecart",(150, 110, 74)),       # 16 矿车
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
    elif pattern == "rock":
        # 岩壁：斜向岩纹 + 亮块
        for y in range(TILE):
            for x in range(TILE):
                if (x + y) % 7 == 0:
                    img.putpixel((x0 + x, y), hl)
        for bx, by in [(3, 4), (9, 9), (12, 3), (5, 12)]:
            for dx in range(2):
                for dy in range(2):
                    img.putpixel((x0 + bx + dx, by + dy), hl)
    elif pattern == "pillar":
        # 矿柱：中心粗柱 + 柱础 + 高光
        for x in range(4, 12):
            for y in range(1, 15):
                img.putpixel((x0 + x, y), (112, 106, 102))
        for y in range(1, 15):
            img.putpixel((x0 + 5, y), (150, 144, 138))
            img.putpixel((x0 + 10, y), (84, 78, 76))
        for x in range(2, 14):
            img.putpixel((x0 + x, 1), hl)
            img.putpixel((x0 + x, 14), hl)
        for x in range(3, 13):
            img.putpixel((x0 + x, 2), hl)
            img.putpixel((x0 + x, 13), hl)
    elif pattern == "rail":
        # 轨道：两条钢轨 + 枕木
        for x in range(TILE):
            img.putpixel((x0 + x, 5), hl)
            img.putpixel((x0 + x, 10), hl)
        for x in [2, 6, 10]:
            for y in range(4, 12):
                img.putpixel((x0 + x, y), (82, 72, 62))
    elif pattern == "ore":
        # 矿石堆：暗底 + 晶体亮点
        for ox, oy in [(4, 5), (10, 4), (6, 10), (12, 11), (8, 7)]:
            img.putpixel((x0 + ox, oy), hl)
            img.putpixel((x0 + ox, oy - 1), (250, 240, 200))
        for bx, by in [(3, 4), (10, 10)]:
            for dx in range(3):
                for dy in range(2):
                    img.putpixel((x0 + bx + dx, by + dy), (120, 110, 100))
    elif pattern == "crate":
        # 木箱：边框 + 十字加强筋
        for x in [1, 14]:
            for y in range(1, 15):
                img.putpixel((x0 + x, y), hl)
        for y in [1, 14]:
            for x in range(1, 15):
                img.putpixel((x0 + x, y), hl)
        for i in range(1, 15):
            img.putpixel((x0 + i, i), hl)
            img.putpixel((x0 + i, 15 - i), hl)
    elif pattern == "gravel":
        # 碎石：多个小石子块
        for sx, sy in [(2, 3), (6, 6), (11, 2), (4, 11), (10, 9), (13, 13)]:
            for dx in range(2):
                for dy in range(2):
                    img.putpixel((x0 + sx + dx, sy + dy), hl)
    elif pattern == "minecart":
        # 矿车：车身 + 车轮 + 横梁
        for x in range(2, 14):
            for y in range(4, 10):
                img.putpixel((x0 + x, y), (140, 100, 64))
        for x in range(3, 13):
            img.putpixel((x0 + x, 4), (40, 26, 18))
            img.putpixel((x0 + x, 9), (40, 26, 18))
        for y in range(11, 14):
            img.putpixel((x0 + 4, y), (60, 42, 28))
            img.putpixel((x0 + 11, y), (60, 42, 28))
        for y in range(11, 14):
            img.putpixel((x0 + 4, y), (60, 42, 28))
        # 轮子
        img.putpixel((x0 + 4, 12), (30, 22, 16))
        img.putpixel((x0 + 11, 12), (30, 22, 16))


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
    print(f"     语义: 1=草地 2=泥土 3=石墙 4=水 5=农田土 6=木板 7=小路 8=花丛 9=岩壁 10=矿柱 11=轨道 12=矿石堆 13=木箱 14=木板 15=碎石 16=矿车")
    if not args.force:
        print(f"     [安全模式] 未覆盖 public/ 下原始文件；需覆盖请加 --force")


if __name__ == "__main__":
    main()
