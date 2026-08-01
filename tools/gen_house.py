"""
生成室内（房屋）地图资源 + 农场门洞补丁

生成内容：
  1. public/assets/tiles/house_tileset.png  — 12 瓦片（8 基础 + 4 家具）
  2. public/assets/maps/house.json          — 20x15 室内地图
  3. 补丁 farm.json Walls 层：row 12, col 6-7 改为 0（门洞）

房屋布局（20x15）：
  Row 0:  全石墙
  Row 1:  石墙 + 木地板内部
  Row 2-3: 左上角床(BB) / 右上角桌子(TT)
  Row 6-7: 中央地毯(RRRR)
  Row 14: 石墙，cols 9-10 为门洞（出口）

运行：python tools/gen_house.py
"""
import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILE_DIR = os.path.join(ROOT, "public", "assets", "tiles")
MAP_DIR = os.path.join(ROOT, "public", "assets", "maps")
T = 16

# 瓦片 gid
G_GRASS = 1
G_DIRT = 2
G_STONE = 3
G_WATER = 4
G_SOIL = 5
G_WOOD = 6
G_PATH = 7
G_FLOWER = 8
G_BED = 9
G_TABLE = 10
G_RUG = 11
G_SHELF = 12

MAP_W = 20
MAP_H = 15


def gen_tileset():
    """生成 house_tileset.png：复制农场 tileset 前 8 块 + 4 个家具块"""
    farm_ts = os.path.join(TILE_DIR, "farm_tileset.png")
    base = Image.open(farm_ts).convert("RGB")
    # 基础 8 块宽度
    base_w = 8 * T

    new_img = Image.new("RGB", (12 * T, T), (0, 0, 0))
    new_img.paste(base.crop((0, 0, base_w, T)), (0, 0))

    # --- Tile 9: 床（红色被褥 + 白色枕头） ---
    x0 = 8 * T
    for y in range(T):
        for x in range(T):
            new_img.putpixel((x0 + x, y), (139, 58, 58))  # 红色被褥底色
    # 枕头（左上角白色）
    for y in range(2, 6):
        for x in range(2, 7):
            new_img.putpixel((x0 + x, y), (240, 240, 230))
    # 被褥纹理
    for y in range(8, 14):
        new_img.putpixel((x0 + 5, y), (180, 70, 70))
        new_img.putpixel((x0 + 10, y), (180, 70, 70))
    # 床框（深棕）
    for x in range(T):
        new_img.putpixel((x0 + x, 0), (80, 50, 30))
        new_img.putpixel((x0 + x, T - 1), (80, 50, 30))

    # --- Tile 10: 桌子（棕色桌面 + 深色桌腿） ---
    x0 = 9 * T
    for y in range(T):
        for x in range(T):
            new_img.putpixel((x0 + x, y), (160, 120, 70))
    # 桌面边缘
    for x in range(T):
        new_img.putpixel((x0 + x, 3), (120, 85, 45))
        new_img.putpixel((x0 + x, 4), (120, 85, 45))
    # 桌腿
    for y in range(5, T):
        new_img.putpixel((x0 + 2, y), (90, 60, 30))
        new_img.putpixel((x0 + 13, y), (90, 60, 30))

    # --- Tile 11: 地毯（红色菱形花纹） ---
    x0 = 10 * T
    for y in range(T):
        for x in range(T):
            new_img.putpixel((x0 + x, y), (120, 50, 50))
    # 菱形花纹
    cx, cy = 8, 8
    for y in range(T):
        for x in range(T):
            d = abs(x - cx) + abs(y - cy)
            if d <= 5:
                new_img.putpixel((x0 + x, y), (180, 80, 80))
            if d <= 2:
                new_img.putpixel((x0 + x, y), (220, 120, 120))

    # --- Tile 12: 书架（棕色木架 + 彩色书本） ---
    x0 = 11 * T
    for y in range(T):
        for x in range(T):
            new_img.putpixel((x0 + x, y), (100, 65, 35))
    # 隔板
    for x in range(T):
        new_img.putpixel((x0 + x, 5), (70, 45, 20))
        new_img.putpixel((x0 + x, 10), (70, 45, 20))
    # 书本（彩色竖条）
    book_colors = [(180, 50, 50), (50, 80, 180), (50, 150, 70), (200, 180, 50)]
    for shelf_y in [2, 7, 12]:
        for i, bc in enumerate(book_colors):
            for y in range(shelf_y, min(shelf_y + 3, T)):
                new_img.putpixel((x0 + 2 + i * 3, y), bc)

    out = os.path.join(TILE_DIR, "house_tileset.png")
    new_img.save(out)
    print(f"[OK] tileset -> {out}  (192x16)")


