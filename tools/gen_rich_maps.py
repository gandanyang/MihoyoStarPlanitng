"""重排 town.json / mine.json 地图布局（制作人批准：扩瓦片 + 重排）

前提：先运行 gen_town_tileset.py --force / gen_mine_tileset.py --force
      （tileset 已扩到 16 格）

本脚本只修改 town.json / mine.json：
  1. tileset 定义：columns/tilecount/imagewidth 从 14/14/224 → 16/16/256
     （运行时 addTilesetImage('placeholder','tiles') 用 mapKey_tileset.png 覆盖渲染，
       JSON 的 columns 决定瓦片数量，必须与纹理一致）
  2. Ground / Walls 层 data：按新布局重写

约束（硬性）：
  - town 出口：左 cols 0-1 rows 9-10 → farm；顶 cols 14-15 rows 0-1 → mine
  - mine 出口：底 cols 14-15 rows 18-19 → town；左 cols 0-1 rows 9-10 → forest
  - NPC 站位（town 中央十字路 / mine 左上休息区）必须可站立
  - 矿脉 ORE_DEPOSITS 格不得是碰撞物，周围须可接近

运行：python tools/gen_rich_maps.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP_DIR = os.path.join(ROOT, "public", "assets", "maps")

W = 30  # 列
H = 20  # 行

# ---- 瓦片 gid（与 gen_*_tileset.py 语义一致） ----
G_GRASS, G_DIRT, G_STONE, G_WATER = 1, 2, 3, 4
G_SOIL, G_WOOD, G_PATH, G_FLOWER = 5, 6, 7, 8
# 小镇扩展
G_ROOF, G_WALL, G_DOOR, G_WINDOW = 9, 10, 11, 12
G_WELL, G_FENCE, G_SIGN, G_BUSH = 13, 14, 15, 16
# 矿洞扩展
G_ROCK, G_PILLAR, G_RAIL, G_ORE = 9, 10, 11, 12
G_CRATE, G_PLANK, G_GRAVEL, G_CART = 13, 14, 15, 16


def new_layer(fill=0):
    return [[fill] * W for _ in range(H)]


def set_cell(layer, c, r, gid):
    if 0 <= c < W and 0 <= r < H:
        layer[r][c] = gid


def fill_rect(layer, c0, r0, c1, r1, gid):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            set_cell(layer, c, r, gid)


def flatten(layer):
    out = []
    for row in layer:
        out.extend(row)
    return out


# ===================== 小镇 =====================
def build_town():
    ground = new_layer(G_GRASS)
    walls = new_layer(0)

    # 十字路（rows 9-10 横、cols 14-15 竖）——包含全部出口通道
    fill_rect(ground, 0, 9, W - 1, 10, G_PATH)
    fill_rect(ground, 14, 0, 15, H - 1, G_PATH)
    # 中央广场（NPC 活动区，铺路防杂乱）
    fill_rect(ground, 12, 8, 17, 11, G_PATH)

    # 四栋建筑（实心：屋顶 + 墙面 + 门 + 窗），底座铺木地板
    buildings = [
        # (c0, r0, c1, r1, 门 col, 窗 cols)
        (4, 3, 9, 8, 6, [5, 8]),
        (20, 3, 25, 8, 23, [21, 24]),
        (4, 12, 9, 17, 6, [5, 8]),
        (20, 12, 25, 17, 23, [21, 24]),
    ]
    for c0, r0, c1, r1, door_c, win_cols in buildings:
        fill_rect(ground, c0, r0, c1, r1, G_WOOD)  # 底座
        # 屋顶（顶部两行）
        fill_rect(walls, c0, r0, c1, r0 + 1, G_ROOF)
        # 墙面（其余行）
        fill_rect(walls, c0, r0 + 2, c1, r1 - 1, G_WALL)
        # 门（底部一行）
        set_cell(walls, door_c, r1, G_DOOR)
        # 窗（墙面上）
        for wc in win_cols:
            set_cell(walls, wc, r0 + 3, G_WINDOW)

    # 中央广场装饰：井 + 花丛（避开 NPC 站位）
    set_cell(walls, 15, 11, G_WELL)          # 井
    for fc, fr in [(12, 8), (17, 8), (12, 11), (17, 11)]:
        set_cell(walls, fc, fr, G_FLOWER)    # 花丛

    # 栅栏（建筑前，避开 NPC 站位与出口）
    for fc, fr in [(6, 10), (22, 10), (7, 11), (21, 11)]:
        set_cell(walls, fc, fr, G_FENCE)

    # 路标（路口）
    set_cell(walls, 10, 11, G_SIGN)
    set_cell(walls, 19, 8, G_SIGN)

    # 右下角装饰水池（碰撞）
    fill_rect(walls, 27, 15, 28, 16, G_WATER)
    fill_rect(ground, 26, 15, 29, 16, G_WOOD)  # 池边木板

    # 灌木点缀（草地边缘，避开建筑/出口/广场）
    for bc, br in [(2, 2), (27, 2), (2, 17), (27, 5), (2, 6), (11, 3), (18, 3),
                   (11, 16), (18, 16), (25, 18), (3, 18), (26, 12)]:
        set_cell(walls, bc, br, G_BUSH)

    return ground, walls


# ===================== 矿洞 =====================
def build_mine():
    ground = new_layer(G_DIRT)
    walls = new_layer(0)

    # 入口/出口平台（木板地）
    fill_rect(ground, 12, 2, 17, 5, G_PLANK)      # 顶部入口平台（含小镇出口 cols 14-15）
    fill_rect(ground, 12, 17, 17, 19, G_PLANK)    # 底部出口平台
    fill_rect(ground, 0, 9, 2, 10, G_PLANK)       # 左出口平台（森林出口）

    # 岩壁外圈（避开出口：顶 cols 14-15 / 底 cols 14-15 / 左 rows 9-10）
    fill_rect(walls, 0, 0, 13, 0, G_ROCK)         # 顶左
    fill_rect(walls, 17, 0, 29, 0, G_ROCK)        # 顶右
    fill_rect(walls, 0, 19, 13, 19, G_ROCK)       # 底左
    fill_rect(walls, 17, 19, 29, 19, G_ROCK)      # 底右
    fill_rect(walls, 0, 0, 0, 8, G_ROCK)          # 左上竖壁
    fill_rect(walls, 0, 12, 0, 19, G_ROCK)        # 左下竖壁
    fill_rect(walls, 29, 0, 29, 19, G_ROCK)       # 右竖壁
    # 入口两侧岩壁加厚（矿洞口更像通道）
    fill_rect(walls, 12, 1, 13, 1, G_ROCK)
    fill_rect(walls, 16, 1, 17, 1, G_ROCK)

    # 矿柱（分隔矿室；避开轨道 col 14、矿脉、NPC 休息区 cols 6-12 rows 8-10）
    for pc, pr in [(3, 8), (4, 14), (8, 4), (9, 16), (16, 8), (18, 16),
                   (21, 4), (22, 10), (25, 16), (26, 5)]:
        set_cell(walls, pc, pr, G_PILLAR)

    # 轨道（col 14 从入口到出口，不碰撞）
    fill_rect(walls, 14, 2, 14, 17, G_RAIL)

    # 矿石堆（碰撞，避开矿脉格）
    for oc, orow in [(24, 4), (6, 17), (26, 9), (3, 6)]:
        set_cell(walls, oc, orow, G_ORE)

    # 木箱（碰撞）
    for cc, cr in [(2, 15), (27, 5), (2, 4)]:
        set_cell(walls, cc, cr, G_CRATE)

    # 碎石（装饰，不碰撞）
    for gc, gr in [(18, 4), (6, 6), (24, 12), (10, 14), (17, 11), (4, 9), (19, 13), (7, 3)]:
        set_cell(walls, gc, gr, G_GRAVEL)

    # 矿车（轨道旁装饰，不碰撞）
    set_cell(walls, 13, 7, G_CART)
    set_cell(walls, 15, 15, G_CART)

    return ground, walls


def write_map(name, ground, walls):
    path = os.path.join(MAP_DIR, f"{name}.json")
    with open(path, encoding="utf-8") as f:
        m = json.load(f)

    # 更新 tileset 定义（16 格）
    ts = m["tilesets"][0]
    ts["imagewidth"] = 256
    ts["imageheight"] = 16
    ts["columns"] = 16
    ts["tilecount"] = 16

    # 覆盖层数据
    for layer in m["layers"]:
        if layer["name"] == "Ground":
            layer["data"] = flatten(ground)
        elif layer["name"] == "Walls":
            layer["data"] = flatten(walls)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False)
    print(f"[OK] {name}.json 已重排（tileset 16 格，Ground/Walls 已更新）")


def main():
    ground, walls = build_town()
    write_map("town", ground, walls)
    ground, walls = build_mine()
    write_map("mine", ground, walls)
    print("done.")


if __name__ == "__main__":
    sys.exit(main())
