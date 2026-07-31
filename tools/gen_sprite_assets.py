# -*- coding: utf-8 -*-
"""
像素美术资源自动生成脚本（v2 — 角色升级为 32×32）
=================================================
纯 PIL 程序化绘制，无外部素材依赖。生成项目运行时所需的全部 5 张 PNG：

  public/assets/sprites/player.png         玩家 4方向×4帧 行走动画 (128x128) 每帧 32x32
  public/assets/sprites/npc_elder.png      村长 idle down                  (32x32)
  public/assets/sprites/npc_merchant.png   商店老板 idle down              (32x32)
  public/assets/sprites/npc_girl.png       神秘少女 idle down              (32x32)
  public/assets/tiles/placeholder_tileset.png   瓦片集 8格×1行           (128x16) 每格 16x16

运行：  python tools/gen_sprite_assets.py
重生成：修改下方调色板 / 像素矩阵后重复运行即可。

Phaser 配套：
  MapScene.ts preload:
    this.load.spritesheet('player', 'assets/sprites/player.png', { frameWidth: 32, frameHeight: 32 })
  Player.ts:
    this.setScale(0.5)    （32×32 → 16×16 逻辑尺寸，与 16×16 瓦片协调）
    this.body.setSize(24, 24).setOffset(4, 6)
  MapScene.ts setupNPCs:
    sprite.setScale(0.5)

帧布局规范（与 Player.ts / MapScene.ts 严格对齐）：
  player.png  行=方向  列=帧序 (每帧 32x32)
    row 0 frames 0-3   : walk down   站立帧 frame 0
    row 1 frames 4-7   : walk left   站立帧 frame 4
    row 2 frames 8-11  : walk right  站立帧 frame 8
    row 3 frames 12-15 : walk up     站立帧 frame 12

  tileset  列=瓦片 gid (1..8)  每格 16x16
    gid 1 草地   gid 2 泥土   gid 3 石墙   gid 4 水
    gid 5 农田   gid 6 木地板 gid 7 小路   gid 8 花
"""

from __future__ import annotations

import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITE_DIR = os.path.join(ROOT, "public", "assets", "sprites")
TILE_DIR = os.path.join(ROOT, "public", "assets", "tiles")

SP = 32    # 角色 sprite 单帧像素（玩家 / NPC）
TILE = 16  # 瓦片像素（地图 tileset，不变）


# ============================================================================
# 统一调色板 — 所有角色与瓦片共用，保证风格协调
# ============================================================================
class C:
    """颜色常量：名称区分用途，避免魔法 RGB 元组散落。"""
    # —— 通用 ——
    TRANSPARENT = (0, 0, 0, 0)
    BLACK = (20, 20, 28, 255)       # 描边/轮廓
    WHITE = (240, 240, 245, 255)    # 高光/眼白
    OUTLINE = (18, 14, 22, 255)     # 角色整体外描边色（极深棕黑，比纯黑柔和）

    # —— 皮肤（所有角色共用，确保种族一致）——
    SKIN = (250, 216, 178, 255)     # 主皮肤
    SKIN_MID = (238, 198, 158, 255) # 皮肤过渡色（脸颊/鼻梁）
    SKIN_SHADOW = (220, 180, 140, 255)  # 皮肤阴影（下巴/脖子）
    CHEEK = (245, 170, 160, 255)    # 腮红（少女 / 村长）

    # —— 玩家配色：亮红外套 + 深蓝裤（与草地绿色高对比度）——
    P_HAIR = (240, 190, 120, 255)   # 金黄短发
    P_HAIR_MID = (220, 160, 80, 255)
    P_HAIR_SHADOW = (200, 140, 60, 255)
    P_SHIRT = (220, 60, 70, 255)    # 亮红夹克主色
    P_SHIRT_MID = (190, 48, 60, 255)
    P_SHIRT_SHADOW = (160, 36, 50, 255)  # 深红阴影
    P_SHIRT_HIGHLIGHT = (250, 120, 120, 255)  # 红高光（左肩/胸前）
    P_PANTS = (56, 66, 110, 255)    # 深蓝裤子
    P_PANTS_MID = (46, 54, 94, 255)
    P_PANTS_SHADOW = (36, 44, 80, 255)
    P_SHOES = (28, 28, 38, 255)     # 近黑深棕鞋
    P_SHOES_LACE = (60, 60, 80, 255)
    P_BELT = (80, 50, 24, 255)      # 深棕宽腰带
    P_BELT_BUCKLE = (255, 200, 80, 255)  # 腰带扣（金）
    P_BADGE_OUTER = (255, 180, 60, 255)  # 金色胸章外圈
    P_BADGE_INNER = (255, 240, 160, 255)  # 金色胸章内圈
    P_NECKLACE = (200, 160, 100, 255)    # 颈部阴影/衣领

    # —— 村长：蓝袍老者 ——
    E_HAIR_WHITE = (242, 242, 244, 255)  # 白发/白胡子
    E_HAIR_GRAY = (210, 210, 218, 255)
    E_HAIR_DARK = (178, 178, 188, 255)
    E_ROBE = (80, 100, 160, 255)    # 深蓝长袍主色
    E_ROBE_MID = (68, 86, 142, 255)
    E_ROBE_SHADOW = (58, 74, 124, 255)
    E_ROBE_TRIM = (255, 230, 160, 255)  # 长袍金边（袖口/领口）
    E_STAFF = (120, 86, 50, 255)   # 木拐杖
    E_STAFF_LIGHT = (150, 110, 70, 255)
    E_STAFF_TOP = (255, 215, 90, 255)  # 拐杖顶金珠
    E_STAFF_TOP_DARK = (200, 160, 40, 255)
    E_SANDAL = (150, 100, 50, 255)  # 拖鞋/布鞋

    # —— 商人：红帽 + 黄围裙（新增钱袋元素）——
    M_HAIR = (190, 120, 50, 255)    # 金黄头发
    M_HAIR_MID = (170, 104, 40, 255)
    M_HAIR_SHADOW = (150, 90, 30, 255)
    M_HAT = (190, 60, 60, 255)      # 红帽子
    M_HAT_MID = (164, 48, 48, 255)
    M_HAT_SHADOW = (138, 40, 40, 255)
    M_HAT_BAND = (90, 50, 30, 255)  # 帽带（深棕）
    M_SHIRT = (238, 230, 200, 255)  # 米白衬衣
    M_SHIRT_SHADOW = (214, 204, 170, 255)
    M_COLLAR = (250, 244, 224, 255) # 白领
    M_APRON = (230, 190, 80, 255)   # 黄围裙
    M_APRON_MID = (210, 170, 64, 255)
    M_APRON_SHADOW = (190, 150, 50, 255)
    M_APRON_STRIPE = (250, 220, 140, 255)
    M_PANTS = (100, 70, 40, 255)    # 棕裤
    M_PANTS_SHADOW = (80, 54, 30, 255)
    M_SHOES = (40, 30, 24, 255)
    M_POUCH = (150, 100, 50, 255)   # 钱袋（挂在围裙上）
    M_POUCH_DARK = (110, 70, 30, 255)
    M_POUCH_STRING = (70, 40, 20, 255)
    M_COIN = (255, 220, 80, 255)    # 金币

    # —— 神秘少女：紫斗篷长发（新增细节）——
    G_HAIR = (148, 96, 188, 255)    # 紫色长发主色
    G_HAIR_MID = (124, 76, 164, 255)
    G_HAIR_SHADOW = (100, 60, 140, 255)
    G_HAIR_HIGHLIGHT = (186, 144, 226, 255)
    G_HAIR_TIP = (210, 180, 240, 255)  # 发尖更浅
    G_CLOAK = (84, 62, 134, 255)   # 深紫斗篷
    G_CLOAK_MID = (70, 50, 114, 255)
    G_CLOAK_SHADOW = (56, 40, 96, 255)
    G_CLOAK_LINING = (150, 120, 190, 255)  # 斗篷内衬（前襟露出）
    G_DRESS = (204, 172, 234, 255)  # 浅紫内裙
    G_DRESS_SHADOW = (174, 140, 210, 255)
    G_RIBBON = (255, 180, 210, 255)  # 粉丝带（头饰/胸前）
    G_RIBBON_SHADOW = (230, 140, 180, 255)
    G_SHOES = (60, 40, 80, 255)     # 紫色小鞋
    G_CHARM_CENTER = (255, 255, 180, 255)  # 发饰/吊坠中心（小宝石）
    G_CHARM = (255, 200, 240, 255)        # 宝石外圈
    G_PENDANT_CHAIN = (200, 170, 220, 255) # 项链细链

    # —— 瓦片调色板（柔和色，避免高饱和）不变 ——
    T_GRASS = (96, 152, 72, 255)
    T_GRASS_DARK = (72, 120, 52, 255)
    T_GRASS_LIGHT = (120, 176, 92, 255)
    T_DIRT = (150, 112, 66, 255)
    T_DIRT_DARK = (116, 82, 44, 255)
    T_DIRT_LIGHT = (176, 136, 90, 255)
    T_STONE = (120, 120, 128, 255)
    T_STONE_DARK = (84, 84, 92, 255)
    T_STONE_LIGHT = (156, 156, 164, 255)
    T_WATER = (72, 124, 180, 255)
    T_WATER_DARK = (52, 92, 140, 255)
    T_WATER_LIGHT = (110, 164, 216, 255)
    T_SOIL = (100, 68, 44, 255)
    T_SOIL_DARK = (72, 46, 26, 255)
    T_SOIL_LINE = (56, 36, 20, 255)
    T_WOOD = (190, 144, 84, 255)
    T_WOOD_DARK = (150, 108, 56, 255)
    T_WOOD_LINE = (118, 82, 40, 255)
    T_PATH = (210, 176, 124, 255)
    T_PATH_DARK = (178, 142, 92, 255)
    T_PATH_LIGHT = (232, 202, 156, 255)
    T_FLOWER_PETAL = (240, 120, 160, 255)
    T_FLOWER_CENTER = (255, 220, 100, 255)
    T_FLOWER_LEAF = (80, 140, 70, 255)


