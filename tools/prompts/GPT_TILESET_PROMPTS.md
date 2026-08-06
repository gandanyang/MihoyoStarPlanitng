# GPT Tileset 出图提示词模板（v2）

> 配合 `tools/gpt_tileset_normalizer.py` 使用的 GPT 生图提示词。
> 制作人 2026-08-07 拍板：GPT 出图后必须经 normalizer 处理（切块+量化+降采样）才能成为游戏 tileset。
>
> 本文件存放各场景的标准提示词，可直接 `node tools/gpt_image_gen.mjs --prompt-file tools/prompts/<scene>.txt` 调用。

---

## 核心思路转变

**旧提示词（错的）**：
> pixel art tileset
> （结果：像素风插画，不是游戏 tile）

**新提示词（对的）**：
- 必须用 "**game tileset**" / "**seamless**" / "**Tiled map editor**"
- 强调 STRICT TILE RULES（无渐变/无光照/平坦像素/限制调色板）
- 必须显式列出 tile 类型清单
- 必须强调 tile 间用清晰网格分隔

---

## 通用前缀（所有场景都用）

```
16x16 pixel art game tileset, top-down view, STRICT TILE RULES:
- each tile must be a clean seamless 16x16 game tile
- no gradients, no lighting effects, no shadows
- flat pixel clusters only
- limited palette (8-16 colors per tile)
- consistent color style across all tiles in the sheet
- tiles must tile seamlessly (no visible seams when placed adjacent)
- tiles must be usable in Tiled map editor (clear pixel boundaries)
- inspired by Stardew Valley / old-school 16-bit JRPG farming games
- ALL tiles separated by visible 1-pixel grid lines for clarity

Tile types to include (each as a 256x256 sub-region in the 4x2 grid):
```

---

## Farm 农场（基础 8 tile + 农场专属扩展）

```
16x16 pixel art game tileset, top-down view, STRICT TILE RULES:
- each tile must be a clean seamless 16x16 game tile
- no gradients, no lighting effects, no shadows
- flat pixel clusters only
- limited palette (8-16 colors per tile)
- consistent color style across all tiles in the sheet
- tiles must tile seamlessly (no visible seams when placed adjacent)
- tiles must be usable in Tiled map editor (clear pixel boundaries)
- inspired by Stardew Valley / old-school 16-bit JRPG farming games
- ALL tiles separated by visible 1-pixel grid lines for clarity

Tile types to include (each as a 256x384 sub-region in 4x2 grid):
[Top row of 4]: grass, dirt, stone-wall, water
[Bottom row of 4]: wood-floor, path, flowers, sand
Each sub-region contains 8x12 sub-tiles for sampling variation.

Color palette: muted warm greens, earthy browns, gray stone, deep blue water, soft yellow accents. No neon colors.
```

---

## Town 小镇（基础 8 + 建筑 8 扩展 = 16 tile）

```
16x16 pixel art game tileset, top-down view, STRICT TILE RULES:
- each tile must be a clean seamless 16x16 game tile
- no gradients, no lighting effects, no shadows
- flat pixel clusters only
- limited palette (8-16 colors per tile)
- consistent color style across all tiles in the sheet
- tiles must tile seamlessly (no visible seams when placed adjacent)
- tiles must be usable in Tiled map editor (clear pixel boundaries)
- inspired by Stardew Valley / old-school 16-bit JRPG farming games

Tile types to include (8x2 grid of 256x256 sub-regions):
[Top row of 8]: grass, dirt, stone-wall, water, soil-tilled, wood-floor, path, flowers
[Bottom row of 8]: roof-shingle, wall-wood, door-wood, window-glass, well-stone, fence-wood, signpost, bush-leaf

Color palette: warm wood browns, gray stone, terracotta roofs, soft green foliage. Same greens as farm tileset.
```

---

## Forest 森林（基础 8 + 树 4 扩展 = 12 tile）

```
16x16 pixel art game tileset, top-down view, STRICT TILE RULES:
- each tile must be a clean seamless 16x16 game tile
- no gradients, no lighting effects, no shadows
- flat pixel clusters only
- limited palette (8-16 colors per tile)
- consistent color style across all tiles in the sheet
- tiles must tile seamlessly (no visible seams when placed adjacent)
- tiles must be usable in Tiled map editor (clear pixel boundaries)
- inspired by Stardew Valley / old-school 16-bit JRPG farming games

Tile types to include (each as 256x256 sub-region):
[6 regions in 3x2 grid]: grass, dirt, dark-soil, fallen-leaves, path, stone
[2 dedicated tree regions]: broadleaf-tree-crown, pine-tree-crown (both 256x512 to show crown + trunk)

Color palette: dark forest greens, brown trunks, mossy earth. Slightly darker/cooler than farm tileset.
```

---

