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
G_STOVE = 13
G_CHAIR = 14
G_CRATE = 15
G_PLANT = 16

MAP_W = 20
MAP_H = 15


def gen_tileset():
    """生成 house_tileset.png：复制农场 tileset 前 8 块 + 4 个家具块"""
    farm_ts = os.path.join(TILE_DIR, "farm_tileset.png")
    base = Image.open(farm_ts).convert("RGB")
    # 基础 8 块宽度
    base_w = 8 * T

    new_img = Image.new("RGB", (16 * T, T), (0, 0, 0))
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

    upgrade_house_tiles(new_img)
    out = os.path.join(TILE_DIR, "house_tileset.png")
    new_img.save(out)
    print(f"[OK] tileset -> {out}  (16*T x T)")



def upgrade_house_tiles(img):
    """???????v0.9?????/???/?????gid ?????"""
    # ??? gid6 (tile 5, x=80)
    x0 = 5 * T
    base_w = (150, 110, 70); dark = (118, 82, 40); light = (180, 140, 96); seam = (96, 64, 30)
    for y in range(T):
        for x in range(T):
            img.putpixel((x0 + x, y), base_w)
    for y in range(T):
        if y % 4 == 3:
            for x in range(T):
                img.putpixel((x0 + x, y), seam)
    for plank in range(4):
        py = plank * 4
        off = (plank % 2) * 3
        for x in range(off, min(off + 5, T)):
            img.putpixel((x0 + x, py + 1), dark)
        for x in (2, 7, 12):
            for y in range(py + 1, min(py + 3, T - 1)):
                if (x + y) % 2 == 0:
                    img.putpixel((x0 + x, y), dark)
    for x in range(T):
        img.putpixel((x0 + x, 0), light)
    # ??? gid3 (tile 2, x=32)
    x1 = 2 * T
    wall = (135, 112, 92); mortar = (96, 78, 62); wall_l = (160, 136, 112)
    for y in range(T):
        for x in range(T):
            img.putpixel((x1 + x, y), wall)
    for by in range(0, T, 4):
        for x in range(T):
            img.putpixel((x1 + x, min(by + 3, T - 1)), mortar)
    for bx in range(0, T, 4):
        for y in range(T):
            img.putpixel((x1 + min(bx + 3, T - 1), y), mortar)
    for by in range(0, T, 4):
        for bx in range(0, T, 4):
            img.putpixel((x1 + bx, by), wall_l)
            img.putpixel((x1 + bx + 1, by), wall_l)
    # ? gid9 (tile 8, x=128)
    x2 = 8 * T
    for x in range(T):
        img.putpixel((x2 + x, 0), (72, 44, 26))
        img.putpixel((x2 + x, 15), (72, 44, 26))
    for y in range(T):
        img.putpixel((x2, y), (72, 44, 26))
        img.putpixel((x2 + 15, y), (72, 44, 26))
    for y in range(3, 15):
        for x in range(1, 15):
            img.putpixel((x2 + x, y), (139, 58, 58) if (x + y) % 2 else (128, 50, 50))
    for y in range(1, 4):
        for x in range(1, 5):
            img.putpixel((x2 + x, y), (238, 238, 238))
    img.putpixel((x2 + 5, 1), (200, 200, 200)); img.putpixel((x2 + 5, 2), (200, 200, 200))
    # ? gid10 (tile 9, x=144)
    x3 = 9 * T
    for y in range(T):
        for x in range(T):
            img.putpixel((x3 + x, y), (160, 120, 70))
    for y in range(1, 4):
        for x in range(1, 15):
            if (x + y) % 4 == 0:
                img.putpixel((x3 + x, y), (180, 138, 84))
    for x in range(1, 15):
        img.putpixel((x3 + x, 1), (190, 150, 94))
    for x in range(T):
        img.putpixel((x3 + x, 3), (120, 85, 45))
        img.putpixel((x3 + x, 4), (120, 85, 45))
    for y in range(2):
        for x in range(3, 5):
            img.putpixel((x3 + x, y), (235, 235, 235))
    img.putpixel((x3 + 5, 0), (235, 235, 235)); img.putpixel((x3 + 5, 1), (180, 90, 60))
    for y in range(5, T):
        img.putpixel((x3 + 2, y), (90, 60, 30))
        img.putpixel((x3 + 13, y), (90, 60, 30))
        img.putpixel((x3 + 3, y), (70, 45, 20))
        img.putpixel((x3 + 12, y), (70, 45, 20))
    # ? gid11 (tile 10, x=160)
    x4 = 10 * T
    for y in range(T):
        for x in range(T):
            img.putpixel((x4 + x, y), (110, 44, 44))
    for x in range(T):
        img.putpixel((x4 + x, 0), (170, 78, 78)); img.putpixel((x4 + x, 15), (170, 78, 78))
    for y in range(T):
        img.putpixel((x4, y), (170, 78, 78)); img.putpixel((x4 + 15, y), (170, 78, 78))
    cx, cy = 8, 8
    for y in range(T):
        for x in range(T):
            d = abs(x - cx) + abs(y - cy)
            if d <= 5:
                img.putpixel((x4 + x, y), (200, 110, 110))
            if d <= 2:
                img.putpixel((x4 + x, y), (235, 150, 150))
    # ? gid12 (tile 11, x=176)
    x5 = 11 * T
    for y in range(T):
        for x in range(T):
            img.putpixel((x5 + x, y), (100, 65, 35))
    for y in range(T):
        img.putpixel((x5, y), (72, 44, 20)); img.putpixel((x5 + 15, y), (72, 44, 20))
    for x in range(T):
        img.putpixel((x5 + x, 5), (70, 45, 20)); img.putpixel((x5 + x, 10), (70, 45, 20))
    book_colors = [(180, 50, 50), (50, 80, 180), (50, 150, 70), (200, 180, 50)]
    for shelf_y in [2, 7, 12]:
        for i, bc in enumerate(book_colors):
            for y in range(shelf_y, min(shelf_y + 3, T)):
                for bx in range(2 + i * 3, 2 + i * 3 + 2):
                    img.putpixel((x5 + bx, y), bc)
    for y in range(7, 10):
        img.putpixel((x5 + 11, y), (150, 100, 50))
        img.putpixel((x5 + 12, y), (150, 100, 50))
    img.putpixel((x5 + 11, 6), (120, 80, 40)); img.putpixel((x5 + 12, 6), (120, 80, 40))
    # stove gid13 (tile 12)
    x6 = 12 * T
    for y in range(T):
        for x in range(T):
            img.putpixel((x6 + x, y), (104, 100, 108))
    for x in range(T):
        img.putpixel((x6 + x, 3), (70, 68, 76))
        img.putpixel((x6 + x, 4), (70, 68, 76))
    for cx in (4, 11):
        for yy in range(6, 13):
            for xx in range(cx, cx + 2):
                img.putpixel((x6 + xx, yy), (52, 50, 58))
        img.putpixel((x6 + cx, 5), (130, 128, 136))
    for yy in range(13, T):
        for x in range(T):
            img.putpixel((x6 + x, yy), (70, 68, 76))
    # chair gid14 (tile 13)
    x7 = 13 * T
    for y in range(T):
        for x in range(T):
            img.putpixel((x7 + x, y), (150, 110, 70))
    for x in (2, 13):
        for y in range(2, 9):
            img.putpixel((x7 + x, y), (110, 75, 40))
    img.putpixel((x7 + 3, 2), (110, 75, 40)); img.putpixel((x7 + 12, 2), (110, 75, 40))
    for x in range(3, 13):
        for y in range(9, 11):
            img.putpixel((x7 + x, y), (110, 75, 40))
    for x in (3, 12):
        for y in range(11, 15):
            img.putpixel((x7 + x, y), (80, 52, 28))
    # crate gid15 (tile 14)
    x8 = 14 * T
    for y in range(T):
        for x in range(T):
            img.putpixel((x8 + x, y), (130, 92, 55))
    for x in range(T):
        img.putpixel((x8 + x, 2), (96, 64, 36))
        img.putpixel((x8 + x, 13), (96, 64, 36))
    for y in range(T):
        img.putpixel((x8, y), (96, 64, 36))
        img.putpixel((x8 + 15, y), (96, 64, 36))
    for x in range(4, 13):
        img.putpixel((x8 + x, 6), (96, 64, 36))
        img.putpixel((x8 + x, 9), (96, 64, 36))
    # plant gid16 (tile 15)
    x9 = 15 * T
    for y in range(T):
        for x in range(T):
            img.putpixel((x9 + x, y), (150, 100, 50))
    for y in range(11, 15):
        for x in range(4, 12):
            img.putpixel((x9 + x, y), (168, 108, 58))
    for x in range(4, 12):
        img.putpixel((x9 + x, 10), (135, 84, 44))
    for x in range(4, 12):
        for y in range(5, 11):
            img.putpixel((x9 + x, y), (74, 132, 66))
    for x in range(6, 10):
        for y in range(2, 5):
            img.putpixel((x9 + x, y), (88, 150, 78))
    return img

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
    fill_rect(ground, 5, 6, 12, 8, G_RUG)
    # 书架（左下角 cols 2-3, rows 11-12）
    fill_rect(ground, 2, 11, 3, 12, G_SHELF)
    set_cell(ground, 4, 2, G_PLANT)
    set_cell(ground, 17, 2, G_PLANT)
    set_cell(ground, 15, 3, G_CHAIR)
    set_cell(ground, 12, 3, G_CHAIR)
    fill_rect(ground, 14, 11, 15, 12, G_STOVE)
    fill_rect(ground, 16, 11, 16, 12, G_CRATE)

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
    "imagewidth": 16 * T,
            "margin": 0,
            "name": "placeholder",
            "spacing": 0,
    "tilecount": 16,
            "tileheight": T,
            "tilewidth": T,
    "columns": 16,
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