# ============================================================================
# 像素绘制辅助（通用：根据传入图像尺寸判断边界，不依赖全局常量）
# ============================================================================
def _in_bounds(img: Image.Image, x: int, y: int) -> bool:
    w, h = img.size
    return 0 <= x < w and 0 <= y < h


def px(img: Image.Image, x: int, y: int, color) -> None:
    """单点着色；越界忽略。"""
    if _in_bounds(img, x, y):
        img.putpixel((x, y), color)


def rect(img: Image.Image, x0: int, y0: int, x1: int, y1: int, color) -> None:
    """实心矩形（含边界）。"""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px(img, x, y, color)


def hline(img: Image.Image, x0: int, x1: int, y: int, color) -> None:
    for x in range(x0, x1 + 1):
        px(img, x, y, color)


def vline(img: Image.Image, x: int, y0: int, y1: int, color) -> None:
    for y in range(y0, y1 + 1):
        px(img, x, y, color)


def box_outline(img: Image.Image, x0: int, y0: int, x1: int, y1: int, color=C.BLACK) -> None:
    """矩形描边（仅外框 4 条边）。"""
    hline(img, x0, x1, y0, color)
    hline(img, x0, x1, y1, color)
    vline(img, x0, y0, y1, color)
    vline(img, x1, y0, y1, color)


def add_outline(img: Image.Image, color=C.OUTLINE) -> Image.Image:
    """
    给已绘制的角色帧加 1 像素深色外轮廓。
    规则：若某像素是透明，但 8 邻域中存在不透明像素，则该像素染成描边色。
    已不透明的像素保持不变（避免覆盖细节）。
    适用于任意尺寸帧（16/32 都可）。
    """
    w, h = img.size
    snap = [img.getpixel((x, y)) for y in range(h) for x in range(w)]

    def opaque(xx: int, yy: int) -> bool:
        if xx < 0 or xx >= w or yy < 0 or yy >= h:
            return False
        return snap[yy * w + xx][3] > 0

    for y in range(h):
        for x in range(w):
            p = snap[y * w + x]
            if p[3] == 0:
                hit = False
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        if opaque(x + dx, y + dy):
                            hit = True
                            break
                    if hit:
                        break
                if hit:
                    img.putpixel((x, y), color)
    return img


# ============================================================================
# 画布工厂
# ============================================================================
def blank_sprite() -> Image.Image:
    """32x32 透明画布（玩家帧 / NPC）。"""
    return Image.new("RGBA", (SP, SP), C.TRANSPARENT)


def blank_tileset() -> Image.Image:
    """瓦片集画布：128x16 = 8 格 × 1 行，每格 16x16。"""
    return Image.new("RGBA", (TILE * 8, TILE), C.TRANSPARENT)


# ============================================================================
# 32×32 通用头部辅助函数（draw_face_down / draw_head_up / draw_head_side）
#
# 32×32 角色结构（y 轴 0..31）：
#   y 0..6   头顶（头发/帽子/头饰）
#   y 5..12  脸部区域（down 可见双眼；side 可见单眼+鼻尖；up 不可见眼）
#   y 11..22 上身（衣服/躯干/手臂/腰带/围裙）
#   y 22..28 大腿
#   y 28..31 小腿 + 鞋
#
# x 轴：主体一般在 x 8..23 之间（16 像素宽），留 0..7 与 24..31 做外延（长发/拐杖/手臂摆动）
# ============================================================================

def draw_face_down_32(img,
                      skin=C.SKIN, hair=None, hair_mid=None, hair_s=None,
                      eye_y=9, left_eye_x=12, right_eye_x=18,
                      brow=True, nose=True, mouth=True, cheek=True,
                      beard=False, beard_long=False):
    """
    down 方向的脸 + 额前刘海。
    默认脸部矩形 x 9..21（13 像素宽），y 6..13（8 像素高）。
    眼睛 2x2 像素（黑眼珠 + 白眼高光各 1），眉毛 2x1。
    """
    # —— 脸基 ——
    rect(img, 9, 6, 22, 13, skin)
    # 脸部两侧阴影（模拟头的圆度）
    vline(img, 9, 7, 12, C.SKIN_SHADOW)
    vline(img, 22, 7, 12, C.SKIN_SHADOW)
    # 下巴阴影
    hline(img, 10, 21, 13, C.SKIN_MID)
    px(img, 9, 13, C.SKIN_SHADOW)
    px(img, 22, 13, C.SKIN_SHADOW)
    # 耳朵（两侧露出一点）
    px(img, 8, 9, skin)
    px(img, 23, 9, skin)
    px(img, 8, 10, C.SKIN_SHADOW)
    px(img, 23, 10, C.SKIN_SHADOW)

    # —— 刘海（头发盖住前额 y 5-7）——
    if hair:
        # 刘海前沿（波浪形，不是一条直线）
        for x in range(8, 24):
            depth = 1 if x % 5 == 0 else (2 if x % 3 == 0 else 0)
            for y_off in range(0, 2 + depth):
                px(img, x, 5 + y_off, hair)
        # 鬓角（两侧往下长一点）
        for y in range(6, 10):
            px(img, 8, y, hair if y < 9 else (hair_s or hair))
            px(img, 23, y, hair if y < 9 else (hair_s or hair))
        # 刘海阴影（下沿）
        if hair_s:
            for x in range(9, 23):
                px(img, x, 7, hair_s)
        if hair_mid:
            # 发绺高光
            for x in (11, 14, 17, 20):
                px(img, x, 5, hair_mid)

    # —— 眉毛 ——
    if brow:
        hline(img, left_eye_x - 1, left_eye_x + 1, eye_y - 2, C.BLACK)
        hline(img, right_eye_x - 1, right_eye_x + 1, eye_y - 2, C.BLACK)

    # —— 眼睛（2 像素高 × 2 像素宽：左上黑（眼珠）、右上白（高光）、左下黑、右下肤）——
    for eye_x in (left_eye_x, right_eye_x):
        px(img, eye_x,     eye_y,     C.BLACK)      # 眼珠左上
        px(img, eye_x + 1, eye_y,     C.WHITE)      # 高光
        px(img, eye_x,     eye_y + 1, C.BLACK)      # 眼珠左下
        px(img, eye_x + 1, eye_y + 1, skin)         # 右下肤色

    # —— 鼻子（侧脸才明显，正面仅一小撮阴影）——
    if nose:
        px(img, 15, eye_y + 2, C.SKIN_SHADOW)
        px(img, 16, eye_y + 2, C.SKIN_SHADOW)

    # —— 嘴（两像素宽的小弯）——
    if mouth:
        px(img, 14, eye_y + 4, C.BLACK)
        px(img, 15, eye_y + 4, C.BLACK)
        px(img, 16, eye_y + 4, C.BLACK)
        px(img, 17, eye_y + 4, C.BLACK)
        # 下嘴唇高光
        px(img, 15, eye_y + 5, C.SKIN_SHADOW)
        px(img, 16, eye_y + 5, C.SKIN_SHADOW)

    # —— 腮红 ——
    if cheek:
        # 淡粉色小扇形
        for cx, cy in [(10, eye_y + 3), (21, eye_y + 3)]:
            for dx, dy in [(-1, 0), (0, 0), (1, 0), (0, -1), (0, 1)]:
                px(img, cx + dx, cy + dy, C.CHEEK)

    # —— 白胡子（村长专用）——
    if beard:
        # 上唇胡须（八字胡）
        for x in range(12, 19):
            px(img, x, eye_y + 4, C.E_HAIR_WHITE)
        px(img, 11, eye_y + 5, C.E_HAIR_WHITE)
        px(img, 19, eye_y + 5, C.E_HAIR_WHITE)
        # 下巴胡须：大覆盖
        if beard_long:
            # 长胡须（覆盖到胸口）
            rect(img, 10, eye_y + 5, 21, 20, C.E_HAIR_WHITE)
            # 胡须边缘波浪
            for x in range(10, 22):
                h = 16 + ((x * 7) % 4)
                px(img, x, h, C.E_HAIR_GRAY)
            # 胡须两侧分绺阴影
            for y in range(eye_y + 5, 21):
                px(img, 10, y, C.E_HAIR_GRAY)
                px(img, 21, y, C.E_HAIR_GRAY)
                if (y - (eye_y + 5)) % 3 == 0:
                    px(img, 15, y, C.E_HAIR_GRAY)
        else:
            # 短胡须（只到下巴）
            rect(img, 11, eye_y + 5, 20, 14, C.E_HAIR_WHITE)
            rect(img, 10, eye_y + 6, 21, 13, C.E_HAIR_GRAY)
            # 胡须末端稍尖
            hline(img, 12, 19, 14, C.E_HAIR_WHITE)
            px(img, 11, 14, C.E_HAIR_GRAY)
            px(img, 20, 14, C.E_HAIR_GRAY)


