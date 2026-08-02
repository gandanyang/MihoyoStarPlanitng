# -*- coding: utf-8 -*-
"""
物品图标生成脚本（v2 像素风，16×16）
====================================
为背包/商店/种子选择等 UI 生成 18 个 16×16 物品图标，替换 emoji 渲染。
逐像素绘制 + 1px C.OUTLINE 描边 + 三色调，与游戏其余像素美术一致。

生成（public/assets/icons/）：
  radish tomato corn strawberry
  radish_seed tomato_seed corn_seed strawberry_seed
  star_shard diamond stone copper iron
  manor_key old_hoe old_watering_can old_axe wood

运行：  python tools/gen_item_icons.py
"""

from __future__ import annotations

import os
from PIL import Image
from gen_sprite_assets import C, px, rect, hline, vline, box_outline, add_outline

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_DIR = os.path.join(ROOT, "public", "assets", "icons")

S = 16  # 图标尺寸


class I:
    """图标配色（16×16 像素，三色调 + 高光）。"""
    # 作物
    RADISH = (232, 92, 108, 255)
    RADISH_D = (198, 70, 84, 255)
    RADISH_L = (250, 160, 170, 255)
    TOMATO = (222, 66, 74, 255)
    TOMATO_D = (188, 48, 56, 255)
    TOMATO_L = (252, 150, 140, 255)
    CORN = (250, 204, 90, 255)
    CORN_D = (214, 168, 60, 255)
    CORN_L = (255, 240, 170, 255)
    BERRY = (236, 64, 96, 255)
    BERRY_D = (202, 46, 76, 255)
    BERRY_L = (255, 140, 160, 255)
    LEAF = (80, 158, 66, 255)
    LEAF_D = (58, 128, 48, 255)
    LEAF_L = (130, 200, 108, 255)
    SEED = (186, 132, 74, 255)
    SEED_D = (154, 104, 56, 255)
    SEED_L = (220, 176, 116, 255)
    # 矿石
    STONE = (150, 150, 158, 255)
    STONE_D = (110, 110, 120, 255)
    STONE_L = (200, 200, 208, 255)
    COPPER = (202, 132, 82, 255)
    COPPER_D = (170, 104, 58, 255)
    COPPER_L = (240, 176, 116, 255)
    IRON = (192, 197, 212, 255)
    IRON_D = (152, 157, 174, 255)
    IRON_L = (238, 240, 250, 255)
    # 星之碎片 / 钻石
    SHARD = (188, 136, 255, 255)
    SHARD_D = (150, 96, 230, 255)
    SHARD_L = (244, 224, 255, 255)
    DIAMOND = (120, 200, 255, 255)
    DIAMOND_D = (80, 160, 230, 255)
    DIAMOND_L = (230, 250, 255, 255)
    # 工具
    METAL = (178, 182, 194, 255)
    METAL_D = (128, 132, 146, 255)
    METAL_L = (226, 230, 240, 255)
    WOOD = (156, 112, 60, 255)
    WOOD_D = (122, 84, 42, 255)
    WOOD_L = (200, 158, 96, 255)
    HANDLE = (150, 104, 60, 255)
    HANDLE_D = (120, 80, 44, 255)
    RING = (104, 72, 36, 255)
    GOLD = (255, 212, 92, 255)
    GOLD_D = (210, 168, 60, 255)


def blank() -> Image.Image:
    return Image.new("RGBA", (S, S), C.TRANSPARENT)


# ============================================================================
# 作物果实（圆润 + 蒂/叶）
# ============================================================================
def crop_icon(body, body_d, body_l, tip=None, leaf=True):
    img = blank()
    # 主体圆
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            if dx * dx + dy * dy <= 17:
                px(img, 8 + dx, 8 + dy, body)
    # 阴影（右下）
    for dy in range(0, 5):
        for dx in range(0, 5):
            if dx * dx + dy * dy <= 15 and (8 + dx > 9 or 8 + dy > 9):
                pass
    px(img, 11, 11, body_d)
    px(img, 12, 10, body_d)
    px(img, 12, 11, body_d)
    px(img, 10, 12, body_d)
    # 高光（左上）
    px(img, 6, 5, body_l)
    px(img, 5, 6, body_l)
    px(img, 7, 6, body_l)
    # 蒂
    rect(img, 7, 2, 9, 4, (110, 168, 74, 255))
    # 叶
    if leaf:
        px(img, 5, 3, I.LEAF)
        px(img, 4, 4, I.LEAF_D)
        px(img, 11, 3, I.LEAF)
        px(img, 12, 4, I.LEAF_D)
    add_outline(img, C.OUTLINE)
    return img


