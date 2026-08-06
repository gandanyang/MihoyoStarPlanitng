# GPT Tileset Normalizer v1 工作总结

> 制作人 2026-08-07 拍板的"GPT 美术 → 游戏 tileset"标准化管线落地记录。
> 决策：先验证 A（升级管线），暂不批量跑 6 场景；farm 做成能放 Steam 截图的标准场景再复制生产线。

## 完成项

### ✅ 1. tools/gpt_tileset_normalizer.py（新建）
**位置**：`tools/gpt_tileset_normalizer.py`（约 250 行）

**3 步管线**（v1 只做这 3 件事）：
1. **自动切块**：`cut_blocks(img, block_size)` 把 GPT 图按 32×32 切成 N 块
2. **每块降噪**：`quantize_block(block, n_colors=12)` → 中切线量化（MEDIANCUT），256 色压到 12 色（dither=NONE 保硬边缘）
3. **重采样 16**：`downsample_block(block, target_size=16)` → NEAREST 采样

**辅助功能**：
- `--picks X,Y ...` 手动选 block（按行主序 → block_idx）
- `--auto-all` 输出全部块（仅供检查）
- `--preview` 在原图上画红色网格 + 黄色子网格 + block 编号（人工挑 tile 用）
- `--dump-all` 把每个 processed tile 单独存盘（调试）
- `--compare v1 v2` 对比两张 tileset（上下排列 + 8×scale 放大）

**调色板一致性**：每 tile 11-12 唯一色（受 `--palette 12` 控制）。

### ✅ 2. tools/prompts/（新建 7 个文件）
- `GPT_TILESET_PROMPTS.md`：通用规则 + 6 场景提示词模板 + 完整调用示例
- `farm.txt`、`town.txt`、`forest.txt`、`mine.txt`、`gate.txt`、`house.txt`：各场景的 `--prompt-file` 文本

**提示词核心**：从 "pixel art tileset" 改为：
- **关键词**：game tileset / seamless / Tiled / limited palette
- **STRICT TILE RULES**：no gradients / no lighting / flat pixel clusters / 8-16 colors
- **每个 tile 都是 clean seamless 16×16**

### ✅ 3. tmp/farm_tileset_v2.png（生成）
**位置**：`tmp/farm_tileset_v2.png`（128×16，8 tile，未覆盖 public/）

**生成参数**：
```
input  = tmp/gpt_tileset_grid.png (1024×768, GPT 已生成的 4×2 patch 概念图)
picks  = 4,3 4,9 12,9 20,15 4,15 4,21 12,21 20,21
         ↑  ↑  ↑↑   ↑↑↑↑  ↑↑↑↑↑ ↑↑↑↑↑↑ ↑
         grass dirt stone water soil wood path flower
palette= 12
```

**对比产物**（`tmp/` 下）：
- `farm_tileset_v2.png`：最终输出（128×16）
- `farm_tileset_v2_preview.png`：原图 + 红色网格 + block 编号
- `farm_tileset_v2_scene.png`：用 v2 模拟一个 16×10 的农场场景（草地/农田/花/路/泥土/石墙/水）
- `normalizer_compare.png`：v1 vs v2 对比（4×scale）
- `normalizer_compare_big.png`：v1 vs v2 对比（12×scale，大图）
- `normalizer_3way.png`：v1 / farm_hq（之前的尝试）/ v2 三方对比（8×scale）

## 关键决策点（制作人建议落地）

| 制作人建议 | 落地情况 |
|----------|---------|
| "现在不要批量跑 6 场景" | ✅ 只做了 farm 一个；其他场景的 prompt 文件已就位，等制作人确认 v2 达标后再批 |
| "A 工具升级 = GPT Image → 16px tile 管线" | ✅ `gpt_tileset_normalizer.py` 完整实现 3 步管线 |
| "调整 GPT 出图提示词" | ✅ `tools/prompts/*.txt` + `GPT_TILESET_PROMPTS.md` |
| "第一版只做 3 件事：切块 / 降噪 / 重新生成 16" | ✅ v1 严格只做这 3 件事；自动选块 / 接缝无缝化 / 调色板归一留 v2 |
| "对比 v1：AI味 vs v2：游戏素材味" | ✅ `normalizer_compare.png` / `normalizer_3way.png` 一目了然 |

## 兼容性验证

- ✅ 尺寸 128×16（与现有 farm_tileset.png 一致，MapScene.ts 加载逻辑无需改）
- ✅ 模式 RGB（Phaser 3 兼容）
- ✅ 8 tile，gid 1-8 语义保留（草/泥/石墙/水/农田土/木板/路/花）
- ✅ 每 tile 11-12 唯一色（远低于 256，不增加 GPU 负担）

## 制作人后续动作

1. **审 `tmp/farm_tileset_v2_scene.png` 与 `tmp/normalizer_compare_big.png`**：判断是否达到"放 Steam 截图"标准
2. **若达标**：
   - 用新的 GPT 提示词（`tools/prompts/farm.txt`）重新生成高清 GPT 图
   - 重跑 normalizer（可能需要微调 picks）
   - `cp tmp/farm_tileset_v2.png public/assets/tiles/farm_tileset.png` 覆盖正式资源
   - 跑 `tests/probes/probe-farm-visual.mjs` 验证游戏内显示
3. **若不达标**：调整 `tools/prompts/farm.txt`（如统一光照方向、限制调色板等），重新跑 GPT + normalizer

## v2 候补（本次不做）

- 自动 tile 选块（按主色聚类，免去手动 picks）
- 接缝无缝化（强制相邻 tile 边缘像素对齐）
- 阴影方向归一（统一左上光源）
- 调色板约束（强制 8-16 色总调色板，跨 tile 一致）
- 修 farm_soil gid 5 的垄沟（v2 现在用的是裸 dirt，可叠加 gen_farm_tileset.py 的 furrow 逻辑）