def draw_head_up_32(img, hair, hair_mid=None, hair_s=None):
    """
    up 方向：后脑 + 后颈，无眼睛。
    头占 x 8..23，y 1..10（帽子/头发）+ 后颈 y 11..12。
    """
    # 后脑头发（主体）
    rect(img, 8, 2, 23, 10, hair)
    # 头盖（y 0-1，稍短）
    rect(img, 9, 0, 22, 2, hair)
    # 头发下沿阴影（颈部交接）
    hline(img, 9, 22, 10, hair_s or hair)
    # 头发下沿波浪
    for x in range(8, 24):
        depth = 1 if x % 4 == 0 else 0
        for d in range(depth + 1):
            px(img, x, 11 + d, hair_s or hair)
    # 后颈（露出一点皮肤）
    rect(img, 12, 11, 19, 12, C.SKIN_SHADOW)
    # 后颈两边阴影更深
    vline(img, 12, 11, 12, (190, 150, 110, 255))
    vline(img, 19, 11, 12, (190, 150, 110, 255))
    # 头发高光绺
    if hair_mid:
        for x in (11, 14, 17, 20):
            px(img, x, 2, hair_mid)
            px(img, x - 1, 4, hair_mid)


def draw_head_side_32(img, skin, hair, hair_mid=None, hair_s=None, facing="left"):
    """
    left/right 方向头：facing='left' 脸朝左；'right' 自动水平镜像。
    使用 m(x) = x（left）或 31-x（right）做坐标翻转。
    """
    def m(x):
        return (SP - 1 - x) if facing == "right" else x

    # 脸：朝向方向偏一侧（约 4 像素），后脑占另一侧
    # 脸区域（从朝向的那侧伸出来）
    face_x0, face_x1 = m(3), m(13)
    if face_x0 > face_x1:
        face_x0, face_x1 = face_x1, face_x0
    rect(img, face_x0, 6, face_x1, 13, skin)
    # 后脑（与脸不重叠的那一侧）
    head_x0, head_x1 = m(10), m(24)
    if head_x0 > head_x1:
        head_x0, head_x1 = head_x1, head_x0
    rect(img, head_x0, 2, head_x1, 11, hair)
    # 头盖
    rect(img, m(11), 0, m(22), 2, hair)
    # 头发下沿阴影
    hline(img, head_x0, head_x1, 10, hair_s or hair)
    # 鬓角
    px(img, m(10), 7, hair_s or hair)
    # 脸圆形阴影
    if facing == "left":
        vline(img, m(3), 7, 12, C.SKIN_SHADOW)  # 脸后侧（接头发）
    else:
        vline(img, m(3), 7, 12, C.SKIN_SHADOW)
    # 脸前侧（朝向侧）高光
    vline(img, m(13), 7, 12, C.SKIN_MID)

    # 单眼（2x2，朝方向的那只）
    eye_x = m(8)
    eye_y = 9
    px(img, eye_x,     eye_y,     C.BLACK)
    px(img, eye_x + 1, eye_y,     C.WHITE) if facing == "left" else px(img, eye_x - 1, eye_y, C.WHITE)
    px(img, eye_x,     eye_y + 1, C.BLACK)
    # 眉毛
    if facing == "left":
        hline(img, eye_x - 1, eye_x + 1, eye_y - 2, C.BLACK)
    else:
        hline(img, eye_x - 1, eye_x + 1, eye_y - 2, C.BLACK)
    # 鼻尖（朝方向前凸 1 像素）
    nose_x = m(3) if facing == "left" else m(13)
    px(img, nose_x, 10, C.SKIN_SHADOW)
    # 耳
    ear_x = m(13) if facing == "left" else m(3)
    px(img, ear_x, 9, skin)
    px(img, ear_x, 10, C.SKIN_SHADOW)
    # 嘴（小点）
    mouth_x = m(5)
    px(img, mouth_x, 12, C.BLACK)
    # 腮红
    cheek_x = m(7)
    for dx, dy in [(-1, 0), (0, 0), (1, 0), (0, -1), (0, 1)]:
        px(img, cheek_x + dx, 10 + dy, C.CHEEK)
    # 头发高光绺
    if hair_mid:
        for x in (13, 16, 19):
            px(img, m(x), 2, hair_mid)
            px(img, m(x + 1), 4, hair_mid)


