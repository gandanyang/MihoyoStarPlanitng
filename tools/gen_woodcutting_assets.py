"""生成砍树功能前置美术资源：
1. tileset 扩展：树顶/树干/树桩/木头瓦片
2. 物品贴图：旧斧头 32x32、木材 32x32
3. 场景贴图：树1/树2/树桩 32x32（作为独立 game object 使用）
"""
import os
import random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILE_DIR = os.path.join(ROOT, "public", "assets", "tiles")
SPRITE_DIR = os.path.join(ROOT, "public", "assets", "sprites")
MAP_DIR = os.path.join(ROOT, "public", "assets", "maps")

os.makedirs(TILE_DIR, exist_ok=True)
os.makedirs(SPRITE_DIR, exist_ok=True)

# ============ 1. 扩展 tileset ============

# 读取现有 tileset
tileset_path = os.path.join(TILE_DIR, "placeholder_tileset.png")
old_tileset = Image.open(tileset_path)  # 128x16, 8 tiles

# 新 tileset：224x16 (14 tiles)
new_tileset = Image.new("RGB", (224, 16), (0, 0, 0))
new_tileset.paste(old_tileset, (0, 0))

def draw_tile_ext(img, idx, base, speck, pattern=None):
    """在扩展区域绘制新瓦片（idx 8-13）"""
    x0 = idx * 16
    for y in range(16):
        for x in range(16):
            img.putpixel((x0 + x, y), base)
    rng = random.Random(idx * 100)
    for _ in range(8):
        img.putpixel((x0 + rng.randint(0, 15), rng.randint(0, 15)), speck)
    if pattern == "tree_top":
        # 树冠：三角形绿色
        for y in range(10):
            half = int(y * 0.7) + 2
            for x in range(8 - half, 8 + half):
                if 0 <= x < 16:
                    img.putpixel((x0 + x, y), (20 + y * 5, 80 + y * 3, 10 + y * 2))
        # 树冠高光
        for _ in range(4):
            img.putpixel((x0 + rng.randint(3, 12), rng.randint(1, 6)), (100, 180, 60))
    elif pattern == "pine_top":
        # 松树冠：深绿色三角
        for y in range(12):
            half = max(1, 7 - y // 2)
            for x in range(8 - half, 8 + half):
                if 0 <= x < 16:
                    img.putpixel((x0 + x, y), (10 + y * 3, 60 + y * 2, 10))
    elif pattern == "trunk":
        # 树干
        for y in range(16):
            for x in range(5, 11):
                img.putpixel((x0 + x, y), (80 + y // 4 * 5, 50 + y // 4 * 5, 20 + y // 4 * 3))
        # 树皮纹理
        for _ in range(4):
            img.putpixel((x0 + rng.randint(6, 9), rng.randint(0, 15)), (60, 35, 15))
    elif pattern == "stump":
        # 树桩
        for y in range(16):
            for x in range(4, 12):
                c = 100 - y * 2
                img.putpixel((x0 + x, y), (c, c - 20, c - 40))
        # 年轮
        for r in [3, 5, 7]:
            cx, cy = 8, 8
            for angle in range(0, 360, 10):
                import math
                rx = cx + int(r * math.cos(angle * math.pi / 180))
                ry = cy + int(r * math.sin(angle * math.pi / 180))
                if 0 <= rx < 16 and 0 <= ry < 16 and y < 10:
                    pass
        # 树桩顶面
        for y in range(3):
            for x in range(5, 11):
                img.putpixel((x0 + x, y), (140 - y * 10, 100 - y * 10, 50 - y * 5))
    elif pattern == "log":
        # 木头
        for y in range(16):
            for x in range(3, 13):
                c = 160 - y * 3
                img.putpixel((x0 + x, y), (c, c - 20, c - 40))
        # 木纹
        for _ in range(3):
            ly = rng.randint(3, 12)
            for x in range(4, 12):
                img.putpixel((x0 + x, ly), (120, 80, 30))

# Tile 8: 树顶（阔叶树）
draw_tile_ext(new_tileset, 8, (40, 100, 30), (80, 160, 50), "tree_top")
# Tile 9: 树干
draw_tile_ext(new_tileset, 9, (90, 60, 30), (70, 45, 20), "trunk")
# Tile 10: 树顶（松树）
draw_tile_ext(new_tileset, 10, (20, 70, 20), (50, 120, 30), "pine_top")
# Tile 11: 树干（松树，略细）
draw_tile_ext(new_tileset, 11, (80, 50, 25), (60, 35, 15), "trunk")
# Tile 12: 树桩
draw_tile_ext(new_tileset, 12, (100, 70, 30), (80, 50, 20), "stump")
# Tile 13: 木头
draw_tile_ext(new_tileset, 13, (160, 120, 50), (140, 100, 40), "log")

new_tileset.save(tileset_path)
print(f"[OK] tileset 已扩展 -> 224x16 (14 tiles)")

# ============ 2. 物品贴图：旧斧头 32x32 ============

def draw_axe(img):
    d = ImageDraw.Draw(img)
    # 斧柄（棕色）
    d.rectangle([13, 10, 15, 28], fill=(120, 80, 40))
    d.rectangle([12, 26, 16, 30], fill=(100, 60, 30))
    # 斧头（灰色金属）
    # 斧刃
    d.polygon([12, 6, 20, 12, 16, 12, 12, 10], fill=(160, 160, 160))
    d.polygon([8, 8, 16, 14, 12, 14, 8, 12], fill=(140, 140, 140))
    # 斧刃高光
    d.polygon([8, 8, 12, 12, 8, 12], fill=(180, 180, 180))
    # 锈迹
    d.point([10, 10], fill=(160, 100, 50))
    d.point([14, 12], fill=(150, 90, 40))

# ============ 3. 物品贴图：木材 32x32 ============

def draw_wood(img):
    d = ImageDraw.Draw(img)
    # 三层木头堆叠
    # 底层
    d.rectangle([6, 22, 26, 28], fill=(140, 100, 50))
    d.rectangle([6, 22, 26, 28], fill=(160, 120, 60))
    # 中层
    d.rectangle([8, 16, 24, 22], fill=(150, 110, 55))
    # 顶层
    d.rectangle([10, 10, 22, 16], fill=(170, 130, 65))
    # 木纹
    d.line([6, 25, 26, 25], fill=(120, 80, 40), width=1)
    d.line([8, 19, 24, 19], fill=(130, 90, 45), width=1)
    d.line([10, 13, 22, 13], fill=(140, 100, 50), width=1)
    # 截面圆圈
    d.ellipse([12, 11, 14, 13], fill=(200, 160, 80))
    d.ellipse([18, 11, 20, 13], fill=(200, 160, 80))
    d.ellipse([14, 17, 16, 19], fill=(200, 160, 80))
    d.ellipse([20, 17, 22, 19], fill=(200, 160, 80))
    d.ellipse([10, 23, 12, 25], fill=(200, 160, 80))

# 生成旧斧头贴图
axe_img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
draw_axe(axe_img)
axe_img.save(os.path.join(SPRITE_DIR, 'old_axe.png'))
print(f"[OK] old_axe.png 已生成 (32x32)")

# 生成木材贴图
wood_img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
draw_wood(wood_img)
wood_img.save(os.path.join(SPRITE_DIR, 'wood.png'))
print(f"[OK] wood.png 已生成 (32x32)")

# ============ 4. 场景树贴图 32x32（作为 game object 使用）============

def draw_tree1(img):
    """阔叶树"""
    d = ImageDraw.Draw(img)
    # 树干
    d.rectangle([13, 16, 19, 30], fill=(90, 60, 30))
    # 树冠（大圆形）
    d.ellipse([4, 0, 28, 22], fill=(40, 120, 30))
    d.ellipse([6, 2, 26, 20], fill=(50, 140, 35))
    d.ellipse([8, 4, 24, 18], fill=(60, 160, 40))
    # 高光
    d.ellipse([10, 6, 18, 12], fill=(80, 180, 55))

def draw_tree2(img):
    """松树"""
    d = ImageDraw.Draw(img)
    # 树干
    d.rectangle([14, 20, 18, 30], fill=(70, 45, 20))
    # 三层三角形树冠
    d.polygon([16, 0, 4, 12, 28, 12], fill=(20, 80, 20))
    d.polygon([16, 4, 6, 18, 26, 18], fill=(25, 90, 25))
    d.polygon([16, 8, 8, 24, 24, 24], fill=(30, 100, 30))
    # 高光
    d.polygon([16, 2, 10, 10, 22, 10], fill=(40, 120, 40))

def draw_stump(img):
    """树桩"""
    d = ImageDraw.Draw(img)
    # 树桩主体
    d.rectangle([8, 14, 24, 30], fill=(100, 70, 35))
    d.rectangle([9, 14, 23, 30], fill=(120, 85, 45))
    # 树桩顶面（椭圆）
    d.ellipse([8, 10, 24, 18], fill=(140, 100, 50))
    d.ellipse([10, 11, 22, 17], fill=(150, 110, 55))
    # 年轮
    d.ellipse([12, 12, 20, 16], fill=(160, 120, 60))
    d.ellipse([14, 13, 18, 15], fill=(170, 130, 65))
    # 树皮纹理
    d.line([9, 18, 9, 28], fill=(80, 50, 25), width=1)
    d.line([23, 18, 23, 28], fill=(80, 50, 25), width=1)
    d.line([12, 20, 12, 28], fill=(90, 60, 30), width=1)
    d.line([20, 20, 20, 28], fill=(90, 60, 30), width=1)

tree1_img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
draw_tree1(tree1_img)
tree1_img.save(os.path.join(SPRITE_DIR, 'tree1.png'))

tree2_img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
draw_tree2(tree2_img)
tree2_img.save(os.path.join(SPRITE_DIR, 'tree2.png'))

stump_img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
draw_stump(stump_img)
stump_img.save(os.path.join(SPRITE_DIR, 'stump.png'))

print(f"[OK] 树贴图已生成: tree1.png, tree2.png, stump.png (32x32)")
print("全部完成！")