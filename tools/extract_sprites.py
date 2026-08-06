# -*- coding: utf-8 -*-
"""
从 0x72 Dungeon Tileset II 大图中裁剪角色 spritesheet。

0x72 角色布局（每个角色占 9列 x 4行）：
  cols +0~3: idle 动画 4帧
  cols +4~7: run  动画 4帧
  col  +8  : hit  1帧
  row +0: down (面向下)
  row +1: left
  row +2: right
  row +3: up

输出：
  public/assets/sprites/player.png        — 玩家 4方向x4帧 run (64x64)
  public/assets/sprites/npc_elder.png     — NPC idle down 首帧 (16x16)
  public/assets/sprites/npc_merchant.png  — NPC idle down 首帧 (16x16)
  public/assets/sprites/npc_girl.png      — NPC idle down 首帧 (16x16)

维护说明：
  - 想换角色，修改下方 CHARACTERS 字典的 (col, row) 坐标
  - 坐标来自 tools/extract_sprites.py --scan 的输出
  - 大图必须放在 public/assets/sprites/source/ 下
"""

from PIL import Image
import os

# === 配置 ===
SOURCE = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'sprites', 'source', '0x72_DungeonTilesetII_v1.7.png')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'sprites')

# 角色在大图中的瓦片坐标 (col, row)
# 选 4 个不同区域的角色：玩家用 knight，3个NPC各选不同角色
CHARACTERS = {
    'player':       (16, 8),   # #4 — 玩家
    'npc_elder':    (21, 16),  # #7 — 村长
    'npc_merchant': (15, 12),  # #5 — 商人
    'npc_girl':     (0, 21),   # #10 — 神秘少女
}

TILE = 16  # 瓦片尺寸


def extract_run_spritesheet(img, col, row):
    """提取角色的 run 动画，拼成 4列x4行 spritesheet (64x64)。
    行顺序：down, left, right, up
    每行 4 帧（cols +4 ~ +7）
    """
    sheet = Image.new('RGBA', (TILE * 4, TILE * 4), (0, 0, 0, 0))
    for dir_idx in range(4):  # 0=down, 1=left, 2=right, 3=up
        for frame in range(4):
            sx = (col + 4 + frame) * TILE
            sy = (row + dir_idx) * TILE
            tile = img.crop((sx, sy, sx + TILE, sy + TILE))
            sheet.paste(tile, (frame * TILE, dir_idx * TILE))
    return sheet


def extract_idle_down(img, col, row):
    """提取角色 idle down 第一帧 (16x16)，用于 NPC 静止站立。"""
    sx = col * TILE
    sy = row * TILE
    return img.crop((sx, sy, sx + TILE, sy + TILE))


def main():
    src = os.path.normpath(SOURCE)
    out_dir = os.path.normpath(OUT_DIR)
    if not os.path.exists(src):
        print(f'ERROR: 找不到大图: {src}')
        print('请把 0x72_DungeonTilesetII_v1.7.png 放到 public/assets/sprites/source/ 下')
        return

    img = Image.open(src).convert('RGBA')
    print(f'大图: {src}  size={img.size}')

    os.makedirs(out_dir, exist_ok=True)

    # 玩家：4方向x4帧 run spritesheet
    name = 'player'
    col, row = CHARACTERS[name]
    sheet = extract_run_spritesheet(img, col, row)
    out = os.path.join(out_dir, f'{name}.png')
    sheet.save(out)
    print(f'  {name}.png  ({sheet.size})  <- col={col} row={row} [4方向x4帧 run]')

    # NPC：idle down 单帧
    for name in ['npc_elder', 'npc_merchant', 'npc_girl']:
        col, row = CHARACTERS[name]
        idle = extract_idle_down(img, col, row)
        out = os.path.join(out_dir, f'{name}.png')
        idle.save(out)
        print(f'  {name}.png  ({idle.size})  <- col={col} row={row} [idle down]')

    print(f'\n完成！输出目录: {out_dir}')


if __name__ == '__main__':
    main()
