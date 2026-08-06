# 《归星物语》资产登记表（Asset Registry）

> 类型：**认知地图**（纯文档，非开发计划；帮助定位资产、避免重复创建）
> 统计日期：2026-08-06 ｜ 用途：快速回答「这个资产在哪 / 有没有 / 谁在用」
> 注意：本项目**多数图像/音频由 tools/ 脚本程序化生成**（零手绘管线），本表同时登记产物与生成脚本
> 更新规则：新增资产目录/大规模重命名后，在本表登记

---

## 〇、总览

| 资产域 | 位置 | 文件数 | 大小 | 说明 |
|--------|------|-------|------|------|
| 地图数据 | `public/assets/maps/` | 7 | 0.07 MB | Tiled JSON（6 地图 + 1 备用） |
| 瓦片集 | `public/assets/tiles/` | 8 | 0.01 MB | 各场景 tileset + preview |
| 立绘 / 头像 | `public/assets/portraits/` | 15 | 7.11 MB | NPC 半身像 / 头像 |
| 物品图标 | `public/assets/icons/` | 22 | <0.01 MB | 程序化生成 |
| 精灵图 | `public/assets/sprites/` | 22 | 0.02 MB | 作物 / NPC / 树 / 农田 |
| 背景图 | `public/assets/images/` | 7 | 4.74 MB | 标题背景 |
| 剧情配音（规范化） | `public/audio/voice_normalized/` | 150 | ~99 MB | **运行时唯一使用**（-16 LUFS） |
| 原始配音 | `public/audio/voice/` | ~213 | ~17 MB | 生成中间产物（运行时不用） |
| 试听素材 | `public/audio/audition/` | ~15 | ~4 MB | 音色候选试听（不打包） |
| 代码 | `src/` | 45 TS | — | 见「系统地图」 |
| 工具脚本 | `tools/` | 60+ | — | 资产生成 / 检查 / 打包 |

---

## 一、地图（public/assets/maps/）

| 文件 | 场景 | 说明 |
|------|------|------|
| `farm.json` | 农场 | 玩家 80% 时间所在 |
| `forest.json` | 森林（后山） | 老树 / 星之碎片 / 后山道路 |
| `town.json` | 小镇 | NPC 聚集地 |
| `mine.json` | 矿洞 | 挖矿 |
| `house.json` | 家 | — |
| `gate.json` | 大门 | 序章场景 |
| `elder_house.json` | 村长家 | v0.6 新增 |

> 生成/检查：`tools/gen_map_assets.py` / `tools/check_map_health.py`

## 二、瓦片集（public/assets/tiles/）

| 文件 | 对应地图 | 生成脚本 |
|------|----------|----------|
| `farm_tileset.png` | farm | `gen_farm_tileset.py` |
| `forest_tileset.png` | forest | `fix_forest_tileset.py` |
| `town_tileset.png` | town | `gen_town_tileset.py` |
| `mine_tileset.png` | mine | `gen_mine_tileset.py` |
| `house_tileset.png` | house / elder_house | `gen_house.py` |
| `gate_tileset.png` | gate | `gen_gate_tileset.py` |
| `placeholder_tileset.png` | 通用占位 | — |
| `_preview.png` | 检查用 | — |

## 三、立绘与头像（public/assets/portraits/）

| 文件 | 角色 | 类型 |
|------|------|------|
| `xiya.png` | 夏雅 | 半身像 |
| `xiya_ai_avatar.png` / `xiya_ai_avatar_v2.png` | 夏雅 | AI 头像 v1/v2 |
| `xiya_ai_portrait.png` | 夏雅 | AI 半身像 |
| `xiaomei_ai.png` | 小梅 | AI 立绘 |
| 其他（15 文件） | 村长 / 老张 / 阿风 / 商店老板 / 神秘少女等 | NPC 立绘 |

> 注意：`portraits_work/` 曾为工作区，已不存在；立绘接入映射见 `probe-portraits-map.mjs`（25/25）

## 四、物品图标（public/assets/icons/）

22 个程序化图标，覆盖：4 作物 + 4 种子、矿石（石/铜/铁）、工具（锄/水壶/斧）、木材、金币、钻石、星之碎片、庄园钥匙、机器人、体力。