# ============================================================================
# 玩家：32×32 精细像素（亮红外套 + 金黄短发 + 金色胸章 + 1px 外描边）
# ============================================================================
def player_frame_32(direction: str, step: int) -> Image.Image:
    """
    direction: 'down' | 'left' | 'right' | 'up'
    step: 0..3  (0=并拢站立, 1=右腿前/左臂后, 2=并拢(姿态微异), 3=左腿前/右臂后)
    """
    img = blank_sprite()

    # —— 行走动画腿/脚 + 身体起伏 ——
    # 站立腿起始 y=23 到 y=28（大腿 23-26，小腿 27-28，鞋 29-31）
    leg_offsets_l = 0  # 0 = 站立位；正值=腿向前（y下沉）
    leg_offsets_r = 0
    body_offset = 0     # 身体整体下沉（走路时）
    arm_offsets_l = 0   # 手臂摆动：正值=向前（y增加），负值=向后
    arm_offsets_r = 0

    if step == 1:
        leg_offsets_r = 2    # 右腿前（下沉 2）
        leg_offsets_l = -1   # 左腿后（抬升 1）
        body_offset = 1      # 身体随迈步下沉 1
        arm_offsets_l = 2    # 左臂前（与右腿反相）
        arm_offsets_r = -2   # 右臂后
    elif step == 2:
        # 并拢位 2：与 step=0 几乎相同，微妙微调避免死板
        leg_offsets_r = 0
        leg_offsets_l = 0
        body_offset = 0
        arm_offsets_l = 0
        arm_offsets_r = 0
    elif step == 3:
        leg_offsets_l = 2
        leg_offsets_r = -1
        body_offset = 1
        arm_offsets_r = 2
        arm_offsets_l = -2

    # —— 先画腿和鞋（底层） ——
    # 左腿（x 10..14）
    leg_l_y0 = 23 + body_offset + leg_offsets_l
    rect(img, 10, leg_l_y0, 14, 27 + leg_offsets_l, C.P_PANTS)
    # 左腿阴影（内外两侧）
    vline(img, 10, leg_l_y0, 27 + leg_offsets_l, C.P_PANTS_SHADOW)
    vline(img, 14, leg_l_y0, 27 + leg_offsets_l, C.P_PANTS_MID)
    hline(img, 10, 14, 27 + leg_offsets_l, C.P_PANTS_MID)
    # 左腿裤中缝
    for y in range(leg_l_y0, 28 + leg_offsets_l):
        px(img, 12, y, C.P_PANTS_MID) if (y - leg_l_y0) % 2 == 0 else None
    # 左鞋（x 9..15，y 29-31）
    shoe_l_y0 = 29 + leg_offsets_l
    rect(img, 9, shoe_l_y0, 15, 31, C.P_SHOES)
    hline(img, 9, 15, shoe_l_y0, C.P_SHOES_LACE)       # 鞋口/鞋带
    px(img, 15, shoe_l_y0 + 1, C.P_SHOES_LACE)
    # 鞋底深色
    hline(img, 9, 15, 31, (14, 14, 22, 255))
    # 左腿若抬起（负 offset），鞋 y 上限收
    if leg_offsets_l < 0:
        for y in range(31 + leg_offsets_l + 1, 32):
            hline(img, 9, 15, y, C.TRANSPARENT)  # 清理超出（实际无需操作：我们没有画在那）

    # 右腿（x 17..21）
    leg_r_y0 = 23 + body_offset + leg_offsets_r
    rect(img, 17, leg_r_y0, 21, 27 + leg_offsets_r, C.P_PANTS)
    vline(img, 17, leg_r_y0, 27 + leg_offsets_r, C.P_PANTS_MID)
    vline(img, 21, leg_r_y0, 27 + leg_offsets_r, C.P_PANTS_SHADOW)
    hline(img, 17, 21, 27 + leg_offsets_r, C.P_PANTS_MID)
    for y in range(leg_r_y0, 28 + leg_offsets_r):
        px(img, 19, y, C.P_PANTS_MID) if (y - leg_r_y0) % 2 == 0 else None
    # 右鞋
    shoe_r_y0 = 29 + leg_offsets_r
    rect(img, 16, shoe_r_y0, 22, 31, C.P_SHOES)
    hline(img, 16, 22, shoe_r_y0, C.P_SHOES_LACE)
    px(img, 16, shoe_r_y0 + 1, C.P_SHOES_LACE)
    hline(img, 16, 22, 31, (14, 14, 22, 255))

    # —— 身体（夹克 + 腰带 + 衣领） y 11..22 (含 body_offset) ——
    by0 = 11 + body_offset   # 身体顶 y（锁骨处）
    by1 = 22 + body_offset   # 身体底 y（腰带下）
    # 夹克主身 x 8..23（16 像素宽）
    rect(img, 8, by0, 23, by1, C.P_SHIRT)
    # 夹克两侧阴影
    vline(img, 8, by0, by1, C.P_SHIRT_SHADOW)
    vline(img, 23, by0, by1, C.P_SHIRT_SHADOW)
    # 夹克下摆阴影
    hline(img, 8, 23, by1, C.P_SHIRT_SHADOW)
    # 衣服竖向褶皱（两条在腋下线）
    for y in range(by0 + 2, by1):
        px(img, 9, y, C.P_SHIRT_MID)  if (y - by0) % 3 == 0 else None
        px(img, 22, y, C.P_SHIRT_MID) if (y - by0) % 3 == 1 else None
    # 左肩高光（左上角一小块，模拟光从左上来）
    rect(img, 8, by0, 11, by0 + 2, C.P_SHIRT_HIGHLIGHT)
    px(img, 9, by0 + 3, C.P_SHIRT_HIGHLIGHT)
    # 胸前中央开襟（一条竖向深色线从衣领下到腰带）
    for y in range(by0 + 1, by1 - 1):
        px(img, 15, y, C.P_SHIRT_SHADOW)
        px(img, 16, y, C.P_SHIRT_SHADOW)
    # 衣领（V 型浅棕色）
    px(img, 14, by0, C.P_NECKLACE)
    px(img, 15, by0, C.SKIN_SHADOW)
    px(img, 16, by0, C.SKIN_SHADOW)
    px(img, 17, by0, C.P_NECKLACE)
    px(img, 13, by0 + 1, C.P_NECKLACE)
    px(img, 18, by0 + 1, C.P_NECKLACE)
    px(img, 14, by0 + 1, C.P_SHIRT_SHADOW)
    px(img, 17, by0 + 1, C.P_SHIRT_SHADOW)
    # 脖子
    rect(img, 14, by0 - 1, 17, by0, C.SKIN)
    hline(img, 14, 17, by0, C.SKIN_SHADOW)  # 脖子底

    # 金色胸章（在左胸夹克上：x 19-21, y by0+2..by0+4）
    badge_cx, badge_cy = 20, by0 + 3
    # 外圈
    box_outline(img, badge_cx - 1, badge_cy - 1, badge_cx + 1, badge_cy + 1, C.P_BADGE_OUTER)
    # 内圈
    px(img, badge_cx, badge_cy, C.P_BADGE_INNER)
    px(img, badge_cx - 1, badge_cy, C.P_BADGE_OUTER)
    px(img, badge_cx + 1, badge_cy, C.P_BADGE_OUTER)
    px(img, badge_cx, badge_cy - 1, C.P_BADGE_OUTER)
    px(img, badge_cx, badge_cy + 1, C.P_BADGE_OUTER)
    # 胸章外发光点（高光）
    px(img, badge_cx + 1, badge_cy - 1, C.WHITE)

    # —— 腰带（两像素宽，夹克下部）——
    belt_y = by1 - 2
    hline(img, 8, 23, belt_y,     C.P_BELT)
    hline(img, 8, 23, belt_y + 1, C.P_BELT)
    # 腰带扣（中央金色 2x2）
    buckle_cx = 15
    rect(img, buckle_cx, belt_y, buckle_cx + 1, belt_y + 1, C.P_BELT_BUCKLE)
    box_outline(img, buckle_cx, belt_y, buckle_cx + 1, belt_y + 1, (180, 130, 40, 255))
    # 腰带两侧小细节（针孔）
    for x in (11, 12, 20, 21):
        px(img, x, belt_y, C.P_BELT_BUCKLE)

    # —— 手臂（夹克袖 + 皮肤手，从身体两侧伸出并摆动） ——
    # 左臂（x 6..7，y by0+1..by1+1 + 摆动偏移）
    arm_l_y0 = by0 + 2 + arm_offsets_l
    arm_l_y1 = by1 - 1 + arm_offsets_l
    rect(img, 6, arm_l_y0, 7, arm_l_y1, C.P_SHIRT)
    vline(img, 6, arm_l_y0, arm_l_y1, C.P_SHIRT_SHADOW)  # 袖外侧阴影
    vline(img, 7, arm_l_y0, arm_l_y1, C.P_SHIRT_MID)    # 袖内侧
    # 袖口
    hline(img, 6, 7, arm_l_y1, C.P_BELT)                 # 袖口边
    # 手（皮肤，从袖口伸出 y=arm_l_y1+1..+2）
    hand_l_y = min(arm_l_y1 + 1, 30)
    rect(img, 6, hand_l_y, 7, hand_l_y + 1, C.SKIN)
    px(img, 6, hand_l_y + 1, C.SKIN_SHADOW)
    px(img, 7, hand_l_y + 1, C.SKIN_SHADOW)

    # 右臂（x 24..25）
    arm_r_y0 = by0 + 2 + arm_offsets_r
    arm_r_y1 = by1 - 1 + arm_offsets_r
    rect(img, 24, arm_r_y0, 25, arm_r_y1, C.P_SHIRT)
    vline(img, 24, arm_r_y0, arm_r_y1, C.P_SHIRT_MID)
    vline(img, 25, arm_r_y0, arm_r_y1, C.P_SHIRT_SHADOW)
    hline(img, 24, 25, arm_r_y1, C.P_BELT)
    hand_r_y = min(arm_r_y1 + 1, 30)
    rect(img, 24, hand_r_y, 25, hand_r_y + 1, C.SKIN)
    px(img, 24, hand_r_y + 1, C.SKIN_SHADOW)
    px(img, 25, hand_r_y + 1, C.SKIN_SHADOW)

    # —— 头（方向决定样式） y 0..10 (含 body_offset) ——
    hy_off = body_offset   # 头发顶偏移
    if direction == "down":
        # 脸
        draw_face_down_32(img, skin=C.SKIN,
                          hair=C.P_HAIR, hair_mid=C.P_HAIR_MID, hair_s=C.P_HAIR_SHADOW,
                          eye_y=9 + hy_off, left_eye_x=12, right_eye_x=18,
                          brow=True, nose=True, mouth=True, cheek=True)
        # 头顶头发（y 0..4，帽形短碎发）
        rect(img, 9, 0 + hy_off, 22, 1 + hy_off, C.P_HAIR)
        rect(img, 8, 2 + hy_off, 23, 3 + hy_off, C.P_HAIR)
        # 头顶漩涡（一个小圆点阴影）
        px(img, 15, 0 + hy_off, C.P_HAIR_SHADOW)
        px(img, 16, 0 + hy_off, C.P_HAIR_SHADOW)
        # 头顶高光绺
        px(img, 12, 0 + hy_off, C.P_HAIR_MID)
        px(img, 19, 0 + hy_off, C.P_HAIR_MID)
        # 头后部（两侧略向外）
        px(img, 7, 4 + hy_off, C.P_HAIR_SHADOW)
        px(img, 24, 4 + hy_off, C.P_HAIR_SHADOW)
        # 脖子（底到 by0）
        rect(img, 13, 14 + hy_off, 18, by0 - 1, C.SKIN)
        hline(img, 13, 18, by0 - 1, C.SKIN_SHADOW)

    elif direction == "up":
        # 后脑 + 后颈
        draw_head_up_32(img, C.P_HAIR, C.P_HAIR_MID, C.P_HAIR_SHADOW)
        # 后脑勺加个小撮（更自然）
        rect(img, 9, 0 + hy_off, 22, 1 + hy_off, C.P_HAIR)
        px(img, 15, 0 + hy_off, C.P_HAIR_SHADOW)
        px(img, 16, 0 + hy_off, C.P_HAIR_SHADOW)
        # 领口阴影（夹克后领）
        hline(img, 11, 20, by0, C.P_SHIRT_SHADOW)
        hline(img, 12, 19, by0 - 1, C.P_NECKLACE)

    elif direction == "left":
        draw_head_side_32(img, C.SKIN, C.P_HAIR, C.P_HAIR_MID, C.P_HAIR_SHADOW, "left")
        # 头顶
        rect(img, 10, 0 + hy_off, 22, 1 + hy_off, C.P_HAIR)
        # 脖子（侧面）
        rect(img, 14, 12, 19, by0 - 1, C.SKIN)
        vline(img, 14, 12, by0 - 1, C.SKIN_SHADOW)
    elif direction == "right":
        draw_head_side_32(img, C.SKIN, C.P_HAIR, C.P_HAIR_MID, C.P_HAIR_SHADOW, "right")
        rect(img, 9, 0 + hy_off, 21, 1 + hy_off, C.P_HAIR)
        rect(img, 12, 12, 17, by0 - 1, C.SKIN)
        vline(img, 17, 12, by0 - 1, C.SKIN_SHADOW)

    # —— 1px 深色外描边 ——
    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 村长：32×32 idle down（白胡须 + 金珠拐杖 + 蓝长袍）
