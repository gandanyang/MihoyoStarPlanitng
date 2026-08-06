# -*- coding: utf-8 -*-
"""
像素美术扩展脚本（v3 — 新 NPC 立绘 + 矿脉贴图）
=============================================
纯 PIL 程序化绘制，复用 gen_sprite_assets.py 的调色板与绘制辅助（保持风格统一）。

生成 7 张 PNG：
  public/assets/sprites/npc_miner.png       矿工老张 idle down  (32x32)
  public/assets/sprites/npc_gardener.png    花匠小梅 idle down  (32x32)
  public/assets/sprites/npc_adventurer.png  冒险家阿飞 idle down (32x32)
  public/assets/sprites/npc_carpenter.png   木匠老周 idle down  (32x32)
  public/assets/sprites/ore_stone.png       石头矿脉 (32x32)
  public/assets/sprites/ore_copper.png      铜矿脉   (32x32)
  public/assets/sprites/ore_iron.png        铁矿脉   (32x32)

运行：  python tools/gen_npc_extras.py

说明：
  - 新 NPC 对应 NPCSystem.ts 里复用贴图的 3 个角色（miner/gardener/adventurer），
    后续接线时把 textureKey 换成 npc_miner/npc_gardener/npc_adventurer，
    并在 MapScene.ts preload 里加这 3 张的 this.load.image 即可。
  - 矿脉贴图用于替换 MapScene.ts setupOres 里的 add.ellipse 占位椭圆
    （石头 12px / 铜 14px / 铁 16px，新图 32x32 可直接 setScale 到目标尺寸）。
"""

from __future__ import annotations