- 生成：`tools/gen_item_icons.py`
- 特殊：`star_shard_legacy_20260804.png`（旧版保留）、`star_shard.png`（新版视觉升级）

## 五、精灵图（public/assets/sprites/）

| 分类 | 文件 |
|------|------|
| 作物 | `crops.png`（4 作物 4 阶段） |
| 农田 | `farm_plot.png`（5 态）、`farm_plot_legacy_20260804.png`（旧版保留） |
| 树木 | `tree1.png` / `tree2.png` / `stump.png` / `wood.png` |
| NPC | `npc_girl.png`（夏雅）/ `npc_elder.png`（村长）/ `npc_gardener.png`（小梅）/ `npc_merchant.png`（商店老板）/ `npc_adventurer.png`（阿风） |
| 其他 | `player_frames.png` / `character_choices.png`（根目录） |

- 生成：`tools/gen_sprite_assets.py` / `gen_crops.py` / `gen_farm_plot.py` / `gen_npc_extras.py` / `gen_woodcutting_assets.py`

## 六、背景图（public/assets/images/）

| 文件 | 用途 |
|------|------|
| `title_bg.jpg` | 标题背景（当前） |
| `title_bg_dusk_v1.jpg` | 黄昏标题备选 |
| `title_bg_legacy.jpg` | 旧版保留 |
| 其他 4 文件 | — |

## 七、音频（public/audio/）

### 7.1 运行时加载链（重点）

**游戏运行时只读取 `voice_normalized/`，由 `src/audio/VoiceBank.ts` 动态 fetch + decode 播放。**

- BGM / 环境音 / 音效：**无音频文件**，全部 Web Audio 现场合成（`MusicSystem.ts` / `AmbienceSystem.ts` / `AudioSystem.ts`）
- 剧情语音：`audio/voice_normalized/<角色>/<id>.wav`（-16 LUFS 规范化）
- 语音→台词映射：`src/audio/voicebank.data.ts`（148 条，由 `tools/gen_mainline_voice.py --emit-voicebank` 生成，勿手改）

### 7.2 角色语音目录

| 角色目录 | normalized（运行时用） | raw（中间产物） | 备注 |
|----------|----------------------|-----------------|------|
| `xiya` | 42 文件 / 38 MB | 82 文件 | 主线 + 日常（语音升级进行中，未提交） |
| `linche` | 52 文件 / 22 MB | 57 文件 | 林澈（内心独白最多） |
| `elder` | 11 / 8.3 MB | 11 | 村长 |
| `gardener` | 7 / 5.8 MB | 14 | 小梅 |
| `girl` | 8 / 3.3 MB | 8 | 神秘少女 |
| `grandpa` | 9 / 6.4 MB | 9 | 爷爷 |
| `miner` | 8 / 6.0 MB | 8 | 老张 |
| `adventurer` | 6 / 5.6 MB | 16 | 阿风（试听中，音色待定） |
| `shopkeeper` | 3 / 1.6 MB | 3 | 商店老板 |
| `system` | 3 / 2.2 MB | 5 | 系统音 |

### 7.3 音频工具链

| 脚本 | 职责 |
|------|------|
| `gen_mainline_voice.py` | 主线语音生成 + voicebank 数据 emit |
| `gen_voice.py` / `generate_all_voice.py` / `voice_batch_linche_10.txt` | 批量 TTS |
| `normalize_audio.py` | -16 LUFS 规范化 |
| `compress_audio.py` | ogg 压缩（真机验证用） |
| `trim_voice_leads.py` | 去头尾静音 |
| `check_voicebank_match.py` | 语音↔台词匹配检查 |
| `fish_tts.ts` / `minimax_tts.ts` / `gen_xiya_minimax.py` | 候选 TTS 引擎（音色试听） |
| `gen_music.py` / `gen_music_variants.py` | BGM 变体生成（参考用） |

### 7.4 试听素材（public/audio/audition/）

- `adventurer_v2/`（9 文件）：阿风新声线候选
- `xiya_confirm/`（2）：夏雅确认版
- `xiya_minimax/`（4）：minimax 候选（candA~D）
- 试听页：`public/audition_xiya_full.html` / `public/audition_afeng_v2.html`

