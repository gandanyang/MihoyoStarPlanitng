# -*- coding: utf-8 -*-
"""
作物精灵生成脚本（v2 像素风，32×32 帧，显示 16×16）
====================================================
为 crops.png 生成 4 作物 × 3 阶段（发芽/生长/成熟）逐像素绘制。
替换旧的程序占位（椭圆堆叠），解决「成熟态统一萝卜」：
  - 成熟态由作物叠层帧（cropIdx*3+2）显示对应作物
  - farm_plot.png 帧 4 改为纯成熟土（去掉烘焙绿植，防双植物）

帧布局（crops.png 96×128）：
  行 = 作物（0 萝卜 / 1 番茄 / 2 玉米 / 3 草莓）
  列 = 阶段（0 发芽 / 1 生长 / 2 成熟）
  MapScene.updateTileVisual 用 cropIdx*3+stage 取帧。

运行：  python tools/gen_crops.py --force
安全：  默认输出 tmp/，--force 覆盖 public/assets/sprites/。
确定性：无 random，逐像素绘制，重复运行输出一致。

调色板：从 gen_item_icons.I（作物果实色）+ gen_sprite_assets.C（描边/叶片）导入，不新造 RGB。
"""

from __future__ import annotations

import argparse
import os
from PIL import Image

from gen_sprite_assets import C, px, rect, add_outline
from gen_item_icons import I

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITE_DIR = os.path.join(ROOT, "public", "assets", "sprites")
TMP_DIR = os.path.join(ROOT, "tmp")
F = 32  # 作物帧尺寸（显示时 setScale(0.5) → 16×16）

# 土壤色（与 farm_tileset gid 5 / farm_plot 一致）
SOIL = (100, 68, 44, 255)
SOIL_D = (72, 46, 26, 255)
SOIL_L = (130, 92, 60, 255)


# ============================================================================
# 基础绘制辅助
# ============================================================================
def blank() -> Image.Image:
    return Image.new("RGBA", (F, F), C.TRANSPARENT)


def ell(img: Image.Image, cx: int, cy: int, rx: int, ry: int, color) -> None:
    """实心椭圆（整数像素）。"""
    for y in range(max(0, cy - ry), min(img.height, cy + ry + 1)):
        for x in range(max(0, cx - rx), min(img.width, cx + rx + 1)):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                px(img, x, y, color)


def soil_mound(img: Image.Image) -> None:
    """底部小土堆（锚定作物，统一构图）。"""
    ell(img, 16, 27, 6, 3, SOIL)
    rect(img, 10, 28, 22, 29, SOIL_D)
    px(img, 12, 27, SOIL_L)
    px(img, 20, 27, SOIL_L)


def sprout(img: Image.Image) -> None:
    """通用发芽：土堆 + 短茎 + 两片嫩叶。"""
    soil_mound(img)
    rect(img, 15, 21, 16, 25, I.LEAF_D)
    # 左叶
    px(img, 13, 19, I.LEAF_L)
    px(img, 12, 20, I.LEAF)
    px(img, 13, 20, I.LEAF)
    px(img, 14, 20, I.LEAF_D)
    px(img, 14, 21, I.LEAF_D)
    # 右叶
    px(img, 19, 19, I.LEAF_L)
    px(img, 18, 20, I.LEAF)
    px(img, 19, 20, I.LEAF)
    px(img, 20, 20, I.LEAF_D)
    px(img, 18, 21, I.LEAF_D)


def leaf_fan(img: Image.Image, cx: int, top: int) -> None:
    """顶部三片叶扇（成熟作物用）。"""
    # 左叶
    ell(img, cx - 5, top + 3, 4, 2, I.LEAF)
    px(img, cx - 7, top + 4, I.LEAF_D)
    px(img, cx - 4, top + 2, I.LEAF_L)
    # 中叶
    ell(img, cx, top, 4, 2, I.LEAF)
    px(img, cx - 1, top - 1, I.LEAF_L)
    px(img, cx, top + 2, I.LEAF_D)
    # 右叶
    ell(img, cx + 5, top + 3, 4, 2, I.LEAF)
    px(img, cx + 7, top + 4, I.LEAF_D)
    px(img, cx + 4, top + 2, I.LEAF_L)


# ============================================================================
# 萝卜（row 0）
# ============================================================================
def radish_sprout():
    img = blank()
    sprout(img)
    add_outline(img)
    return img


def radish_growing():
    img = blank()
    soil_mound(img)
    rect(img, 15, 20, 16, 26, I.LEAF_D)      # 茎
    ell(img, 16, 24, 4, 2, I.RADISH_D)       # 萝卜顶微微露出
    px(img, 15, 23, I.RADISH)
    leaf_fan(img, 16, 14)                     # 更茂盛的叶
    add_outline(img)
    return img


