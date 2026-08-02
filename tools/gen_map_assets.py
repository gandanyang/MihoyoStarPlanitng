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
TILE_COUNT = 14
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
G_TREE_TOP = 9    # 阔叶树顶（碰撞）
G_TREE_TRUNK = 10 # 树干（碰撞）
G_PINE_TOP = 11   # 松树顶（碰撞）
G_PINE_TRUNK = 12 # 松树干（碰撞）
G_STUMP = 13      # 树桩（碰撞）
G_LOG = 14        # 木头（无碰撞）

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


# 农场地图独立尺寸（其他地图仍为 30x20）
FARM_W = 40
FARM_H = 25

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


def write_map(name, ground, walls, map_w=MAP_W, map_h=MAP_H):
    os.makedirs(MAP_DIR, exist_ok=True)
    data = {
        "compressionlevel": -1,
        "height": map_h,
        "width": map_w,
        "tileheight": TILE_SIZE,
        "tilewidth": TILE_SIZE,
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "tiledversion": "1.9.2",
        "type": "map",
        "version": "1.9",
        "layers": [
            {"data": ground, "height": map_h, "width": map_w, "name": "Ground",
             "opacity": 1, "type": "tilelayer", "visible": True, "x": 0, "y": 0},
            {"data": walls, "height": map_h, "width": map_w, "name": "Walls",
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
    print(f"[OK] {name} map -> {out}  ({map_w}x{map_h} tiles)")


# ---------------- 农场辅助（独立尺寸） ----------------
def new_farm_layer(fill=0):
    return [fill] * (FARM_W * FARM_H)

def set_farm_cell(layer, col, row, val):
    if 0 <= col < FARM_W and 0 <= row < FARM_H:
        layer[row * FARM_W + col] = val

def fill_farm_rect(layer, col0, row0, col1, row1, val):
    for r in range(row0, row1 + 1):
        for c in range(col0, col1 + 1):
            set_farm_cell(layer, c, r, val)

def make_farm_border(gaps):
    """gaps: list of (edge, start_tile, length)"""
    walls = new_farm_layer()
    for c in range(FARM_W):
        set_farm_cell(walls, c, 0, G_STONE)
        set_farm_cell(walls, c, FARM_H - 1, G_STONE)
    for r in range(FARM_H):
        set_farm_cell(walls, 0, r, G_STONE)
        set_farm_cell(walls, FARM_W - 1, r, G_STONE)
    for edge, start, length in gaps:
        for i in range(length):
            if edge == "top":
                set_farm_cell(walls, start + i, 0, 0)
            elif edge == "bottom":
                set_farm_cell(walls, start + i, FARM_H - 1, 0)
            elif edge == "left":
                set_farm_cell(walls, 0, start + i, 0)
            elif edge == "right":
                set_farm_cell(walls, FARM_W - 1, start + i, 0)
    return walls


# ---------------- 4 张地图 ----------------
def gen_gate():
    """庄园大门地图：一次性教程地图，连接车站→农场。30x20"""
    ground = new_layer(G_GRASS)

    # ---- 纵向主路径：cols 14-15 ----
    for r in range(MAP_H):
        set_cell(ground, 14, r, G_PATH)
        set_cell(ground, 15, r, G_PATH)

    # 大门区域：路径加宽至 cols 13-16（rows 7-11）
    for r in range(7, 12):
        for c in range(13, 17):
            set_cell(ground, c, r, G_PATH)

    # ---- 右上：花园 ----
    # 花园外围
    fill_rect(ground, 21, 3, 28, 8, G_FLOWER)
    # 花园小径
    set_cell(ground, 24, 5, G_PATH)
    set_cell(ground, 25, 5, G_PATH)
    # 花园中心木椅
    set_cell(ground, 24, 6, G_WOOD)
    set_cell(ground, 25, 6, G_WOOD)

    # ---- 左上：小树林 ----
    fill_rect(ground, 1, 3, 8, 8, G_FLOWER)
    # 树桩
    set_cell(ground, 3, 5, G_WOOD)
    set_cell(ground, 6, 6, G_WOOD)
    # 落叶
    set_cell(ground, 4, 4, G_DIRT)
    set_cell(ground, 5, 7, G_DIRT)

    # ---- 右下：小池塘 ----
    fill_rect(ground, 22, 13, 28, 18, G_WATER)
    # 池塘边花朵
    set_cell(ground, 22, 12, G_FLOWER)
    set_cell(ground, 23, 12, G_FLOWER)
    set_cell(ground, 28, 12, G_FLOWER)
    set_cell(ground, 22, 18, G_FLOWER)
    # 池塘中央小岛
    set_cell(ground, 25, 15, G_GRASS)
    set_cell(ground, 25, 16, G_GRASS)
    # 小岛上的花
    set_cell(ground, 25, 15, G_FLOWER)

    # ---- 左下：灌木丛 ----
    fill_rect(ground, 1, 13, 8, 18, G_FLOWER)
    # 小路穿过灌木
    set_cell(ground, 4, 15, G_PATH)
    set_cell(ground, 5, 15, G_PATH)
    # 石头
    set_cell(ground, 3, 16, G_STONE)

    # ---- 路径两侧散落泥土过渡 ----
    for r in range(1, MAP_H - 1):
        if r >= 7 and r <= 11:
            continue  # 大门区域保留干净
        for c in [12, 13, 16, 17]:
            if random.random() < 0.25:
                set_cell(ground, c, r, G_DIRT)

    # ============ walls 层 ============
    walls = new_layer()

    # 边框
    for c in range(MAP_W):
        set_cell(walls, c, 0, G_STONE)
        set_cell(walls, c, MAP_H - 1, G_STONE)
    for r in range(MAP_H):
        set_cell(walls, 0, r, G_STONE)
        set_cell(walls, MAP_W - 1, r, G_STONE)
    # 顶部出口 gap（通往农场）
    set_cell(walls, 14, 0, 0)
    set_cell(walls, 15, 0, 0)
    # 底部出口 gap（通往车站）
    set_cell(walls, 14, MAP_H - 1, 0)
    set_cell(walls, 15, MAP_H - 1, 0)

    # ---- 庄园大门结构 ----
    # 门柱（左右各两根石柱，rows 8-9）
    for c in [12, 13, 16, 17]:
        set_cell(walls, c, 8, G_STONE)
        set_cell(walls, c, 9, G_STONE)
    # 门顶横梁（cols 12-13, 16-17, row 7）— 避开 cols 14-15 通道，否则开门后仍被瓦片碰撞挡住
    for c in [12, 13, 16, 17]:
        set_cell(walls, c, 7, G_STONE)
    # 门两侧围墙（从门柱延伸到地图边缘, row 8）
    for c in range(1, 12):
        set_cell(walls, c, 8, G_STONE)
    for c in range(18, MAP_W - 1):
        set_cell(walls, c, 8, G_STONE)
    # 围墙下方支撑柱（每隔3格一个, row 9）
    for c in range(2, 12, 3):
        set_cell(walls, c, 9, G_STONE)
    for c in range(18, MAP_W - 1, 3):
        set_cell(walls, c, 9, G_STONE)

    # 门的位置（cols 14-15, rows 8-9）不放置墙砖
    # 门由代码中的 physics rectangle 实现，使用钥匙后销毁
    # 但为了视觉上看起来像有门，在 ground 层放置木纹
    set_cell(ground, 14, 8, G_WOOD)
    set_cell(ground, 15, 8, G_WOOD)
    set_cell(ground, 14, 9, G_WOOD)
    set_cell(ground, 15, 9, G_WOOD)

    # ---- 四角装饰树丛 ----
    for rect in [(2, 2, 5, 3), (24, 2, 27, 3), (2, 14, 5, 15), (24, 14, 27, 15)]:
        fill_rect(walls, *rect, G_STONE)

    # 池塘边装饰石
    set_cell(walls, 22, 13, G_STONE)
    set_cell(walls, 28, 18, G_STONE)

    write_map("gate", ground, walls)


def gen_farm():
    """农场：草地 + 大块农田 + 左下木屋。出口：顶→森林，右→小镇

    M1-1 v0.1：5 区视觉升级（森林入口/花园/农田过渡/住宅/水塘）。
    仅瓦片装饰：不动 gid 语义、碰撞规则、出口位置、FARM_AREA/FARM_TREE_POSITIONS。
    """
    ground = new_farm_layer(G_GRASS)
    # 大块农田：cols 12-28, rows 8-16（面积 17x9 = 153 格，约为原来的 4 倍）
    fill_farm_rect(ground, 12, 8, 28, 16, G_SOIL)
    fill_farm_rect(ground, FARM_W - 2, 9, FARM_W - 1, 10, G_PATH)   # 右出口小路
    fill_farm_rect(ground, 13, 1, 16, 4, G_PATH)                    # 顶出口小路（M1-1 加宽至 cols 13-16）
    # ---- M1-1 森林入口区：路径两侧泥土落叶过渡（cols 12/17 rows 1-4） ----
    fill_farm_rect(ground, 12, 1, 12, 4, G_DIRT)
    fill_farm_rect(ground, 17, 1, 17, 4, G_DIRT)
    # ---- M1-1 花园区：泥土小径（col 5 rows 5-6） ----
    fill_farm_rect(ground, 5, 5, 5, 6, G_DIRT)
    # ---- M1-1 农田区：两侧泥土过渡带（col 11 / col 29 rows 8-16，FARM_AREA 内部不动） ----
    fill_farm_rect(ground, 11, 8, 11, 16, G_DIRT)
    fill_farm_rect(ground, 29, 8, 29, 16, G_DIRT)
    # ---- M1-1 住宅区：门前小路（cols 6-7 row 18） ----
    fill_farm_rect(ground, 6, 18, 7, 18, G_PATH)
    # ---- M1-1 水塘区：泥土岸 + 塘底过渡（避开全部 FARM_TREE_POSITIONS） ----
    fill_farm_rect(ground, 30, 18, 30, 22, G_DIRT)   # 西岸（(30,20) 树在岸上，自然）
    fill_farm_rect(ground, 34, 19, 34, 22, G_DIRT)   # 东岸（避开 (34,18) 树）
    fill_farm_rect(ground, 31, 18, 33, 18, G_DIRT)   # 塘上泥土（花丛打底）
    fill_farm_rect(ground, 31, 23, 33, 23, G_DIRT)   # 塘底泥土过渡

    walls = make_farm_border([("top", 14, 2), ("right", 9, 2)])
    # 左上装饰花（花园区）：保留原花丛 + M1-1 新增第二组（cols 6-8 rows 3-4）
    fill_farm_rect(walls, 3, 3, 5, 4, G_FLOWER)
    fill_farm_rect(walls, 6, 3, 8, 4, G_FLOWER)
    # ---- M1-1 森林入口区：路径两侧花丛（cols 12/17 rows 2-3） ----
    fill_farm_rect(walls, 12, 2, 12, 3, G_FLOWER)
    fill_farm_rect(walls, 17, 2, 17, 3, G_FLOWER)
    # 左下木屋：cols 3-8 rows 19-23 木地板，四周石墙
    fill_farm_rect(walls, 3, 19, 8, 23, G_WOOD)
    for c in range(3, 9):
        set_farm_cell(walls, c, 18, G_STONE)        # 上墙
        set_farm_cell(walls, c, 24, G_STONE)        # 下墙
    # 木屋门洞（row 18, cols 6-7）— 玩家从此进入室内场景
    set_farm_cell(walls, 6, 18, 0)
    set_farm_cell(walls, 7, 18, 0)
    for r in range(19, 24):
        set_farm_cell(walls, 2, r, G_STONE)         # 左墙
        set_farm_cell(walls, 9, r, G_STONE)         # 右墙
    # ---- M1-1 住宅区：木屋右侧花丛（col 10 rows 21-23，避开石墙 col 9 与 (10,20) 树） ----
    fill_farm_rect(walls, 10, 21, 10, 23, G_FLOWER)
    # ---- M1-1 水塘区：水塘 cols 31-33 rows 19-22（gid 4 碰撞）+ 塘上花丛（cols 31-33 row 18） ----
    fill_farm_rect(walls, 31, 19, 33, 22, G_WATER)
    fill_farm_rect(walls, 31, 18, 33, 18, G_FLOWER)
    write_map("farm", ground, walls, FARM_W, FARM_H)


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
    """森林：草地+泥块，树木+花丛。出口：底→农场，右→矿洞"""
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
    # 四角树木（2x2 树：树顶在上，树干在下）
    tree_positions = [(3, 3), (5, 5), (23, 3), (25, 5), (3, 13), (5, 15), (23, 13), (25, 15)]
    for c, r in tree_positions:
        set_cell(walls, c, r, G_TREE_TOP)
        set_cell(walls, c, r + 1, G_TREE_TRUNK)
        set_cell(walls, c + 1, r, G_TREE_TOP)
        set_cell(walls, c + 1, r + 1, G_TREE_TRUNK)
    # 额外散落松树（单棵 2x2）
    pine_positions = [(8, 4), (20, 5), (7, 15), (22, 14)]
    for c, r in pine_positions:
        set_cell(walls, c, r, G_PINE_TOP)
        set_cell(walls, c, r + 1, G_PINE_TRUNK)
        set_cell(walls, c + 1, r, G_PINE_TOP)
        set_cell(walls, c + 1, r + 1, G_PINE_TRUNK)
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
    gen_gate()
    gen_farm()
    gen_town()
    gen_forest()
    gen_mine()
    print("done.")
