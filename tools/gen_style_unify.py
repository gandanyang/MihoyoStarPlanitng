# -*- coding: utf-8 -*-
"""
像素美术风格统一脚本（v4 — 消除旧平滑风）
========================================
把 gen_xiya.py / gen_crops.py / gen_woodcutting_assets.py 时代遗留的
ImageDraw 平滑风资源（树/斧/木/夏雅）重绘为 gen_sprite_assets.py 的 v2 像素风：
  - 32×32 手绘像素矩阵
  - 1px 深色外描边（add_outline）
  - 复用统一调色板（C + 本脚本新增）
  - 左上光源、右下投影

生成（覆盖同名文件）：
  public/assets/sprites/tree1.png        阔叶树 (32x32)
  public/assets/sprites/tree2.png        松树   (32x32)
  public/assets/sprites/stump.png        树桩   (32x32)
  public/assets/sprites/old_axe.png      旧斧头 (32x32)
  public/assets/sprites/wood.png         木材   (32x32)
  public/assets/sprites/npc_xiya.png     夏雅   (32x32)

运行：  python tools/gen_style_unify.py
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


class T:
    """树/木/斧/夏雅配色（与 C 类同风格，语义命名）。"""

    # —— 阔叶树 ——
    LEAF_MAIN = (42, 112, 34, 255)
    LEAF_MID = (56, 136, 44, 255)
    LEAF_DARK = (30, 88, 26, 255)
    LEAF_HI = (88, 170, 60, 255)
    # —— 松树 ——
    PINE_MAIN = (18, 66, 20, 255)
    PINE_MID = (26, 90, 28, 255)
    PINE_DARK = (12, 48, 16, 255)
    PINE_HI = (48, 126, 44, 255)
    # —— 树干/树桩 ——
    TRUNK = (98, 64, 34, 255)
    TRUNK_DARK = (76, 48, 26, 255)
    TRUNK_LIGHT = (124, 88, 48, 255)
    STUMP_TOP = (168, 128, 70, 255)
    STUMP_TOP_L = (186, 148, 86, 255)
    STUMP_TOP_D = (140, 102, 54, 255)
    STUMP_RING = (110, 76, 38, 255)
    # —— 斧头 ——
    AXE_STEEL = (170, 172, 182, 255)
    AXE_DARK = (118, 122, 134, 255)
    AXE_LIGHT = (206, 210, 220, 255)
    AXE_RUST = (168, 110, 60, 255)
    HANDLE = (142, 98, 56, 255)
    HANDLE_DARK = (116, 78, 44, 255)
    HANDLE_LIGHT = (170, 126, 76, 255)
    # —— 木材 ——
    WOOD_MAIN = (152, 110, 56, 255)
    WOOD_MID = (170, 130, 72, 255)
    WOOD_DARK = (122, 86, 42, 255)
    WOOD_LIGHT = (196, 156, 96, 255)
    RING = (104, 72, 36, 255)
    # —— 夏雅（镇长助理/机械维修师，20 岁：橙金短发 + 工装感，呼应对话色 #f0a050）——
    X_HAIR = (238, 158, 72, 255)          # 橙金短发主色
    X_HAIR_MID = (216, 136, 52, 255)
    X_HAIR_S = (192, 114, 40, 255)
    X_HAIR_HI = (250, 200, 120, 255)
    X_SHIRT = (246, 240, 222, 255)        # 米白工装衬衫
    X_SHIRT_S = (222, 212, 186, 255)
    X_OVERALL = (76, 96, 156, 255)        # 深蓝工装背带裤
    X_OVERALL_MID = (66, 84, 138, 255)
    X_OVERALL_S = (56, 72, 118, 255)
    X_BELT = (90, 62, 34, 255)            # 工具腰带
    X_BUCKLE = (255, 212, 92, 255)        # 金属扣
    X_TOOL = (170, 172, 182, 255)         # 腰间工具（金属灰）
    X_TOOL_S = (118, 122, 134, 255)
    X_BOOT = (120, 84, 56, 255)           # 棕色短靴
    X_BOOT_S = (94, 62, 40, 255)


# ============================================================================
# 像素圆/三角辅助（旧 ImageDraw 平滑形的像素化替代）
# ============================================================================
def fill_circle(img: Image.Image, cx: int, cy: int, r: int, color) -> None:
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                px(img, cx + dx, cy + dy, color)


def fill_triangle(img: Image.Image, x0: int, y0: int, x1: int, y1: int, color) -> None:
    """上宽下收的等腰三角形（松树冠），顶点 (x0,y0)，底边 y1 处宽 2*dx 内缩。"""
    top_w = 2
    for y in range(y0, y1 + 1):
        half = max(1, top_w + ((y - y0) * (x0 - top_w)) // (y1 - y0))
        for x in range(x0 - half, x0 + half + 1):
            px(img, x, y, color)


# ============================================================================
# 阔叶树（树冠团簇 + 树干）
# ============================================================================
def tree1_frame_32() -> Image.Image:
    img = blank_sprite()
    # 树冠：三大团 + 高光 + 暗部
    fill_circle(img, 16, 9, 11, T.LEAF_DARK)
    fill_circle(img, 12, 7, 8, T.LEAF_MAIN)
    fill_circle(img, 20, 8, 8, T.LEAF_MAIN)
    fill_circle(img, 16, 5, 7, T.LEAF_MID)
    # 高光（左上）
    fill_circle(img, 13, 4, 3, T.LEAF_HI)
    px(img, 12, 3, T.LEAF_HI)
    px(img, 17, 3, T.LEAF_HI)
    # 树冠底部凹凸
    px(img, 7, 13, T.LEAF_DARK)
    px(img, 25, 13, T.LEAF_DARK)
    px(img, 9, 15, T.LEAF_DARK)
    px(img, 23, 15, T.LEAF_DARK)
    px(img, 13, 17, T.LEAF_DARK)
    px(img, 19, 17, T.LEAF_DARK)
    # 树干（y 16-30）
    rect(img, 13, 16, 19, 30, T.TRUNK)
    vline(img, 13, 16, 30, T.TRUNK_DARK)
    vline(img, 19, 16, 30, T.TRUNK_DARK)
    vline(img, 14, 16, 30, T.TRUNK_LIGHT)
    # 树皮纹理
    for y in range(18, 30):
        if (y - 18) % 4 == 0:
            px(img, 15, y, T.TRUNK_DARK)
            px(img, 18, y, T.TRUNK_DARK)
    # 树根（底部分叉）
    px(img, 12, 29, T.TRUNK)
    px(img, 20, 29, T.TRUNK)
    px(img, 12, 30, T.TRUNK_DARK)
    px(img, 20, 30, T.TRUNK_DARK)

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 松树（三层三角冠 + 树干）
# ============================================================================
def tree2_frame_32() -> Image.Image:
    img = blank_sprite()
    # 树干
    rect(img, 14, 22, 18, 30, T.TRUNK)
    vline(img, 14, 22, 30, T.TRUNK_DARK)
    vline(img, 18, 22, 30, T.TRUNK_DARK)
    # 三层树冠（下宽上窄）
    fill_triangle(img, 16, 4, 18, 26, T.PINE_DARK)
    fill_triangle(img, 16, 2, 15, 22, T.PINE_MAIN)
    fill_triangle(img, 16, 0, 12, 16, T.PINE_MID)
    # 高光（左上侧）
    for y in range(2, 20):
        half = max(1, 2 + ((y - 0) * (12 - 2)) // 20)
        px(img, 16 - half + 1, y, T.PINE_HI)
    px(img, 13, 3, T.PINE_HI)
    px(img, 14, 4, T.PINE_HI)
    px(img, 14, 9, T.PINE_HI)
    px(img, 15, 10, T.PINE_HI)

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 树桩（顶面椭圆 + 年轮 + 侧边）
# ============================================================================
def stump_frame_32() -> Image.Image:
    img = blank_sprite()
    # 侧边（y 18-30）
    rect(img, 8, 18, 24, 30, T.TRUNK)
    vline(img, 8, 18, 30, T.TRUNK_DARK)
    vline(img, 24, 18, 30, T.TRUNK_DARK)
    hline(img, 8, 24, 30, T.TRUNK_DARK)
    # 侧边树皮纹理
    for y in range(20, 30):
        if (y - 20) % 3 == 0:
            px(img, 10, y, T.TRUNK_DARK)
            px(img, 22, y, T.TRUNK_DARK)
    # 顶面（椭圆，y 14-20）
    fill_circle(img, 16, 17, 10, T.STUMP_TOP)
    fill_circle(img, 16, 17, 8, T.STUMP_TOP_L)
    # 年轮（三圈）
    box_outline(img, 11, 12, 21, 22, T.STUMP_RING)
    box_outline(img, 13, 14, 19, 20, T.STUMP_RING)
    px(img, 16, 17, T.STUMP_RING)
    # 顶面高光
    px(img, 12, 14, T.STUMP_TOP_L)
    px(img, 13, 14, T.STUMP_TOP_L)
    px(img, 11, 15, T.STUMP_TOP_L)
    # 顶面边缘过渡到侧边
    hline(img, 9, 23, 18, T.STUMP_TOP_D)
    hline(img, 10, 22, 19, T.STUMP_TOP_D)

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 旧斧头（斜握柄 + 锈刃）
# ============================================================================
def old_axe_frame_32() -> Image.Image:
    img = blank_sprite()
    # 斧柄（对角线，左上到右下）
    for i in range(22):
        x = 12 + i // 2
        y = 26 - i // 2
        px(img, x, y, T.HANDLE)
        px(img, x, y + 1, T.HANDLE_DARK)
    px(img, 11, 26, T.HANDLE_DARK)
    px(img, 12, 27, T.HANDLE_DARK)
    # 柄高光
    px(img, 13, 25, T.HANDLE_LIGHT)
    px(img, 14, 24, T.HANDLE_LIGHT)
    px(img, 15, 23, T.HANDLE_LIGHT)
    px(img, 16, 22, T.HANDLE_LIGHT)
    # 柄尾（y 26-30）
    rect(img, 13, 26, 15, 30, T.HANDLE)
    hline(img, 13, 15, 30, T.HANDLE_DARK)
    # 斧头金属（大头，左上）
    rect(img, 5, 5, 14, 12, T.AXE_STEEL)
    vline(img, 5, 5, 12, T.AXE_DARK)
    # 斧刃（右下弧面，亮）
    for dy in range(0, 7):
        for dx in range(0, 6 - dy):
            px(img, 13 - dx, 13 + dy, T.AXE_STEEL)
    # 斧刃高光
    px(img, 10, 11, T.AXE_LIGHT)
    px(img, 11, 10, T.AXE_LIGHT)
    px(img, 12, 9, T.AXE_LIGHT)
    px(img, 9, 12, T.AXE_LIGHT)
    # 斧背（左下）阴影
    for y in range(8, 13):
        px(img, 5, y, T.AXE_DARK)
    px(img, 5, 7, T.AXE_DARK)
    # 锈迹
    px(img, 8, 6, T.AXE_RUST)
    px(img, 7, 8, T.AXE_RUST)
    px(img, 9, 7, T.AXE_RUST)
    px(img, 6, 10, T.AXE_RUST)
    # 斧头与柄连接处
    px(img, 12, 12, T.AXE_DARK)
    px(img, 13, 12, T.AXE_DARK)

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 木材（堆叠原木，端面圆环）
# ============================================================================
def wood_frame_32() -> Image.Image:
    img = blank_sprite()
    # 下层原木（横放）
    fill_circle(img, 16, 25, 5, T.WOOD_MID)   # 端面（正对镜头）
    # 原木主体（y 20-30）
    rect(img, 7, 21, 25, 29, T.WOOD_MAIN)
    hline(img, 7, 25, 21, T.WOOD_LIGHT)
    hline(img, 7, 25, 29, T.WOOD_DARK)
    vline(img, 7, 21, 29, T.WOOD_DARK)
    vline(img, 25, 21, 29, T.WOOD_DARK)
    # 木纹
    for x in range(8, 25):
        if (x - 8) % 5 == 0:
            px(img, x, 24, T.WOOD_DARK)
            px(img, x, 26, T.WOOD_DARK)
    # 上层原木（端面）
    fill_circle(img, 10, 16, 5, T.WOOD_MID)
    # 端面年轮
    box_outline(img, 6, 12, 14, 20, T.RING)
    box_outline(img, 8, 14, 12, 18, T.RING)
    px(img, 10, 16, T.RING)
    # 端面高光
    px(img, 7, 13, T.WOOD_LIGHT)
    px(img, 8, 13, T.WOOD_LIGHT)
    # 上层原木主体（后方，y 11-21）
    rect(img, 3, 12, 17, 20, T.WOOD_MAIN)
    hline(img, 3, 17, 12, T.WOOD_LIGHT)
    hline(img, 3, 17, 20, T.WOOD_DARK)
    # 上层木纹
    for x in range(4, 17):
        if (x - 4) % 5 == 0:
            px(img, x, 16, T.WOOD_DARK)
    # 上层原木主体端面圈（左端，侧视）
    fill_circle(img, 3, 16, 5, T.WOOD_MID)
    box_outline(img, 0, 12, 6, 20, T.RING)

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 夏雅（v2 像素风：橙金短发少女 + 深蓝工装背带裤 + 工具腰带）
# ============================================================================
def npc_xiya_frame_32() -> Image.Image:
    img = blank_sprite()

    # —— 棕色短靴 ——
    rect(img, 10, 29, 14, 31, T.X_BOOT)
    rect(img, 17, 29, 21, 31, T.X_BOOT)
    hline(img, 10, 14, 31, T.X_BOOT_S)
    hline(img, 17, 21, 31, T.X_BOOT_S)
    hline(img, 10, 14, 29, (150, 108, 74, 255))
    hline(img, 17, 21, 29, (150, 108, 74, 255))

    # —— 工装背带裤（深蓝）—— 腿 y 23-28
    rect(img, 10, 23, 14, 28, T.X_OVERALL)
    rect(img, 17, 23, 21, 28, T.X_OVERALL)
    vline(img, 10, 23, 28, T.X_OVERALL_S)
    vline(img, 14, 23, 28, T.X_OVERALL_MID)
    vline(img, 17, 23, 28, T.X_OVERALL_MID)
    vline(img, 21, 23, 28, T.X_OVERALL_S)
    hline(img, 10, 14, 28, T.X_OVERALL_S)
    hline(img, 17, 21, 28, T.X_OVERALL_S)
    # 裤中缝
    for y in range(23, 29):
        px(img, 12, y, T.X_OVERALL_S) if (y - 23) % 2 == 0 else None
        px(img, 19, y, T.X_OVERALL_S) if (y - 23) % 2 == 1 else None

    # —— 米白工装衬衫（y 11-22）——
    rect(img, 7, 11, 24, 22, T.X_SHIRT)
    vline(img, 7, 11, 22, T.X_SHIRT_S)
    vline(img, 24, 11, 22, T.X_SHIRT_S)
    hline(img, 7, 24, 22, T.X_SHIRT_S)
    # 衬衫开襟 + 纽扣
    for y in range(12, 21):
        px(img, 15, y, T.X_SHIRT_S)
        px(img, 16, y, T.X_SHIRT_S)
    for y in (14, 17, 20):
        px(img, 15, y, T.X_OVERALL_MID)
        px(img, 16, y, T.X_OVERALL_MID)
    # 衬衫领
    rect(img, 13, 11, 18, 12, (252, 248, 234, 255))
    px(img, 12, 11, T.X_SHIRT_S)
    px(img, 19, 11, T.X_SHIRT_S)

    # —— 工具腰带（深棕，y 20-21）——
    hline(img, 8, 23, 20, T.X_BELT)
    hline(img, 8, 23, 21, T.X_BELT)
    # 金属扣
    rect(img, 15, 20, 16, 21, T.X_BUCKLE)
    box_outline(img, 15, 20, 16, 21, (200, 160, 60, 255))
    # 腰间工具（左腰挂扳手，金属灰）
    rect(img, 9, 18, 11, 20, T.X_TOOL)
    rect(img, 9, 20, 11, 21, T.X_TOOL_S)
    px(img, 9, 17, T.X_TOOL)
    px(img, 11, 18, T.X_TOOL_S)
    # 右腰工具兜（深棕）
    rect(img, 20, 18, 22, 21, T.X_BELT)
    px(img, 21, 20, T.X_BUCKLE)
    px(img, 21, 19, (200, 160, 60, 255))

    # —— 工装背带（深蓝，交叉搭在衬衫上）——
    for step in range(3):
        px(img, 11 + step, 12 + step, T.X_OVERALL)
        px(img, 11 + step, 12 + step - 1, T.X_OVERALL_MID)
        px(img, 20 - step, 12 + step, T.X_OVERALL)
        px(img, 20 - step, 12 + step - 1, T.X_OVERALL_MID)
    # 胸前金属扣（两处背带扣）
    px(img, 12, 12, T.X_BUCKLE)
    px(img, 19, 12, T.X_BUCKLE)
    px(img, 13, 13, T.X_BUCKLE)
    px(img, 18, 13, T.X_BUCKLE)

    # —— 手臂（衬衫袖 + 皮肤手）——
    rect(img, 5, 14, 7, 19, T.X_SHIRT)
    vline(img, 5, 14, 19, T.X_SHIRT_S)
    rect(img, 5, 20, 7, 22, C.SKIN)
    rect(img, 24, 14, 26, 19, T.X_SHIRT)
    vline(img, 26, 14, 19, T.X_SHIRT_S)
    rect(img, 24, 20, 26, 22, C.SKIN)
    px(img, 5, 22, C.SKIN_SHADOW)
    px(img, 26, 22, C.SKIN_SHADOW)

    # —— 头：橙金短发 + 脸 ——
    draw_face_down_32(img, skin=C.SKIN, hair=T.X_HAIR, hair_mid=T.X_HAIR_MID, hair_s=T.X_HAIR_S,
                      eye_y=9, left_eye_x=12, right_eye_x=18,
                      brow=True, nose=True, mouth=True, cheek=True)
    # 脖子
    rect(img, 13, 14, 18, 16, C.SKIN)
    hline(img, 13, 18, 16, C.SKIN_SHADOW)

    # 头顶短发
    rect(img, 9, 0, 22, 1, T.X_HAIR)
    rect(img, 8, 2, 23, 3, T.X_HAIR)
    # 头顶分缝
    vline(img, 15, 0, 3, T.X_HAIR_S)
    vline(img, 16, 0, 3, T.X_HAIR_S)
    # 头顶高光绺
    for x in (11, 14, 17, 20):
        px(img, x, 1, T.X_HAIR_HI)
    px(img, 12, 2, T.X_HAIR_HI)
    px(img, 19, 2, T.X_HAIR_HI)
    # 两侧短发（耳下俏皮外翘）
    for y in range(4, 11):
        px(img, 7, y, T.X_HAIR)
        px(img, 24, y, T.X_HAIR)
        if (y - 4) % 3 == 0:
            px(img, 7, y, T.X_HAIR_MID)
            px(img, 24, y, T.X_HAIR_MID)
    px(img, 7, 11, T.X_HAIR_S)
    px(img, 24, 11, T.X_HAIR_S)
    # 鬓角发尖
    px(img, 8, 5, T.X_HAIR_MID)
    px(img, 23, 5, T.X_HAIR_MID)
    # 后颈短发梢
    for y in range(11, 14):
        px(img, 9, y, T.X_HAIR_S)
        px(img, 22, y, T.X_HAIR_S)

    # 橙金发色呼应对话色 #f0a050：刘海高光点缀
    px(img, 10, 3, T.X_HAIR_HI)
    px(img, 21, 3, T.X_HAIR_HI)
    # hair clip (v1.3: orange-gold bob + clip)
    px(img, 18, 2, (245, 150, 170, 255))
    px(img, 19, 2, (245, 150, 170, 255))
    px(img, 18, 3, (210, 120, 145, 255))
    px(img, 19, 3, (245, 150, 170, 255))

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 主入口
# ============================================================================
def main() -> None:
    os.makedirs(SPRITE_DIR, exist_ok=True)

    outputs = [
        ("tree1.png", tree1_frame_32(), "阔叶树"),
        ("tree2.png", tree2_frame_32(), "松树"),
        ("stump.png", stump_frame_32(), "树桩"),
        ("old_axe.png", old_axe_frame_32(), "旧斧头"),
        ("wood.png", wood_frame_32(), "木材"),
        ("npc_xiya.png", npc_xiya_frame_32(), "夏雅"),
    ]
    for name, img, desc in outputs:
        out = os.path.join(SPRITE_DIR, name)
        img.save(out)
        print(f"[OK] {name}  {img.size}  ({desc})")

    print("\n全部完成！风格已统一为 v2 像素风（1px 描边 + 共用调色板）。")


if __name__ == "__main__":
    main()