def new_layer(fill=0):
    return [fill] * (MAP_W * MAP_H)


def set_cell(layer, col, row, val):
    if 0 <= col < MAP_W and 0 <= row < MAP_H:
        layer[row * MAP_W + col] = val


def fill_rect(layer, c0, r0, c1, r1, val):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            set_cell(layer, c, r, val)


def gen_house_map():
    """生成 house.json：20x15 室内地图"""
    # Ground 层：全木地板 + 家具
    ground = new_layer(G_WOOD)
    # 床（左上角 cols 2-3, rows 2-3）
    fill_rect(ground, 2, 2, 3, 3, G_BED)
    # 桌子（右上角 cols 13-14, rows 2-3）
    fill_rect(ground, 13, 2, 14, 3, G_TABLE)
    # 地毯（中央 cols 5-12, rows 6-7）
    fill_rect(ground, 5, 6, 12, 7, G_RUG)
    # 书架（左下角 cols 2-3, rows 11-12）
    fill_rect(ground, 2, 11, 3, 12, G_SHELF)

    # Walls 层：石墙边界，底部 cols 9-10 留门洞
    walls = new_layer(0)
    # 顶部和底部石墙
    for c in range(MAP_W):
        set_cell(walls, c, 0, G_STONE)
        set_cell(walls, c, MAP_H - 1, G_STONE)
    # 左右石墙
    for r in range(MAP_H):
        set_cell(walls, 0, r, G_STONE)
        set_cell(walls, MAP_W - 1, r, G_STONE)
    # 底部门洞（cols 9-10）
    set_cell(walls, 9, MAP_H - 1, 0)
    set_cell(walls, 10, MAP_H - 1, 0)

    data = {
        "compressionlevel": -1,
        "height": MAP_H,
        "width": MAP_W,
        "tileheight": T,
        "tilewidth": T,
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
            "image": "../tiles/house_tileset.png",
            "imageheight": T,
            "imagewidth": 12 * T,
            "margin": 0,
            "name": "placeholder",
            "spacing": 0,
            "tilecount": 12,
            "tileheight": T,
            "tilewidth": T,
            "columns": 12,
        }],
    }
    out = os.path.join(MAP_DIR, "house.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[OK] house map -> {out}  ({MAP_W}x{MAP_H} tiles)")


def patch_farm_door():
    """在 farm.json 的 Walls 层开一个门洞（row 12, cols 6-7）"""
    farm_path = os.path.join(MAP_DIR, "farm.json")
    with open(farm_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    walls_layer = None
    for layer in data["layers"]:
        if layer["name"] == "Walls":
            walls_layer = layer
            break
    if not walls_layer:
        print("[WARN] farm.json 中未找到 Walls 层")
        return

    walls = walls_layer["data"]
    w = data["width"]  # 30
    # row 12, cols 6-7 → 设为 0（空）
    changed = 0
    for col in [6, 7]:
        idx = 12 * w + col
        if walls[idx] != 0:
            walls[idx] = 0
            changed += 1

    with open(farm_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[OK] farm.json 门洞已开（row 12, cols 6-7，改了 {changed} 个瓦片）")


if __name__ == "__main__":
    gen_tileset()
    gen_house_map()
    patch_farm_door()
    print("done.")