# ============================================================================
def npc_elder_frame_32() -> Image.Image:
    img = blank_sprite()

    # —— 脚（木拖鞋，站在 y 29-31） ——
    # 左脚
    rect(img, 9, 29, 14, 31, C.E_SANDAL)
    hline(img, 9, 14, 29, (180, 130, 80, 255))
    # 右脚
    rect(img, 17, 29, 22, 31, C.E_SANDAL)
    hline(img, 17, 22, 29, (180, 130, 80, 255))
    # 鞋钉
    for x in (10, 13, 18, 21):
        px(img, x, 31, (90, 60, 30, 255))

    # —— 长袍下摆（y 22-29，盖住腿）——
    rect(img, 6, 22, 25, 29, C.E_ROBE)
    # 长袍波浪下摆（不是一条直线）
    for x in range(6, 26):
        depth = 1 if (x % 6 == 0) else 0
        px(img, x, 28 + depth, C.E_ROBE_SHADOW)
    hline(img, 6, 25, 29, C.E_ROBE_SHADOW)
    # 长袍两侧阴影
    vline(img, 6, 22, 29, C.E_ROBE_SHADOW)
    vline(img, 25, 22, 29, C.E_ROBE_SHADOW)
    # 长袍中央折
    for y in range(22, 30):
        px(img, 15, y, C.E_ROBE_MID)
        px(img, 16, y, C.E_ROBE_MID)

    # —— 长袍上身（y 11-22）——
    rect(img, 6, 11, 25, 22, C.E_ROBE)
    vline(img, 6, 11, 22, C.E_ROBE_SHADOW)
    vline(img, 25, 11, 22, C.E_ROBE_SHADOW)
    hline(img, 6, 25, 22, C.E_ROBE_SHADOW)
    # 袖口（金色镶边）
    for y in range(18, 21):
        hline(img, 4, 7, y, C.E_ROBE_TRIM)
        hline(img, 24, 27, y, C.E_ROBE_TRIM)
    # 手（从袖口里伸出，肤色）
    # 左手（左袖，x 4-6）
    rect(img, 4, 20, 6, 22, C.SKIN)
    # 右手（右袖，x 25-27）—— 这里他握着拐杖，所以手握在 x 25，拐杖 x 3
    rect(img, 25, 20, 27, 22, C.SKIN)
    px(img, 4, 22, C.SKIN_SHADOW)
    px(img, 27, 22, C.SKIN_SHADOW)
    # 胸前长袍褶皱
    for y in range(13, 22):
        if (y - 13) % 3 == 0:
            px(img, 10, y, C.E_ROBE_MID)
            px(img, 21, y, C.E_ROBE_MID)

    # —— 腰部宽腰带（深色）——
    hline(img, 6, 25, 21, C.E_ROBE_SHADOW)
    hline(img, 6, 25, 22, C.E_ROBE_TRIM)
    # 腰带扣
    rect(img, 14, 21, 17, 22, C.E_STAFF_TOP)
    box_outline(img, 14, 21, 17, 22, C.E_STAFF_TOP_DARK)

    # —— 木拐杖：左手边，从 y 3（顶部金珠）到 y 31（底部）——
    # 拐杖杆（x 3-4，两像素粗）
    vline(img, 3, 5, 31, C.E_STAFF)
    vline(img, 4, 5, 31, C.E_STAFF_LIGHT)
    # 拐杖节（每隔 6 像素一小圈深色）
    for y in (9, 15, 21, 27):
        px(img, 3, y, (90, 60, 30, 255))
        px(img, 4, y, (90, 60, 30, 255))
    # 拐杖头金珠（大圆形，x 1..5, y 1..5）
    for cy in range(1, 6):
        for cx in range(1, 6):
            # 菱形：切角的方形
            if abs(cx - 3) + abs(cy - 3) <= 2:
                px(img, cx, cy, C.E_STAFF_TOP)
    # 金珠阴影
    px(img, 2, 4, C.E_STAFF_TOP_DARK)
    px(img, 5, 4, C.E_STAFF_TOP_DARK)
    px(img, 4, 5, C.E_STAFF_TOP_DARK)
    # 金珠高光
    px(img, 2, 2, C.WHITE)
    # 手握拐杖处（x 3-4 y 20-22 被手覆盖，已在上面画手）
    rect(img, 3, 20, 4, 22, C.E_STAFF)  # 拐杖继续从手后穿下
    rect(img, 25, 20, 27, 22, C.SKIN)  # 右手保持皮肤

    # —— 头：白头发 + 长白胡须（draw_face_down 已含胡须）——
    draw_face_down_32(img, skin=C.SKIN,
                      hair=C.E_HAIR_WHITE, hair_mid=None, hair_s=C.E_HAIR_GRAY,
                      eye_y=9, left_eye_x=12, right_eye_x=18,
                      brow=True, nose=True, mouth=True, cheek=False,
                      beard=True, beard_long=True)
    # 头顶秃头（老人头顶稀疏）
    rect(img, 12, 0, 19, 2, C.SKIN)     # 头顶秃
    hline(img, 12, 19, 2, C.E_HAIR_WHITE)  # 发际
    # 两侧白发（头两侧）
    rect(img, 8, 1, 11, 5, C.E_HAIR_WHITE)
    rect(img, 20, 1, 23, 5, C.E_HAIR_WHITE)
    # 白发下沿灰
    hline(img, 8, 11, 5, C.E_HAIR_GRAY)
    hline(img, 20, 23, 5, C.E_HAIR_GRAY)
    # 头顶老年斑（两小点浅褐）
    px(img, 14, 1, C.CHEEK)
    px(img, 17, 1, C.CHEEK)
    # 头顶高光（白色头发反射光）
    px(img, 10, 2, C.WHITE)
    px(img, 21, 2, C.WHITE)
    # 脖子
    rect(img, 13, 14, 18, 16, C.SKIN_SHADOW)

    # 脖子上挂个小念珠（2 颗棕色珠子）
    px(img, 14, 17, (140, 90, 40, 255))
    px(img, 17, 17, (140, 90, 40, 255))
    px(img, 15, 18, (140, 90, 40, 255))
    px(img, 16, 18, (140, 90, 40, 255))

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 商店老板：32×32 idle down（红帽 + 黄围裙 + 胸前钱袋 + 金币）
# ============================================================================
def npc_merchant_frame_32() -> Image.Image:
    img = blank_sprite()

    # —— 鞋（y 29-31）——
    rect(img, 9, 29, 14, 31, C.M_SHOES)
    rect(img, 17, 29, 22, 31, C.M_SHOES)
    hline(img, 9, 14, 29, (70, 54, 44, 255))
    hline(img, 17, 22, 29, (70, 54, 44, 255))
    hline(img, 9, 14, 31, (20, 14, 10, 255))
    hline(img, 17, 22, 31, (20, 14, 10, 255))

    # —— 裤子（y 23-28）——
    rect(img, 10, 23, 14, 28, C.M_PANTS)
    rect(img, 17, 23, 21, 28, C.M_PANTS)
    vline(img, 10, 23, 28, C.M_PANTS_SHADOW)
    vline(img, 14, 23, 28, C.M_PANTS_SHADOW)
    vline(img, 17, 23, 28, C.M_PANTS_SHADOW)
    vline(img, 21, 23, 28, C.M_PANTS_SHADOW)
    hline(img, 10, 14, 28, C.M_PANTS_SHADOW)
    hline(img, 17, 21, 28, C.M_PANTS_SHADOW)
    # 裤中缝
    for y in range(23, 29):
        px(img, 12, y, C.M_PANTS_SHADOW) if (y - 23) % 2 == 0 else None
        px(img, 19, y, C.M_PANTS_SHADOW) if (y - 23) % 2 == 1 else None

    # —— 衬衣 + 围裙（y 11-23）——
    # 衬衣底（米白，全身）
    rect(img, 7, 11, 24, 23, C.M_SHIRT)
    # 衬衣两侧阴影
    vline(img, 7, 11, 23, C.M_SHIRT_SHADOW)
    vline(img, 24, 11, 23, C.M_SHIRT_SHADOW)
    hline(img, 7, 24, 23, C.M_SHIRT_SHADOW)
    # 衬衣翻领
    rect(img, 13, 11, 18, 12, C.M_COLLAR)
    px(img, 12, 11, C.M_COLLAR)
    px(img, 19, 11, C.M_COLLAR)
    # 衬衣纽扣（3 颗竖向）
    for y in (14, 17, 20):
        px(img, 15, y, C.M_PANTS)
        px(img, 16, y, C.M_PANTS)
    # 衬衣袖子（袖口伸到身体外）
    # 左袖
    rect(img, 5, 14, 7, 19, C.M_SHIRT)
    vline(img, 5, 14, 19, C.M_SHIRT_SHADOW)
    rect(img, 5, 20, 7, 22, C.SKIN)  # 手
    # 右袖
    rect(img, 24, 14, 26, 19, C.M_SHIRT)
    vline(img, 26, 14, 19, C.M_SHIRT_SHADOW)
    rect(img, 24, 20, 26, 22, C.SKIN)  # 手

    # 黄围裙（胸前到大腿，中央覆盖衬衣）
    apron_x0, apron_y0 = 10, 13
    apron_x1, apron_y1 = 21, 24
    rect(img, apron_x0, apron_y0, apron_x1, apron_y1, C.M_APRON)
    # 围裙边缘阴影
    vline(img, apron_x0, apron_y0, apron_y1, C.M_APRON_SHADOW)
    vline(img, apron_x1, apron_y0, apron_y1, C.M_APRON_SHADOW)
    hline(img, apron_x0, apron_x1, apron_y1, C.M_APRON_SHADOW)
    # 围裙竖向条纹（2 条浅色）
    for x in (13, 18):
        vline(img, x, apron_y0 + 1, apron_y1 - 1, C.M_APRON_STRIPE)
    # 围裙横向装饰带（中上部一条深色）
    hline(img, apron_x0, apron_x1, apron_y0 + 4, C.M_APRON_SHADOW)
    # 围裙口袋（右下角）
    pocket_x0, pocket_y0 = 15, 19
    pocket_x1, pocket_y1 = 20, 22
    box_outline(img, pocket_x0, pocket_y0, pocket_x1, pocket_y1, C.M_APRON_SHADOW)
    for y in range(pocket_y0 + 1, pocket_y1):
        for x in range(pocket_x0 + 1, pocket_x1):
            px(img, x, y, C.M_APRON_MID)

    # 钱袋（挂在围裙右腰，x 21-24, y 20-23）——小麻袋造型
    pouch_cx, pouch_cy = 22, 21
    # 钱袋主体
    rect(img, pouch_cx - 1, pouch_cy - 1, pouch_cx + 2, pouch_cy + 2, C.M_POUCH)
    px(img, pouch_cx - 1, pouch_cy - 1, C.M_POUCH_DARK)
    px(img, pouch_cx + 2, pouch_cy - 1, C.M_POUCH_DARK)
    hline(img, pouch_cx - 1, pouch_cx + 2, pouch_cy + 2, C.M_POUCH_DARK)
    # 钱袋系绳
    hline(img, pouch_cx, pouch_cx + 1, pouch_cy - 2, C.M_POUCH_STRING)
    vline(img, pouch_cx, pouch_cy - 3, pouch_cy - 2, C.M_POUCH_STRING)
    vline(img, pouch_cx + 1, pouch_cy - 3, pouch_cy - 2, C.M_POUCH_STRING)
    # 钱袋上印$符号（一颗金色小圆=金币）
    px(img, pouch_cx, pouch_cy, C.M_COIN)
    px(img, pouch_cx + 1, pouch_cy, C.M_COIN)
    # 掉出一颗小金币在钱袋下方（点缀）
    px(img, pouch_cx + 2, pouch_cy + 3, C.M_COIN)
    box_outline(img, pouch_cx + 2, pouch_cy + 3, pouch_cx + 2, pouch_cy + 3, (200, 160, 40, 255))

    # 围裙背带（跨肩膀斜挂到颈部两侧）
    # 左背带：从 apron 左上角 (10,13) 斜上到左领 (12,11)
    for step in range(3):
        px(img, 10 + step, 13 - step, C.M_APRON)
        px(img, 10 + step, 13 - step - 1, C.M_APRON_SHADOW)
    # 右背带：从 (21,13) 斜上到右领 (19,11)
    for step in range(3):
        px(img, 21 - step, 13 - step, C.M_APRON)
        px(img, 21 - step, 13 - step - 1, C.M_APRON_SHADOW)

    # —— 头：红帽 + 浅棕金头发 ——
    # 头发（盖在脸前额 + 两侧）
    draw_face_down_32(img, skin=C.SKIN,
                      hair=C.M_HAIR, hair_mid=C.M_HAIR_MID, hair_s=C.M_HAIR_SHADOW,
                      eye_y=9, left_eye_x=12, right_eye_x=18,
                      brow=True, nose=True, mouth=True, cheek=False)
    # 脖子
    rect(img, 13, 14, 18, 16, C.SKIN)
    hline(img, 13, 18, 16, C.SKIN_SHADOW)

    # 红色圆顶帽（盖在头顶 y 0..5）
    # 帽冠主体
    rect(img, 9, 1, 22, 4, C.M_HAT)
    rect(img, 10, 0, 21, 0, C.M_HAT)
    # 帽冠阴影（下方）
    hline(img, 9, 22, 4, C.M_HAT_MID)
    hline(img, 10, 21, 5, C.M_HAT_SHADOW)
    # 帽冠高光（上方弧形）
    hline(img, 11, 14, 0, (230, 100, 100, 255))
    hline(img, 17, 20, 0, (230, 100, 100, 255))
    # 帽檐（四周伸出一圈深色带）
    rect(img, 7, 4, 24, 5, C.M_HAT_SHADOW)
    hline(img, 7, 24, 5, C.M_HAT_BAND)
    hline(img, 7, 24, 4, C.M_HAT_MID)
    # 帽檐顶部装饰（前方中央一白色小方块=帽徽）
    rect(img, 14, 2, 17, 3, C.WHITE)
    px(img, 14, 2, C.M_HAT)
    px(img, 17, 2, C.M_HAT)
    px(img, 15, 2, (200, 200, 200, 255))
    px(img, 16, 2, (200, 200, 200, 255))
    # 帽子两侧突出（遮挡鬓角处）
    px(img, 8, 3, C.M_HAT_MID)
    px(img, 23, 3, C.M_HAT_MID)

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# 神秘少女：32×32 idle down（紫长发及腰 + 深紫斗篷 + 丝带发饰）
# ============================================================================
def npc_girl_frame_32() -> Image.Image:
    img = blank_sprite()

    # —— 鞋（小紫鞋，y 30-31）——
    rect(img, 10, 30, 14, 31, C.G_SHOES)
    rect(img, 17, 30, 21, 31, C.G_SHOES)
    hline(img, 10, 14, 31, (36, 24, 50, 255))
    hline(img, 17, 21, 31, (36, 24, 50, 255))
    # 鞋尖小花（粉）
    px(img, 12, 30, C.G_RIBBON)
    px(img, 19, 30, C.G_RIBBON)

    # —— 腿（被内裙 + 斗篷盖，只露出膝盖上方一小截皮肤）——
    # 只在 y 28-29 之间露脚踝肤
    rect(img, 10, 28, 14, 29, C.SKIN)
    rect(img, 17, 28, 21, 29, C.SKIN)
    hline(img, 10, 14, 29, C.SKIN_SHADOW)
    hline(img, 17, 21, 29, C.SKIN_SHADOW)

    # —— 连衣裙（浅紫，内裙） y 20-28（短裙）——
    rect(img, 10, 20, 21, 28, C.G_DRESS)
    # 裙褶（竖向 3 条阴影）
    for x in (12, 15, 18):
        for y in range(22, 28):
            if (y - 22) % 2 == 0:
                px(img, x, y, C.G_DRESS_SHADOW)
    # 裙底波浪
    for x in range(10, 22):
        depth = 1 if x % 4 == 1 else 0
        px(img, x, 27 + depth, C.G_DRESS_SHADOW)
    hline(img, 10, 21, 28, C.G_DRESS_SHADOW)

    # —— 斗篷（披在连衣裙外，更大一圈，盖到 y 10-29）——
    # 斗篷主体（比裙宽 2 像素）
    rect(img, 7, 12, 24, 27, C.G_CLOAK)
    # 斗篷两侧阴影
    vline(img, 7, 12, 27, C.G_CLOAK_SHADOW)
    vline(img, 24, 12, 27, C.G_CLOAK_SHADOW)
    hline(img, 7, 24, 27, C.G_CLOAK_SHADOW)
    # 斗篷前襟（从脖子到腰的开口，露出连衣裙内衬色）
    for y in range(13, 23):
        px(img, 14, y, C.G_CLOAK_LINING)
        px(img, 15, y, C.G_CLOAK_LINING)
        px(img, 16, y, C.G_CLOAK_LINING)
        px(img, 17, y, C.G_CLOAK_LINING)
    # 前襟丝带边（粉丝带滚边）
    for y in range(13, 28):
        px(img, 13, y, C.G_RIBBON)
        px(img, 18, y, C.G_RIBBON)
    # 前襟开口处裙身可见（在领口下露一小段连衣裙）
    rect(img, 14, 13, 17, 19, C.G_DRESS)

    # 胸前丝带结（大蝴蝶结）
    bow_cx, bow_cy = 15, 13
    # 左蝶翼
    for dx, dy in [(-1, 0), (-2, 0), (-1, -1), (-2, -1), (-1, 1), (-2, 1), (-3, 0)]:
        px(img, bow_cx + dx, bow_cy + dy, C.G_RIBBON)
    # 右蝶翼
    for dx, dy in [(+1, 0), (+2, 0), (+1, -1), (+2, -1), (+1, 1), (+2, 1), (+3, 0)]:
        px(img, bow_cx + dx, bow_cy + dy, C.G_RIBBON)
    # 中心结
    rect(img, bow_cx - 1, bow_cy, bow_cx + 2, bow_cy + 1, C.G_RIBBON_SHADOW)
    # 蝴蝶结飘带（两条向下）
    for dy in range(2, 6):
        px(img, bow_cx - 1, bow_cy + dy, C.G_RIBBON)
        px(img, bow_cx + 2, bow_cy + dy, C.G_RIBBON)
        if dy % 2 == 0:
            px(img, bow_cx - 2, bow_cy + dy, C.G_RIBBON_SHADOW)
            px(img, bow_cx + 3, bow_cy + dy, C.G_RIBBON_SHADOW)
    # 飘带末端燕尾
    px(img, bow_cx - 2, bow_cy + 6, C.G_RIBBON)
    px(img, bow_cx - 1, bow_cy + 6, C.G_RIBBON)
    px(img, bow_cx - 2, bow_cy + 7, C.G_RIBBON_SHADOW)
    px(img, bow_cx + 3, bow_cy + 6, C.G_RIBBON)
    px(img, bow_cx + 2, bow_cy + 6, C.G_RIBBON)
    px(img, bow_cx + 3, bow_cy + 7, C.G_RIBBON_SHADOW)
    # 吊坠（蝴蝶结下的小宝石）
    px(img, bow_cx, bow_cy + 2, C.G_CHARM)
    px(img, bow_cx + 1, bow_cy + 2, C.G_CHARM)
    px(img, bow_cx, bow_cy + 3, C.G_CHARM_CENTER)
    px(img, bow_cx + 1, bow_cy + 3, C.G_CHARM_CENTER)

    # 斗篷领口（大圆形披风领）
    # 领口大翻领（y 10-12，略翘）
    rect(img, 6, 10, 25, 12, C.G_CLOAK)
    vline(img, 6, 10, 12, C.G_CLOAK_MID)
    vline(img, 25, 10, 12, C.G_CLOAK_MID)
    hline(img, 6, 25, 10, C.G_CLOAK_MID)
    # 翻领内侧露出（浅紫）
    rect(img, 12, 11, 19, 12, C.G_CLOAK_LINING)
    hline(img, 12, 19, 12, C.G_RIBBON_SHADOW)  # 领口贴边

    # 手臂（斗篷袖，手从袖中伸出）
    # 左斗篷袖（宽大）
    rect(img, 4, 14, 7, 22, C.G_CLOAK)
    vline(img, 4, 14, 22, C.G_CLOAK_SHADOW)
    vline(img, 7, 14, 22, C.G_CLOAK_MID)
    # 袖口开口
    hline(img, 4, 7, 22, C.G_CLOAK_LINING)
    # 手（肤色）
    rect(img, 5, 23, 7, 25, C.SKIN)
    # 右斗篷袖
    rect(img, 24, 14, 27, 22, C.G_CLOAK)
    vline(img, 24, 14, 22, C.G_CLOAK_MID)
    vline(img, 27, 14, 22, C.G_CLOAK_SHADOW)
    hline(img, 24, 27, 22, C.G_CLOAK_LINING)
    rect(img, 24, 23, 26, 25, C.SKIN)

    # —— 紫长发（背后+两侧，及腰）——
    # 先发后（背后的头发，y 8 到 y 26，从斗篷外露出在两侧）
    # 左侧发绺（x 3-6，y 8-26）
    for y in range(8, 27):
        # 波浪宽（每 3 像素左右变化 1 宽度）
        w = 4 if (y - 8) % 6 < 3 else 3
        for x in range(3, 3 + w):
            shade = C.G_HAIR
            if x == 3 + w - 1:
                shade = C.G_HAIR_SHADOW
            if x == 3:
                shade = C.G_HAIR_MID
            px(img, x, y, shade)
    # 发尖（y 27-28，更浅）
    for x in range(3, 7):
        px(img, x, 27, C.G_HAIR_TIP)
        px(img, x, 28, C.G_HAIR_SHADOW)
    # 右侧发绺（x 25-29，y 8-26）
    for y in range(8, 27):
        w = 4 if (y - 8) % 6 < 3 else 3
        for x in range(29 - w + 1, 30):
            shade = C.G_HAIR
            if x == 29 - w + 1:
                shade = C.G_HAIR_SHADOW
            if x == 29:
                shade = C.G_HAIR_MID
            px(img, x, y, shade)
    for x in range(26, 30):
        px(img, x, 27, C.G_HAIR_TIP)
        px(img, x, 28, C.G_HAIR_SHADOW)
    # 背后长发主体（在斗篷后可见一小条于腰部 y 20-27）
    for y in range(20, 28):
        px(img, 8, y, C.G_HAIR)
        px(img, 23, y, C.G_HAIR)
        if (y - 20) % 3 == 0:
            px(img, 9, y, C.G_HAIR_MID)
            px(img, 22, y, C.G_HAIR_MID)
        else:
            px(img, 9, y, C.G_HAIR_SHADOW)
            px(img, 22, y, C.G_HAIR_SHADOW)

    # —— 头：脸 + 刘海（紫发）——
    draw_face_down_32(img, skin=C.SKIN,
                      hair=C.G_HAIR, hair_mid=C.G_HAIR_HIGHLIGHT, hair_s=C.G_HAIR_SHADOW,
                      eye_y=9, left_eye_x=12, right_eye_x=18,
                      brow=True, nose=True, mouth=True, cheek=True)
    # 脖子
    rect(img, 13, 14, 18, 16, C.SKIN)
    hline(img, 13, 18, 16, C.SKIN_SHADOW)
    # 脖子项链（细小链 + 紫水晶坠）
    for x in (13, 14, 17, 18):
        px(img, x, 15, C.G_PENDANT_CHAIN)
    # 坠子
    px(img, 15, 17, C.G_CHARM)
    px(img, 16, 17, C.G_CHARM)
    px(img, 15, 18, C.G_CHARM_CENTER)
    px(img, 16, 18, C.G_CHARM_CENTER)

    # 头顶头发（长发顶）
    rect(img, 9, 0, 22, 1, C.G_HAIR)
    rect(img, 8, 2, 23, 3, C.G_HAIR)
    # 头顶分缝（深色线，中分）
    vline(img, 15, 0, 3, C.G_HAIR_SHADOW)
    vline(img, 16, 0, 3, C.G_HAIR_SHADOW)
    # 头顶高光绺（几缕浅色）
    for x in (10, 12, 19, 21):
        for y in (0, 2):
            if (x + y) % 2 == 0:
                px(img, x, y, C.G_HAIR_HIGHLIGHT)
    # 头顶丝带花发饰（左上方，x 8-10, y 0-2）
    flower_cx, flower_cy = 9, 1
    # 花瓣（粉色6点）
    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1)]:
        px(img, flower_cx + dx, flower_cy + dy, C.G_RIBBON)
    # 花芯
    px(img, flower_cx, flower_cy, C.G_CHARM_CENTER)
    # 发饰小叶子
    px(img, flower_cx - 2, flower_cy + 1, C.T_FLOWER_LEAF)
    px(img, flower_cx - 2, flower_cy, C.T_FLOWER_LEAF)
    # 丝带蝴蝶结尾
    px(img, flower_cx - 1, flower_cy + 2, C.G_RIBBON)
    px(img, flower_cx, flower_cy + 2, C.G_RIBBON)
    px(img, flower_cx - 1, flower_cy + 3, C.G_RIBBON_SHADOW)
    px(img, flower_cx, flower_cy + 3, C.G_RIBBON_SHADOW)

    add_outline(img, C.OUTLINE)
    return img