import os
from PIL import Image
from gen_sprite_assets import (
    C, blank_sprite, px, rect, hline, vline, box_outline, add_outline,
    draw_face_down_32,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITE_DIR = os.path.join(ROOT, "public", "assets", "sprites")


# ============================================================================
# 新增角色专属调色板（与 C 类互补，不覆盖已有 NPC 配色）
# ============================================================================
class N:
    """矿工老张 / 花匠小梅 / 冒险家阿飞 + 矿脉配色。"""

    # —— 矿工老张：黄安全帽 + 深蓝吊带工装 + 镐 ——
    MN_HELMET = (232, 198, 88, 255)          # 安全帽主色
    MN_HELMET_MID = (206, 172, 70, 255)
    MN_HELMET_SHADOW = (178, 146, 54, 255)
    MN_HELMET_LIGHT = (252, 234, 150, 255)   # 帽脊高光
    MN_LAMP = (255, 255, 205, 255)           # 帽前灯
    MN_HAIR = (150, 120, 90, 255)            # 花白鬓发
    MN_HAIR_S = (120, 94, 70, 255)
    MN_BEARD = (196, 182, 168, 255)          # 灰白胡须
    MN_BEARD_S = (168, 152, 138, 255)
    MN_SHIRT = (204, 174, 124, 255)          # 土黄工装衬衫
    MN_SHIRT_MID = (182, 152, 104, 255)
    MN_SHIRT_S = (158, 128, 86, 255)
    MN_OVERALL = (72, 92, 152, 255)          # 深蓝吊带裤
    MN_OVERALL_MID = (62, 80, 132, 255)
    MN_OVERALL_S = (52, 68, 112, 255)
    MN_BOOT = (112, 82, 56, 255)
    MN_BOOT_L = (132, 98, 66, 255)
    MN_PICK = (128, 128, 138, 255)           # 镐头金属
    MN_PICK_S = (98, 98, 108, 255)
    MN_HANDLE = (132, 98, 62, 255)           # 镐柄木
    MN_HANDLE_S = (116, 84, 52, 255)

    # —— 花匠小梅：麦色草帽 + 粉裙 + 绿围裙，手捧花束 ——
    GD_HAT = (216, 186, 122, 255)
    GD_HAT_MID = (190, 162, 102, 255)
    GD_HAT_S = (162, 136, 84, 255)
    GD_HAT_BAND = (150, 92, 62, 255)
    GD_HAIR = (172, 122, 82, 255)
    GD_HAIR_S = (142, 98, 62, 255)
    GD_DRESS = (242, 172, 192, 255)          # 粉裙
    GD_DRESS_MID = (218, 148, 168, 255)
    GD_DRESS_S = (194, 126, 146, 255)
    GD_APRON = (152, 202, 132, 255)          # 绿围裙
    GD_APRON_S = (122, 172, 102, 255)
    GD_FLOWER = (246, 142, 162, 255)         # 手中花束
    GD_FLOWER_RED = (222, 82, 92, 255)
    GD_FLOWER_C = (255, 236, 130, 255)       # 花芯
    GD_LEAF = (82, 152, 72, 255)
    GD_SHOE = (122, 82, 62, 255)

    # —— 冒险家阿飞：棕探险帽 + 苔绿夹克 + 佩剑 ——
    AV_HAT = (152, 106, 62, 255)
    AV_HAT_MID = (130, 90, 50, 255)
    AV_HAT_S = (108, 74, 40, 255)
    AV_HAIR = (222, 182, 92, 255)
    AV_HAIR_S = (192, 152, 62, 255)
    AV_JACKET = (92, 132, 92, 255)
    AV_JACKET_MID = (78, 114, 78, 255)
    AV_JACKET_S = (64, 96, 64, 255)
    AV_PANTS = (122, 106, 82, 255)
    AV_PANTS_S = (102, 88, 66, 255)
    AV_BOOT = (82, 62, 42, 255)
    AV_BELT = (72, 52, 32, 255)
    AV_BUCKLE = (255, 212, 92, 255)
    AV_BAG = (142, 106, 62, 255)             # 斜挎包
    AV_BAG_S = (116, 86, 50, 255)
    AV_SCARF = (202, 92, 72, 255)            # 红领巾
    AV_SWORD = (192, 197, 207, 255)          # 剑鞘
    AV_SWORD_S = (150, 155, 168, 255)
    AV_GUARD = (212, 162, 62, 255)           # 剑柄

    # —— 木匠老周：深棕短发(略白发) + 棕色工作围裙 + 工具腰包 + 木屑痕迹 ——
    CP_HAIR = (120, 84, 56, 255)           # 深棕短发
    CP_HAIR_MID = (142, 102, 68, 255)      # 发绺过渡
    CP_HAIR_S = (94, 62, 40, 255)          # 发根阴影
    CP_GRAY_HAIR = (200, 192, 178, 255)    # 略有白发（几缕）
    CP_SHIRT = (216, 196, 168, 255)        # 米灰工装衬衫
    CP_SHIRT_MID = (194, 174, 146, 255)
    CP_SHIRT_S = (170, 150, 122, 255)
    CP_COLLAR = (226, 208, 182, 255)
    CP_APRON = (150, 100, 62, 255)         # 棕色工作围裙
    CP_APRON_MID = (128, 84, 50, 255)
    CP_APRON_S = (106, 68, 38, 255)
    CP_APRON_STRIPE = (176, 126, 82, 255)  # 围裙浅条纹
    CP_BELT = (88, 58, 34, 255)            # 工具腰带（深棕皮革）
    CP_PANTS = (86, 82, 88, 255)           # 深灰蓝工装裤
    CP_PANTS_S = (68, 64, 70, 255)
    CP_BOOT = (78, 54, 38, 255)            # 深棕靴子
    CP_BOOT_L = (100, 70, 48, 255)
    CP_TOOL_LEATHER = (112, 80, 46, 255)   # 工具腰包（皮革）
    CP_TOOL_METAL = (198, 202, 214, 255)   # 金属工具（锤头/刨刃）
    CP_TOOL_WOOD = (170, 128, 74, 255)     # 工具木柄
    CP_WOODCHIP = (216, 178, 118, 255)     # 木屑（衣上浅色点）

    # —— 矿脉（与 MineState.ts 现有颜色语义一致）——
    OR_STONE = (150, 150, 158, 255)
    OR_STONE_MID = (130, 130, 138, 255)
    OR_STONE_DARK = (104, 104, 114, 255)
    OR_STONE_LIGHT = (192, 192, 200, 255)
    OR_COPPER = (202, 132, 82, 255)
    OR_COPPER_LIGHT = (238, 174, 112, 255)
    OR_COPPER_DARK = (172, 102, 56, 255)
    OR_IRON = (192, 197, 212, 255)
    OR_IRON_LIGHT = (236, 239, 250, 255)
    OR_IRON_DARK = (152, 157, 174, 255)


# ============================================================================
# 矿工老张（idle down）：黄安全帽 + 吊带工装 + 扛镐
# ============================================================================
def npc_miner_frame_32() -> Image.Image:
    img = blank_sprite()

    # —— 靴子 ——
    rect(img, 9, 29, 14, 31, N.MN_BOOT)
    hline(img, 9, 14, 29, N.MN_BOOT_L)
    hline(img, 9, 14, 31, (32, 22, 14, 255))
    rect(img, 17, 29, 22, 31, N.MN_BOOT)
    hline(img, 17, 22, 29, N.MN_BOOT_L)
    hline(img, 17, 22, 31, (32, 22, 14, 255))
    px(img, 12, 31, (54, 38, 24, 255))
    px(img, 19, 31, (54, 38, 24, 255))

    # —— 吊带工装裤（腿）——
    rect(img, 10, 23, 14, 28, N.MN_OVERALL)
    vline(img, 10, 23, 28, N.MN_OVERALL_S)
    vline(img, 14, 23, 28, N.MN_OVERALL_MID)
    rect(img, 17, 23, 21, 28, N.MN_OVERALL)
    vline(img, 17, 23, 28, N.MN_OVERALL_MID)
    vline(img, 21, 23, 28, N.MN_OVERALL_S)
    hline(img, 10, 14, 28, N.MN_OVERALL_S)
    hline(img, 17, 21, 28, N.MN_OVERALL_S)

    # —— 土黄衬衫 ——
    rect(img, 7, 11, 24, 22, N.MN_SHIRT)
    vline(img, 7, 11, 22, N.MN_SHIRT_S)
    vline(img, 24, 11, 22, N.MN_SHIRT_S)
    hline(img, 7, 24, 22, N.MN_SHIRT_S)
    # 胸前纽扣缝
    for y in range(14, 21):
        px(img, 15, y, N.MN_SHIRT_S) if y % 2 == 0 else px(img, 16, y, N.MN_SHIRT_S)
    # 衣领
    rect(img, 13, 11, 18, 12, N.MN_SHIRT_MID)
    px(img, 12, 11, N.MN_SHIRT_S)
    px(img, 19, 11, N.MN_SHIRT_S)
    # 左胸口袋
    box_outline(img, 9, 14, 12, 18, N.MN_SHIRT_S)
    px(img, 10, 16, N.MN_SHIRT_MID)

    # —— 吊带（工装背带盖在衬衫上）——
    for y in range(12, 21):
        px(img, 10, y, N.MN_OVERALL) if y % 2 == 0 else px(img, 10, y, N.MN_OVERALL_MID)
        px(img, 21, y, N.MN_OVERALL) if y % 2 == 0 else px(img, 21, y, N.MN_OVERALL_MID)
    # 胸前金属扣
    rect(img, 15, 12, 16, 13, N.MN_LAMP)

    # —— 手臂 ——
    # 左臂（下垂）
    rect(img, 6, 13, 7, 20, N.MN_SHIRT)
    vline(img, 6, 13, 20, N.MN_SHIRT_S)
    rect(img, 6, 21, 7, 23, C.SKIN)
    px(img, 6, 23, C.SKIN_SHADOW)
    # 右臂（扶镐）
    rect(img, 24, 12, 25, 20, N.MN_SHIRT)
    vline(img, 25, 12, 20, N.MN_SHIRT_S)
    rect(img, 24, 21, 25, 23, C.SKIN)

    # —— 镐（竖扛右肩，x 26-27）——
    vline(img, 26, 3, 24, N.MN_HANDLE)
    vline(img, 27, 3, 24, N.MN_HANDLE_S)
    # 镐头（弧形朝左）
    rect(img, 21, 0, 28, 2, N.MN_PICK)
    px(img, 20, 1, N.MN_PICK)
    hline(img, 22, 27, 2, N.MN_PICK_S)
    px(img, 28, 1, N.MN_PICK_S)
    px(img, 21, 0, N.MN_PICK_S)
    # 右手握柄
    rect(img, 25, 20, 27, 22, C.SKIN)

    # —— 头：胡子 + 安全帽 ——
    draw_face_down_32(img, skin=C.SKIN, hair=N.MN_HAIR, hair_mid=None, hair_s=N.MN_HAIR_S,
                      eye_y=9, left_eye_x=12, right_eye_x=18,
                      brow=True, nose=True, mouth=True, cheek=False,
                      beard=True, beard_long=False)
    # 脖子
    rect(img, 13, 14, 18, 16, C.SKIN_SHADOW)

    # 黄色安全帽（盖头顶 y 0-5）
    rect(img, 9, 0, 22, 1, N.MN_HELMET)
    rect(img, 8, 2, 23, 3, N.MN_HELMET)
    hline(img, 8, 23, 4, N.MN_HELMET_MID)
    rect(img, 7, 5, 24, 5, N.MN_HELMET_SHADOW)
    hline(img, 7, 24, 4, N.MN_HELMET_MID)
    px(img, 8, 4, N.MN_HELMET_MID)
    px(img, 23, 4, N.MN_HELMET_MID)
    # 帽脊高光
    hline(img, 12, 16, 0, N.MN_HELMET_LIGHT)
    hline(img, 11, 14, 1, N.MN_HELMET_LIGHT)
    # 帽前矿灯
    rect(img, 14, 1, 17, 2, N.MN_LAMP)
    px(img, 15, 1, (250, 250, 235, 255))
    px(img, 16, 1, (250, 250, 235, 255))

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 花匠小梅（idle down）：麦色草帽 + 粉裙 + 绿围裙 + 手捧花束
# ============================================================================
def npc_gardener_frame_32() -> Image.Image:
    img = blank_sprite()

    # —— 鞋 ——
    rect(img, 10, 30, 14, 31, N.GD_SHOE)
    rect(img, 17, 30, 21, 31, N.GD_SHOE)
    hline(img, 10, 14, 31, (82, 52, 38, 255))
    hline(img, 17, 21, 31, (82, 52, 38, 255))

    # —— 露脚踝 ——
    rect(img, 10, 29, 14, 29, C.SKIN)
    rect(img, 17, 29, 21, 29, C.SKIN)

    # —— 粉裙（A 字）——
    rect(img, 9, 21, 22, 27, N.GD_DRESS)
    vline(img, 9, 21, 27, N.GD_DRESS_S)
    vline(img, 22, 21, 27, N.GD_DRESS_S)
    for x in range(9, 23):
        depth = 1 if x % 4 == 1 else 0
        px(img, x, 27 + depth, N.GD_DRESS_S)
    hline(img, 9, 22, 28, N.GD_DRESS_S)
    # 裙褶
    for x in (12, 15, 18):
        for y in range(22, 27):
            if (y - 22) % 2 == 0:
                px(img, x, y, N.GD_DRESS_S)

    # —— 绿围裙（覆盖胸前到裙上）——
    rect(img, 10, 13, 21, 23, N.GD_APRON)
    vline(img, 10, 13, 23, N.GD_APRON_S)
    vline(img, 21, 13, 23, N.GD_APRON_S)
    hline(img, 10, 21, 23, N.GD_APRON_S)
    # 围裙小花朵图案
    for fx, fy in [(12, 16), (19, 16), (12, 20), (19, 20)]:
        px(img, fx, fy, N.GD_FLOWER_RED)
        px(img, fx - 1, fy, N.GD_FLOWER_RED)
        px(img, fx + 1, fy, N.GD_FLOWER_RED)
        px(img, fx, fy - 1, N.GD_FLOWER_RED)
        px(img, fx, fy + 1, N.GD_FLOWER_RED)
        px(img, fx, fy, N.GD_FLOWER_C)
    # 围裙背带
    for step in range(3):
        px(img, 10 + step, 13 - step, N.GD_APRON)
        px(img, 21 - step, 13 - step, N.GD_APRON)

    # —— 手臂 ——
    rect(img, 5, 15, 7, 19, N.GD_DRESS)
    vline(img, 5, 15, 19, N.GD_DRESS_S)
    rect(img, 5, 20, 7, 22, C.SKIN)
    rect(img, 24, 15, 26, 19, N.GD_DRESS)
    vline(img, 26, 15, 19, N.GD_DRESS_S)
    rect(img, 24, 20, 26, 22, C.SKIN)

    # —— 手中花束（胸前下方）——
    vline(img, 15, 19, 21, N.GD_LEAF)
    vline(img, 16, 19, 21, N.GD_LEAF)
    px(img, 14, 20, N.GD_LEAF)
    px(img, 17, 20, N.GD_LEAF)
    for fx, fy in [(15, 18), (16, 18), (15, 17), (16, 17)]:
        px(img, fx, fy, N.GD_FLOWER)
    px(img, 15, 18, N.GD_FLOWER_C)
    px(img, 16, 17, N.GD_FLOWER_C)

    # —— 头：草帽 + 棕发 ——
    draw_face_down_32(img, skin=C.SKIN, hair=N.GD_HAIR, hair_mid=None, hair_s=N.GD_HAIR_S,
                      eye_y=9, left_eye_x=12, right_eye_x=18,
                      brow=True, nose=True, mouth=True, cheek=True)
    # 脖子
    rect(img, 13, 14, 18, 16, C.SKIN)
    hline(img, 13, 18, 16, C.SKIN_SHADOW)

    # 麦色宽檐草帽
    rect(img, 11, 0, 20, 3, N.GD_HAT)
    hline(img, 12, 19, 3, N.GD_HAT_S)
    hline(img, 13, 16, 1, N.GD_HAT_MID)
    rect(img, 6, 4, 25, 5, N.GD_HAT)
    hline(img, 6, 25, 4, N.GD_HAT_MID)
    hline(img, 6, 25, 6, N.GD_HAT_S)
    # 帽带
    hline(img, 7, 24, 4, N.GD_HAT_BAND)
    # 帽檐下投影（遮住眉骨上方）
    hline(img, 8, 23, 7, (170, 144, 92, 255))

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 冒险家阿飞（idle down）：棕探险帽 + 苔绿夹克 + 斜挎包 + 佩剑
# ============================================================================
def npc_adventurer_frame_32() -> Image.Image:
    img = blank_sprite()

    # —— 靴子 ——
    rect(img, 9, 29, 14, 31, N.AV_BOOT)
    rect(img, 17, 29, 22, 31, N.AV_BOOT)
    hline(img, 9, 14, 29, (104, 80, 54, 255))
    hline(img, 17, 22, 29, (104, 80, 54, 255))
    hline(img, 9, 14, 31, (38, 28, 20, 255))
    hline(img, 17, 22, 31, (38, 28, 20, 255))

    # —— 卡其裤 ——
    rect(img, 10, 23, 14, 28, N.AV_PANTS)
    vline(img, 10, 23, 28, N.AV_PANTS_S)
    rect(img, 17, 23, 21, 28, N.AV_PANTS)
    vline(img, 21, 23, 28, N.AV_PANTS_S)
    hline(img, 10, 14, 28, N.AV_PANTS_S)
    hline(img, 17, 21, 28, N.AV_PANTS_S)
    # 中缝
    for y in range(23, 29):
        px(img, 12, y, N.AV_PANTS_S) if (y - 23) % 2 == 0 else None
        px(img, 19, y, N.AV_PANTS_S) if (y - 23) % 2 == 1 else None

    # —— 苔绿夹克 ——
    rect(img, 7, 11, 24, 23, N.AV_JACKET)
    vline(img, 7, 11, 23, N.AV_JACKET_S)
    vline(img, 24, 11, 23, N.AV_JACKET_S)
    hline(img, 7, 24, 23, N.AV_JACKET_S)
    hline(img, 7, 24, 22, N.AV_JACKET_MID)
    # 前襟开合
    for y in range(12, 21):
        px(img, 15, y, N.AV_JACKET_S)
        px(img, 16, y, N.AV_JACKET_S)
    # 红领巾
    rect(img, 12, 11, 19, 12, N.AV_SCARF)
    px(img, 12, 11, (170, 72, 54, 255))
    px(img, 19, 11, (170, 72, 54, 255))

    # —— 腰带 ——
    hline(img, 8, 23, 20, N.AV_BELT)
    hline(img, 8, 23, 21, N.AV_BELT)
    rect(img, 14, 20, 17, 21, N.AV_BUCKLE)
    box_outline(img, 14, 20, 17, 21, (202, 162, 60, 255))

    # —— 斜挎包（左腰）——
    rect(img, 9, 16, 13, 20, N.AV_BAG)
    box_outline(img, 9, 16, 13, 20, N.AV_BAG_S)
    px(img, 11, 18, N.AV_BAG_S)
    # 背带（斜）
    for step in range(7):
        px(img, 14 - step, 13 + step, N.AV_BAG)

    # —— 手臂 ——
    # 左臂（下垂）
    rect(img, 5, 14, 7, 20, N.AV_JACKET)
    vline(img, 5, 14, 20, N.AV_JACKET_S)
    rect(img, 5, 21, 7, 23, C.SKIN)
    # 右臂（撑剑柄）
    rect(img, 23, 14, 25, 20, N.AV_JACKET)
    vline(img, 25, 14, 20, N.AV_JACKET_S)
    rect(img, 23, 21, 25, 23, C.SKIN)

    # —— 佩剑（远右侧斜挎）——
    for step in range(6):
        px(img, 26 + step, 18 + step, N.AV_SWORD)
        px(img, 26 + step, 19 + step, N.AV_SWORD_S)
    px(img, 26, 17, N.AV_GUARD)
    px(img, 27, 17, N.AV_GUARD)

    # —— 头：探险帽 + 金发 ——
    draw_face_down_32(img, skin=C.SKIN, hair=N.AV_HAIR, hair_mid=None, hair_s=N.AV_HAIR_S,
                      eye_y=9, left_eye_x=12, right_eye_x=18,
                      brow=True, nose=True, mouth=True, cheek=False)
    # 脖子
    rect(img, 13, 14, 18, 16, C.SKIN)
    hline(img, 13, 18, 16, C.SKIN_SHADOW)

    # 棕色探险帽（前檐上翘）
    rect(img, 8, 0, 23, 3, N.AV_HAT)
    hline(img, 8, 23, 3, N.AV_HAT_MID)
    hline(img, 12, 16, 1, (176, 130, 78, 255))
    rect(img, 5, 4, 26, 5, N.AV_HAT)
    hline(img, 5, 26, 6, N.AV_HAT_S)
    hline(img, 6, 25, 4, N.AV_HAT_S)
    px(img, 5, 4, N.AV_HAT_MID)
    px(img, 5, 5, N.AV_HAT_MID)
    px(img, 26, 4, N.AV_HAT_MID)
    px(img, 26, 5, N.AV_HAT_MID)

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 木匠老周（idle down）：深棕短发 + 米灰工装衬衫 + 棕色工作围裙 + 工具腰包
# 视觉方向（制作人 2026-08-07 拍板）：40~50 岁男性乡镇手艺人，温和沉默，
# 不要白胡子老人 / 大斧头伐木工 / 欧美木匠形象。
# ============================================================================
def npc_carpenter_frame_32() -> Image.Image:
    img = blank_sprite()

    # —— 靴子 ——
    rect(img, 9, 29, 14, 31, N.CP_BOOT)
    hline(img, 9, 14, 29, N.CP_BOOT_L)
    hline(img, 9, 14, 31, (40, 26, 16, 255))
    rect(img, 17, 29, 22, 31, N.CP_BOOT)
    hline(img, 17, 22, 29, N.CP_BOOT_L)
    hline(img, 17, 22, 31, (40, 26, 16, 255))
    px(img, 12, 31, (56, 38, 26, 255))
    px(img, 19, 31, (56, 38, 26, 255))

    # —— 深灰蓝工装裤 ——
    rect(img, 10, 23, 14, 28, N.CP_PANTS)
    vline(img, 10, 23, 28, N.CP_PANTS_S)
    vline(img, 14, 23, 28, N.CP_PANTS_S)
    rect(img, 17, 23, 21, 28, N.CP_PANTS)
    vline(img, 17, 23, 28, N.CP_PANTS_S)
    vline(img, 21, 23, 28, N.CP_PANTS_S)
    hline(img, 10, 14, 28, N.CP_PANTS_S)
    hline(img, 17, 21, 28, N.CP_PANTS_S)
    # 裤中缝
    for y in range(23, 29):
        px(img, 12, y, N.CP_PANTS_S) if (y - 23) % 2 == 0 else None
        px(img, 19, y, N.CP_PANTS_S) if (y - 23) % 2 == 1 else None

    # —— 米灰工装衬衫 ——
    rect(img, 7, 11, 24, 22, N.CP_SHIRT)
    vline(img, 7, 11, 22, N.CP_SHIRT_S)
    vline(img, 24, 11, 22, N.CP_SHIRT_S)
    hline(img, 7, 24, 22, N.CP_SHIRT_S)
    # 前襟开合（暗缝线）
    for y in range(13, 21):
        px(img, 15, y, N.CP_SHIRT_S) if y % 2 == 0 else px(img, 16, y, N.CP_SHIRT_S)
    # 衣领
    rect(img, 13, 11, 18, 12, N.CP_COLLAR)
    px(img, 12, 11, N.CP_SHIRT_S)
    px(img, 19, 11, N.CP_SHIRT_S)
    # 左胸口袋（略倾斜，工具感）
    box_outline(img, 9, 14, 13, 18, N.CP_SHIRT_S)
    px(img, 11, 15, N.CP_SHIRT_MID)
    px(img, 11, 17, N.CP_SHIRT_MID)

    # —— 棕色工作围裙（覆盖胸前到大腿）——
    rect(img, 10, 13, 21, 24, N.CP_APRON)
    vline(img, 10, 13, 24, N.CP_APRON_S)
    vline(img, 21, 13, 24, N.CP_APRON_S)
    hline(img, 10, 21, 24, N.CP_APRON_S)
    # 围裙竖向浅条纹（2 条）
    for x in (13, 18):
        for y in range(14, 24):
            px(img, x, y, N.CP_APRON_STRIPE) if (y - 14) % 3 == 0 else None
    # 围裙上沿小翻边
    hline(img, 10, 21, 13, N.CP_APRON_MID)
    # 围裙上的木屑痕迹（浅木色小点，示意干活沾了木屑）
    for sx, sy in [(14, 16), (20, 18), (12, 20), (18, 22), (15, 19)]:
        px(img, sx, sy, N.CP_WOODCHIP)

    # —— 工具腰带（深棕皮革，压住围裙下沿）——
    hline(img, 9, 22, 23, N.CP_BELT)
    hline(img, 9, 22, 24, N.CP_BELT)

    # —— 工具腰包 + 工具（右侧腰间，木匠身份识别）——
    # 腰包（皮革小袋，挂在腰带上）
    rect(img, 21, 20, 25, 23, N.CP_TOOL_LEATHER)
    px(img, 22, 20, (88, 58, 34, 255))
    px(img, 24, 20, (88, 58, 34, 255))
    # 袋口封边
    hline(img, 21, 25, 20, N.CP_TOOL_LEATHER)
    # 露出的木柄（从腰包向上，斜插）
    for step in range(4):
        px(img, 23 - step, 18 + step, N.CP_TOOL_WOOD)
    # 金属工具头（锤头，贴在腰包侧面）
    rect(img, 25, 18, 26, 20, N.CP_TOOL_METAL)
    px(img, 25, 21, N.CP_TOOL_METAL)
    px(img, 26, 21, N.CP_TOOL_METAL)

    # —— 手臂 ——
    # 左臂（下垂，袖口卷起露手腕）
    rect(img, 6, 13, 7, 20, N.CP_SHIRT)
    vline(img, 6, 13, 20, N.CP_SHIRT_S)
    rect(img, 6, 21, 7, 23, C.SKIN)
    px(img, 6, 23, C.SKIN_SHADOW)
    # 右臂（略前伸，扶工具）
    rect(img, 24, 12, 25, 20, N.CP_SHIRT)
    vline(img, 25, 12, 20, N.CP_SHIRT_S)
    rect(img, 24, 21, 25, 23, C.SKIN)

    # —— 头：深棕短发 + 略有白发 ——
    draw_face_down_32(img, skin=C.SKIN, hair=N.CP_HAIR, hair_mid=N.CP_HAIR_MID, hair_s=N.CP_HAIR_S,
                      eye_y=9, left_eye_x=12, right_eye_x=18,
                      brow=True, nose=True, mouth=True, cheek=False)
    # 脖子
    rect(img, 13, 14, 18, 16, C.SKIN_SHADOW)

    # 头顶短发（y 0-5，不戴帽，乡镇手艺人）
    rect(img, 9, 0, 22, 1, N.CP_HAIR)
    rect(img, 8, 2, 23, 3, N.CP_HAIR)
    hline(img, 8, 23, 4, N.CP_HAIR_MID)
    hline(img, 8, 23, 5, N.CP_HAIR_S)
    # 短发侧沿
    px(img, 7, 3, N.CP_HAIR_MID)
    px(img, 24, 3, N.CP_HAIR_MID)
    px(img, 7, 4, N.CP_HAIR_S)
    px(img, 24, 4, N.CP_HAIR_S)
    # 头顶略有白发（几缕灰白发绺，体现 40~50 岁）
    px(img, 11, 0, N.CP_GRAY_HAIR)
    px(img, 14, 0, N.CP_GRAY_HAIR)
    px(img, 19, 0, N.CP_GRAY_HAIR)
    px(img, 13, 2, N.CP_GRAY_HAIR)
    px(img, 17, 2, N.CP_GRAY_HAIR)
    # 鬓角略花白
    px(img, 8, 6, N.CP_GRAY_HAIR)
    px(img, 23, 6, N.CP_GRAY_HAIR)

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 矿脉贴图（32×32）
# ============================================================================
def _ore_base(img: Image.Image) -> None:
    """石块群底子（共用）。"""
    # 主石三块交叠
    rect(img, 6, 10, 20, 26, N.OR_STONE)
    rect(img, 14, 8, 27, 24, N.OR_STONE_MID)
    rect(img, 10, 4, 23, 12, N.OR_STONE)
    # 阴影（底 + 右侧）
    hline(img, 6, 20, 26, N.OR_STONE_DARK)
    vline(img, 20, 10, 26, N.OR_STONE_DARK)
    hline(img, 14, 27, 24, N.OR_STONE_DARK)
    vline(img, 27, 8, 24, N.OR_STONE_DARK)
    hline(img, 10, 23, 12, N.OR_STONE_DARK)
    # 高光（左上）
    hline(img, 6, 9, 10, N.OR_STONE_LIGHT)
    px(img, 10, 4, N.OR_STONE_LIGHT)
    px(img, 8, 12, N.OR_STONE_LIGHT)
    px(img, 24, 10, N.OR_STONE_LIGHT)
    # 裂纹
    vline(img, 13, 13, 26, N.OR_STONE_DARK)
    for y in range(13, 25):
        px(img, 14, y, N.OR_STONE_DARK) if (y - 13) % 3 == 0 else None
    for y in range(10, 24):
        px(img, 23, y, N.OR_STONE_DARK) if (y - 10) % 3 == 1 else None
    # 散落碎石
    px(img, 4, 20, N.OR_STONE_MID)
    px(img, 5, 22, N.OR_STONE_DARK)
    px(img, 28, 16, N.OR_STONE)
    px(img, 29, 18, N.OR_STONE_DARK)
    px(img, 9, 27, N.OR_STONE_MID)


def _ore_crystals(img: Image.Image, crystal, crystal_light) -> None:
    """在岩面上嵌 4 颗菱形晶体。"""
    for cx, cy in [(11, 13), (19, 9), (24, 17), (15, 21)]:
        for dx, dy in [(0, 0), (-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1)]:
            px(img, cx + dx, cy + dy, crystal)
        px(img, cx, cy, crystal_light)
        px(img, cx - 1, cy - 1, crystal_light)


def ore_stone_32() -> Image.Image:
    img = Image.new("RGBA", (32, 32), C.TRANSPARENT)
    _ore_base(img)
    add_outline(img, C.OUTLINE)
    return img


def ore_copper_32() -> Image.Image:
    img = Image.new("RGBA", (32, 32), C.TRANSPARENT)
    _ore_base(img)
    _ore_crystals(img, N.OR_COPPER, N.OR_COPPER_LIGHT)
    add_outline(img, C.OUTLINE)
    return img


def ore_iron_32() -> Image.Image:
    img = Image.new("RGBA", (32, 32), C.TRANSPARENT)
    _ore_base(img)
    _ore_crystals(img, N.OR_IRON, N.OR_IRON_LIGHT)
    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 主入口
# ============================================================================
def main() -> None:
    os.makedirs(SPRITE_DIR, exist_ok=True)

    outputs = [
        ("npc_miner.png", npc_miner_frame_32(), "矿工老张 idle down"),
        ("npc_gardener.png", npc_gardener_frame_32(), "花匠小梅 idle down"),
        ("npc_adventurer.png", npc_adventurer_frame_32(), "冒险家阿飞 idle down"),
        ("npc_carpenter.png", npc_carpenter_frame_32(), "木匠老周 idle down"),
        ("ore_stone.png", ore_stone_32(), "石头矿脉"),
        ("ore_copper.png", ore_copper_32(), "铜矿脉"),
        ("ore_iron.png", ore_iron_32(), "铁矿脉"),
    ]
    for name, img, desc in outputs:
        out = os.path.join(SPRITE_DIR, name)
        img.save(out)
        print(f"[OK] {name}  {img.size}  ({desc})")

    print("\n全部完成！输出目录：")
    print(f"  {SPRITE_DIR}")
    print("\n后续接线（不在本次改动范围）：")
    print("  - NPCSystem.ts: miner/gardener/adventurer 的 textureKey 改指向新图")
    print("  - MapScene.ts preload: 增加 npc_miner/npc_gardener/npc_adventurer 的 load.image")
    print("  - MapScene.ts setupOres: add.ellipse 替换为 add.image + 对应贴图")


if __name__ == "__main__":
    main()