## Mine 矿洞（基础 8 + 矿洞 8 扩展 = 16 tile）

```
16x16 pixel art game tileset, top-down view, STRICT TILE RULES:
- each tile must be a clean seamless 16x16 game tile
- no gradients, no lighting effects, no shadows
- flat pixel clusters only
- limited palette (8-16 colors per tile)
- consistent color style across all tiles in the sheet
- tiles must tile seamlessly (no visible seams when placed adjacent)
- tiles must be usable in Tiled map editor (clear pixel boundaries)
- inspired by Stardew Valley / old-school 16-bit JRPG farming games

Tile types to include (8x2 grid of 256x256 sub-regions):
[Top row of 8]: stone-floor, dark-stone, ore-vein, water-drip, wood-plank, rubble, path-dim, dirt-dark
[Bottom row of 8]: rock-wall, mine-pillar, rail-track, ore-pile, wood-crate, plank-bridge, gravel, minecart

Color palette: cool grays, dark browns, dim blue water, warm torch-wood. Lower saturation than outdoor tilesets.
```

---

## Gate 大门（基础 8 tile，简化）

```
16x16 pixel art game tileset, top-down view, STRICT TILE RULES:
- each tile must be a clean seamless 16x16 game tile
- no gradients, no lighting effects, no shadows
- flat pixel clusters only
- limited palette (8-16 colors per tile)
- consistent color style across all tiles in the sheet
- tiles must tile seamlessly (no visible seams when placed adjacent)
- tiles must be usable in Tiled map editor (clear pixel boundaries)
- inspired by Stardew Valley / old-school 16-bit JRPG farming games

Tile types to include (8x1 grid of 256x192 sub-regions):
grass, dirt, stone-wall, water, soil-tilled, wood-floor, path, flowers

Color palette: SAME as farm tileset (gate is just the entry to the farm).
```

---

## House 房屋（基础 8 + 家具 4 扩展 = 12 tile）

```
16x16 pixel art game tileset, top-down view, STRICT TILE RULES:
- each tile must be a clean seamless 16x16 game tile
- no gradients, no lighting effects, no shadows
- flat pixel clusters only
- limited palette (8-16 colors per tile)
- consistent color style across all tiles in the sheet
- tiles must tile seamlessly (no visible seams when placed adjacent)
- tiles must be usable in Tiled map editor (clear pixel boundaries)
- inspired by Stardew Valley / old-school 16-bit JRPG farming games

Tile types to include (each as 256x256 sub-region):
[6 in top row]: wood-floor, carpet-rug, stone-wall, wood-wall, dirt, path
[2 dedicated furniture regions]: bed, table, shelf, stove (each 256x512)

Color palette: warm interior tones, soft wood, faded rug reds. Same wood color as farm tileset.
```

---

## 输出尺寸推荐

| 场景 | 推荐尺寸 | 输出文件大小 | tileset PNG 数量 |
|------|---------|---------|------------|
| farm | 1024×768 (4×2 patch) | ~250KB | 1 (基础 8) |
| town | 2048×512 (8×2 patch) | ~330KB | 1 (基础 8+扩展 8) |
| forest | 1536×1024 (3×2 patch + 2 树) | ~400KB | 1 (基础 8+树 4) |
| mine | 2048×512 (8×2 patch) | ~330KB | 1 (基础 8+扩展 8) |
| gate | 2048×192 (8×1 patch) | ~120KB | 1 (基础 8) |
| house | 1536×512 (6×2 + 4 家具) | ~250KB | 1 (基础 8+家具 4) |

---

## 完整调用示例

```bash
# Farm 农场 tileset
node tools/gpt_image_gen.mjs \
  --prompt-file tools/prompts/farm.txt \
  --size 1024x768 \
  --out tmp/gpt_tileset_grid.png

# Normalizer 处理
python tools/gpt_tileset_normalizer.py \
  --input tmp/gpt_tileset_grid.png \
  --output tmp/farm_tileset_v2.png \
  --block-size 32 --palette 12 \
  --picks 4,3 4,9 12,9 20,15 4,15 4,21 12,21 20,21 \
  --preview

# 对比 v1 vs v2
python tools/gpt_tileset_normalizer.py \
  --compare public/assets/tiles/farm_tileset.png tmp/farm_tileset_v2.png \
  --compare-out tmp/normalizer_compare.png

# 满意后覆盖正式资源
cp tmp/farm_tileset_v2.png public/assets/tiles/farm_tileset.png
```

---

## v2 → v3 待办（本次不做）

- 自动 tile 选块（按主色聚类匹配期望 tile 类型，免去手动 picks）
- 接缝无缝化（强制相邻 tile 边缘像素对齐）
- 阴影方向归一（统一左上光源）
- 调色板约束（强制 8-16 色总调色板，跨 tile 一致）