# ============================================================================
# Spritesheet 组装
# ============================================================================
def build_player_sheet_32() -> Image.Image:
    """128x128 = 4 列 × 4 行，每帧 32x32。"""
    sheet = Image.new("RGBA", (SP * 4, SP * 4), C.TRANSPARENT)
    directions = ["down", "left", "right", "up"]
    for row, d in enumerate(directions):
        for col in range(4):
            frame = player_frame_32(d, col)
            sheet.paste(frame, (col * SP, row * SP))
    return sheet


# ============================================================================
# 瓦片集（16×16 不变，保留已有实现，但常量改为 TILE）
# ============================================================================
def draw_tile_base(img, tile_idx, base, base_dark, base_light, speck_count=10, seed=0):
    x0 = tile_idx * TILE
    for y in range(TILE):
        for x in range(x0, x0 + TILE):
            img.putpixel((x, y), base)
    rng_state = (seed * 9301 + 49297) % 233280
    def rnd():
        nonlocal rng_state
        rng_state = (rng_state * 9301 + 49297) % 233280
        return rng_state / 233280.0
    for _ in range(speck_count):
        x = x0 + int(rnd() * TILE)
        y = int(rnd() * TILE)
        c = base_light if rnd() < 0.45 else base_dark
        if x0 <= x < x0 + TILE and 0 <= y < TILE:
            img.putpixel((x, y), c)
    for y in range(TILE):
        img.putpixel((x0, y), base)
        img.putpixel((x0 + TILE - 1, y), base)


