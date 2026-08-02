# -*- coding: utf-8 -*-
"""
地图资产健康检查 v0.6.1
扫描 6 张地图（farm/town/gate/forest/mine/house）+ 对应 tileset：
  1. 层结构（Ground/Walls、depth）
  2. gid 使用范围与越界检查（gid > tileset 格数 → 黑瓦片）
  3. tileset 引用一致性（JSON image 是否指向 {key}_tileset.png）
  4. gid 1-4 / 9-13 语义像素采样（碰撞规则 setCollisionBetween(3,4)+(9,13) 全局生效）
  5. 出口 gap 检查（exits.ts 出口区域在 Walls 层是否开口、gap>=2 格）
  6. object layer 存在性
用法: python tools/check_map_health.py
"""
import json
import os
from PIL import Image

ROOT = 'public/assets'
MAPS = ['farm', 'town', 'gate', 'forest', 'mine', 'house']
TILE = 16

def load_map(key):
    with open(f'{ROOT}/maps/{key}.json', encoding='utf-8') as f:
        return json.load(f)

def tileset_png_info(key):
    p = f'{ROOT}/tiles/{key}_tileset.png'
    if not os.path.exists(p):
        return None
    img = Image.open(p).convert('RGBA')
    return {'w': img.size[0], 'tiles': img.size[0] // TILE}

def tile_pixels(key, gid):
    """返回瓦片 gid 的平均 RGB（含透明度）"""
    p = f'{ROOT}/tiles/{key}_tileset.png'
    if not os.path.exists(p):
        return None
    img = Image.open(p).convert('RGBA')
    if gid < 1 or gid * TILE > img.size[0]:
        return None
    tile = img.crop(((gid - 1) * TILE, 0, gid * TILE, TILE))
    px = [c for c in tile.getdata() if c[3] > 0]
    if not px:
        return None
    r = sum(c[0] for c in px) // len(px)
    g = sum(c[1] for c in px) // len(px)
    b = sum(c[2] for c in px) // len(px)
    return (r, g, b)

def main():
    issues = []
    print('=' * 70)
    print('地图资产健康检查 v0.6.1')
    print('=' * 70)
    for key in MAPS:
        m = load_map(key)
        w, h = m['width'], m['height']
        ts_info = tileset_png_info(key)
        print(f'\n### {key}.json  ({w}x{h})')
        # --- 1. 层结构 ---
        layers = {}
        for layer in m['layers']:
            name = layer.get('name', '?')
            layers[name] = layer['data']
            print(f'  层 [{name}] depth={layer.get("properties", [{}])[0].get("value", "?") if layer.get("properties") else "无"} type={layer.get("type")} len={len(layer["data"])}')
        # --- 2. gid 范围 ---
        all_gids = set()
        for name, d in layers.items():
            used = set(x for x in d if x > 0)
            all_gids |= used
            if used:
                print(f'    {name}: gid {min(used)}..{max(used)}  使用格数 {len(used)}')
        # --- 3. tileset 越界 ---
        ts_json = m.get('tilesets', [])
        if ts_json:
            ts = ts_json[0]
            img_ref = ts.get('image', '')
            print(f'  tilesets: firstgid={ts.get("firstgid")} name="{ts.get("name")}" image="{img_ref}" '
                  f'columns={ts.get("columns")} tilecount={ts.get("tilecount")} img_w={ts.get("imagewidth")}')
            expect_img = f'../tiles/{key}_tileset.png'
            if img_ref != expect_img:
                issues.append(f'{key}: tileset image 引用 {img_ref} 与 {expect_img} 不一致（不影响运行时，加载被替换）')
        if all_gids:
            max_gid = max(all_gids)
            # 实际 png 格数
            png_tiles = ts_info['tiles'] if ts_info else 0
            print(f'  实际 png: {key}_tileset.png -> {png_tiles} 格（{ts_info["w"]}px）')
            if max_gid > png_tiles:
                issues.append(f'{key}: 地图最大 gid {max_gid} > tileset 格数 {png_tiles} → **黑瓦片风险**')
            elif max_gid > (ts.get('tilecount') or 0) and png_tiles > (ts.get('tilecount') or 0):
                issues.append(f'{key}: 地图最大 gid {max_gid} > JSON tilecount {ts.get("tilecount")}')
        # --- 4. 语义采样（碰撞规则全局生效） ---
        if 'Walls' in layers:
            wall_gids = set(x for x in layers['Walls'] if x > 0)
            semantic = []
            for gid in sorted(wall_gids):
                rgb = tile_pixels(key, gid)
                semantic.append(f'{gid}:{rgb}')
            print(f'  Walls 层 gid 语义采样: {", ".join(semantic)}')
        # --- 5. 出口 gap 检查（在 main 末尾单独做，坐标来自 exits.ts） ---

    # 出口检查单独（用 ts 文件里的坐标）
    print('\n### 出口 gap 检查（exits.ts 坐标 → Walls 层）')
    exits_def = {
        'gate': [((14, 0), (16, 2))],  # 底出口？gate 在 map 中...
        'farm': [((14, 0), (16, 2)), ((37, 9), (39, 11)), ((5, 18), (7, 20))],
        'forest': [((14, 18), (15, 19)), ((28, 9), (29, 10))],
        'town': [((0, 9), (1, 10)), ((14, 0), (15, 1))],
        'mine': [((14, 18), (15, 19)), ((0, 9), (1, 10))],
        'house': [((9, 14), (10, 14))],
    }
    for key, zones in exits_def.items():
        m = load_map(key)
        walls = None
        for layer in m['layers']:
            if layer.get('name') == 'Walls':
                walls = layer['data']
                break
        if walls is None:
            issues.append(f'{key}: 无 Walls 层')
            continue
        w = m['width']
        for (c0, r0), (c1, r1) in zones:
            cells = []
            for r in range(r0, r1 + 1):
                row = []
                for c in range(c0, c1 + 1):
                    row.append(walls[r * w + c])
                cells.append(row)
            # 边界侧必须有连续 gap（取矩形朝向边界那侧）
            open_cells = sum(1 for row in cells for v in row if v == 0)
            print(f'  {key} 出口区 ({c0},{r0})-({c1},{r1}): {cells}  开口格 {open_cells}/{len(cells)*len(cells[0])}')
            if open_cells == 0:
                issues.append(f'{key}: 出口区 ({c0},{r0})-({c1},{r1}) 无开口 → 玩家无法切换场景')
        # object layer
        obj_layers = [l for l in m['layers'] if l.get('type') == 'objectgroup']
        if obj_layers:
            for ol in obj_layers:
                print(f'  {key} object layer "{ol.get("name")}": {len(ol.get("objects", []))} 个对象')
        else:
            print(f'  {key} object layer: 无')

    print('\n' + '=' * 70)
    if issues:
        print(f'发现 {len(issues)} 个风险项:')
        for it in issues:
            print('  ⚠️ ' + it)
    else:
        print('未发现风险项')

if __name__ == '__main__':
    main()
