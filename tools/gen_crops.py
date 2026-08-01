"""为 crops.png 添加草莓作物帧（第4行，3帧）"""
from PIL import Image, ImageDraw

# 读取现有 crops.png
img = Image.open('public/assets/sprites/crops.png')
w, h = img.size  # 96x96, 每帧 32x32, 3x3 网格

# 扩展到 4 行（96x128）
new_img = Image.new('RGBA', (w, h + 32), (0, 0, 0, 0))
new_img.paste(img, (0, 0))

# 草莓 3 帧 (row 3, cols 0-2)
frames = [
    # 帧 9: 幼苗（绿色小苗）
    Image.new('RGBA', (32, 32), (0, 0, 0, 0)),
    # 帧 10: 生长中（绿色植株 + 小白花）
    Image.new('RGBA', (32, 32), (0, 0, 0, 0)),
    # 帧 11: 成熟（绿色植株 + 红色草莓果实）
    Image.new('RGBA', (32, 32), (0, 0, 0, 0)),
]

# 绘制幼苗
d = ImageDraw.Draw(frames[0])
d.ellipse([12, 18, 20, 26], fill=(80, 160, 60))   # 小叶子
d.ellipse([14, 14, 18, 20], fill=(60, 140, 40))   # 顶芽

# 绘制生长中
d = ImageDraw.Draw(frames[1])
d.ellipse([8, 14, 24, 28], fill=(70, 150, 50))    # 大叶子
d.ellipse([12, 10, 20, 18], fill=(60, 140, 40))   # 顶部叶
d.point([16, 8], fill=(255, 255, 255))             # 小白花

# 绘制成熟
d = ImageDraw.Draw(frames[2])
d.ellipse([6, 14, 26, 28], fill=(60, 140, 40))    # 叶子
d.ellipse([12, 16, 20, 24], fill=(220, 40, 40))   # 红色草莓
d.point([14, 18], fill=(255, 200, 0))              # 籽
d.point([18, 20], fill=(255, 200, 0))
d.point([15, 21], fill=(255, 200, 0))
d.ellipse([14, 12, 18, 16], fill=(50, 130, 30))   # 草莓蒂

# 贴入新图
for i, frame in enumerate(frames):
    new_img.paste(frame, (i * 32, 96))

new_img.save('public/assets/sprites/crops.png')
print(f'[OK] crops.png 已更新 -> {new_img.size}')