def draw_tileset_16() -> Image.Image:
    """瓦片集 8 格 × 1 行 = 128×16（每格 16×16）。保持原实现。"""
    img = blank_tileset()

    # gid 1 草地
    draw_tile_base(img, 0, C.T_GRASS, C.T_GRASS_DARK, C.T_GRASS_LIGHT, 14, seed=1)
    for gx, gy in [(2, 5), (8, 3), (12, 10), (5, 12)]:
        px(img, 0 * TILE + gx, gy, C.T_GRASS_LIGHT)
        px(img, 0 * TILE + gx, gy - 1, C.T_GRASS_LIGHT)
    # gid 2 泥土
    draw_tile_base(img, 1, C.T_DIRT, C.T_DIRT_DARK, C.T_DIRT_LIGHT, 16, seed=2)
    for gx, gy in [(3, 6), (9, 4), (11, 11)]:
        px(img, TILE + gx, gy, C.T_STONE_DARK)
        px(img, TILE + gx + 1, gy, C.T_STONE)
    # gid 3 石墙
    draw_tile_base(img, 2, C.T_STONE, C.T_STONE_DARK, C.T_STONE_LIGHT, 8, seed=3)
    x0 = 2 * TILE
    for y in (5, 11):
        for x in range(TILE):
            px(img, x0 + x, y, C.T_STONE_DARK)
    for y in range(0, 5):
        px(img, x0 + 4, y, C.T_STONE_DARK)
        px(img, x0 + 11, y, C.T_STONE_DARK)
    for y in range(6, 11):
        px(img, x0 + 1, y, C.T_STONE_DARK)
        px(img, x0 + 8, y, C.T_STONE_DARK)
    for y in range(12, 16):
        px(img, x0 + 4, y, C.T_STONE_DARK)
        px(img, x0 + 11, y, C.T_STONE_DARK)
    for gx, gy in [(2, 2), (9, 3), (6, 8), (13, 9), (3, 14)]:
        px(img, x0 + gx, gy, C.T_STONE_LIGHT)
    # gid 4 水
    x0 = 3 * TILE
    draw_tile_base(img, 3, C.T_WATER, C.T_WATER_DARK, C.T_WATER_LIGHT, 0, seed=4)
    for wave_y in (3, 8, 13):
        for x in range(TILE):
            if (x + wave_y) % 4 in (1, 2):
                px(img, x0 + x, wave_y, C.T_WATER_LIGHT)
            else:
                px(img, x0 + x, wave_y, C.T_WATER_DARK)
    for gx, gy in [(1, 1), (12, 5), (5, 11), (14, 14)]:
        px(img, x0 + gx, gy, C.WHITE)
    # gid 5 农田土
    x0 = 4 * TILE
    draw_tile_base(img, 4, C.T_SOIL, C.T_SOIL_DARK, (116, 84, 56, 255), 8, seed=5)
    for fy in (3, 7, 11):
        for x in range(TILE):
            px(img, x0 + x, fy, C.T_SOIL_LINE)
            px(img, x0 + x, fy + 1, C.T_SOIL_DARK)
    # gid 6 木地板
    x0 = 5 * TILE
    draw_tile_base(img, 5, C.T_WOOD, C.T_WOOD_DARK, (212, 168, 108, 255), 6, seed=6)
    for fx in (5, 10):
        for y in range(TILE):
            px(img, x0 + fx, y, C.T_WOOD_LINE)
    for gx, gy in [(2, 3), (7, 10), (13, 5), (3, 13)]:
        px(img, x0 + gx, gy, C.T_WOOD_DARK)
        px(img, x0 + gx + 1, gy, C.T_WOOD_LINE)
    # gid 7 小路
    x0 = 6 * TILE
    draw_tile_base(img, 6, C.T_PATH, C.T_PATH_DARK, C.T_PATH_LIGHT, 12, seed=7)
    for gx, gy in [(4, 4), (10, 9)]:
        rect(img, x0 + gx, gy, x0 + gx + 1, gy + 1, C.T_PATH_LIGHT)
    for gx, gy in [(2, 12), (13, 3), (7, 14)]:
        px(img, x0 + gx, gy, C.T_PATH_DARK)
    # gid 8 花
    x0 = 7 * TILE
    draw_tile_base(img, 7, C.T_GRASS, C.T_GRASS_DARK, C.T_GRASS_LIGHT, 10, seed=8)
    for fx, fy in [(3, 4), (11, 5), (5, 11), (12, 12)]:
        px(img, x0 + fx, fy, C.T_FLOWER_PETAL)
        px(img, x0 + fx + 1, fy, C.T_FLOWER_PETAL)
        px(img, x0 + fx - 1, fy, C.T_FLOWER_PETAL)
        px(img, x0 + fx, fy + 1, C.T_FLOWER_PETAL)
        px(img, x0 + fx, fy - 1, C.T_FLOWER_PETAL)
        px(img, x0 + fx, fy, C.T_FLOWER_CENTER)
        px(img, x0 + fx - 2, fy + 1, C.T_FLOWER_LEAF)
        px(img, x0 + fx + 2, fy + 1, C.T_FLOWER_LEAF)
    return img


