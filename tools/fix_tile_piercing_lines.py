#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
tools/fix_tile_piercing_lines.py — 修复 tileset 底色 tile 内部贯穿暗线

背景：GPT 网格图经 normalizer 后，部分"底色/地面类"tile 内部残留一条贯穿
暗线（GPT 网格线残留），单一 tile 平铺时每 16px 重复出现 → 画面出现规则黑线网格
（用户反馈：后山/矿洞有黑线）。

方法：对指定 tile 的贯穿暗列/暗行（>70% 像素暗于内部中位-25），将暗像素
用相邻像素平均填充（竖线用左右邻，横线用上下邻）。边缘列/行（0/15）不动，
保证 tile 无缝性不受影响。装饰类 tile（窗框/墙线等）不处理，避免破坏设计。

用法：
  python tools/fix_tile_piercing_lines.py \
    --tileset public/assets/tiles/forest_tileset.png \
    --fix 1:x7 2:x8
  # --fix 格式: <tile_index>:<x|y><col_or_row>，如 1:x7 表示 tile1 的竖线在 x=7
"""
import argparse
import numpy as np
from PIL import Image

def fix_tile(tile, cols, rows):
    """tile: 16x16 RGB array；cols: 需修复的贯穿暗列；rows: 需修复的贯穿暗行"""
    t = tile.copy()
    lum = (t[:,:,0].astype(int)*299 + t[:,:,1].astype(int)*587 + t[:,:,2].astype(int)*114) / 1000
    inner = lum[2:-2, 2:-2]
    med = np.median(inner)
    threshold = med - 25
    # 竖线：暗像素用左右邻平均
    for x in cols:
        if x <= 0 or x >= 15:
            continue  # 边缘列不动
        for y in range(16):
            if lum[y, x] < threshold:
                left = t[y, x-1].astype(int)
                right = t[y, x+1].astype(int)
                t[y, x] = ((left + right) / 2).astype(np.uint8)
    # 横线：暗像素用上下邻平均
    for y in rows:
        if y <= 0 or y >= 15:
            continue
        for x in range(16):
            if lum[y, x] < threshold:
                up = t[y-1, x].astype(int)
                down = t[y+1, x].astype(int)
                t[y, x] = ((up + down) / 2).astype(np.uint8)
    return t

def main():
    ap = argparse.ArgumentParser(description='修复 tileset 底色 tile 内部贯穿暗线')
    ap.add_argument('--tileset', required=True, help='tileset 图片路径')
    ap.add_argument('--fix', required=True, nargs='+',
                    help='修复项，格式 <tile_index>:<x|y><pos>，如 1:x7 2:x8 6:y3 6:y14')
    ap.add_argument('--output', help='输出路径（默认覆盖原文件）')
    args = ap.parse_args()

    img = Image.open(args.tileset).convert('RGB')
    arr = np.array(img)
    h, w = arr.shape[:2]
    assert w % 16 == 0 and h == 16, f'tileset 尺寸异常 {w}x{h}'

    # 解析修复项
    fixes = {}
    for item in args.fix:
        tile_s, line_s = item.split(':')
        tile_idx = int(tile_s)
        axis = line_s[0].lower()
        pos = int(line_s[1:])
        fixes.setdefault(tile_idx, {'cols': [], 'rows': []})
        if axis == 'x':
            fixes[tile_idx]['cols'].append(pos)
        elif axis == 'y':
            fixes[tile_idx]['rows'].append(pos)
        else:
            raise SystemExit(f'--fix 轴必须是 x 或 y: {item}')

    n_tiles = w // 16
    for tile_idx, spec in fixes.items():
        if not (1 <= tile_idx <= n_tiles):
            raise SystemExit(f'tile 索引越界: {tile_idx} (共 {n_tiles})')
        sl = (slice(None), slice((tile_idx-1)*16, tile_idx*16))
        arr[:, (tile_idx-1)*16:tile_idx*16] = fix_tile(
            arr[:, (tile_idx-1)*16:tile_idx*16], spec['cols'], spec['rows'])
        print(f'✅ tile{tile_idx}: 修复竖线 x={spec["cols"] or "-"} 横线 y={spec["rows"] or "-"}')

    out = args.output or args.tileset
    Image.fromarray(arr).save(out)
    print(f'✅ 已保存: {out}')

if __name__ == '__main__':
    main()
