"""F1 修复：forest_tileset.png 补齐缺失的 gid 9-12 树瓦片

背景（见《地图扩展技术评估报告-v0.6.md》F1）：
- forest.json Walls 层有 47 格引用 gid 9-12（树/松树），
  但 forest_tileset.png 只有 8 格（128x16），运行时帧越界 → 树木不可见（隐形墙）。
- 该地图当年按 14 格体系摆放树瓦片：
    gid 9 = 阔叶树冠（位于树干正上方）
    gid 10 = 树干
    gid 11 = 松树冠
    gid 12 = 树干
- 勘察发现：placeholder_tileset.png 的 idx 8-13（gid 9-14）像素全黑，
  因此不能从 placeholder 复制，改为按 gen_woodcutting_assets.py 的树瓦片绘制逻辑
  直接生成（同种子 rng，确定性、可复现——这正是该 gid 体系设计时的树美术）。

修复方式（只追加瓦片，最小改动）：
- 保留 forest_tileset.png 现有 8 格，追加绘制 gid 9-12 四格 → 12 格（192x16）。
- 不修改任何 gid 编号、不修改 Tiled JSON、不调整碰撞语义。
- Phaser 3 `Tileset.setImage` 按实际纹理尺寸重算 columns/total，
  因此 12 格 tileset 即可让 gid 1-12 全部正常渲染。

用法：python tools/fix_forest_tileset.py
"""
import os
import random
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILE_DIR = os.path.join(ROOT, "public", "assets", "tiles")
TILE = 16

FOREST = os.path.join(TILE_DIR, "forest_tileset.png")

# 与 gen_woodcutting_assets.py 完全一致的树瓦片绘制参数：
#   (base 底色, speck 杂点, pattern)
# idx 8-11 对应 gid 9-12
TREE_TILES = [
    ((40, 100, 30), (80, 160, 50), "tree_top"),   # gid 9  阔叶树冠
    ((90, 60, 30), (70, 45, 20), "trunk"),        # gid 10 树干
    ((20, 70, 20), (50, 120, 30), "pine_top"),    # gid 11 松树冠
    ((80, 50, 25), (60, 35, 15), "trunk"),        # gid 12 树干（略细同款）
]


def draw_tile_ext(img, x0, base, speck, pattern):
    """按 gen_woodcutting_assets.py 的 draw_tile_ext 绘制单个瓦片（x0 为瓦片左上角 x）"""
    rng = random.Random((x0 // TILE) * 100)
    for y in range(TILE):
        for x in range(TILE):
            img.putpixel((x0 + x, y), base)
    for _ in range(8):
        img.putpixel((x0 + rng.randint(0, 15), rng.randint(0, 15)), speck)
    if pattern == "tree_top":
        for y in range(10):
            half = int(y * 0.7) + 2
            for x in range(8 - half, 8 + half):
                if 0 <= x < 16:
                    img.putpixel((x0 + x, y), (20 + y * 5, 80 + y * 3, 10 + y * 2))
        for _ in range(4):
            img.putpixel((x0 + rng.randint(3, 12), rng.randint(1, 6)), (100, 180, 60))
    elif pattern == "pine_top":
        for y in range(12):
            half = max(1, 7 - y // 2)
            for x in range(8 - half, 8 + half):
                if 0 <= x < 16:
                    img.putpixel((x0 + x, y), (10 + y * 3, 60 + y * 2, 10))
    elif pattern == "trunk":
        for y in range(TILE):
            for x in range(5, 11):
                img.putpixel((x0 + x, y), (80 + y // 4 * 5, 50 + y // 4 * 5, 20 + y // 4 * 3))
        for _ in range(4):
            img.putpixel((x0 + rng.randint(6, 9), rng.randint(0, 15)), (60, 35, 15))


BASE_TILES = 8  # forest_tileset 的基础 8 格（gid 1-8，opencode 像素风）


def main():
    forest = Image.open(FOREST).convert("RGB")
    # 兼容两种状态：8 格原版 / 已被错误扩展过的 192px（只取前 8 格，gid 1-8 不变）
    if forest.width // TILE < BASE_TILES:
        raise SystemExit(f"[ERROR] forest_tileset 格数不足：{forest.width // TILE}")
    base = forest.crop((0, 0, BASE_TILES * TILE, TILE))

    new = Image.new("RGB", (base.width + len(TREE_TILES) * TILE, TILE), (0, 0, 0))
    new.paste(base, (0, 0))
    for i, (tbase, speck, pattern) in enumerate(TREE_TILES):
        draw_tile_ext(new, (8 + i) * TILE, tbase, speck, pattern)

    new.save(FOREST)
    print(f"[OK] forest_tileset.png -> {new.size} ({new.width // TILE} 格)")
    for i, (_, _, pattern) in enumerate(TREE_TILES):
        print(f"     gid {9 + i} = {pattern}")


if __name__ == "__main__":
    main()
