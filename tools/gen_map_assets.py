"""
地图资源生成脚本
生成占位 tileset PNG 与 4 张 Tiled 地图 JSON（农场/小镇/森林/矿洞）。
4 区域连通拓扑：
    森林 ──── 矿洞
      │        │
    农场 ──── 小镇
每张地图 30x20 瓦片，每瓦片 16 像素，总 480x320。

运行：python tools/gen_map_assets.py
后续可用 Tiled 打开 .json 精修，或用 ComfyUI 替换 tileset。
"""
import json
import os
import random
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILE_DIR = os.path.join(ROOT, "public", "assets", "tiles")
MAP_DIR = os.path.join(ROOT, "public", "assets", "maps")

TILE_SIZE = 16
TILE_COUNT = 8
TILESET_W = TILE_SIZE * TILE_COUNT
TILESET_H = TILE_SIZE

# 瓦片 gid
G_GRASS = 1
G_DIRT = 2
G_STONE = 3   # 碰撞
G_WATER = 4   # 碰撞
G_SOIL = 5
G_WOOD = 6
G_PATH = 7
G_FLOWER = 8

MAP_W = 30
MAP_H = 20


# ---------------- tileset ----------------
def draw_tile(img, idx, base, speck, pattern=None):
    x0 = idx * TILE_SIZE
    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            img.putpixel((x0 + x, y), base)
    rng = random.Random(idx * 100)
    for _ in range(12):
        img.putpixel((x0 + rng.randint(0, TILE_SIZE - 1), rng.randint(0, TILE_SIZE - 1)), speck)
    if pattern == "furrow":
        for y in [3, 7, 11]:
            for x in range(TILE_SIZE):
                img.putpixel((x0 + x, y), speck)
    elif pattern == "plank":
        for x in [5, 10]:
            for y in range(TILE_SIZE):
                img.putpixel((x0 + x, y), speck)
    elif pattern == "brick":
        for x in range(TILE_SIZE):
            img.putpixel((x0 + x, 5), speck)
            img.putpixel((x0 + x, 11), speck)
        for y in range(TILE_SIZE):
            img.putpixel((x0 + 3, y), speck)
            img.putpixel((x0 + 11, y), speck)
    elif pattern == "flower":
        for fx, fy in [(4, 4), (11, 5), (6, 11), (12, 12)]:
            img.putpixel((x0 + fx, fy), speck)
            img.putpixel((x0 + fx + 1, fy), speck)
            img.putpixel((x0 + fx, fy + 1), speck)


def gen_tileset():
    os.makedirs(TILE_DIR, exist_ok=True)
    img = Image.new("RGB", (TILESET_W, TILESET_H), (0, 0, 0))
    draw_tile(img, 0, (74, 124, 58), (58, 100, 44))             # 草地
    draw_tile(img, 1, (139, 107, 62), (107, 75, 46))            # 泥土
    draw_tile(img, 2, (107, 107, 107), (70, 70, 70), "brick")   # 石墙
    draw_tile(img, 3, (58, 90, 139), (74, 106, 155))            # 水
    draw_tile(img, 4, (74, 53, 37), (50, 32, 21), "furrow")     # 农田土
    draw_tile(img, 5, (176, 136, 80), (140, 100, 50), "plank")  # 木地板
    draw_tile(img, 6, (196, 165, 116), (176, 145, 96))          # 小路
    draw_tile(img, 7, (74, 124, 58), (255, 102, 153), "flower") # 花
    out = os.path.join(TILE_DIR, "placeholder_tileset.png")
    img.save(out)
    print(f"[OK] tileset -> {out}  ({TILESET_W}x{TILESET_H})")


# ---------------- 地图辅助 ----------------
def new_layer(fill=0):
    return [fill] * (MAP_W * MAP_H)


def set_cell(layer, col, row, val):
    if 0 <= col < MAP_W and 0 <= row < MAP_H:
        layer[row * MAP_W + col] = val


def fill_rect(layer, col0, row0, col1, row1, val):
    for r in range(row0, row1 + 1):
        for c in range(col0, col1 + 1):
            set_cell(layer, c, r, val)


def make_border(gaps):
    """gaps: list of (edge, start_tile, length)，edge ∈ top/bottom/left/right"""
    walls = new_layer()
    for c in range(MAP_W):
        set_cell(walls, c, 0, G_STONE)
        set_cell(walls, c, MAP_H - 1, G_STONE)
    for r in range(MAP_H):
        set_cell(walls, 0, r, G_STONE)
        set_cell(walls, MAP_W - 1, r, G_STONE)
    for edge, start, length in gaps:
        for i in range(length):
            if edge == "top":
                set_cell(walls, start + i, 0, 0)
            elif edge == "bottom":
                set_cell(walls, start + i, MAP_H - 1, 0)
            elif edge == "left":
                set_cell(walls, 0, start + i, 0)
            elif edge == "right":
                set_cell(walls, MAP_W - 1, start + i, 0)
    return walls