def radish_mature():
    img = blank()
    # 主体：粉白萝卜（上红下白 + 根须），加宽加高以 16×16 显示可辨
    ell(img, 16, 20, 8, 5, I.RADISH)
    px(img, 12, 18, I.RADISH_L)
    px(img, 20, 23, I.RADISH_D)
    px(img, 21, 21, I.RADISH_D)
    ell(img, 16, 23, 7, 4, C.WHITE)           # 白色下半
    px(img, 16, 27, I.RADISH_D)               # 根须
    px(img, 15, 28, I.RADISH_D)
    px(img, 16, 28, I.RADISH_D)
    px(img, 17, 28, I.RADISH_D)
    leaf_fan(img, 16, 9)
    add_outline(img)
    return img


# ============================================================================
# 番茄（row 1）
# ============================================================================
def tomato_sprout():
    img = blank()
    sprout(img)
    add_outline(img)
    return img


def tomato_growing():
    img = blank()
    soil_mound(img)
    # 绿色灌木
    ell(img, 14, 19, 4, 3, I.LEAF)
    ell(img, 18, 19, 4, 3, I.LEAF_D)
    ell(img, 16, 16, 4, 3, I.LEAF)
    px(img, 14, 15, I.LEAF_L)
    px(img, 18, 20, I.LEAF_D)
    # 未熟小绿果
    px(img, 16, 21, I.LEAF_D)
    px(img, 17, 21, I.LEAF_D)
    add_outline(img)
    return img


def tomato_mature():
    img = blank()
    # 果实（加宽加高）
    ell(img, 16, 21, 8, 7, I.TOMATO)
    px(img, 11, 18, I.TOMATO_L)
    px(img, 10, 21, I.TOMATO_L)
    px(img, 20, 26, I.TOMATO_D)
    px(img, 22, 24, I.TOMATO_D)
    # 花萼 + 茎
    px(img, 14, 12, I.LEAF_D)
    px(img, 16, 11, I.LEAF_D)
    px(img, 18, 12, I.LEAF_D)
    px(img, 13, 13, I.LEAF)
    px(img, 19, 13, I.LEAF)
    px(img, 16, 9, I.LEAF_D)
    rect(img, 16, 9, 16, 11, I.LEAF_D)
    # 两侧叶
    ell(img, 10, 19, 4, 3, I.LEAF)
    ell(img, 22, 19, 4, 3, I.LEAF)
    px(img, 8, 20, I.LEAF_D)
    px(img, 24, 20, I.LEAF_D)
    add_outline(img)
    return img


# ============================================================================
# 玉米（row 2）
# ============================================================================
def corn_sprout():
    img = blank()
    sprout(img)
    add_outline(img)
    return img


def corn_growing():
    img = blank()
    soil_mound(img)
    # 高茎 + 下垂叶
    rect(img, 15, 12, 16, 27, I.LEAF_D)
    ell(img, 12, 16, 3, 2, I.LEAF)
    ell(img, 20, 18, 3, 2, I.LEAF_D)
    px(img, 10, 17, I.LEAF_D)
    px(img, 22, 19, I.LEAF_D)
    px(img, 15, 11, I.LEAF_L)
    add_outline(img)
    return img


def corn_mature():
    img = blank()
    # 高茎
    rect(img, 15, 9, 16, 29, I.LEAF_D)
    # 玉米棒（竖直黄棒 + 粒纹），加宽加高突出黄色
    rect(img, 11, 16, 19, 28, I.CORN)
    for x in (12, 14, 16, 18):
        for y in range(17, 29, 2):
            px(img, x, y, I.CORN_D)
    px(img, 12, 18, I.CORN_L)
    px(img, 13, 20, I.CORN_L)
    px(img, 15, 22, I.CORN_L)
    px(img, 17, 24, I.CORN_L)
    # 顶部包叶（紧贴玉米棒两侧）
    ell(img, 10, 15, 4, 4, I.LEAF)
    ell(img, 20, 15, 4, 4, I.LEAF)
    px(img, 10, 10, I.LEAF_D)
    px(img, 20, 10, I.LEAF_D)
    # 底部收束
    rect(img, 12, 29, 18, 29, I.LEAF_D)
    add_outline(img)
    return img


# ============================================================================
# 草莓（row 3）
# ============================================================================
def strawberry_sprout():
    img = blank()
    sprout(img)
    add_outline(img)
    return img