> ⚠️ 语音流程注意（AGENTS.md）：语音改动必须走试听确认流程，制作人确认后才能打包。

---

## 八、系统地图（src/）

### 8.1 系统分层

```
main.ts（入口 / Android返回 / PC ESC）
├── 场景层：TitleScene → StationScene → MapScene（6 地图共用）
├── 实体层：Player / NPC
├── 系统层：Time / Stamina / Inventory / Economy / Quest / NPC / Save / Story / Automation / DailyQuest / DailyEvent / GuiXingRecord / Weather / Ambience / AndroidBackHandler / InputManager / TouchControls / IslandReport
├── 数据层：FarmState / FarmPlot / FarmProgress / FarmRestore / MineState / MemoryFlashbacks / exits
└── UI 层：StoryDialogue / QuestPanel / BackpackPanel / ShopPanel / EndingPanel / MemoryFlashback / MemoryMoment / ConfirmDialog / WaitPanel / SmartSellPreviewPanel / dom-anim
```

### 8.2 关键系统职责（快速定位）

| 系统 | 文件 | 职责 |
|------|------|------|
| 时间 | `data/TimeSystem.ts` | 唯一时间源，`nextDay()` 跨天结算 |
| 存档 | `systems/SaveSystem.ts` | v0.5 分组 + 版本迁移 |
| 剧情 | `systems/StorySystem.ts` | 单写者制，状态机 `storyStep` |
| 语音 | `audio/VoiceBank.ts` | fetch+decode+LRU 播放，防 IDM |
| BGM | `audio/MusicSystem.ts` | Web Audio 合成 |
| 环境音 | `systems/AmbienceSystem.ts` | 水/风/虫/鸟/雨，昼夜变化 |
| 天气 | `systems/WeatherSystem.ts` | 雨天覆盖层 + 自动湿润 |
| 复兴 | `data/FarmRestore.ts` | RESTORE_KEYS（老屋/花园/后山道路） |
| 归星录 | `systems/GuiXingRecordSystem.ts` | 标签 + 记忆段 |
| 智能出售 | `ui/SmartSellPreviewPanel.ts` | 出售预览 + 资源保护（未提交） |
| 经济 | `data/Economy.ts` | 价格 / 出售 |
| NPC | `systems/NPCSystem.ts` | 日程 + 对话 |

### 8.3 依赖红线（改动前必读）

1. 天/时间只在 `TimeSystem.nextDay()` 递增
2. 模块状态必须可被 `SaveSystem` 完整序列化
3. 数值单一来源（一种价格只定义一次）
4. 新增玩法优先复用 `MapScene` 模式，禁止复制场景
5. 新增物品必须同步：`Inventory.ItemType` + `ITEM_DEFS` + 商店 + 存档 + PRD

---

## 九、测试探针（tests/probes/）

80+ 个 Puppeteer 探针，按功能命名（`probe-<系统>-<功能>.mjs`）。

| 类别 | 代表探针 |
|------|----------|
| 教程 / 序章 | `test-tutorial.mjs` / `probe-prologue-walkthrough.mjs` |
| 主线 | `test-ch1-story.mjs` / `probe-ch1-walkthrough.mjs` |
| 存档 | `probe-save-restore.mjs` / `probe-restore-037.mjs` |
| 移动端 | `probe-mobile-*.mjs`（5 个） |
| 音频 | `probe-voice.mjs` / `probe-wav-requests.mjs` / `probe-stargaze-voice.mjs` / `probe-ambience.mjs` |
| 视觉 | `probe-forest-visual.mjs` / `probe-town-elder-visual.mjs` / `probe-shard-visual.mjs` |
| 压力 | `test-stress-switch.mjs` |

---

## 十、维护建议

1. **新增资产目录时**：在本表登记（目录名 + 用途 + 生成脚本）
2. **删除旧版保留资产**（`*_legacy_*` / `*_20260804`）：确认无代码引用后清理
3. **语音升级期间**：`voice_normalized/xiya` 处于未提交状态，打包前必须先走制作人试听确认
4. **本表是认知地图，不是权威设计**：冲突时以 `顶层设计.md`、`AGENTS.md`、`TEST_RULES.md` 为准