# ============================================================================
# 主入口
# ============================================================================
def main() -> None:
    os.makedirs(SPRITE_DIR, exist_ok=True)
    os.makedirs(TILE_DIR, exist_ok=True)

    # 1. 玩家 spritesheet（128×128，每帧 32×32）
    sheet = build_player_sheet_32()
    out = os.path.join(SPRITE_DIR, "player.png")
    sheet.save(out)
    print(f"[OK] player.png   {sheet.size}  (4方向×4帧，每帧32x32)")

    # 2. 村长（32×32 idle down）
    elder = npc_elder_frame_32()
    out = os.path.join(SPRITE_DIR, "npc_elder.png")
    elder.save(out)
    print(f"[OK] npc_elder.png  {elder.size}  (村长 idle down)")

    # 3. 商店老板（32×32 idle down）
    merchant = npc_merchant_frame_32()
    out = os.path.join(SPRITE_DIR, "npc_merchant.png")
    merchant.save(out)
    print(f"[OK] npc_merchant.png  {merchant.size}  (商店老板 idle down)")

    # 4. 神秘少女（32×32 idle down）
    girl = npc_girl_frame_32()
    out = os.path.join(SPRITE_DIR, "npc_girl.png")
    girl.save(out)
    print(f"[OK] npc_girl.png  {girl.size}  (神秘少女 idle down)")

    # 5. 瓦片集（128×16，每格 16×16）
    tiles = draw_tileset_16()
    out = os.path.join(TILE_DIR, "placeholder_tileset.png")
    tiles.save(out)
    print(f"[OK] tileset  {tiles.size}  (8格×1行，每格16x16)")

    print("\n全部完成！文件输出到：")
    print(f"  角色(32x32): {SPRITE_DIR}")
    print(f"  瓦片(16x16): {TILE_DIR}")
    print("\nPhaser 配套修改（已完成）：")
    print("  - MapScene.ts preload: player frameWidth/frameHeight = 32")
    print("  - Player.ts: setScale(0.5) + body setSize(24,24) setOffset(4,6)")
    print("  - MapScene.ts setupNPCs: sprite.setScale(0.5)")


if __name__ == "__main__":
    main()