def write_map(name, ground, walls):
    os.makedirs(MAP_DIR, exist_ok=True)
    data = {
        "compressionlevel": -1,
        "height": MAP_H,
        "width": MAP_W,
        "tileheight": TILE_SIZE,
        "tilewidth": TILE_SIZE,
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "tiledversion": "1.9.2",
        "type": "map",
        "version": "1.9",
        "layers": [
            {"data": ground, "height": MAP_H, "width": MAP_W, "name": "Ground",
             "opacity": 1, "type": "tilelayer", "visible": True, "x": 0, "y": 0},
            {"data": walls, "height": MAP_H, "width": MAP_W, "name": "Walls",
             "opacity": 1, "type": "tilelayer", "visible": True, "x": 0, "y": 0},
        ],
        "tilesets": [{
            "firstgid": 1,
            "image": "../tiles/placeholder_tileset.png",
            "imageheight": TILESET_H,
            "imagewidth": TILESET_W,
            "margin": 0,
            "name": "placeholder",
            "spacing": 0,
            "tilecount": TILE_COUNT,
            "tileheight": TILE_SIZE,
            "tilewidth": TILE_SIZE,
            "columns": TILE_COUNT,
        }],
    }
    out = os.path.join(MAP_DIR, f"{name}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[OK] {name} map -> {out}  ({MAP_W}x{MAP_H} tiles)")


# ---------------- 4 张地图 ----------------
def gen_farm():
    """农场：草地 + 中央农田 + 左下木屋。出口：顶→森林，右→小镇"""
    ground = new_layer(G_GRASS)
    fill_rect(ground, 11, 8, 18, 12, G_SOIL)   # 中央农田土
    fill_rect(ground, 28, 9, 29, 10, G_PATH)   # 右出口小路
    fill_rect(ground, 14, 1, 15, 4, G_PATH)    # 顶出口小路

    walls = make_border([("top", 14, 2), ("right", 9, 2)])
    # 左上装饰花
    for c in range(3, 6):
        set_cell(walls, c, 3, G_FLOWER)
    # 左下木屋：cols 3-8 rows 13-17 木地板，四周石墙
    fill_rect(walls, 3, 13, 8, 17, G_WOOD)
    for c in range(3, 9):
        set_cell(walls, c, 12, G_STONE)        # 上墙
        set_cell(walls, c, 18, G_STONE)        # 下墙
    for r in range(13, 18):
        set_cell(walls, 2, r, G_STONE)         # 左墙
        set_cell(walls, 9, r, G_STONE)         # 右墙
    write_map("farm", ground, walls)


def gen_town():
    """小镇：木地板地面 + 路面十字 + 两栋石屋。出口：左→农场，顶→矿洞"""
    ground = new_layer(G_WOOD)
    # 路面十字路（rows 9-10 横向，cols 14-15 纵向）
    for r in range(9, 11):
        for c in range(MAP_W):
            set_cell(ground, c, r, G_PATH)
    for c in range(14, 16):
        for r in range(MAP_H):
            set_cell(ground, c, r, G_PATH)

    walls = make_border([("left", 9, 2), ("top", 14, 2)])
    # 两栋石屋：cols 4-8 / 21-25，rows 4-8 木地板，四周石墙（下墙放 row9 会堵路，故屋区只到 row8，下墙用 row9 但留 col 通道）
    for c0, c1 in [(4, 8), (21, 25)]:
        fill_rect(walls, c0, 4, c1, 8, G_WOOD)   # 屋内木地板
        for c in range(c0, c1 + 1):
            set_cell(walls, c, 3, G_STONE)        # 上墙
        for r in range(4, 9):
            set_cell(walls, c0 - 1, r, G_STONE)   # 左墙
            set_cell(walls, c1 + 1, r, G_STONE)   # 右墙
    write_map("town", ground, walls)


def gen_forest():
    """森林：草地+泥块，四角石簇（树/岩），花丛。出口：底→农场，右→矿洞"""
    ground = new_layer(G_GRASS)
    rng = random.Random(42)
    for _ in range(30):
        c, r = rng.randint(2, MAP_W - 3), rng.randint(2, MAP_H - 3)
        set_cell(ground, c, r, G_DIRT)
    # 保留中央十字通路为草地
    for r in range(MAP_H):
        set_cell(ground, 14, r, G_GRASS)
        set_cell(ground, 15, r, G_GRASS)
    for c in range(MAP_W):
        set_cell(ground, c, 9, G_GRASS)
        set_cell(ground, c, 10, G_GRASS)

    walls = make_border([("bottom", 14, 2), ("right", 9, 2)])
    # 四角石簇（障碍，模拟树/岩石）
    for c0, r0 in [(4, 4), (23, 4), (4, 13), (23, 13)]:
        fill_rect(walls, c0, r0, c0 + 2, r0 + 2, G_STONE)
    # 花丛装饰
    for c, r in [(14, 6), (15, 6), (14, 13), (15, 13), (8, 9), (21, 10)]:
        set_cell(walls, c, r, G_FLOWER)
    write_map("forest", ground, walls)


def gen_mine():
    """矿洞：泥地 + 四角石簇（矿石）+ 顶部水池。出口：底→小镇，左→森林"""
    ground = new_layer(G_DIRT)

    walls = make_border([("bottom", 14, 2), ("left", 9, 2)])
    # 四角石簇（矿石障碍）
    for c0, r0 in [(4, 4), (23, 4), (4, 13), (23, 13)]:
        fill_rect(walls, c0, r0, c0 + 2, r0 + 2, G_STONE)
    # 顶部中央水池
    fill_rect(walls, 13, 4, 16, 7, G_WATER)
    write_map("mine", ground, walls)


if __name__ == "__main__":
    gen_tileset()
    gen_farm()
    gen_town()
    gen_forest()
    gen_mine()
    print("done.")