def radish_icon():
    img = crop_icon(I.RADISH, I.RADISH_D, I.RADISH_L)
    # 萝卜根须
    px(img, 7, 13, I.RADISH_D)
    px(img, 8, 14, I.RADISH_D)
    px(img, 9, 13, I.RADISH_D)
    return img


def tomato_icon():
    return crop_icon(I.TOMATO, I.TOMATO_D, I.TOMATO_L)


def corn_icon():
    img = blank()
    # 玉米棒主体
    for dy in range(-4, 5):
        for dx in range(-3, 4):
            if dx * dx + dy * dy <= 14:
                px(img, 8 + dx, 8 + dy, I.CORN)
    # 粒纹
    for x in range(6, 12):
        for y in (6, 9, 12):
            px(img, x, y, I.CORN_D) if (x + y) % 2 == 0 else px(img, x, y, I.CORN_L)
    # 顶部绿叶
    px(img, 8, 3, I.LEAF)
    px(img, 7, 2, I.LEAF_D)
    px(img, 6, 1, I.LEAF_D)
    px(img, 9, 3, I.LEAF)
    px(img, 10, 2, I.LEAF_D)
    px(img, 11, 1, I.LEAF_D)
    add_outline(img, C.OUTLINE)
    return img


def strawberry_icon():
    img = crop_icon(I.BERRY, I.BERRY_D, I.BERRY_L)
    # 草莓籽
    px(img, 7, 7, I.BERRY_L)
    px(img, 9, 6, I.BERRY_L)
    px(img, 11, 8, I.BERRY_L)
    px(img, 8, 10, I.BERRY_L)
    px(img, 10, 11, I.BERRY_L)
    px(img, 6, 9, I.BERRY_L)
    return img


# ============================================================================
# 种子（小圆 + 芽）
# ============================================================================
def seed_icon():
    img = blank()
    # 土褐色小圆（种子）
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dx * dx + dy * dy <= 5:
                px(img, 8 + dx, 9 + dy, I.SEED)
    px(img, 9, 10, I.SEED_D)
    # 芽
    px(img, 7, 5, I.LEAF)
    px(img, 8, 5, I.LEAF)
    px(img, 8, 4, I.LEAF_L)
    px(img, 7, 4, I.LEAF_L)
    px(img, 8, 3, I.LEAF_L)
    # 土堆
    rect(img, 4, 12, 12, 13, (140, 104, 62, 255))
    px(img, 5, 12, (170, 132, 84, 255))
    px(img, 11, 12, (170, 132, 84, 255))
    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 矿石（岩块 + 晶体）
# ============================================================================
def ore_icon(body, body_d, body_l):
    img = blank()
    # 岩块
    rect(img, 4, 7, 11, 13, I.STONE)
    px(img, 5, 6, I.STONE)
    px(img, 10, 6, I.STONE)
    px(img, 6, 5, I.STONE)
    hline(img, 4, 11, 13, I.STONE_D)
    vline(img, 11, 7, 13, I.STONE_D)
    # 晶体（中心菱形）
    for dx, dy in [(0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)]:
        px(img, 8 + dx, 9 + dy, body)
    px(img, 8, 9, body_l)
    px(img, 7, 8, body_l)
    # 碎粒
    px(img, 6, 8, body)
    px(img, 11, 11, body)
    px(img, 9, 12, body_d)
    px(img, 5, 11, body_d)
    px(img, 3, 9, I.STONE)
    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 星之碎片 / 钻石（菱形宝石 + 高光）
# ============================================================================
def gem_icon(main, main_d, main_l, facet):
    img = blank()
    # 大菱形
    pts = [(8, 2), (13, 8), (8, 14), (3, 8)]
    for x, y in pts:
        pass
    for y in range(2, 15):
        half = max(1, (y - 2) if y <= 8 else (14 - y))
        for x in range(8 - half, 8 + half + 1):
            px(img, x, y, main)
    # 切割面
    for x in range(5, 12):
        px(img, x, 8, main_d)
    px(img, 7, 6, main_d)
    px(img, 9, 6, main_d)
    # 高光
    px(img, 6, 4, main_l)
    px(img, 7, 4, main_l)
    px(img, 6, 5, main_l)
    px(img, 10, 5, facet)
    px(img, 11, 5, facet)
    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 庄园钥匙（圆头 + 齿）