def strawberry_growing():
    img = blank()
    soil_mound(img)
    # 绿叶 + 小白花
    ell(img, 14, 20, 4, 3, I.LEAF)
    ell(img, 18, 20, 4, 3, I.LEAF_D)
    px(img, 13, 19, I.LEAF_L)
    px(img, 19, 20, I.LEAF_D)
    # 白花（5 瓣 + 黄芯）
    px(img, 16, 15, C.WHITE)
    px(img, 14, 17, C.WHITE)
    px(img, 18, 17, C.WHITE)
    px(img, 16, 19, C.WHITE)
    px(img, 16, 16, I.CORN_L)
    add_outline(img)
    return img


def strawberry_mature():
    img = blank()
    # 红果（心形），加宽加高 + 明确蒂叶
    ell(img, 16, 22, 8, 6, I.BERRY)
    px(img, 12, 18, I.BERRY)
    px(img, 20, 18, I.BERRY)
    px(img, 11, 21, I.BERRY)
    px(img, 21, 21, I.BERRY)
    px(img, 13, 17, I.BERRY_L)
    px(img, 19, 27, I.BERRY_D)
    px(img, 21, 25, I.BERRY_D)
    # 白籽（更大更亮）
    for sx, sy in [(14, 20), (18, 20), (15, 24), (18, 24), (12, 23), (20, 23), (16, 18)]:
        px(img, sx, sy, C.WHITE)
    # 蒂叶（三片，覆盖果顶）
    ell(img, 16, 15, 6, 3, I.LEAF)
    px(img, 12, 14, I.LEAF_D)
    px(img, 20, 14, I.LEAF_D)
    px(img, 16, 12, I.LEAF_L)
    px(img, 14, 13, I.LEAF)
    px(img, 18, 13, I.LEAF)
    rect(img, 16, 10, 16, 13, I.LEAF_D)
    add_outline(img)
    return img


# ============================================================================
# 图集组装
# ============================================================================
CROPS = [
    [radish_sprout, radish_growing, radish_mature],
    [tomato_sprout, tomato_growing, tomato_mature],
    [corn_sprout, corn_growing, corn_mature],
    [strawberry_sprout, strawberry_growing, strawberry_mature],
]


def gen_crops_image() -> Image.Image:
    sheet = Image.new("RGBA", (F * 3, F * 4), C.TRANSPARENT)
    for r, row in enumerate(CROPS):
        for c, fn in enumerate(row):
            sheet.paste(fn(), (c * F, r * F))
    return sheet


# ============================================================================
# farm_plot.png 帧 4 重绘：成熟土（去掉烘焙绿植）
# 帧 0-3 保持现状（只复核），帧 4 = 纯成熟土（深色 + 收成痕迹）
# ============================================================================
def redraw_farm_plot_mature(src_path: str, dst_path: str) -> None:
    img = Image.open(src_path).convert("RGBA")
    if img.size != (80, 16):
        raise ValueError(f"farm_plot.png 尺寸异常: {img.size}（期望 80×16）")
    # 帧 4：x ∈ [64, 79]
    for y in range(16):
        for x in range(64, 80):
            img.putpixel((x, y), C.TRANSPARENT)
    fx = 64
    for y in range(16):
        for x in range(16):
            # 底色：成熟土（比 tilled 帧稍深，带一点收成后的颗粒感）
            img.putpixel((fx + x, y), SOIL_D)
    # 高光土点 + 收成残留（浅色碎屑，非植物）
    speck = [(3, 4), (11, 3), (6, 8), (13, 9), (4, 12), (10, 13), (2, 7), (8, 6)]
    for sx, sy in speck:
        img.putpixel((fx + sx, sy), SOIL_L)
    speck_d = [(12, 2), (5, 5), (9, 11), (14, 6), (3, 10), (7, 14)]
    for sx, sy in speck_d:
        img.putpixel((fx + sx, sy), (56, 36, 20, 255))
    img.save(dst_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="覆盖 public/assets/sprites/ 下原始文件")
    args = ap.parse_args()
    out_dir = SPRITE_DIR if args.force else TMP_DIR
    os.makedirs(out_dir, exist_ok=True)

    crops_path = os.path.join(out_dir, "crops.png")
    gen_crops_image().save(crops_path)
    print(f"[OK] crops.png -> {crops_path} ({F*3}x{F*4}, 4 作物 × 3 阶段)")

    src_plot = os.path.join(SPRITE_DIR, "farm_plot.png")
    plot_path = os.path.join(out_dir, "farm_plot.png")
    if os.path.exists(src_plot):
        redraw_farm_plot_mature(src_plot, plot_path)
        print(f"[OK] farm_plot.png（帧 4 成熟土）-> {plot_path}")
    else:
        print(f"[SKIP] 未找到 {src_plot}，跳过 farm_plot 帧 4 重绘")

    if not args.force:
        print("  [安全模式] 未覆盖 public/ 下原始文件；需覆盖请加 --force")


if __name__ == "__main__":
    main()
