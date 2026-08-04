#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""farm_plot.png 地块状态帧生成器（5 帧 × 16×16，确定性，无随机）。

帧语义（MapScene.ts setFrame）：
  0 = 锄地 tilled ｜ 1 = 播种 planted ｜ 2 = 浇水 watered ｜ 3 = 备用(浇水变体) ｜ 4 = 成熟土 mature
土壤色与 farm_tileset gid5 / gen_crops SOIL 一致（100,68,44 / 72,46,26 / 150,112,66）。
运行： python tools/gen_farm_plot.py [--force]
"""

from __future__ import annotations

import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITE_DIR = os.path.join(ROOT, "public", "assets", "sprites")
FRAME = 16

# 土壤色（与 gid5 / gen_crops 一致）
SOIL = (100, 68, 44, 255)
SOIL_D = (72, 46, 26, 255)
SOIL_DD = (56, 36, 20, 255)
SOIL_L = (150, 112, 66, 255)
SOIL_LL = (120, 84, 52, 255)
# 水光（浇水反光）
WET = (82, 52, 30, 255)
SHINE = (168, 196, 224, 255)
SHINE_D = (130, 160, 196, 255)
TRANSPARENT = (0, 0, 0, 0)


def blank() -> Image.Image:
    return Image.new("RGBA", (FRAME, FRAME), TRANSPARENT)


def px(img: Image.Image, x: int, y: int, c) -> None:
    if 0 <= x < FRAME and 0 <= y < FRAME:
        img.putpixel((x, y), c)


def rect(img: Image.Image, x0, y0, x1, y1, c) -> None:
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px(img, x, y, c)


def hline(img: Image.Image, y, c, x0=0, x1=FRAME - 1) -> None:
    for x in range(x0, x1 + 1):
        px(img, x, y, c)


def base_fill(img: Image.Image, c) -> None:
    rect(img, 0, 0, FRAME - 1, FRAME - 1, c)


def tilled_base(img: Image.Image) -> None:
    """锄地基底：翻耕土 + 垄沟深槽/垄脊 + 顶缘光 + 底缘影。"""
    base_fill(img, SOIL)
    # 垄沟三条（y 4/8/12），深槽 + 垄脊浅色
    for gy in (4, 8, 12):
        hline(img, gy, SOIL_DD)
        hline(img, gy + 1, SOIL_LL)
    # 顶缘高光 / 底缘阴影
    hline(img, 0, SOIL_L)
    hline(img, 15, SOIL_DD)
    # 土块质感（确定性斑点）
    for sx, sy in ((2, 2), (12, 2), (5, 6), (11, 6), (3, 10), (13, 10), (6, 13), (10, 13)):
        px(img, sx, sy, SOIL_L)
    for sx, sy in ((9, 3), (4, 7), (13, 7), (7, 11), (12, 12)):
        px(img, sx, sy, SOIL_DD)


def frame_tilled() -> Image.Image:
    img = blank()
    tilled_base(img)
    return img


def frame_planted() -> Image.Image:
    img = blank()
    tilled_base(img)
    # 种子点：沿垄沟（y≈8）3 颗小暗点 + 高光
    for sx in (3, 8, 13):
        px(img, sx, 8, (40, 24, 12, 255))
        px(img, sx + 1, 8, (40, 24, 12, 255))
        px(img, sx, 7, SOIL_LL)
    return img


def frame_watered() -> Image.Image:
    img = blank()
    base_fill(img, WET)
    # 湿土垄沟（更暗）+ 少量高光
    for gy in (4, 8, 12):
        hline(img, gy, (58, 34, 18, 255))
    # 水光反光（左上两片）
    for sx, sy in ((3, 3), (4, 3), (3, 4), (11, 2), (12, 2), (11, 3), (6, 10), (7, 10)):
        px(img, sx, sy, SHINE)
    for sx, sy in ((12, 3), (5, 10)):
        px(img, sx, sy, SHINE_D)
    hline(img, 15, (50, 28, 14, 255))
    return img


def frame_watered2() -> Image.Image:
    """帧 3 备用：雨后更湿（反光更多）。"""
    img = blank()
    base_fill(img, (74, 46, 26, 255))
    for gy in (4, 9):
        hline(img, gy, (54, 32, 16, 255))
    for sx, sy in ((2, 2), (3, 2), (2, 3), (9, 4), (10, 4), (5, 9), (6, 9), (12, 11), (13, 11)):
        px(img, sx, sy, SHINE)
    hline(img, 15, (46, 26, 12, 255))
    return img


def frame_mature() -> Image.Image:
    img = blank()
    base_fill(img, SOIL_D)
    # 收获后残茬：浅色秸秆点 + 松散颗粒
    for sx, sy in ((3, 3), (11, 2), (6, 6), (13, 8), (4, 11), (10, 12), (2, 8), (8, 5)):
        px(img, sx, sy, SOIL_L)
    for sx, sy in ((12, 4), (5, 8), (9, 13), (14, 11), (3, 13)):
        px(img, sx, sy, SOIL_LL)
    hline(img, 0, SOIL_LL)
    hline(img, 15, (48, 30, 14, 255))
    return img


FRAMES = [frame_tilled, frame_planted, frame_watered, frame_watered2, frame_mature]


def main() -> int:
    force = "--force" in sys.argv[1:]
    out_dir = SPRITE_DIR if force else os.path.join(ROOT, "tmp")
    sheet = Image.new("RGBA", (FRAME * 5, FRAME), TRANSPARENT)
    for i, fn in enumerate(FRAMES):
        sheet.paste(fn(), (i * FRAME, 0))
    out = os.path.join(out_dir, "farm_plot.png")
    sheet.save(out)
    print(f"[OK] farm_plot.png -> {out} ({sheet.size[0]}x{sheet.size[1]}, 5 态)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