# ============================================================================
def key_icon():
    img = blank()
    # 环
    box_outline(img, 3, 3, 7, 7, I.GOLD)
    px(img, 5, 4, I.GOLD)
    px(img, 5, 5, I.GOLD)
    px(img, 5, 6, I.GOLD)
    px(img, 4, 5, I.GOLD)
    px(img, 6, 5, I.GOLD)
    # 杆
    rect(img, 7, 5, 12, 6, I.GOLD)
    px(img, 7, 5, I.GOLD_D)
    # 齿
    rect(img, 9, 7, 10, 9, I.GOLD)
    rect(img, 11, 7, 12, 8, I.GOLD)
    # 高光
    px(img, 4, 4, (255, 240, 180, 255))
    px(img, 8, 5, (255, 240, 180, 255))
    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 旧锄头（斜柄 + 锄刃）
# ============================================================================
def hoe_icon():
    img = blank()
    # 柄（对角）
    for i in range(12):
        px(img, 10 - i // 2, 14 - i // 2, I.HANDLE)
    px(img, 9, 13, I.HANDLE_D)
    px(img, 8, 12, I.HANDLE_D)
    # 锄刃（左侧横向）
    rect(img, 2, 6, 7, 7, I.METAL)
    hline(img, 2, 7, 6, I.METAL_L)
    hline(img, 2, 7, 7, I.METAL_D)
    px(img, 2, 5, I.METAL)
    px(img, 1, 7, I.METAL)
    px(img, 1, 8, I.METAL_D)
    px(img, 8, 6, I.HANDLE)
    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 旧水壶（壶身 + 提手 + 壶嘴）
# ============================================================================
def can_icon():
    img = blank()
    # 壶身
    rect(img, 5, 7, 12, 13, I.METAL)
    hline(img, 5, 12, 7, I.METAL_L)
    hline(img, 5, 12, 13, I.METAL_D)
    vline(img, 12, 7, 13, I.METAL_D)
    # 提手
    px(img, 6, 5, I.METAL)
    px(img, 7, 4, I.METAL)
    px(img, 8, 4, I.METAL)
    px(img, 9, 4, I.METAL)
    px(img, 10, 4, I.METAL)
    px(img, 11, 5, I.METAL)
    # 壶嘴（右下）
    px(img, 13, 10, I.METAL)
    px(img, 13, 11, I.METAL)
    px(img, 12, 12, I.METAL)
    px(img, 14, 9, I.METAL)
    px(img, 14, 10, I.METAL_D)
    # 壶身横纹
    for x in range(6, 12):
        px(img, x, 10, I.METAL_D) if x % 2 == 0 else None
    px(img, 7, 9, I.METAL_L)
    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 旧斧头（柄 + 锈刃）
# ============================================================================
def axe_icon():
    img = blank()
    # 柄（对角）
    for i in range(12):
        px(img, 10 - i // 2, 14 - i // 2, I.HANDLE)
    px(img, 9, 13, I.HANDLE_D)
    px(img, 8, 12, I.HANDLE_D)
    # 斧头（左上）
    rect(img, 2, 4, 7, 9, I.METAL)
    px(img, 7, 4, I.METAL)
    px(img, 8, 5, I.METAL)
    px(img, 8, 6, I.METAL)
    px(img, 2, 4, I.METAL_L)
    px(img, 3, 4, I.METAL_L)
    hline(img, 2, 7, 9, I.METAL_D)
    vline(img, 2, 5, 9, I.METAL_D)
    # 锈迹
    px(img, 4, 6, (172, 112, 62, 255))
    px(img, 5, 7, (172, 112, 62, 255))
    px(img, 3, 8, (172, 112, 62, 255))
    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 体力（闪电，HUD 指示）
# ============================================================================
def stamina_icon():
    img = blank()
    # 闪电主体：上部宽块 → 中部收窄 → 右下尖角（斜向闪电）
    for y, (x0, x1) in {
        3: (6, 10),
        4: (5, 10),
        5: (5, 10),
        6: (5, 9),
        7: (5, 8),
        8: (6, 8),
        9: (7, 9),
        10: (8, 10),
        11: (8, 11),
        12: (9, 11),
        13: (10, 11),
    }.items():
        for x in range(x0, x1 + 1):
            px(img, x, y, I.GOLD)
    # 高光（左上）
    px(img, 6, 3, (255, 240, 180, 255))
    px(img, 5, 4, (255, 240, 180, 255))
    px(img, 6, 4, (255, 240, 180, 255))
    # 阴影（右下）
    px(img, 10, 10, I.GOLD_D)
    px(img, 10, 11, I.GOLD_D)
    px(img, 11, 11, I.GOLD_D)
    px(img, 11, 12, I.GOLD_D)
    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 金币（金色圆币，HUD 指示）
# ============================================================================
def coin_icon():
    img = blank()
    # 外圆（半径 6）
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            if dx * dx + dy * dy <= 36:
                px(img, 8 + dx, 8 + dy, I.GOLD)
    # 内环（半径 3~4，暗色区分币面）
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            d2 = dx * dx + dy * dy
            if d2 <= 16 and d2 >= 9:
                px(img, 8 + dx, 8 + dy, I.GOLD_D)
    # 中心方孔（币孔/币值符号感）
    rect(img, 7, 7, 9, 9, I.GOLD)
    px(img, 8, 8, (255, 240, 180, 255))
    # 高光（左上弧）
    px(img, 4, 5, (255, 240, 180, 255))
    px(img, 3, 6, (255, 240, 180, 255))
    px(img, 4, 6, (255, 240, 180, 255))
    # 阴影（右下弧）
    px(img, 11, 11, I.GOLD_D)
    px(img, 12, 10, I.GOLD_D)
    px(img, 12, 11, I.GOLD_D)
    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 木材（圆木堆叠）
# ============================================================================
def wood_icon():
    img = blank()
    # 底层圆木
    rect(img, 3, 10, 13, 13, I.WOOD)
    hline(img, 3, 13, 10, I.WOOD_L)
    hline(img, 3, 13, 13, I.WOOD_D)
    # 底层端面
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dx * dx + dy * dy <= 5:
                px(img, 5 + dx, 12 + dy, (176, 138, 78, 255))
    box_outline(img, 4, 11, 6, 13, I.RING)
    # 上层圆木
    rect(img, 7, 6, 13, 10, I.WOOD)
    hline(img, 7, 13, 6, I.WOOD_L)
    hline(img, 7, 13, 10, I.WOOD_D)
    # 上层端面
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dx * dx + dy * dy <= 5:
                px(img, 10 + dx, 8 + dy, (176, 138, 78, 255))
    box_outline(img, 9, 7, 11, 9, I.RING)
    px(img, 10, 8, I.RING)
    # 木纹
    for x in range(4, 13):
        px(img, x, 12, I.WOOD_D) if x % 3 == 0 else None
    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 主入口
# ============================================================================
def main() -> None:
    os.makedirs(ICON_DIR, exist_ok=True)

    outputs = [
        ("radish.png", radish_icon(), "萝卜"),
        ("tomato.png", tomato_icon(), "番茄"),
        ("corn.png", corn_icon(), "玉米"),
        ("strawberry.png", strawberry_icon(), "草莓"),
        ("radish_seed.png", seed_icon(), "萝卜种子"),
        ("tomato_seed.png", seed_icon(), "番茄种子"),
        ("corn_seed.png", seed_icon(), "玉米种子"),
        ("strawberry_seed.png", seed_icon(), "草莓种子"),
        ("star_shard.png", gem_icon(I.SHARD, I.SHARD_D, I.SHARD_L, (255, 255, 255, 255)), "星之碎片"),
        ("diamond.png", gem_icon(I.DIAMOND, I.DIAMOND_D, I.DIAMOND_L, (200, 240, 255, 255)), "钻石"),
        ("stone.png", ore_icon(I.STONE, I.STONE_D, I.STONE_L), "石头"),
        ("copper.png", ore_icon(I.COPPER, I.COPPER_D, I.COPPER_L), "铜矿"),
        ("iron.png", ore_icon(I.IRON, I.IRON_D, I.IRON_L), "铁矿"),
        ("manor_key.png", key_icon(), "庄园钥匙"),
        ("old_hoe.png", hoe_icon(), "旧锄头"),
        ("old_watering_can.png", can_icon(), "旧水壶"),
        ("old_axe.png", axe_icon(), "旧斧头"),
        ("wood.png", wood_icon(), "木材"),
        ("stamina.png", stamina_icon(), "体力"),
        ("coin.png", coin_icon(), "金币"),
    ]
    for name, img, desc in outputs:
        img.save(os.path.join(ICON_DIR, name))
        print(f"[OK] {name}  16x16  ({desc})")

    print(f"\n全部完成！输出目录：{ICON_DIR}")


if __name__ == "__main__":
    main()
